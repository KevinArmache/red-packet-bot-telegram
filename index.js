/**
 * index.js — Orchestrateur principal du bot Cryptobox Telegram/Binance
 *
 * Flux :
 *  1. Charger .env → 2. Historique → 3. Navigateur Binance →
 *  4. Client Telegram → 5. Écoute passive → 6. Cron reset minuit
 */

"use strict";

require("dotenv").config();

const cron = require("node-cron");
const logger = require("./src/logger");
const stats = require("./src/stats");
const history = require("./src/history");
const queue = require("./src/queue");
const { initBrowser, claimCode, closeBrowser } = require("./src/binance");
const { startTelegramClient } = require("./src/telegram");

// Intervalle du bilan périodique affiché dans la console (en minutes, 0 = off)
const STATS_INTERVAL_MIN = Math.max(
  0,
  parseInt(process.env.STATS_INTERVAL_MIN ?? "30", 10),
);

// ─── Validation ──────────────────────────────────────────────────────────────

function validateEnv() {
  const required = ["API_ID", "API_HASH", "PHONE_NUMBER", "TARGET_CHANNELS"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.error(`🔑 Variables manquantes dans .env : ${missing.join(", ")}`);
    process.exit(1);
  }
}

function parseTargetChannels() {
  const raw = process.env.TARGET_CHANNELS ?? "";
  return raw
    .split(",")
    .map((ch) => ch.trim())
    .filter(Boolean);
}

// ─── Bilan périodique ────────────────────────────────────────────────────────

function printStats(title = "📊 Bilan d'activité") {
  const { rows } = stats.snapshot();
  logger.blank();
  logger.table(title, rows, logger.colors.cyan);
  logger.blank();
}

function scheduleStatsHeartbeat() {
  if (STATS_INTERVAL_MIN === 0) return;
  setInterval(() => printStats(), STATS_INTERVAL_MIN * 60 * 1000).unref?.();
}

// ─── Cron de réinitialisation ────────────────────────────────────────────────

function scheduleDailyReset() {
  cron.schedule("0 0 * * *", () => {
    history.cleanOldCodes(); // Nettoie  les codes de plus de 48h
    logger.info("🗑️ Cron minuit : vérification de l'historique terminée");
    printStats("📊 Bilan de la journée");
  });
}

// ─── Traitement d'un code détecté ────────────────────────────────────────────

/**
 * Chaque code détecté par Telegram est mis en file puis réclamé sur Binance.
 * ⛔ Une seule tentative par code : aucun code n'est rejoué, quel qu'en soit
 *    le résultat (protection du compteur anti-fraude Binance).
 *
 * @param {string} code - Code Cryptobox détecté.
 * @param {{ channel?: string, detectedAt?: number }} [meta] - Contexte de détection.
 */
function handleDetectedCode(code, meta = {}) {
  const detectedAt = meta.detectedAt ?? Date.now();
  const pending = queue.size;

  stats.peak("queuePeak", pending + 1);
  if (pending > 0) {
    logger.info(`📥 File d'attente : ${pending} code(s) devant ${code}`);
  }

  queue.enqueue(async () => {
    const waitedMs = Date.now() - detectedAt;
    stats.recordQueueWait(waitedMs);

    if (waitedMs > 1000) {
      logger.warn(`⏱️ Code ${code} — ${waitedMs} ms d'attente avant traitement`);
    }

    const startedAt = Date.now();
    try {
      const result = await claimCode(code);
      const elapsed = Date.now() - startedAt;

      switch (result.status) {
        case "success":
          stats.bump("codesClaimed");
          stats.bump("codesWon");
          stats.recordClaimDuration(elapsed);
          stats.state.lastWinAt = Date.now();
          logger.success(`🏁 Code ${code} traité en ${elapsed} ms`);
          break;

        case "permanent_failure":
          stats.bump("codesClaimed");
          stats.bump("codesFailed");
          stats.recordClaimDuration(elapsed);
          logger.info(
            `⏭️ Code ${code} clos définitivement — on passe au suivant (aucun retry)`,
          );
          break;

        case "rate_limited":
          stats.bump("codesClaimed");
          stats.recordClaimDuration(elapsed);
          logger.warn(`🛑 Code ${code} — limite Binance atteinte, bot en pause`);
          break;

        case "temporary_failure":
          stats.bump("codesClaimed");
          stats.recordClaimDuration(elapsed);
          logger.warn(
            `⏭️ Code ${code} — échec technique, abandonné sans nouvelle tentative`,
          );
          break;

        default:
          // paused / browser_unavailable / page_unavailable
          stats.bump("codesSkipped");
          logger.warn(`⏭️ Code ${code} non tenté (${result.status})`);
          break;
      }

      if (result.remember) {
        history.addCode(code);
      }
    } finally {
      history.clearProcessing(code);
    }
  }, code);
}

// ─── Gestionnaires d'erreurs globales ────────────────────────────────────────

let shuttingDown = false;

function setupGlobalErrorHandlers() {
  process.on("uncaughtException", (err) => {
    logger.error(`💥 Exception non capturée : ${err.message}`);
    logger.debug(err.stack ?? "");
    // Ne pas quitter — le bot continue
  });

  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    logger.error(`💥 Promesse rejetée : ${msg}`);
    // Ne pas quitter — le bot continue
  });

  const gracefulShutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.blank();
    logger.warn(`🛑 Signal ${signal} — arrêt propre...`);

    if (queue.size > 0) {
      logger.info(`⏳ ${queue.size} code(s) encore en file — on les termine...`);
      await Promise.race([queue.drain(), new Promise((r) => setTimeout(r, 15000))]);
    }

    printStats("📊 Bilan final");
    await closeBrowser();
    logger.banner(["👋 Bot arrêté proprement — à bientôt !"], logger.colors.yellow);
    process.exit(0);
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

async function main() {
  logger.blank();
  logger.banner(
    [
      "🤖 Bot Red Packet — Telegram × Binance",
      "⚡ Détection instantanée · Zéro retry · Zéro rattrapage",
    ],
    logger.colors.cyan,
  );
  logger.blank();

  // 1. Validation
  logger.rule("🧩 Initialisation");
  validateEnv();
  setupGlobalErrorHandlers();

  // 2. Historique
  history.loadHistory();

  // 3. Navigateur Binance
  await initBrowser();

  // 4. Canaux cibles
  const targetChannels = parseTargetChannels();
  if (targetChannels.length === 0) {
    logger.error("🎯 Aucun canal défini dans TARGET_CHANNELS");
    process.exit(1);
  }
  logger.info(`🎯 ${targetChannels.length} canal(aux) demandé(s) dans TARGET_CHANNELS`);

  // 5. Client Telegram — chaque code détecté est envoyé à Playwright
  logger.blank();
  logger.rule("📡 Telegram");
  await startTelegramClient(targetChannels, handleDetectedCode);

  // 6. Cron reset + bilan périodique
  scheduleDailyReset();
  scheduleStatsHeartbeat();

  logger.blank();
  logger.banner(
    [
      "🟢 Bot opérationnel — En attente des Red Packets",
      STATS_INTERVAL_MIN > 0
        ? `⏱️ Bilan automatique toutes les ${STATS_INTERVAL_MIN} min`
        : "⏱️ Bilan périodique désactivé (STATS_INTERVAL_MIN=0)",
    ],
    logger.colors.green,
  );
  logger.blank();
}

main().catch((err) => {
  logger.error(`💀 Erreur fatale : ${err.message}`);
  logger.error(err.stack ?? "");
  process.exit(1);
});
