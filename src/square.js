/**
 * square.js — Red Packets de Binance Square repérés sur Telegram
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  🧧 DES LIENS, PAS DES CODES                                             ║
 * ║                                                                          ║
 * ║  Des canaux comme @Packet_Red publient un lien vers un post Binance      ║
 * ║  Square, et la réponse à son quiz (Red Packet Quiz). Ce module reconnaît ║
 * ║  ces messages, réunit par numéro de post ce que disent les canaux et     ║
 * ║  garde le tout pour l'onglet 🧧 Square de l'app.                         ║
 * ║                                                                          ║
 * ║  Le bot lit l'état de chaque Red Packet depuis sa page Binance           ║
 * ║  (question, indice, épuisé, déjà pris), sans jamais cliquer ni répondre :║
 * ║  les règles de Square interdisent les bots. C'est toi qui ouvres le post ║
 * ║  et qui réponds. Dès que Binance le marque pris, le lien et la réponse   ║
 * ║  partent sur ton canal.                                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Deux fichiers à côté du signe de vie (écrits seulement dans l'app) :
 *   square.json        écrit ici, lu par l'app ;
 *   square-marks.json  écrit par l'app (« Pris », « Raté »…), lu ici.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const logger = require("./logger");

const HOUR = 3600_000;
const SAVE_DELAY_MS = 2000;
const MAX_ITEMS = 300;
const MAX_AGE_MS = 7 * 24 * HOUR;
const MAX_ANSWERS = 5;
const MAX_SOURCES = 8;
const MAX_ANSWER_LENGTH = 120;
// Statut jamais lu sur Binance : au-delà, un Red Packet quitte « À prendre ».
// Même valeur dans SquareLog.kt.
const TAKE_WINDOW_MS = 24 * HOUR;
// Gain marqué bot arrêté : publié au démarrage s'il est plus récent
const PUBLISH_WINDOW_MS = 24 * HOUR;

// Lecture de l'état sur Binance : une seule à la fois, très espacées
const CHECK_TICK_MS = 30_000;
const RECHECK_MS = 20 * 60_000; // Red Packet à prendre
const OPENED_RECHECK_MS = 60_000; // ouvert dans Binance : pris ou pas ?
const OPENED_WATCH_MS = 15 * 60_000;
const MAX_CHECK_ERRORS = 3;
const CHECK_PAUSE_MS = 30 * 60_000;

const truthy = (raw, fallback) => {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "oui", "yes", "on"].includes(value);
};

const HEARTBEAT_FILE = (process.env.BOT_HEARTBEAT_FILE ?? "").trim();
const RUN_DIR = HEARTBEAT_FILE ? path.dirname(HEARTBEAT_FILE) : "";
const FILE = RUN_DIR ? path.join(RUN_DIR, "square.json") : "";
const MARKS_FILE = RUN_DIR ? path.join(RUN_DIR, "square-marks.json") : "";

const ENABLED = truthy(process.env.SQUARE_ENABLED, true);
/** Lire l'état des Red Packets sur Binance (app Android seulement). */
const CHECK = ENABLED && Boolean(FILE) && truthy(process.env.SQUARE_CHECK, true);
/** Canaux de liens : écoutés, jamais une source de codes (src/telegram.js). */
const CHANNELS = ENABLED
  ? String(process.env.SQUARE_CHANNELS ?? "").split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean)
  : [];

// ─── Fonctions pures (testées par test/guard.js) ────────────────────────────

// Lien partagé depuis l'appli (uni-qr/cpos : post, uni-qr/cart : article)
const RE_SHARE_LINK = /binance\.(?:com|info)\/uni-qr\/([a-z]+)\/(\d{5,20})/gi;
// Adresse du site, avec ou sans titre devant le numéro
const RE_SITE_LINK =
  /binance\.(?:com|info)\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?(?:square|feed)\/post\/(?:[a-z0-9-]*-)?(\d{5,20})/gi;

// « 🎰 USDT ~ 0.00098655 | Random 🎲 »
const RE_PRIZE = /([A-Z][A-Z0-9]{1,9})\s*~\s*([0-9]+(?:[.,][0-9]+)?)?/;
const RE_SPLIT = /\b(random|fixed)\b/i;
// Titre fait d'un seul mot : « 🎁 USDT 🎁 », « 💓 BTC 💓 »
const RE_TITLE_COIN = /^[^A-Za-z0-9]*([A-Z][A-Z0-9]{1,9})[^A-Za-z0-9]*$/;
// Libellés de ces canaux, pas des cryptos
const NOT_A_COIN = new Set(["CLAIM", "BOX", "FREE", "ANSWER"]);

// « 🎯Answer » SOL », « 💎Ans » ✨SOL✨ », « Réponse : SOL »
const RE_ANSWER = /(?:^|[^A-Za-zÀ-ÿ])(?:ans|answer|r[ée]ponse)\s*[»:：>=\-–—]+\s*(.+)$/im;
const RE_ANSWER_EDGES = /^[\s✨⭐🌟💎`*_"'«»“”]+|[\s✨⭐🌟💎`*_"'«»“”]+$/gu;
// « CLAIM BOX » : pas de question, le Red Packet s'ouvre directement
const RE_NO_QUESTION = /^claim(?:\s*box)?$/i;

const cleanAnswer = (text) => String(text ?? "").replace(RE_ANSWER_EDGES, "").trim();

/**
 * Liens vers des posts Binance Square, sans doublon.
 * @param {string} text
 * @returns {{ id: string, segment: string }[]} segment : cpos (post), cart (article)…
 */
function parseLinks(text) {
  const found = new Map();
  for (const m of String(text ?? "").matchAll(RE_SHARE_LINK)) {
    if (!found.has(m[2])) found.set(m[2], m[1].toLowerCase());
  }
  for (const m of String(text ?? "").matchAll(RE_SITE_LINK)) {
    if (!found.has(m[1])) found.set(m[1], "cpos");
  }
  return [...found].map(([id, segment]) => ({ id, segment }));
}

/** Lien qui ouvre le post dans l'appli Binance, sans le parrainage de personne. */
function cleanLink({ id, segment }) {
  return `https://app.binance.com/uni-qr/${segment || "cpos"}/${id}?uc=app_square_share_link&us=copylink`;
}

/** Crypto, montant et partage annoncés par le canal (chacun peut manquer). */
function parsePrize(plain) {
  const text = String(plain ?? "");
  const prize = RE_PRIZE.exec(text);
  const firstLine = text.split("\n").find((line) => line.trim()) ?? "";
  const named = prize?.[1] ?? RE_TITLE_COIN.exec(firstLine)?.[1] ?? "";
  return {
    coin: NOT_A_COIN.has(named) ? "" : named,
    amount: (prize?.[2] ?? "").replace(",", "."),
    split: (RE_SPLIT.exec(text)?.[1] ?? "").toLowerCase(),
  };
}

/**
 * Réponse publiée par le canal : ligne « Answer » (le monospace y donne le texte
 * exact, sans décoration), sinon le monospace seul (format de @BoxxSquare).
 * @param {{ plain: string, trusted: string[] }} sources
 */
function parseAnswer({ plain, trusted = [] }) {
  const spots = trusted.map((t) => String(t).trim()).filter(Boolean);
  const labelled = cleanAnswer(RE_ANSWER.exec(String(plain ?? ""))?.[1]);
  const answer =
    labelled && !/^https?:/i.test(labelled)
      ? spots.find((spot) => labelled.includes(spot)) ?? labelled
      : spots[0] ?? "";
  return answer.slice(0, MAX_ANSWER_LENGTH);
}

/**
 * Ce que dit un message Telegram (voir buildMessageSources), un élément par post.
 * @param {{ plain: string, trusted: string[] }} sources
 */
function parseMessage(sources) {
  const links = parseLinks(sources.plain);
  if (links.length === 0) return [];
  const prize = parsePrize(sources.plain);
  const answer = parseAnswer(sources);
  const direct = RE_NO_QUESTION.test(answer);
  return links.map((link) => ({
    ...link,
    ...prize,
    type: direct ? "direct" : answer ? "quiz" : "",
    answer: direct ? "" : answer,
  }));
}

/**
 * Ajoute ce qu'un canal dit d'un post à ce qu'on sait déjà. Deux canaux qui
 * donnent la même réponse la confirment ; les réponses les plus citées d'abord.
 * @param {object|undefined} item
 * @param {object} sighting - élément de parseMessage
 * @param {string} channel
 * @param {number} at - heure du message
 */
function mergeSighting(item, sighting, channel, at) {
  const next = item ?? {
    id: sighting.id,
    segment: sighting.segment,
    type: "",
    coin: "",
    amount: "",
    split: "",
    answers: [],
    sources: [],
    firstAt: at,
    lastAt: at,
    publishedAt: 0,
    checkedAt: 0,
    receivedAt: 0,
    state: "",
    quiz: "",
    hint: "",
    total: 0,
    expiresAt: 0,
  };
  next.lastAt = Math.max(next.lastAt, at);
  next.coin = next.coin || sighting.coin;
  next.amount = next.amount || sighting.amount;
  next.split = next.split || sighting.split;

  if (sighting.answer) {
    const key = sighting.answer.toLowerCase();
    let entry = next.answers.find((a) => a.text.toLowerCase() === key);
    if (!entry && next.answers.length < MAX_ANSWERS) {
      entry = { text: sighting.answer, from: [] };
      next.answers.push(entry);
    }
    if (entry && channel && !entry.from.includes(channel)) entry.from.push(channel);
    next.answers.sort((a, b) => b.from.length - a.from.length);
  }
  // Une vraie réponse prouve le quiz, même si un autre canal a écrit « CLAIM BOX ».
  // Une fois lu sur Binance, le type n'est plus deviné.
  if (!next.checkedAt) next.type = next.answers.length > 0 ? "quiz" : next.type || sighting.type;
  if (channel && !next.sources.includes(channel) && next.sources.length < MAX_SOURCES) next.sources.push(channel);
  return next;
}

const textOf = (value) => String(value ?? "").trim().slice(0, MAX_ANSWER_LENGTH);

/**
 * Ajoute à un Red Packet ce que Binance en dit (voir readSquarePost). Binance
 * prime sur les canaux. `type` 1 : quiz, 2 : sans question.
 * @returns {object} item, complété
 */
function applyInfo(item, info, now) {
  item.checkedAt = now;
  item.coin = textOf(info.currency).toUpperCase() || item.coin;
  item.quiz = textOf(info.quiz);
  item.hint = textOf(info.answerHint);
  item.total = Number(info.number) || item.total || 0;
  item.expiresAt = Number(info.expiredTime) || item.expiresAt || 0;
  if (info.type === 1) item.type = "quiz";
  else if (info.type === 2) item.type = "direct";
  item.state = info.isRunOut ? "runout" : info.isExpired ? "expired" : "open";
  if (info.isReceivedByCurrentUser && !item.receivedAt) item.receivedAt = now;
  return item;
}

/** Plus rien à prendre : épuisé ou expiré, d'après Binance. */
function isFinished(item, now) {
  return item.state === "runout" || item.state === "expired" || (item.expiresAt > 0 && item.expiresAt <= now);
}

/** Red Packets encore à prendre, d'après Binance et tes marques. */
function takeList(items, marks, now) {
  return items.filter((item) => {
    if (marks[item.id] || item.receivedAt || isFinished(item, now)) return false;
    return item.expiresAt > 0 || now - item.firstAt < TAKE_WINDOW_MS;
  });
}

/** Red Packets pris (vu sur Binance, ou marqué par toi) pas encore publiés. */
function winsToPublish(items, marks, now) {
  return items.filter((item) => {
    if (item.publishedAt) return false;
    const mark = marks[item.id];
    const at = item.receivedAt || (mark?.mark === "won" ? mark.at || 0 : 0);
    return at > 0 && now - at < PUBLISH_WINDOW_MS;
  });
}

/**
 * Prochain Red Packet à relire sur Binance : d'abord celui que tu viens d'ouvrir
 * (pris ou pas ?), puis les jamais lus, puis le plus ancien relevé.
 */
function nextToCheck(items, marks, now) {
  const live = items.filter((item) => !item.receivedAt && !isFinished(item, now));
  const opened = live.find((item) => {
    const mark = marks[item.id];
    return mark?.mark === "opened" && now - mark.at < OPENED_WATCH_MS && now - item.checkedAt >= OPENED_RECHECK_MS;
  });
  if (opened) return opened;
  // Ouvert puis laissé de côté : relu au rythme lent, il peut encore être pris
  const waiting = live.filter((item) => !marks[item.id] || marks[item.id].mark === "opened");
  return (
    waiting.find((item) => !item.checkedAt) ??
    waiting
      .filter((item) => now - item.checkedAt >= RECHECK_MS)
      .sort((a, b) => a.checkedAt - b.checkedAt)[0] ??
    null
  );
}

/** « USDT · réponse : SOL », pour les logs et la notification. */
function describeItem(item) {
  const answer = item.answers?.[0]?.text || item.hint;
  const what = item.type === "direct" ? "sans question" : answer ? `réponse : ${answer}` : "réponse à trouver";
  return [item.coin, what].filter(Boolean).join(" · ");
}

// ─── Fonctionnement ─────────────────────────────────────────────────────────

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

function empty() {
  return { v: 1, items: [] };
}

let data = empty();
let saveTimer = null;
let seen = 0;
let listening = false;
/** @type {((item: object) => boolean) | null} */
let publish = null;
/** @type {((id: string) => Promise<object|null>) | null} */
let readPost = null;
let checking = false;
let checkErrors = 0;
let checkPausedUntil = 0;

function writeNow() {
  saveTimer = null;
  if (!FILE) return;
  const oldest = Date.now() - MAX_AGE_MS;
  data.items = data.items.filter((item) => item.lastAt >= oldest).slice(0, MAX_ITEMS);
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

function save() {
  if (!FILE || saveTimer) return;
  saveTimer = setTimeout(writeNow, SAVE_DELAY_MS);
  saveTimer.unref?.();
}

/** Arrêt : écrit tout de suite ce qui attend. */
function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    writeNow();
  }
}

function readMarks() {
  if (!MARKS_FILE) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(MARKS_FILE, "utf-8"));
    return isObject(raw) ? raw : {};
  } catch (_) {
    return {}; // pas encore de marque
  }
}

/** Relit le fichier (redémarrage du bot : l'onglet 🧧 Square est gardé). */
function load() {
  if (!FILE) return;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    if (isObject(raw) && Array.isArray(raw.items)) data = { v: 1, items: raw.items.slice(0, MAX_ITEMS) };
  } catch (_) {
    /* absent ou illisible : on repart de zéro */
  }
}

/** Notification regroupée de l'app : combien à prendre, et le plus récent. */
function announce() {
  const host = globalThis.__rpbHost;
  if (!host) return;
  const list = takeList(data.items, readMarks(), Date.now());
  host.event("square_update", { count: list.length, text: list[0] ? describeItem(list[0]) : "" });
}

/** Tes gains marqués « Pris » : sur ton canal, une seule fois. */
function publishWins() {
  if (!publish) return;
  for (const item of winsToPublish(data.items, readMarks(), Date.now())) {
    const sent = publish({ ...item, answer: item.answers[0]?.text || item.hint, link: cleanLink(item) });
    if (sent) item.publishedAt = Date.now();
  }
  save();
}

/** Relit un Red Packet sur Binance. Refus répétés : tout s'arrête 30 min. */
async function checkNext() {
  if (checking || !readPost || Date.now() < checkPausedUntil) return;
  const item = nextToCheck(data.items, readMarks(), Date.now());
  if (!item) return;
  checking = true;
  try {
    const info = await readPost(item.id);
    if (!info) return; // page occupée ou pas prête : prochain passage
    if (info.refused !== undefined) {
      checkErrors++;
      logger.debug(`🧧 Lecture de ${item.id} refusée par Binance : ${info.refused}`);
      if (checkErrors >= MAX_CHECK_ERRORS) {
        checkErrors = 0;
        checkPausedUntil = Date.now() + CHECK_PAUSE_MS;
        logger.warn(`🧧 Binance refuse les lectures Square (${info.refused}) : pause de 30 min`);
      }
      return;
    }
    checkErrors = 0;
    const known = item.receivedAt;
    applyInfo(item, info, Date.now());
    if (item.receivedAt && !known) logger.success(`🧧 Red Packet Square pris : ${describeItem(item)}`);
    save();
    publishWins();
    announce();
  } finally {
    checking = false;
  }
}

/**
 * Message Telegram avec un lien Square.
 * @param {{ plain: string, trusted: string[] }} sources
 * @param {{ channel?: string, postedAt?: number, quiet?: boolean }} [meta]
 *   quiet : rattrapage au démarrage, l'alerte part à la fin (voir announce).
 */
function handle(sources, meta = {}) {
  if (!ENABLED) return;
  const at = meta.postedAt ?? Date.now();
  let added = 0;
  for (const sighting of parseMessage(sources)) {
    const known = data.items.find((item) => item.id === sighting.id);
    const item = mergeSighting(known, sighting, meta.channel ?? "", at);
    if (known) continue;
    data.items.unshift(item);
    added++;
    seen++;
    logger.info(`🧧 Red Packet Square : ${describeItem(item)} — depuis ${meta.channel ?? "?"}`);
  }
  if (data.items.length > MAX_ITEMS) data.items.length = MAX_ITEMS;
  save();
  if (added > 0 && !meta.quiet) announce();
}

/**
 * Démarre l'onglet Square.
 * @param {{ publish: (item: object) => boolean, readPost?: (id: string) => Promise<object|null> }} options
 *   publish : poste un gain sur ton canal, false si aucun canal n'est réglé.
 *   readPost : état d'un Red Packet sur Binance (src/binance.js).
 */
function start(options) {
  publish = options.publish;
  const host = globalThis.__rpbHost;
  if (!ENABLED) return;
  if (CHECK && options.readPost && !readPost) {
    readPost = options.readPost;
    setInterval(() => {
      checkNext().catch((err) => logger.error(`💥 🧧 Lecture Square : ${err.message}`));
    }, CHECK_TICK_MS).unref?.();
  }
  if (host && !listening) {
    listening = true;
    host.on("square.mark", () => {
      try {
        publishWins();
        announce();
      } catch (err) {
        logger.error(`💥 🧧 Marque Square illisible : ${err.message}`);
      }
    });
  }
  publishWins();
  announce();
}

function describe() {
  if (!ENABLED) return "désactivé (SQUARE_ENABLED=false)";
  const where = CHANNELS.length > 0 ? `liens lus sur ${CHANNELS.join(", ")}, et dans tes canaux de codes` : "liens lus dans tes canaux de codes";
  return `${where}${CHECK ? " · état lu sur Binance" : ""}`;
}

/** Lignes du bilan d'activité. */
function statsRows() {
  return ENABLED && seen > 0 ? [["🧧 Red Packets Square", seen]] : [];
}

module.exports = {
  ENABLED,
  CHANNELS,
  load,
  start,
  handle,
  announce,
  flush,
  describe,
  statsRows,
  // Exposés pour les tests
  parseLinks,
  cleanLink,
  parsePrize,
  parseAnswer,
  parseMessage,
  mergeSighting,
  applyInfo,
  isFinished,
  takeList,
  winsToPublish,
  nextToCheck,
  describeItem,
};
