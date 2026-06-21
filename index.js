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
const history = require("./src/history");
const queue = require("./src/queue");
const { initBrowser, claimCode, closeBrowser } = require("./src/binance");
const { startTelegramClient } = require("./src/telegram");

// ─── Validation ──────────────────────────────────────────────────────────────

function validateEnv() {
  const required = ["API_ID", "API_HASH", "PHONE_NUMBER", "TARGET_CHANNELS"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.error(`❌ Variables manquantes : ${missing.join(", ")}`);
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

// ─── Cron de réinitialisation ────────────────────────────────────────────────

function scheduleDailyReset() {
  cron.schedule("0 0 * * *", () => {
    history.cleanOldCodes(); // Nettoie  les codes de plus de 48h
    logger.info("🗑️ Cron minuit : vérification de l'historique terminée");
  });
}

// ─── Gestionnaires d'erreurs globales ────────────────────────────────────────

function setupGlobalErrorHandlers() {
  process.on("uncaughtException", (err) => {
    logger.error(`💥 Exception non capturée : ${err.message}`);
    // Ne pas quitter — le bot continue
  });

  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    logger.error(`💥 Promesse rejetée : ${msg}`);
    // Ne pas quitter — le bot continue
  });

  const gracefulShutdown = async (signal) => {
    logger.warn(`🛑 Signal ${signal} — arrêt propre...`);
    await closeBrowser();
    process.exit(0);
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

async function main() {
  console.log("");
  logger.info("╔══════════════════════════════════════════════════════╗");
  logger.info("║  🤖 Bot Red Packet Telegram/Binance — Démarrage     ║");
  logger.info("╚══════════════════════════════════════════════════════╝");
  console.log("");

  // 1. Validation
  validateEnv();
  setupGlobalErrorHandlers();

  // 2. Historique
  history.loadHistory();

  // 3. Navigateur Binance
  await initBrowser();

  // 4. Canaux cibles
  const targetChannels = parseTargetChannels();
  if (targetChannels.length === 0) {
    logger.error("❌ Aucun canal défini dans TARGET_CHANNELS");
    process.exit(1);
  }

  // 5. Client Telegram — chaque code détecté est envoyé à Playwright
  await startTelegramClient(targetChannels, (code) => {
    const pending = queue.size;
    if (pending > 0) {
      logger.info(`📥 File d'attente : ${pending} code(s) avant ${code}`);
    }

    queue.enqueue(async () => {
      try {
        const result = await claimCode(code);
        if (result.remember) {
          history.addCode(code);
        } else if (result.status === 'temporary_failure') {
          logger.warn(`🔁 Code ${code} non mémorisé — échec temporaire, pas de nouvelle tentative automatique`);
        }
      } finally {
        history.clearProcessing(code);
      }
    });
  });

  // 6. Cron reset
  scheduleDailyReset();

  console.log("");
  logger.success("═══════════════════════════════════════════════════");
  logger.success("  🟢 Bot opérationnel — En attente des Red Packets");
  logger.success("═══════════════════════════════════════════════════");
  console.log("");
}

main().catch((err) => {
  logger.error(`💀 Erreur fatale : ${err.message}`);
  logger.error(err.stack ?? "");
  process.exit(1);
});
