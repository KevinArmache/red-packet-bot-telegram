/**
 * notifier.js — Alertes Telegram via ton bot personnel (API Bot)
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  🔔 DES ALERTES QUI SONNENT VRAIMENT                                     ║
 * ║                                                                          ║
 * ║  Un message que tu t'envoies dans tes « Messages enregistrés » ne        ║
 * ║  déclenche aucune notification. Les alertes passent donc par TON bot     ║
 * ║  (créé en 2 minutes avec @BotFather) :                                   ║
 * ║   • vraie notification sur ton téléphone ;                               ║
 * ║   • fonctionne même si la session Telegram du userbot est cassée ;       ║
 * ║   • le userbot, lui, reste passif.                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Réglages (.env) :
 *   ALERT_BOT_TOKEN  jeton donné par @BotFather (vide = alertes désactivées)
 *   ALERT_CHAT_ID    facultatif — par défaut, ton propre identifiant Telegram
 *   NOTIFY_LEVEL     off | problems | all (défaut : off)
 *
 * ⚠️ Envoie une fois /start à ton bot : sans ça, Telegram lui interdit de
 *    t'écrire en premier.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const { dataPath } = require("./paths");

const TOKEN = (process.env.ALERT_BOT_TOKEN ?? "").trim();
const LEVEL = normalizeLevel(process.env.NOTIFY_LEVEL);
const ROLE = (process.env.BOT_ROLE ?? "primary").trim().toLowerCase();

/** Préfixe des alertes : distingue le PC du téléphone. */
const LABEL =
  (process.env.BOT_NAME ?? "").trim() ||
  (ROLE === "backup" ? "📱 Téléphone" : "💻 PC");

const CHAT_ID_FILE = dataPath(".alert-chat-id");
const STATE_FILE = dataPath(".run", "alerts.json");
const SEND_TIMEOUT_MS = 8000;

function normalizeLevel(raw) {
  const level = String(raw ?? "off").trim().toLowerCase();
  return ["off", "problems", "all"].includes(level) ? level : "off";
}

function readFileSafe(file) {
  try {
    return fs.readFileSync(file, "utf-8").trim();
  } catch (_) {
    return "";
  }
}

let chatId = (process.env.ALERT_CHAT_ID ?? "").trim() || readFileSafe(CHAT_ID_FILE);
let warnedMissingChat = false;

// Alertes en cours d'envoi, par type : pas de doublon si deux arrivent ensemble
const inFlight = new Set();

// Dernier envoi par type d'alerte — conservé sur disque pour qu'un bot qui
// redémarre en boucle n'envoie pas la même alerte à chaque relance.
const lastSentAt = loadState();

function loadState() {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"))));
  } catch (_) {
    return new Map();
  }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(Object.fromEntries(lastSentAt)));
  } catch (_) {
    /* non bloquant */
  }
}

/** Les alertes sont-elles configurées ? */
function isEnabled() {
  return Boolean(TOKEN) && LEVEL !== "off";
}

/** Résumé lisible de la configuration, pour les logs de démarrage. */
function describe() {
  if (!TOKEN) return "désactivées (ALERT_BOT_TOKEN vide)";
  if (LEVEL === "off") return "désactivées (NOTIFY_LEVEL=off)";
  const scope = LEVEL === "all" ? "problèmes + gains" : "problèmes uniquement";
  return `activées — ${scope}, via ton bot Telegram`;
}

/**
 * Mémorise le destinataire des alertes (ton identifiant Telegram).
 * Conservé dans .alert-chat-id pour pouvoir prévenir même si, au prochain
 * démarrage, la session Telegram du bot est cassée.
 * @param {number|string} id
 */
function setChatId(id) {
  if (!id || (process.env.ALERT_CHAT_ID ?? "").trim()) return;
  const value = String(id);
  if (value === chatId) return;
  chatId = value;
  try {
    fs.writeFileSync(CHAT_ID_FILE, value);
  } catch (_) {
    /* non bloquant */
  }
}

/**
 * Envoie une alerte. Ne lève jamais d'erreur.
 * @param {string} text
 * @param {{ level?: 'problems'|'all', key?: string, cooldownMs?: number }} [opts]
 *   level      : 'problems' (défaut) ou 'all' (informations, gains)
 *   key        : type d'alerte, pour le délai minimum entre deux envois
 *   cooldownMs : délai minimum entre deux alertes du même `key`
 * @returns {Promise<boolean>} true si l'alerte est partie.
 */
async function send(text, { level = "problems", key, cooldownMs = 0 } = {}) {
  if (!isEnabled()) return false;
  if (level === "all" && LEVEL !== "all") return false;

  if (!chatId) {
    if (!warnedMissingChat) {
      warnedMissingChat = true;
      logger.warn(
        "🔕 Alertes : destinataire inconnu — il sera connu après la première\n" +
          "    connexion Telegram (ou renseigne ALERT_CHAT_ID dans .env).",
      );
    }
    return false;
  }

  const throttled = Boolean(key && cooldownMs > 0);
  if (throttled) {
    const last = Number(lastSentAt.get(key) ?? 0);
    if (Date.now() - last < cooldownMs || inFlight.has(key)) return false;
    inFlight.add(key);
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${LABEL} · ${text}`,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const reason = body.description || `HTTP ${res.status}`;
      const hint = /chat not found|can't initiate|blocked/i.test(reason)
        ? " — envoie /start à ton bot d'alertes"
        : /unauthorized|not found/i.test(reason)
          ? " — vérifie ALERT_BOT_TOKEN"
          : "";
      logger.warn(`🔕 Alerte non envoyée : ${reason}${hint}`);
      return false;
    }

    // Le délai minimum ne démarre qu'une fois l'alerte VRAIMENT livrée : un
    // échec (réseau, arrêt du bot) ne doit pas faire taire la suivante.
    if (throttled) {
      lastSentAt.set(key, Date.now());
      saveState();
    }
    logger.debug(`🔔 Alerte envoyée : ${text.split("\n")[0]}`);
    return true;
  } catch (err) {
    const reason = err?.name === "TimeoutError" ? "délai dépassé" : err?.message;
    logger.warn(`🔕 Alerte non envoyée : ${reason}`);
    return false;
  } finally {
    if (throttled) inFlight.delete(key);
  }
}

/** Envoi « tire et oublie » : ne bloque jamais le traitement des codes. */
function notify(text, opts) {
  void send(text, opts);
}

/**
 * Envoi borné dans le temps — à utiliser juste avant un `process.exit()`,
 * pour que l'alerte parte vraiment sans retarder l'arrêt trop longtemps.
 * L'attente couvre le délai de la requête (8 s) : sur données mobiles, la
 * connexion à api.telegram.org peut prendre plusieurs secondes.
 */
async function sendAndWait(text, opts, maxWaitMs = SEND_TIMEOUT_MS + 1000) {
  await Promise.race([
    send(text, opts),
    new Promise((resolve) => setTimeout(resolve, maxWaitMs)),
  ]);
}

module.exports = {
  LABEL,
  isEnabled,
  describe,
  setChatId,
  send,
  notify,
  sendAndWait,
};
