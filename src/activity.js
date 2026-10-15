/**
 * activity.js — Journal d'activité lu par l'app Android
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  📜 CE QUE L'ÉCRAN D'ACCUEIL AFFICHE                                     ║
 * ║                                                                          ║
 * ║  Un seul fichier JSON (bot-data/.run/activity.json, à côté du signe de   ║
 * ║  vie), écrit seulement dans l'app (BOT_HEARTBEAT_FILE posé) :            ║
 * ║   • items   : les 50 derniers codes et leur résultat ;                   ║
 * ║   • hours   : codes détectés / gagnés par heure (48 h) → graphique 24 h ;║
 * ║   • gains   : montants gagnés par crypto, aujourd'hui et au total, et    ║
 * ║               leur valeur en dollars (prix public Binance) ;            ║
 * ║   • sources : par canal Telegram et par compte X (détectés, gagnés,      ║
 * ║               dernier message vu).                                       ║
 * ║  Écriture atomique et regroupée : jamais plus d'une toutes les 2 s.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { priceUsd } = require("./prices");

const HEARTBEAT_FILE = (process.env.BOT_HEARTBEAT_FILE ?? "").trim();
const FILE = HEARTBEAT_FILE ? path.join(path.dirname(HEARTBEAT_FILE), "activity.json") : "";

const HOUR = 3600_000;
const MAX_ITEMS = 50;
const HOURS_KEPT = 48;
const SOURCE_MAX_AGE_MS = 30 * 24 * HOUR;
const MAX_SOURCES = 400;
const SAVE_DELAY_MS = 2000;
// Simple message vu (canal actif) : écriture moins pressée
const SEEN_SAVE_DELAY_MS = 15_000;

const dayKey = (ts = Date.now()) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const hourKey = (ts) => String(Math.floor(ts / HOUR) * HOUR);

function empty() {
  return {
    v: 1,
    since: Date.now(),
    items: [],
    hours: {},
    gains: { day: dayKey(), today: {}, total: {}, todayUsd: 0, totalUsd: 0 },
    sources: {},
  };
}

let data = empty();
let saveTimer = null;
let saveDue = 0;

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

/** Relit le fichier (redémarrage du bot : l'historique de l'écran est gardé). */
function load() {
  if (!FILE) return;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    if (!isObject(raw)) return;
    const base = empty();
    data = {
      v: 1,
      since: Number(raw.since) || base.since,
      items: Array.isArray(raw.items) ? raw.items.slice(0, MAX_ITEMS) : [],
      hours: isObject(raw.hours) ? raw.hours : {},
      gains: isObject(raw.gains) ? { ...base.gains, ...raw.gains } : base.gains,
      sources: isObject(raw.sources) ? raw.sources : {},
    };
  } catch (_) {
    /* absent ou illisible : on repart de zéro */
  }
  rollDay();
  // Gains enregistrés sans valeur en dollars (prix indisponible à ce moment-là)
  for (const item of data.items) {
    if (item.status === "won" && !Number.isFinite(item.gainUsd)) void fillUsd(item);
  }
}

/**
 * Valeur en dollars d'un gain : « ≈ $ » lu sur Binance, sinon prix public de
 * Binance (src/prices.js). Ajoutée au gain et aux totaux, puis écrite.
 */
async function fillUsd(item) {
  const parsed = parseGain(item.gain);
  if (!parsed) return;
  const price = await priceUsd(parsed.coin);
  if (!price || Number.isFinite(item.gainUsd)) return;
  item.gainUsd = parsed.amount * price;
  data.gains.totalUsd += item.gainUsd;
  if (dayKey(item.at) === data.gains.day) data.gains.todayUsd += item.gainUsd;
  save();
}

function writeNow() {
  saveTimer = null;
  saveDue = 0;
  if (!FILE) return;
  prune();
  const json = JSON.stringify(data);
  const tmp = `${FILE}.tmp`;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, FILE);
  } catch (_) {
    try {
      fs.writeFileSync(FILE, json);
    } catch (_) {
      /* non bloquant */
    }
  }
}

function save(delayMs = SAVE_DELAY_MS) {
  if (!FILE) return;
  const due = Date.now() + delayMs;
  if (saveTimer && saveDue <= due) return; // une écriture plus proche est déjà prévue
  if (saveTimer) clearTimeout(saveTimer);
  saveDue = due;
  saveTimer = setTimeout(writeNow, delayMs);
  saveTimer.unref?.();
}

function prune() {
  const oldestHour = Date.now() - HOURS_KEPT * HOUR;
  for (const key of Object.keys(data.hours)) if (Number(key) < oldestHour) delete data.hours[key];

  const oldestSource = Date.now() - SOURCE_MAX_AGE_MS;
  const entries = Object.entries(data.sources);
  for (const [name, s] of entries) {
    if (Math.max(s.lastMsgAt || 0, s.lastCodeAt || 0) < oldestSource) delete data.sources[name];
  }
  const left = Object.entries(data.sources);
  if (left.length > MAX_SOURCES) {
    left
      .sort((a, b) => (a[1].lastMsgAt || 0) - (b[1].lastMsgAt || 0))
      .slice(0, left.length - MAX_SOURCES)
      .forEach(([name]) => delete data.sources[name]);
  }
}

/** Nouveau jour : les gains « aujourd'hui » repartent de zéro. */
function rollDay() {
  const today = dayKey();
  if (data.gains.day === today) return;
  data.gains.day = today;
  data.gains.today = {};
  data.gains.todayUsd = 0;
}

function sourceOf(channel, origin) {
  const name = String(channel || "?").slice(0, 80);
  let s = data.sources[name];
  if (!s) {
    s = { origin, detected: 0, won: 0, lastMsgAt: 0, lastCodeAt: 0 };
    data.sources[name] = s;
  }
  return s;
}

function bumpHour(field, ts = Date.now()) {
  const key = hourKey(ts);
  const slot = data.hours[key] ?? (data.hours[key] = { d: 0, w: 0 });
  slot[field] = (slot[field] || 0) + 1;
}

/**
 * « 0.0009 SPELL » → { amount: 0.0009, coin: "SPELL" }, ou null.
 * @param {string} gain
 */
function parseGain(gain) {
  const m = /([0-9]+(?:[.,][0-9]+)?)\s*([A-Z][A-Z0-9]{1,9})/.exec(String(gain ?? ""));
  if (!m) return null;
  const amount = Number(m[1].replace(",", "."));
  return Number.isFinite(amount) ? { amount, coin: m[2] } : null;
}

// ─── API ────────────────────────────────────────────────────────────────────

/** Message reçu d'un canal surveillé (ou post X) : « dernier message vu ». */
function channelSeen(channel, origin = "telegram") {
  if (!FILE) return;
  sourceOf(channel, origin).lastMsgAt = Date.now();
  save(SEEN_SAVE_DELAY_MS);
}

/** Code détecté (avant toute décision : réclamé, laissé, sauté…). */
function detected(meta = {}) {
  if (!FILE) return;
  const s = sourceOf(meta.channel, meta.origin || "telegram");
  s.detected++;
  s.lastCodeAt = Date.now();
  bumpHour("d");
  save();
}

/**
 * Issue d'un code.
 * @param {string} code
 * @param {object} meta - { channel, origin, source }
 * @param {'won'|'failed'|'guarded'|'deferred'|'skipped'|'unknown'|'paused'|'error'|'dry'} status
 * @param {{ gain?: string, gainUsd?: number, latencyMs?: number }} [extra]
 */
function record(code, meta = {}, status, extra = {}) {
  if (!FILE) return;
  rollDay();
  const item = {
    code,
    origin: meta.origin || "telegram",
    channel: meta.channel || "",
    source: meta.source || "",
    status,
    gain: extra.gain || "",
    gainUsd: Number.isFinite(extra.gainUsd) ? extra.gainUsd : null,
    at: Date.now(),
    latencyMs: Number.isFinite(extra.latencyMs) ? Math.round(extra.latencyMs) : null,
  };
  data.items.unshift(item);
  if (data.items.length > MAX_ITEMS) data.items.length = MAX_ITEMS;

  if (status === "won") {
    bumpHour("w");
    sourceOf(meta.channel, item.origin).won++;
    const parsed = parseGain(item.gain);
    if (parsed) {
      data.gains.today[parsed.coin] = (data.gains.today[parsed.coin] || 0) + parsed.amount;
      data.gains.total[parsed.coin] = (data.gains.total[parsed.coin] || 0) + parsed.amount;
    }
    if (item.gainUsd !== null) {
      data.gains.todayUsd += item.gainUsd;
      data.gains.totalUsd += item.gainUsd;
    } else {
      void fillUsd(item);
    }
  }
  save();
}

/** Arrêt : écrit tout de suite ce qui attend. */
function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    writeNow();
  }
}

module.exports = {
  ENABLED: Boolean(FILE),
  load,
  channelSeen,
  detected,
  record,
  flush,
  // Exposé pour les tests
  parseGain,
};
