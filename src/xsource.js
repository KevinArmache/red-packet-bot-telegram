/**
 * xsource.js — Codes Red Packet publiés sur X (Twitter)
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  🐦 NI SCRAPING, NI API : LES NOTIFICATIONS DE L'APPLI X                 ║
 * ║                                                                          ║
 * ║  Sur le téléphone, l'app Android lit les notifications de l'appli X      ║
 * ║  officielle (comptes suivis avec la cloche « Tous les posts ») et en     ║
 * ║  transmet le texte ici (message « x.post » du pont). Les codes sont      ║
 * ║  extraits avec les MÊMES règles que Telegram (src/telegram.js).          ║
 * ║                                                                          ║
 * ║  Qui réclame ?                                                           ║
 * ║   • téléphone seul (solo) ou responsable en ce moment : lui, tout de     ║
 * ║     suite ;                                                              ║
 * ║   • sinon (téléphone en veille, le PC réclame) : message silencieux      ║
 * ║     « #xcode … » dans les Messages enregistrés. Le PC le lit et les deux ║
 * ║     appareils jugent sur la MÊME date serveur Telegram (relay.canClaim), ║
 * ║     exactement comme pour un code publié dans un canal.                  ║
 * ║                                                                          ║
 * ║  L'anti-blocage s'applique comme partout (handleDetectedCode).           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

const logger = require("./logger");
const stats = require("./stats");
const history = require("./history");
const notifier = require("./notifier");
const { extractCodes, isPlausibleCode } = require("./telegram");

const truthy = (raw, fallback) => {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "oui", "yes", "on"].includes(value);
};

// ─── Réglages ───────────────────────────────────────────────────────────────

/** Téléphone : lecture des notifications X. */
const ENABLED = truthy(process.env.X_ENABLED, false);
/** Essai à blanc : toute la chaîne tourne, mais aucun code n'est tapé. */
const DRY_RUN = truthy(process.env.X_DRY_RUN, false);
/** PC : réclame les codes X relayés par le téléphone (#xcode). */
const ACCEPT_RELAYED = truthy(process.env.X_RELAY_ACCEPT, true);
const IS_DEBUG = process.env.DEBUG === "true";
const MAX_AGE_MS = Math.max(0, parseInt(process.env.MAX_MESSAGE_AGE_S ?? "180", 10) || 0) * 1000;

const X_PACKAGE = "com.twitter.android";
// Notifications de test envoyées par adb (cmd notification post) : acceptées
// UNIQUEMENT en essai à blanc
const TEST_PACKAGE = "com.android.shell";
const TAG = "#xcode";
const RELAY_MAX_AGE_MS = 30_000; // un #xcode plus vieux est ignoré
const RELAY_DELETE_AFTER_MS = 10 * 60_000; // ménage des Messages enregistrés
const MAX_TEXT = 2000;
const SOURCES = ["monospace", "lien", "label", "texte"];

const XCODE_RE = new RegExp(
  `^${TAG} ([A-Z0-9]{8}) src=(${SOURCES.join("|")}) from=(@[A-Za-z0-9_]{1,15}|-) ` +
    "at=(\\d{10,13}) inst=([0-9a-f]{8})( dry=1)?$",
);

// ─── Fonctions pures (testées par test/guard.js) ────────────────────────────

/**
 * Liste de comptes X : « @Binance, cz_binance » → ["binance", "cz_binance"].
 * @param {string} raw
 */
function parseAccounts(raw) {
  const out = [];
  for (const part of String(raw ?? "").split(/[\s,;]+/)) {
    const m = /^@?([A-Za-z0-9_]{1,15})$/.exec(part.trim());
    if (m && !out.includes(m[1].toLowerCase())) out.push(m[1].toLowerCase());
  }
  return out;
}

const asText = (value) => (typeof value === "string" ? value : "").trim();

/**
 * Notification brute (pont) → post exploitable, ou null.
 * Le texte réunit bigText (ou text), les lignes et les messages, sans
 * doublon. Le titre et le sous-texte ne servent qu'à identifier le compte.
 * @param {object} data
 * @param {{ allowTest?: boolean }} [options]
 */
function parsePost(data, options = {}) {
  if (!data || typeof data !== "object") return null;
  const pkg = asText(data.pkg);
  if (pkg !== X_PACKAGE && !(options.allowTest && pkg === TEST_PACKAGE)) return null;

  const pieces = [];
  const push = (value) => {
    const text = asText(value);
    if (!text) return;
    if (pieces.some((p) => p.includes(text))) return;
    // Un morceau plus complet remplace ceux qu'il contient (text ⊂ bigText)
    for (let i = pieces.length - 1; i >= 0; i--) if (text.includes(pieces[i])) pieces.splice(i, 1);
    pieces.push(text);
  };
  push(data.bigText);
  push(data.text);
  // Posts avec image (BigPictureStyle) : texte aussi rangé ici par X
  push(data.summaryText);
  push(data.ticker);
  for (const line of Array.isArray(data.lines) ? data.lines : []) push(line);
  for (const m of Array.isArray(data.messages) ? data.messages : []) push(m?.text);

  const urls = (Array.isArray(data.urls) ? data.urls : [])
    .map(asText)
    .filter((u) => /^https?:\/\//i.test(u));
  const text = pieces.join("\n").slice(0, MAX_TEXT);
  const postedAt = Number(data.postedAt);
  if (!Number.isFinite(postedAt) || postedAt <= 0) return null;
  if (!text && urls.length === 0) return null;

  const when = Number(data.when);
  return {
    pkg,
    key: asText(data.key),
    title: asText(data.titleBig) || asText(data.title),
    subText: asText(data.subText),
    text,
    urls,
    postedAt,
    when: Number.isFinite(when) && when > 0 ? when : 0,
    update: data.update === true,
  };
}

const squash = (s) => s.toLowerCase().replace(/[^a-z0-9_]/g, "");

/**
 * Compte qui a publié : @pseudo trouvé dans le titre, sinon le nom affiché.
 * ⚠️ Jamais le sous-texte : X y met souvent TON propre compte.
 * @returns {{ handle: string|null, name: string }}
 */
function accountOf(post) {
  const title = post?.title ?? "";
  const inTitle = /@([A-Za-z0-9_]{1,15})/.exec(title);
  if (inTitle) return { handle: inTitle[1].toLowerCase(), name: title };
  // « @pseudo: texte » en tête du post (format de certaines notifications)
  const lead = /^@([A-Za-z0-9_]{1,15})\s*[:：]/.exec(post?.text ?? "");
  if (lead) return { handle: lead[1].toLowerCase(), name: title || `@${lead[1]}` };
  return { handle: null, name: title };
}

/** Libellé pour les logs et l'app : « @binance », sinon le nom affiché. */
function accountLabel(post) {
  const { handle, name } = accountOf(post);
  if (handle) return `@${handle}`;
  return name ? name.replace(/\s+/g, " ").slice(0, 40) : "compte inconnu";
}

/**
 * Le post vient-il d'un compte de la liste ? Liste vide : tous les comptes.
 * @param {string[]} accounts - Pseudos en minuscules, sans @.
 */
function matchAccount(post, accounts) {
  if (!accounts || accounts.length === 0) return true;
  const { handle, name } = accountOf(post);
  if (handle && accounts.includes(handle)) return true;
  if (!name) return false;
  // Nom affiché « Binance » ↔ pseudo « binance »
  if (accounts.includes(squash(name))) return true;
  const words = name.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean);
  return accounts.some((a) => words.includes(a));
}

/**
 * Post assez récent ? (notification ré-affichée après coup, réveil du téléphone…)
 * @param {{ postedAt: number, when: number }} post
 */
function isFresh(post, now, maxAgeMs, startedAt) {
  // `when` peut être l'heure du post lui-même : on garde la plus ancienne des
  // deux si elle est plausible (jamais dans le futur de postedAt)
  const stamp = post.when && post.when <= post.postedAt + 5000 ? Math.min(post.when, post.postedAt) : post.postedAt;
  if (startedAt && stamp < startedAt) return false;
  if (maxAgeMs > 0 && now - stamp > maxAgeMs) return false;
  return true;
}

/**
 * Nettoie un post avant l'extraction : @mentions, #hashtags, $cashtags et
 * liens t.co ne sont jamais des codes ; le dernier mot coupé (« … ») non plus.
 */
function cleanTweet(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/https?:\/\/t\.co\/\S*/gi, " ")
    .replace(/(^|[^A-Za-z0-9_])[@#$][A-Za-z0-9_]+/g, "$1 ")
    // Coupure de X (« … ») : le dernier mot est incomplet
    .replace(/\S*…\s*$/, "")
    .trim();
}

/**
 * Codes d'un post (règles de src/telegram.js, aucun segment monospace sur X).
 * @param {{ includeKnown?: boolean }} [options] - garder les codes déjà traités
 */
function extractFromPost(post, options = {}) {
  const plain = [cleanTweet(post.text), ...post.urls].filter(Boolean).join("\n");
  return extractCodes({ plain, trusted: [] }, options);
}

/**
 * Où réclamer un code X détecté sur CET appareil ?
 * @returns {'local'|'forward'}
 */
function routeFor({ role, canClaimNow }) {
  return role === "solo" || canClaimNow ? "local" : "forward";
}

/** Message « #xcode » publié dans les Messages enregistrés. */
function formatXCode({ code, source, from, at, inst, dry }) {
  const handle = /^@[A-Za-z0-9_]{1,15}$/.test(from ?? "") ? from : "-";
  return (
    `${TAG} ${code} src=${source} from=${handle} at=${Math.round(at)} inst=${inst}${dry ? " dry=1" : ""}\n` +
    `🐦 Code X relayé par 📱 ${notifier.LABEL} — ne pas modifier`
  );
}

/**
 * Lit un message « #xcode » (première ligne seulement), ou null s'il est mal
 * formé. Le code est revérifié (codes BP, 8 chiffres…).
 */
function parseXCode(text) {
  const first = String(text ?? "").split("\n", 1)[0].trim();
  const m = XCODE_RE.exec(first);
  if (!m) return null;
  const [, code, source, from, at, inst, dry] = m;
  if (!isPlausibleCode(code, source !== "texte")) return null;
  return { code, source, from: from === "-" ? null : from, at: Number(at), inst, dry: Boolean(dry) };
}

/** Un #xcode publié à `stamp` (heure serveur) est-il encore à traiter ? */
function isFreshRelay(stamp, serverNow, maxMs = RELAY_MAX_AGE_MS) {
  if (!Number.isFinite(stamp)) return false;
  return serverNow - stamp <= maxMs && stamp - serverNow <= 5000;
}

// ─── Fonctionnement ─────────────────────────────────────────────────────────

const ACCOUNTS = parseAccounts(process.env.X_ACCOUNTS);
/** lastFound / lastKnown : codes du dernier post, dont déjà traités. */
const state = { startedAt: Date.now(), lastAt: 0, lastFrom: "", lastFound: 0, lastKnown: 0 };

/** @type {import('@mtcute/node').TelegramClient | null} */
let client = null;
/** @type {((code: string, meta: object) => void) | null} */
let onCode = null;
/** @type {((channel: string) => void) | null} */
let onPost = null;
let relay = null;
let listening = false;
let lastPeerWarnAt = 0;
let relayRefusedLogged = false;

function describe() {
  if (!ENABLED) {
    return ACCEPT_RELAYED
      ? "codes relayés par le téléphone acceptés (#xcode)"
      : "désactivé (X_ENABLED=false, X_RELAY_ACCEPT=false)";
  }
  const who = ACCOUNTS.length ? ACCOUNTS.map((a) => `@${a}`).join(", ") : "tous les comptes avec la cloche";
  return `notifications de l'appli X lues — ${who}${DRY_RUN ? " · 🧪 essai à blanc" : ""}`;
}

/**
 * Démarre la source X (après la connexion Telegram).
 * @param {object} options
 * @param {import('@mtcute/node').TelegramClient} options.client
 * @param {(code: string, meta: object) => void} options.onCode - handleDetectedCode
 * @param {(channel: string) => void} [options.onPost] - activité d'un compte (stats par source)
 */
function start(options) {
  client = options.client;
  onCode = options.onCode;
  onPost = options.onPost ?? null;
  relay = require("./relay");
  state.startedAt = Date.now();

  const host = globalThis.__rpbHost;
  if (!ENABLED || !host || listening) return;
  listening = true;
  host.on("x.post", (data) => {
    try {
      handlePost(data);
    } catch (err) {
      logger.error(`💥 🐦 Notification X illisible : ${err.message}`);
    }
  });
}

function handlePost(data) {
  const post = parsePost(data, { allowTest: DRY_RUN });
  if (!post) return;

  const from = accountLabel(post);
  stats.bump("xPosts");
  state.lastAt = Date.now();
  state.lastFrom = from;
  onPost?.(`🐦 ${from}`);

  if (IS_DEBUG) {
    logger.debug(`🐦 Notification X de ${from} : ${post.text.replace(/\s+/g, " ").slice(0, 200)}`);
  }

  if (!isFresh(post, Date.now(), MAX_AGE_MS, state.startedAt)) {
    logger.debug(`🐦 Post X de ${from} trop ancien — ignoré`);
    return;
  }
  if (!matchAccount(post, ACCOUNTS)) {
    logger.debug(`🐦 Post X de ${from} : compte absent de X_ACCOUNTS — ignoré`);
    return;
  }

  // Codes déjà traités (souvent publiés plus tôt sur Telegram) : comptés et
  // annoncés, pour qu'un post X sans réclamation ne passe pas pour un raté
  const found = extractFromPost(post, { includeKnown: true });
  const known = found.filter(({ code }) => history.hasCode(code) || history.isProcessing(code)).length;
  state.lastFound = found.length;
  state.lastKnown = known;
  if (known > 0) {
    logger.info(
      `🐦 Post X de ${from} : ${known === found.length ? "" : `${known} sur ${found.length} `}` +
        `code(s) déjà traité(s) plus tôt (Telegram ou X) — rien à refaire`,
    );
  } else if (found.length === 0) {
    logger.debug(`🐦 Post X de ${from} : aucun code`);
  }

  for (const { code, source } of found) {
    if (history.hasCode(code) || history.isProcessing(code)) {
      stats.bump("codesDuplicate");
      continue;
    }
    history.markProcessing(code);
    stats.bump("codesDetected");
    stats.bump("xCodes");
    stats.state.lastCodeAt = Date.now();

    logger.success(
      `🎁 Code trouvé : ${code} — depuis 🐦 X ${from}` +
        (source === "texte" ? " · texte libre" : "") +
        (DRY_RUN ? " · 🧪 essai à blanc" : ""),
    );

    const meta = {
      channel: `🐦 ${from}`,
      origin: "x",
      source,
      detectedAt: Date.now(),
      dryRun: DRY_RUN,
    };
    const route = routeFor({ role: relay.ROLE, canClaimNow: relay.canClaim(relay.serverNow()) });
    if (route === "local") {
      onCode(code, { ...meta, postedAt: relay.serverNow() });
    } else {
      void forward(code, meta, accountOf(post).handle);
    }
  }
}

/** Téléphone en veille : le code part au PC par les Messages enregistrés. */
async function forward(code, meta, handle) {
  if (relay.peerAcceptsX() === false && Date.now() - lastPeerWarnAt > 3 * 3600_000) {
    lastPeerWarnAt = Date.now();
    logger.warn("🐦 Le PC n'annonce pas les codes X (x=1) : il n'est sans doute pas à jour");
    notifier.notify("⚠️ Le PC ne prend pas les codes X : mets-le à jour (git pull) puis relance-le.", {
      key: "x-peer-old",
      cooldownMs: 6 * 3600_000,
    });
  }

  try {
    const text = formatXCode({
      code,
      source: meta.source,
      from: handle ? `@${handle}` : "-",
      at: relay.serverNow(),
      inst: relay.INSTANCE,
      dry: meta.dryRun,
    });
    const msg = await client.sendText("me", text, { silent: true });
    stats.bump("xForwarded");
    logger.info(`📨 Code ${code} transmis au PC (Messages enregistrés, #xcode)`);
    setTimeout(() => {
      client?.deleteMessagesById("me", [msg.id]).catch(() => {});
    }, RELAY_DELETE_AFTER_MS).unref?.();
    // Même date serveur que le PC : si CET appareil est devenu responsable
    // entre-temps, c'est lui qui réclame ; sinon le code est laissé au PC.
    onCode(code, { ...meta, postedAt: msg.date.getTime() });
  } catch (err) {
    history.clearProcessing(code);
    logger.warn(`📨 Code X ${code} non transmis au PC (${err.message}) — perdu`);
  }
}

/**
 * Messages enregistrés : un « #xcode » relayé par le téléphone ?
 * @returns {boolean} true si le message était un #xcode (traité ou ignoré).
 */
function handleSelfMessage(msg, isEdit) {
  const text = msg?.text ?? "";
  if (!text.startsWith(TAG)) return false;
  const info = parseXCode(text);
  if (!info) {
    logger.debug("📨 Message #xcode mal formé — ignoré");
    return true;
  }
  if (relay && info.inst === relay.INSTANCE) return true; // notre propre envoi
  if (isEdit || !onCode || !relay) return true;
  if (!ACCEPT_RELAYED) {
    if (!relayRefusedLogged) {
      relayRefusedLogged = true;
      logger.info("📨 Codes X relayés ignorés (X_RELAY_ACCEPT=false)");
    }
    return true;
  }

  const stamp = msg.date?.getTime?.() ?? NaN;
  if (!isFreshRelay(stamp, relay.serverNow())) {
    logger.warn(`📨 Code X ${info.code} relayé trop tard — ignoré`);
    return true;
  }
  if (history.hasCode(info.code) || history.isProcessing(info.code)) {
    stats.bump("codesDuplicate");
    return true;
  }

  history.markProcessing(info.code);
  stats.bump("codesDetected");
  stats.bump("xRelayed");
  stats.state.lastCodeAt = Date.now();
  const from = info.from ?? "compte inconnu";
  state.lastAt = Date.now();
  state.lastFrom = from;
  onPost?.(`🐦 ${from}`);
  logger.success(
    `🎁 Code trouvé : ${info.code} — depuis 🐦 X ${from} (relayé par le téléphone)` +
      (info.source === "texte" ? " · texte libre" : "") +
      (info.dry ? " · 🧪 essai à blanc" : ""),
  );
  onCode(info.code, {
    channel: `🐦 ${from}`,
    origin: "x",
    source: info.source,
    detectedAt: Date.now(),
    postedAt: stamp,
    dryRun: info.dry,
  });
  return true;
}

/** Lignes du signe de vie lu par l'app Android. */
function heartbeatLines() {
  return [
    `x_on=${ENABLED ? 1 : 0}`,
    `x_dry=${DRY_RUN ? 1 : 0}`,
    `x_seen=${stats.state.xPosts}`,
    `x_codes=${stats.state.xCodes + stats.state.xRelayed}`,
    `x_last_at=${state.lastAt}`,
    `x_last_from=${state.lastFrom.replace(/[\r\n=]/g, " ")}`,
    `x_last_found=${state.lastFound}`,
    `x_last_known=${state.lastKnown}`,
  ];
}

/** Lignes du bilan d'activité. */
function statsRows() {
  const s = stats.state;
  if (!ENABLED && !s.xRelayed) return [];
  const rows = [];
  if (ENABLED) {
    rows.push(["🐦 Posts X lus", s.xPosts]);
    rows.push(["🐦 Codes X", `${s.xCodes}${s.xForwarded ? ` (dont ${s.xForwarded} transmis au PC)` : ""}`]);
  }
  if (s.xRelayed) rows.push(["📨 Codes X reçus du téléphone", s.xRelayed]);
  return rows;
}

module.exports = {
  ENABLED,
  DRY_RUN,
  ACCEPT_RELAYED,
  describe,
  start,
  handleSelfMessage,
  heartbeatLines,
  statsRows,
  // Exposés pour les tests
  parseAccounts,
  parsePost,
  accountOf,
  accountLabel,
  matchAccount,
  isFresh,
  cleanTweet,
  extractFromPost,
  routeFor,
  formatXCode,
  parseXCode,
  isFreshRelay,
};
