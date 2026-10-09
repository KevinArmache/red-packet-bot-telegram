/**
 * index.js — Orchestrateur principal du bot Cryptobox Telegram/Binance
 *
 * Flux :
 *  • PC (BOT_ROLE=primary, défaut) ou appareil seul (BOT_ROLE=solo) :
 *      .env → historique → navigateur Binance → Telegram → relais → cron
 *  • Téléphone (BOT_ROLE=backup) :
 *      .env → historique → Telegram → relais → navigateur Binance
 *      UNIQUEMENT quand le PC est absent (Chromium fermé en veille)
 *  • `node index.js --setup` :
 *      connexion Telegram puis connexion Binance, alerte de test, et sortie
 */

"use strict";

const path = require("path");
// .env du dossier du bot, quel que soit le répertoire de lancement
// (le superviseur Android démarre node depuis /root)
require("dotenv").config({ path: path.join(__dirname, ".env") });

const fs = require("fs");
const cron = require("node-cron");
const logger = require("./src/logger");
const stats = require("./src/stats");
const history = require("./src/history");
const queue = require("./src/queue");
const notifier = require("./src/notifier");
const relay = require("./src/relay");
const { hints, ANDROID_APP } = require("./src/platform");
const binance = require("./src/binance");
const { startTelegramClient, loginTelegram, isAuthDeadError } = require("./src/telegram");

const SETUP_MODE = process.argv.includes("--setup");
const UNATTENDED = ["1", "true"].includes(
  String(process.env.BOT_UNATTENDED ?? "").toLowerCase(),
);

// Intervalle du bilan périodique affiché dans la console (en minutes, 0 = off)
const STATS_INTERVAL_MIN = Math.max(
  0,
  parseInt(process.env.STATS_INTERVAL_MIN ?? "30", 10),
);

// Signe de vie pour l'app Android (fichier réécrit toutes les 15 s)
const HEARTBEAT_FILE = (process.env.BOT_HEARTBEAT_FILE ?? "").trim();
// Facultatif : ping healthchecks.io toutes les 5 min (alerte si le téléphone meurt)
const HEALTHCHECK_URL = (process.env.HEALTHCHECK_URL ?? "").trim();
// Code de sortie du lancement précédent (transmis par le superviseur Android)
const LAST_EXIT_CODE = parseInt(process.env.BOT_LAST_EXIT_CODE ?? "0", 10) || 0;

// Session Telegram à refaire : le superviseur attend 30 min au lieu de relancer
const EXIT_LOGIN_REQUIRED = 78;
// Téléphone en veille : Chromium fermé après ce délai (mémoire libérée)
const STANDBY_CLOSE_DELAY_MS = 2 * 60_000;
// Vérification périodique de la session Telegram (révocation en cours de route)
const TELEGRAM_PROBE_MS = 3 * 60_000;
const HOUR = 3600_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

let shuttingDown = false;
/** @type {import('@mtcute/node').TelegramClient | null} */
let telegram = null;
let telegramHealthyAt = 0;

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
  const { rows } = stats.snapshot(relay.statsRows());
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

    // Bilan quotidien : sert aussi de signe de vie (pas de message = problème)
    const s = stats.state;
    const where = relay.ROLE === "backup" ? ` — ${relay.describeMode()}` : "";
    notifier.notify(
      `📊 Bilan (en ligne depuis ${stats.formatDuration(Date.now() - s.startedAt)}) : ` +
        `${s.codesDetected} code(s) détecté(s), ${s.codesWon} gagné(s), ` +
        `${s.codesFailed} échec(s)${where}.`,
      { level: "all" },
    );
  });
}

// ─── Signe de vie (watchdog Android) et healthcheck ─────────────────────────

/**
 * Telegram répond-il ? Le ping healthchecks.io n'est envoyé que dans ce cas
 * (une session révoquée ne doit pas passer pour un bot en bonne santé), et
 * le signe de vie le signale à l'app (tg_ok).
 */
function telegramAlive() {
  return !telegram || Date.now() - telegramHealthyAt < TELEGRAM_PROBE_MS * 2 + 60_000;
}

function writeHeartbeat() {
  // Toujours écrit : c'est la preuve que le processus vit (watchdog de l'app).
  // La santé de Telegram est un champ à part (tg_ok), avec son propre seuil.
  if (!HEARTBEAT_FILE) return;
  const s = binance.getStatus();
  const browser = s.awaitingLogin
    ? "login"
    : s.ready
      ? "ready"
      : s.launched
        ? "starting"
        : "closed";
  const lines = [
    `ts=${Date.now()}`,
    `role=${relay.ROLE}`,
    `mode=${relay.currentMode()}`,
    `browser=${browser}`,
    `pause_until=${s.pauseUntil}`,
    `detected=${stats.state.codesDetected}`,
    `won=${stats.state.codesWon}`,
    `last_code_at=${stats.state.lastCodeAt}`,
    `started_at=${stats.state.startedAt}`,
    `sleeps=${stats.state.deviceSleeps}`,
    `disconnects=${stats.state.disconnects}`,
    `messages=${stats.state.messagesSeen}`,
    `tg_ok=${telegramAlive() ? 1 : 0}`,
    `tg_healthy_at=${telegramHealthyAt}`,
  ];
  try {
    fs.writeFileSync(HEARTBEAT_FILE, `${lines.join("\n")}\n`);
  } catch (_) {
    /* non bloquant */
  }
}

function startHeartbeat() {
  if (!HEARTBEAT_FILE) return;
  writeHeartbeat();
  // Toutes les 15 s : l'état affiché par l'app reflète vite le relais et le navigateur
  setInterval(writeHeartbeat, 15_000).unref?.();
}

/**
 * Détecteur de mise en veille (téléphone) : si Android endort le processeur
 * (réglages batterie, nettoyage de la marque), le bot est figé — plus de messages Telegram,
 * réclamations très lentes. Un minuteur de 5 s qui se réveille avec un gros
 * retard le prouve : on le signale clairement au lieu de laisser deviner.
 */
function startSleepDetector() {
  if (!UNATTENDED) return; // le PC qui se met en veille, c'est normal
  const TICK_MS = 5_000;
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const lateMs = now - last - TICK_MS;
    last = now;
    if (lateMs < 15_000) return;
    stats.bump("deviceSleeps");
    logger.warn(
      `💤 Le système a endormi le bot pendant ${stats.formatDuration(lateMs)} — vérifie\n` +
        `    ${hints.sleepSettings}.`,
    );
    notifier.notify(
      "💤 Le téléphone endort le bot quand l'écran est verrouillé : aucun code n'arrive pendant ce temps. " +
        `Vérifie ${hints.sleepSettings}.`,
      { key: "device-sleep", cooldownMs: 6 * HOUR },
    );
  }, TICK_MS).unref?.();
}

function startHealthcheck() {
  if (!HEALTHCHECK_URL) return;
  const ping = () => {
    if (!telegramAlive()) return;
    fetch(HEALTHCHECK_URL, { signal: AbortSignal.timeout(10_000) }).catch(() => {});
  };
  ping();
  setInterval(ping, 5 * 60_000).unref?.();
  logger.info("💓 Healthcheck : ping toutes les 5 min");
}

// ─── Session Telegram : vérification en cours de route ──────────────────────

/**
 * Une session révoquée (Paramètres → Appareils) ou expirée ne lève aucune
 * erreur visible : le bot deviendrait sourd en silence. On interroge donc
 * Telegram toutes les 3 min ; une erreur d'authentification confirmée mène à
 * l'alerte 🔑 et à une sortie « connexion requise » (code 78).
 */
function startTelegramProbe() {
  telegramHealthyAt = Date.now();
  let running = false;

  const probe = async () => {
    if (running || shuttingDown || !telegram) return;
    running = true;
    try {
      await telegram.call({ _: "updates.getState" }, { timeout: 30_000 });
      telegramHealthyAt = Date.now();
    } catch (err) {
      if (!isAuthDeadError(err)) return; // réseau, délai, FLOOD_WAIT : on réessaiera
      await sleep(15_000);
      try {
        await telegram.getMe();
        telegramHealthyAt = Date.now();
      } catch (err2) {
        if (isAuthDeadError(err2)) await loginRequiredExit(err2.message);
      }
    } finally {
      running = false;
    }
  };

  setInterval(() => void probe(), TELEGRAM_PROBE_MS).unref?.();
  telegram.onError.add((err) => {
    if (isAuthDeadError(err)) void probe();
  });
}

/** Session Telegram à refaire : alerte, état « arrêté » publié, sortie 78. */
async function loginRequiredExit(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.error(
    `🔑 Session Telegram invalide (${reason}) — ` +
      (UNATTENDED ? hints.telegramLogin : "relance le bot et saisis le code"),
  );
  await notifier.sendAndWait(
    UNATTENDED
      ? `🔑 Session Telegram expirée : ${hints.telegramLogin}.`
      : "🔑 Session Telegram expirée : relance le bot (npm start) et saisis le code reçu.",
    { key: "tg-login", cooldownMs: 3 * HOUR },
  );
  await relay.shutdown().catch(() => {});
  await binance.closeBrowser().catch(() => {});
  process.exit(EXIT_LOGIN_REQUIRED);
}

// ─── Navigateur : rappels, relance, veille ──────────────────────────────────

function binanceLoginMessage() {
  return (
    `🔑 Binance demande une reconnexion : ${hints.binanceLogin}. ` +
    "Les codes sont ignorés en attendant."
  );
}

const browserHooks = {
  onLoginRequired: () => {
    void relay.publish(); // PC : « indisponible » → le téléphone prend le relais
    notifier.notify(binanceLoginMessage(), {
      key: "binance-login",
      cooldownMs: 3 * HOUR,
    });
  },
  onLoginRestored: () => {
    void relay.publish();
    notifier.notify("✅ Session Binance rétablie — les codes sont de nouveau réclamés.", {
      key: "binance-restored",
      cooldownMs: 10 * 60_000,
    });
  },
  onUnexpectedClose: (reason, context) => onBrowserLost(reason, context),
  onPause: (until) => {
    relay.announcePause(until);
    notifier.notify(
      `🛑 Limite Binance atteinte — pause anti-ban jusqu'à ${fmtTime(until)}. ` +
        "Aucun code ne sera tenté d'ici là.",
      { key: "binance-pause", cooldownMs: HOUR },
    );
  },
};

// Lancements / fermetures du navigateur : un seul à la fois
let browserChain = Promise.resolve();
function browserTask(fn) {
  browserChain = browserChain.then(fn).catch((err) => {
    logger.error(`🌐 ${err.message}`);
  });
  return browserChain;
}

/** Lance le navigateur si cet appareil doit tourner (3 essais, 60 s d'écart). */
async function ensureBrowser() {
  let failures = 0;
  for (;;) {
    if (shuttingDown || !relay.shouldRunBrowser()) return;
    if (binance.getStatus().launched) return;
    try {
      await binance.initBrowser(browserHooks);
      void relay.publish();
      return;
    } catch (err) {
      if (shuttingDown || !relay.shouldRunBrowser()) return;
      if (err.code === "BROWSER_CLOSED") {
        // Lancement annulé (veille puis reprise rapide, onglet planté…) :
        // on recommence si l'appareil doit toujours tourner
        await sleep(2000);
        continue;
      }
      failures++;
      if (failures >= 3) throw err;
      logger.warn(`🌐 Lancement du navigateur échoué (${err.message}) — nouvel essai dans 60 s`);
      await sleep(60_000);
    }
  }
}

const crashTimes = [];
let browserRecoveryQueued = false;

/** Chromium fermé ou onglet planté : relance du navigateur dans le même processus. */
function onBrowserLost(reason, context) {
  if (shuttingDown || browserRecoveryQueued) return;
  if (context && !binance.isCurrentContext(context)) return; // déjà remplacé
  browserRecoveryQueued = true;

  logger.error(`🌐 ${reason} — relance automatique du navigateur`);
  notifier.notify(`🌐 ${reason} — relance automatique du navigateur…`, {
    key: "browser-lost",
    cooldownMs: 10 * 60_000,
  });

  // Fermeture IMMÉDIATE (hors file) : débloque un lancement ou une attente
  // de connexion en cours sur le navigateur perdu
  void binance.closeBrowser();
  void relay.publish(); // PC : « indisponible » le temps de la relance

  browserTask(async () => {
    browserRecoveryQueued = false;
    if (shuttingDown || !relay.shouldRunBrowser()) return; // téléphone en veille

    const now = Date.now();
    crashTimes.push(now);
    while (crashTimes.length && now - crashTimes[0] > 10 * 60_000) crashTimes.shift();
    if (crashTimes.length > 3) {
      await fatal("Chromium plante en boucle (plus de 3 fois en 10 min)");
      return;
    }

    await sleep(5000);
    try {
      await ensureBrowser();
      if (binance.getStatus().ready) logger.success("🌐 Navigateur relancé");
    } catch (err) {
      await fatal(`navigateur impossible à relancer : ${err.message}`);
    }
  });
}

// ── Mode relais (téléphone) : prise de relais / veille ──

let standbyCloseTimer = null;

function onRelayActivate() {
  clearTimeout(standbyCloseTimer);
  standbyCloseTimer = null;
  browserTask(async () => {
    try {
      await ensureBrowser();
    } catch (err) {
      await fatal(`navigateur impossible à lancer : ${err.message}`);
    }
  });
}

function onRelayStandby() {
  const s = binance.getStatus();
  if (s.launched && !s.ready) {
    // Navigateur en cours de lancement ou en attente de connexion : inutile
    // d'attendre, on ferme tout de suite (annule l'attente de connexion)
    void binance.closeBrowser();
    return;
  }

  clearTimeout(standbyCloseTimer);
  standbyCloseTimer = setTimeout(() => {
    standbyCloseTimer = null;
    browserTask(async () => {
      if (relay.shouldRunBrowser() || !binance.getStatus().launched) return;
      await binance.closeBrowser();
      logger.info("😴 Chromium fermé pendant la veille (mémoire libérée)");
    });
  }, STANDBY_CLOSE_DELAY_MS);
}

// ─── Arrêt ───────────────────────────────────────────────────────────────────

/** Arrêt sur erreur : alerte, état « arrêté » publié, puis sortie. */
async function fatal(reason, exitCode = 1) {
  if (shuttingDown) return;
  shuttingDown = true;
  // App Android : la cause s'affiche aussi à l'écran
  globalThis.__rpbHost?.event("fatal", { message: reason });
  logger.error(
    `💀 ${reason} — arrêt du bot` +
      (UNATTENDED ? " (le superviseur va le relancer)" : ""),
  );
  await notifier.sendAndWait(
    `💥 ${reason}.` +
      (UNATTENDED ? " Redémarrage automatique du bot…" : " Relance le bot (npm start)."),
    { key: "fatal", cooldownMs: 15 * 60_000 },
  );
  await relay.shutdown().catch(() => {});
  await binance.closeBrowser().catch(() => {});
  process.exit(exitCode);
}

// ─── Traitement d'un code détecté ────────────────────────────────────────────

/**
 * Code que CET appareil ne réclame pas (l'autre appareil en est responsable) :
 * inscrit à l'historique pour ne jamais le tenter plus tard (repost, édition).
 */
function leaveToOtherDevice(code, postedAt) {
  stats.bump("codesDeferred");
  history.addCode(code);
  logger.info(`🤝 Code ${code} non réclamé ici — ${relay.whyNotClaiming(postedAt)}`);
}

/**
 * Chaque code détecté par Telegram est mis en file puis réclamé sur Binance.
 * ⛔ Une seule tentative par code : aucun code n'est rejoué, quel qu'en soit
 *    le résultat (protection du compteur anti-fraude Binance).
 *
 * @param {string} code - Code Cryptobox détecté.
 * @param {{ channel?: string, detectedAt?: number, postedAt?: number }} [meta]
 *   postedAt : heure SERVEUR Telegram de la publication (ou de l'édition).
 */
function handleDetectedCode(code, meta = {}) {
  // Arrêt en cours : l'autre appareil a déjà été prévenu, il s'en charge
  if (shuttingDown) {
    history.clearProcessing(code);
    logger.info(`⏹️ Code ${code} ignoré — arrêt en cours`);
    return;
  }

  // Relais : un seul appareil est responsable de chaque code
  if (!relay.canClaim(meta.postedAt)) {
    leaveToOtherDevice(code, meta.postedAt);
    history.clearProcessing(code);
    return;
  }

  const detectedAt = meta.detectedAt ?? Date.now();
  const pending = queue.size;

  stats.peak("queuePeak", pending + 1);
  if (pending > 0) {
    logger.info(`📥 File d'attente : ${pending} code(s) devant ${code}`);
  }

  queue.enqueue(async () => {
    // La responsabilité a changé pendant l'attente dans la file
    if (!relay.canClaim(meta.postedAt)) {
      leaveToOtherDevice(code, meta.postedAt);
      history.clearProcessing(code);
      return;
    }

    const waitedMs = Date.now() - detectedAt;
    stats.recordQueueWait(waitedMs);

    if (waitedMs > 1000) {
      logger.warn(`⏱️ Code ${code} — ${waitedMs} ms d'attente avant traitement`);
    }

    const startedAt = Date.now();
    try {
      const result = await binance.claimCode(code, {
        // Dernier contrôle juste avant de taper le code
        canSubmit: () => !shuttingDown && relay.canClaim(meta.postedAt),
        // Inscrit AVANT la saisie : jamais rejoué ici, et l'autre appareil
        // l'apprend par le registre partagé
        onSubmitting: () => {
          history.addCode(code);
          relay.recordClaim(code);
        },
      });
      const elapsed = Date.now() - startedAt;

      switch (result.status) {
        case "success":
          stats.bump("codesClaimed");
          stats.bump("codesWon");
          stats.recordClaimDuration(elapsed);
          stats.state.lastWinAt = Date.now();
          logger.success(`🏁 Code ${code} traité en ${elapsed} ms`);
          notifier.notify(
            `💰 Gagné ! Code ${code} → ${result.gain || "montant à vérifier sur Binance"}` +
              (meta.channel ? ` (${meta.channel})` : ""),
            { level: "all" },
          );
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
          // L'alerte et le partage de la pause sont faits par browserHooks.onPause
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

        case "unknown":
          // Soumis, mais Binance n'a rien confirmé : jamais compté comme gagné
          stats.bump("codesClaimed");
          stats.recordClaimDuration(elapsed);
          notifier.notify(
            `❔ Code ${code} : résultat inconnu (Binance n'a rien confirmé). ` +
              "Vérifie l'historique Cryptobox ; si ça se répète, signale-le.",
            { key: "claim-unknown", cooldownMs: HOUR },
          );
          break;

        case "deferred":
          leaveToOtherDevice(code, meta.postedAt);
          break;

        case "logged_out":
          // L'alerte est envoyée par browserHooks.onLoginRequired
          stats.bump("codesSkipped");
          logger.warn(`⏭️ Code ${code} non tenté (session Binance à reconnecter)`);
          break;

        case "page_unavailable":
          stats.bump("codesSkipped");
          logger.warn(`⏭️ Code ${code} non tenté (page Cryptobox inaccessible)`);
          notifier.notify(
            "⚠️ Page Cryptobox inaccessible : un code n'a pas pu être tenté. " +
              "Si ça se répète, vérifie la fenêtre Binance du bot (session, page bloquée).",
            { key: "page-unavailable", cooldownMs: 3 * HOUR },
          );
          break;

        default:
          // paused / browser_unavailable
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

/** Registre de l'autre appareil : ses codes ne seront jamais tentés ici. */
function onPeerCodes(codes, fromRole) {
  const added = history.addCodes(codes);
  if (added > 0) {
    logger.info(
      `📒 ${added} code(s) déjà tapé(s) par ${fromRole === "primary" ? "le PC" : "le téléphone"} ` +
        "ajouté(s) à l'historique",
    );
  }
}

// ─── Gestionnaires d'erreurs globales ────────────────────────────────────────

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
    if (shuttingDown) {
      // Second Ctrl+C : sortie immédiate
      if (signal === "SIGINT") process.exit(130);
      return;
    }
    shuttingDown = true;

    logger.blank();
    logger.warn(`🛑 Signal ${signal} — arrêt propre...`);

    // Publie « arrêté » → l'autre appareil reprend la main immédiatement
    await relay.shutdown().catch(() => {});

    if (queue.size > 0) {
      logger.info(`⏳ ${queue.size} code(s) encore en file — on les termine...`);
      await Promise.race([queue.drain(), new Promise((r) => setTimeout(r, 15000))]);
    }

    printStats("📊 Bilan final");
    await binance.closeBrowser();
    logger.banner(["👋 Bot arrêté proprement — à bientôt !"], logger.colors.yellow);
    process.exit(0);
  };

  // SIGHUP : fermeture de la fenêtre de console (Windows) ou du terminal
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));
}

// ─── Mode connexion (« node index.js --setup ») ─────────────────────────────

async function runSetup() {
  logger.blank();
  logger.banner(
    [
      "🔑 Connexion du bot — Telegram puis Binance",
      "Suis les instructions ci-dessous",
    ],
    logger.colors.cyan,
  );
  logger.blank();

  validateEnv();

  logger.rule("📡 Telegram");
  const { tg, me } = await loginTelegram();
  notifier.setChatId(me.id);

  logger.blank();
  logger.rule("🌐 Binance");
  await binance.initBrowser({});
  await binance.closeBrowser();
  await tg.destroy().catch(() => {});

  logger.blank();
  logger.rule("🔔 Alertes");
  if (notifier.isEnabled()) {
    const sent = await notifier.send(
      "🔔 Test : si tu lis ce message, les alertes du bot fonctionnent.",
    );
    if (sent) logger.success("🔔 Alerte de test envoyée — vérifie ton Telegram");
  } else {
    logger.warn(`🔕 Alertes ${notifier.describe()}`);
  }

  logger.blank();
  logger.banner(
    ["✅ Connexions OK", "Lance le bot : npm start"],
    logger.colors.green,
  );
  process.exit(0);
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

function announceOnline() {
  const where = relay.ROLE !== "solo" ? ` — ${relay.describeMode()}` : "";
  if (LAST_EXIT_CODE > 0) {
    notifier.notify(
      `♻️ Bot relancé après un arrêt inattendu (code ${LAST_EXIT_CODE})${where}.`,
      { key: "restart", cooldownMs: 15 * 60_000 },
    );
  } else {
    notifier.notify(`🟢 Bot en ligne${where}.`, {
      level: "all",
      key: "online",
      cooldownMs: 10 * 60_000,
    });
  }
}

async function main() {
  if (SETUP_MODE) return runSetup();

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
  startHeartbeat();
  startSleepDetector();
  if (ANDROID_APP && process.env.BOT_APP_VERSION) {
    logger.info(`📱 App Android : version ${process.env.BOT_APP_VERSION}`);
  }
  logger.info(`🤝 Rôle : ${relay.describeRole()}`);
  logger.info(`🔔 Alertes : ${notifier.describe()}`);

  // 2. Historique
  history.loadHistory();

  // 3. Canaux cibles
  const targetChannels = parseTargetChannels();
  if (targetChannels.length === 0) {
    logger.error("🎯 Aucun canal défini dans TARGET_CHANNELS");
    process.exit(1);
  }

  // 4. Navigateur Binance — PC / appareil seul : tout de suite, comme avant.
  //    Téléphone : seulement quand il prend le relais (voir onRelayActivate).
  //    App Android seule (solo) : après Telegram, pour que la connexion
  //    Telegram (faite dans l'app) n'attende pas la connexion Binance.
  const browserFirst = relay.ROLE !== "backup" && !ANDROID_APP;
  if (browserFirst) {
    await binance.initBrowser(browserHooks);
  }
  logger.info(`🎯 ${targetChannels.length} canal(aux) demandé(s) dans TARGET_CHANNELS`);

  // 5. Client Telegram — le relais démarre dès l'authentification, avant la
  //    résolution des canaux ; chaque code détecté est envoyé à Playwright
  logger.blank();
  logger.rule("📡 Telegram");
  const { tg } = await startTelegramClient(targetChannels, handleDetectedCode, {
    onSelfMessage: (msg) => relay.handleSelfMessage(msg),
    onConnectionState: (state) => relay.setConnectionState(state),
    onAuthenticated: async (client, me) => {
      telegram = client;
      // Connecté : Telegram est sain dès maintenant (la résolution des canaux
      // peut durer plusieurs minutes avant la première vérification)
      telegramHealthyAt = Date.now();
      notifier.setChatId(me.id);
      if (relay.ROLE !== "solo") {
        logger.blank();
        logger.rule("🤝 Relais PC ⇄ téléphone");
      }
      await relay.start(client, {
        getLocalState: () => binance.getStatus(),
        onActivate: onRelayActivate,
        onStandby: onRelayStandby,
        onPeerCodes,
        onSharedPause: (until, fromRole) => {
          if (binance.setPauseUntil(until)) {
            logger.warn(
              `🛑 Pause anti-ban partagée par ${fromRole === "primary" ? "le PC" : "le téléphone"} ` +
                `— aucun code jusqu'à ${fmtTime(until)}`,
            );
          }
        },
      });
      logger.blank();
      logger.rule("📡 Canaux");
    },
  });
  telegram = tg;
  startTelegramProbe();
  if (relay.ROLE !== "backup" && !browserFirst) onRelayActivate();

  // 6. Cron reset + bilan périodique + healthcheck
  scheduleDailyReset();
  scheduleStatsHeartbeat();
  startHealthcheck();

  logger.blank();
  logger.banner(
    [
      relay.ROLE === "backup"
        ? `🟢 Bot opérationnel — ${relay.describeMode()}`
        : "🟢 Bot opérationnel — En attente des Red Packets",
      STATS_INTERVAL_MIN > 0
        ? `⏱️ Bilan automatique toutes les ${STATS_INTERVAL_MIN} min`
        : "⏱️ Bilan périodique désactivé (STATS_INTERVAL_MIN=0)",
    ],
    logger.colors.green,
  );
  logger.blank();

  announceOnline();
}

main().catch(async (err) => {
  if (err?.code === "TG_LOGIN_REQUIRED") {
    logger.error(`🔑 ${err.message}`);
    await notifier.sendAndWait(`🔑 Session Telegram expirée : ${hints.telegramLogin}.`, {
      key: "tg-login",
      cooldownMs: 3 * HOUR,
    });
    process.exit(EXIT_LOGIN_REQUIRED);
  }

  logger.error(`💀 Erreur fatale : ${err.message}`);
  logger.error(err.stack ?? "");
  globalThis.__rpbHost?.event("fatal", { message: err.message });
  await notifier.sendAndWait(
    `💥 Erreur fatale : ${err.message}` +
      (UNATTENDED ? " — relance automatique." : ""),
    { key: "fatal", cooldownMs: 15 * 60_000 },
  );
  await relay.shutdown().catch(() => {});
  await binance.closeBrowser().catch(() => {});
  process.exit(1);
});
