/**
 * relay.js — Relais PC (prioritaire) ⇄ téléphone (secours)
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  🤝 JAMAIS DEUX SOUMISSIONS DU MÊME CODE                                 ║
 * ║                                                                          ║
 * ║  Le PC et le téléphone partagent le même compte Binance : si les deux    ║
 * ║  réclamaient un code, la 2e soumission échouerait et brûlerait une       ║
 * ║  tentative sur le compteur anti-fraude.                                  ║
 * ║                                                                          ║
 * ║  Chaque appareil tient UN message d'état silencieux dans tes « Messages  ║
 * ║  enregistrés » (#botrelay), modifié toutes les 60 s et à chaque          ║
 * ║  changement. Il contient son état et son REGISTRE : les codes qu'il a    ║
 * ║  tapés (24 h). Quatre règles en découlent :                              ║
 * ║                                                                          ║
 * ║  1. Un seul responsable à la fois. Le PC (BOT_ROLE=primary) est          ║
 * ║     prioritaire ; le téléphone (BOT_ROLE=backup) se met en veille dès    ║
 * ║     que le PC est actif, et reprend s'il s'arrête, n'est pas prêt, ou    ║
 * ║     se tait plus de 2 min 30 (silence confirmé par une relecture).       ║
 * ║  2. Passation acquittée : le PC ne réclame qu'après que le téléphone a   ║
 * ║     annoncé sa mise en veille (ou 20 s sans réponse de sa part).         ║
 * ║  3. Responsabilité datée par le SERVEUR Telegram : un appareil ne        ║
 * ║     réclame que les codes publiés après sa prise de responsabilité. Les  ║
 * ║     messages livrés en retard (réveil du PC, coupure réseau) sont        ║
 * ║     enregistrés, jamais soumis.                                          ║
 * ║  4. Registre partagé : chaque code est annoncé juste avant d'être tapé ; ║
 * ║     l'autre appareil l'ajoute à son historique (reposts, éditions).      ║
 * ║                                                                          ║
 * ║  La pause anti-ban est partagée (limite du compte, pas de l'appareil).   ║
 * ║  BOT_ROLE=solo : aucune coordination (un seul appareil).                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

const crypto = require("crypto");
const logger = require("./logger");
const notifier = require("./notifier");
const stats = require("./stats");

const ROLE = normalizeRole(process.env.BOT_ROLE);
const PEER_ROLE = ROLE === "primary" ? "backup" : "primary";
const TAG = "#botrelay";
// Identifiant de CE processus : on reconnaît l'écho de nos propres messages
const INSTANCE = crypto.randomBytes(4).toString("hex");

const HEARTBEAT_MS = 60_000; // publication de l'état
const PEER_TIMEOUT_MS = 150_000; // l'autre appareil est jugé absent après ce silence
const SAFE_SILENCE_MS = 120_000; // sans publication réussie depuis 2 min, on cesse de réclamer
const SHORT_BLIP_MS = 60_000; // coupure assez courte pour garder la responsabilité
const ACK_TIMEOUT_MS = 20_000; // le PC attend au plus 20 s la mise en veille du téléphone
const TICK_MS = 5_000; // réévaluation périodique
const MESSAGE_MAX_AGE_MS = 24 * 3600_000; // message d'état remplacé chaque jour
const LEDGER_MAX_AGE_MS = 24 * 3600_000; // durée de vie d'un code dans le registre
const LEDGER_MAX_CODES = 300; // ≈ 2 700 caractères (limite Telegram : 4 096)
const PUBLISH_DEBOUNCE_MS = 300;
const PUBLISH_RETRY_MS = 15_000;
const SEARCH_FRESH_MS = 15_000;
const SEARCH_RETRY_LIMIT = 6;
const RELAY_NOTIFY_COOLDOWN_MS = 5 * 60_000;

const STATUS_RE =
  /#botrelay\s+role=(primary|backup|solo)\s+state=([a-z]+)\s+pause=(\d+)(?:\s+inst=([0-9a-f]+))?(?:\s+since=(\d+))?/i;
const CODES_RE = /^codes=([A-Z0-9,]*)\s*$/m;
// Compteur anti-blocage (src/antiban.js), à la suite de la ligne #botrelay :
// les versions précédentes ignorent ces jetons
const ANTIBAN_RE = /#botrelay\b[^\n]*?\sfails=(\d+)\s+failsAt=(\d+)(?:\s+halt=([01]))?/i;
// Cet appareil réclame les codes X relayés par le téléphone (#xcode, src/xsource.js)
const ACCEPTS_X_RE = /#botrelay\b[^\n]*?\sx=1(?:\s|$)/im;

function normalizeRole(raw) {
  const role = String(raw ?? "primary").trim().toLowerCase();
  return ["primary", "backup", "solo"].includes(role) ? role : "primary";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const fmtClock = (ts) => new Date(ts).toLocaleTimeString("fr-FR");
const msgStamp = (msg) => (msg?.editDate ?? msg?.date)?.getTime?.() ?? NaN;

/** @type {import('@mtcute/node').TelegramClient | null} */
let tg = null;
let callbacks = {};
let started = false;
let stopping = false;
let connected = true;
let disconnectedAt = 0;
let resyncing = false;

// ── Message d'état de CET appareil ──────────────────────────────────────────
let statusMessageId = null;
let statusMessageDate = 0;
let lastPublishOkAt = 0; // horloge locale
let lastPublishAttemptAt = 0;
let clockOffset = 0; // heure serveur Telegram − heure locale
let publishing = Promise.resolve();
let publishTimer = null;
let lastPublishWarnAt = 0;
let lastPublishedState = null;

// ── Responsabilité ──────────────────────────────────────────────────────────
let owner = ROLE === "solo";
let ownerSince = 0; // heure SERVEUR à partir de laquelle on réclame
let activePublishedAt = 0; // heure serveur de l'annonce « actif » (depuis la dernière perte)
let handoverStartedAt = 0; // PC : début de l'attente de la mise en veille du téléphone

// ── Mode du téléphone ───────────────────────────────────────────────────────
let mode = ROLE === "backup" ? "checking" : "active"; // checking | active | standby
let modeSince = Date.now();
const timeIn = { active: 0, standby: 0 };
let confirming = false;

// ── L'autre appareil ────────────────────────────────────────────────────────
// at : réception locale du dernier signal · serverTs : heure serveur de ce signal
// known : état connu (recherche réussie ou message reçu)
const peer = { at: 0, serverTs: 0, state: null, inst: null, known: false, acceptsX: false };
let searchFailures = 0;
let lastSearchOkAt = 0;

// ── Registre : codes que CET appareil a tapés (code → horodatage local) ─────
const myCodes = new Map();

let sharedPauseUntil = 0;
let sharedPauseFrom = null;
let lastDuplicateWarnAt = 0;
let heartbeatTimer = null;
let tickTimer = null;

const serverNow = () => Date.now() + clockOffset;
// Notre état a été publié récemment : l'autre appareil nous voit (condition
// pour GARDER la responsabilité ; une coupure courte ne la fait pas perdre)
const publishFresh = () => lastPublishOkAt > 0 && Date.now() - lastPublishOkAt < SAFE_SILENCE_MS;
// … et connecté en ce moment (condition pour RÉCLAMER)
const selfHealthy = () => connected && publishFresh();
const peerFresh = () => peer.known && peer.at > 0 && Date.now() - peer.at < PEER_TIMEOUT_MS;

// ─── Lecture d'un message d'état ────────────────────────────────────────────

function parseStatus(text) {
  const m = STATUS_RE.exec(text ?? "");
  if (!m) return null;
  const line = CODES_RE.exec(text ?? "");
  const guard = ANTIBAN_RE.exec(text ?? "");
  return {
    role: m[1].toLowerCase(),
    state: m[2].toLowerCase(),
    pauseUntil: Number(m[3]) || 0,
    instance: m[4] ? m[4].toLowerCase() : null,
    since: Number(m[5]) || 0,
    codes: line?.[1] ? line[1].split(",").filter((c) => /^[A-Z0-9]{8}$/.test(c)) : [],
    // failsAt : heure SERVEUR (les horloges des deux appareils peuvent différer)
    antiban: guard
      ? { fails: Number(guard[1]) || 0, failsAt: Number(guard[2]) || 0, halted: guard[3] === "1" }
      : null,
    acceptsX: ACCEPTS_X_RE.test(text ?? ""),
  };
}

// ─── API publique ───────────────────────────────────────────────────────────

/**
 * Cet appareil doit-il réclamer ce code ?
 * @param {number} [postedAt] Heure SERVEUR de publication (ou d'édition) du message.
 */
function canClaim(postedAt) {
  if (ROLE === "solo") return true;
  if (!owner || stopping || resyncing || !selfHealthy()) return false;
  const stamp = Number.isFinite(postedAt) ? postedAt : serverNow();
  return stamp >= ownerSince;
}

/** Pourquoi un code n'est pas réclamé ici — pour des logs compréhensibles. */
function whyNotClaiming(postedAt) {
  if (stopping) return "arrêt en cours";
  if (ROLE === "backup" && mode === "standby") return "laissé au PC (téléphone en veille)";
  if (ROLE === "backup" && mode === "checking") return "vérification du PC en cours";
  if (!connected || resyncing) return "reconnexion à Telegram en cours";
  if (!selfHealthy()) return "état du relais pas encore publié";
  if (!owner) {
    return ROLE === "primary"
      ? "passage de relais en cours (le téléphone se met en veille)"
      : "prise de relais en cours";
  }
  if (Number.isFinite(postedAt) && postedAt < ownerSince) {
    return "publié avant la prise de relais — l'autre appareil en était responsable";
  }
  return "relais";
}

/**
 * L'autre appareil réclame-t-il les codes X relayés (#xcode) ?
 * @returns {boolean|null} null si son état n'est pas connu (ou trop ancien).
 */
function peerAcceptsX() {
  if (ROLE === "solo" || !peerFresh()) return null;
  return peer.acceptsX === true;
}

/** État de l'autre appareil, pour l'app (carte PC ⇄ téléphone). */
function peerInfo() {
  if (ROLE === "solo" || !peer.known) return { state: "", at: 0 };
  return { state: peer.state ?? "", at: peer.at };
}

/** Le navigateur doit-il tourner ? (téléphone en veille : non, mémoire libérée) */
function shouldRunBrowser() {
  return ROLE !== "backup" || mode === "active";
}

function currentMode() {
  if (ROLE === "backup") return mode;
  if (ROLE === "solo") return "active";
  return owner ? "active" : "handover";
}

function describeRole() {
  if (ROLE === "solo") return "appareil seul (BOT_ROLE=solo) — aucune coordination";
  if (ROLE === "primary") return "💻 PC prioritaire (BOT_ROLE=primary)";
  return "📱 téléphone en relais (BOT_ROLE=backup)";
}

function describeMode() {
  if (ROLE === "solo") return "actif";
  if (ROLE === "primary") {
    if (owner) return "💻 réclame les codes";
    if (handoverStartedAt) return "🤝 passage de relais en cours";
    return describeState(ownState());
  }
  if (mode === "active") return owner ? "📱 actif (réclame les codes)" : "📱 prise de relais en cours";
  if (mode === "standby") return "😴 en veille (le PC réclame)";
  return "🔎 vérification du PC";
}

/**
 * Démarre le relais (juste après la connexion Telegram).
 * @param {import('@mtcute/node').TelegramClient} client
 * @param {object} cb
 * @param {() => { ready: boolean, awaitingLogin: boolean, pauseUntil: number }} [cb.getLocalState]
 * @param {(reason: string) => void} [cb.onActivate]  téléphone : prendre le relais
 * @param {(reason: string) => void} [cb.onStandby]   téléphone : passer en veille
 * @param {(until: number, fromRole: string) => void} [cb.onSharedPause]
 * @param {(codes: string[], fromRole: string) => void} [cb.onPeerCodes]
 *   codes tapés par l'autre appareil : à ajouter à l'historique
 * @param {() => { fails: number, failsAt: number, halted: boolean }} [cb.getAntiban]
 *   compteur anti-blocage de cet appareil (failsAt en heure locale)
 * @param {(state: { fails: number, failsAt: number, halted: boolean }, fromRole: string) => void} [cb.onPeerAntiban]
 *   compteur publié par l'autre appareil (failsAt converti en heure locale)
 * @param {() => boolean} [cb.acceptsX] cet appareil réclame les codes X relayés (#xcode)
 */
async function start(client, cb = {}) {
  if (ROLE === "solo") {
    logger.info("🤝 Relais désactivé (BOT_ROLE=solo) — cet appareil réclame seul");
    return;
  }

  tg = client;
  callbacks = cb;

  const found = await searchStatuses();
  if (found) applyFound(found);
  started = true;

  if (sharedPauseUntil > Date.now()) {
    callbacks.onSharedPause?.(sharedPauseUntil, sharedPauseFrom);
  }

  logger.info(
    ROLE === "primary"
      ? "🤝 Relais : 💻 PC prioritaire — état publié toutes les 60 s\n" +
          "    dans tes « Messages enregistrés » (message #botrelay, silencieux)"
      : "🤝 Relais : 📱 téléphone en secours — il réclame seulement\n" +
          "    quand le PC est arrêté, pas prêt, ou muet depuis 2 min 30",
  );

  await publish();
  // Âge du dernier signal de l'autre appareil, en heure serveur (le décalage
  // d'horloge vient d'être mesuré par notre publication)
  if (peer.serverTs) peer.at = Date.now() - Math.max(0, serverNow() - peer.serverTs);

  heartbeatTimer = setInterval(() => void publish(), HEARTBEAT_MS);
  tickTimer = setInterval(() => evaluate(), TICK_MS);
  evaluate();
}

/** Arrêt propre : « arrêté » est publié pour que l'autre appareil reprenne tout de suite. */
async function shutdown() {
  if (stopping) return;
  stopping = true;
  owner = ROLE === "solo";
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (tickTimer) clearInterval(tickTimer);
  if (publishTimer) clearTimeout(publishTimer);
  if (ROLE !== "solo" && tg && started) {
    await Promise.race([publish(), sleep(4000)]);
  }
}

/**
 * État de la connexion Telegram (transmis par telegram.js).
 * Pendant une coupure, on ne réclame rien ; à la reconnexion, on relit l'état
 * de l'autre appareil AVANT de reprendre (les messages en retard arrivent
 * pendant la synchronisation).
 */
function setConnectionState(state) {
  const ok = state === "connected" || state === "updating";
  if (ok === connected) return;
  connected = ok;
  if (!ok) {
    disconnectedAt = Date.now();
    return;
  }
  if (!started || stopping || ROLE === "solo") return;
  const offlineMs = Math.max(
    Date.now() - disconnectedAt,
    lastPublishOkAt ? Date.now() - lastPublishOkAt - HEARTBEAT_MS : 0,
  );
  void resync(offlineMs);
}

async function resync(offlineMs) {
  if (resyncing) return;
  resyncing = true;
  try {
    const found = await searchStatuses();
    if (found) applyFound(found);
    const peerBusy =
      peerFresh() &&
      (peer.state === "active" || (ROLE === "backup" && peer.state === "pause"));
    // Coupure courte, autre appareil inactif : il n'a pas pu reprendre la main
    // (il lui faut 2 min 30 de silence), la responsabilité reste continue.
    if (offlineMs >= SHORT_BLIP_MS || peerBusy || !found) {
      loseOwnership(`reconnexion à Telegram après ${stats.formatDuration(offlineMs)}`);
    }
    // Téléphone : veille AVANT de republier, pour ne jamais annoncer « actif »
    // alors que le PC a repris la main pendant la coupure
    if (ROLE === "backup" && peerBusy) {
      applyMode(
        "standby",
        peer.state === "active" ? "le PC est actif" : "le PC est en pause anti-ban (même compte Binance)",
      );
    }
  } finally {
    resyncing = false;
  }
  await publish(); // rétablit la santé et réévalue
}

/**
 * Messages des « Messages enregistrés » (transmis par telegram.js).
 * @param {import('@mtcute/node').Message} msg
 */
function handleSelfMessage(msg) {
  if (ROLE === "solo") return;
  const info = parseStatus(msg?.text);
  if (!info || info.instance === INSTANCE) return; // écho de nos propres publications

  if (info.pauseUntil > Date.now()) applySharedPause(info.pauseUntil, info.role);
  if (info.codes.length) applyPeerCodes(info.codes, info.role);
  if (info.antiban && info.role === PEER_ROLE) applyPeerAntiban(info.antiban, info.role);

  if (info.role === ROLE) {
    if (info.state !== "stopped") warnDuplicateRole();
    return;
  }
  if (info.role !== PEER_ROLE) return;

  const stamp = msgStamp(msg);
  if (Number.isFinite(stamp) && stamp < peer.serverTs) return; // plus ancien que ce qu'on sait
  peer.at = Date.now();
  peer.serverTs = Number.isFinite(stamp) ? stamp : serverNow();
  peer.state = info.state;
  peer.inst = info.instance;
  peer.acceptsX = info.acceptsX;
  peer.known = true;
  if (started) evaluate();
}

/**
 * Un code va être TAPÉ sur cet appareil : on l'inscrit au registre et on le
 * partage tout de suite (l'autre appareil l'ajoutera à son historique).
 */
function recordClaim(code) {
  if (ROLE === "solo") return;
  myCodes.delete(code);
  myCodes.set(code, Date.now());
  pruneLedger();
  schedulePublish();
}

/** Une pause anti-ban vient d'être déclenchée ICI : l'autre appareil doit la respecter. */
function announcePause(until) {
  if (ROLE === "solo" || !tg) return;
  sharedPauseUntil = Math.max(sharedPauseUntil, until);
  schedulePublish();
}

/** Le compteur anti-blocage a changé ICI : publié pour l'autre appareil. */
function announceAntiban() {
  if (ROLE === "solo" || !tg) return;
  schedulePublish();
}

/** Lignes ajoutées au bilan d'activité. */
function statsRows() {
  if (ROLE === "solo") return [["🤝 Relais", "désactivé (solo)"]];
  const rows = [["🤝 Relais", describeMode()]];
  if (ROLE === "backup") {
    const now = Date.now();
    const active = timeIn.active + (mode === "active" ? now - modeSince : 0);
    const standby = timeIn.standby + (mode === "standby" ? now - modeSince : 0);
    rows.push(["⏳ Actif / veille", `${stats.formatDuration(active)} / ${stats.formatDuration(standby)}`]);
  }
  rows.push(["📒 Registre partagé", `${myCodes.size} code(s) annoncé(s) (24 h)`]);
  return rows;
}

// ─── Recherche de l'état laissé par les appareils ───────────────────────────

/** @returns {Promise<import('@mtcute/node').Message[] | null>} null si échec */
async function searchStatuses() {
  try {
    const found = await tg.searchMessages({ chatId: "me", query: TAG, limit: 30 });
    searchFailures = 0;
    lastSearchOkAt = Date.now();
    return found;
  } catch (err) {
    searchFailures++;
    if (searchFailures === 1 || searchFailures === SEARCH_RETRY_LIMIT) {
      logger.warn(`🤝 Relais : état des appareils illisible (${err.message}) — nouvel essai`);
    }
    return null;
  }
}

/**
 * Applique le résultat d'une recherche : pause en cours, registre de l'autre
 * appareil, notre message d'état à réutiliser, dernier état de l'autre appareil.
 */
function applyFound(found) {
  let own = null;
  const staleOwn = [];
  let latestPeer = null;

  for (const msg of found) {
    const info = parseStatus(msg.text);
    if (!info) continue;
    const stamp = msgStamp(msg);

    if (info.pauseUntil > Date.now()) applySharedPause(info.pauseUntil, info.role);

    if (info.role === ROLE) {
      if (!own || stamp > own.stamp) {
        if (own) staleOwn.push(own.msg.id);
        own = { msg, stamp, info };
      } else {
        staleOwn.push(msg.id);
      }
      continue;
    }

    if (info.codes.length) applyPeerCodes(info.codes, info.role);
    if (info.antiban && info.role === PEER_ROLE) applyPeerAntiban(info.antiban, info.role);
    if (info.role === PEER_ROLE && (!latestPeer || stamp > latestPeer.stamp)) {
      latestPeer = { stamp, info };
    }
  }

  if (own && !statusMessageId) {
    statusMessageId = own.msg.id;
    statusMessageDate = own.msg.date.getTime();
    // Registre de l'exécution précédente de CET appareil : toujours partagé
    const at = own.stamp - clockOffset;
    for (const code of own.info.codes) if (!myCodes.has(code)) myCodes.set(code, at);
    pruneLedger();
  }
  if (staleOwn.length > 0) {
    tg.deleteMessagesById("me", staleOwn).catch(() => {});
  }

  peer.known = true;
  if (latestPeer && latestPeer.stamp >= peer.serverTs) {
    peer.serverTs = latestPeer.stamp;
    peer.state = latestPeer.info.state;
    peer.inst = latestPeer.info.instance;
    peer.acceptsX = latestPeer.info.acceptsX;
    peer.at = Date.now() - Math.max(0, serverNow() - latestPeer.stamp);
  }
}

function applyPeerCodes(codes, fromRole) {
  // Avant start(), callbacks est vide : la recherche de démarrage les relira
  callbacks.onPeerCodes?.(codes, fromRole);
}

/** Compteur anti-blocage de l'autre appareil (même compte Binance). */
function applyPeerAntiban(state, fromRole) {
  if (!state.failsAt) return;
  callbacks.onPeerAntiban?.({ ...state, failsAt: state.failsAt - clockOffset }, fromRole);
}

// ─── Publication de l'état ──────────────────────────────────────────────────

function activePause() {
  const local = callbacks.getLocalState?.()?.pauseUntil ?? 0;
  return Math.max(sharedPauseUntil, local);
}

/** État publié par CET appareil. */
function ownState() {
  const pause = activePause();
  const pauseUntil = pause > Date.now() ? pause : 0;
  if (stopping) return { state: "stopped", pauseUntil };
  if (ROLE === "backup") return { state: mode, pauseUntil };

  const local = callbacks.getLocalState?.() ?? {};
  if (pauseUntil) return { state: "pause", pauseUntil };
  if (!local.ready || local.awaitingLogin) return { state: "unavailable", pauseUntil: 0 };
  return { state: "active", pauseUntil: 0 };
}

function describeState({ state, pauseUntil }) {
  switch (state) {
    case "active":
      return ROLE === "backup" ? "📱 actif" : "🟢 actif";
    case "standby":
      return "😴 en veille";
    case "checking":
      return "🔎 vérification";
    case "pause":
      return `🛑 pause anti-ban jusqu'à ${fmtTime(pauseUntil)}`;
    case "stopped":
      return "⏹️ arrêté";
    default:
      return "🟠 indisponible (navigateur pas prêt)";
  }
}

function consequence({ state }) {
  if (state === "pause") return "même compte Binance : aucun appareil ne réclame";
  if (ROLE === "backup") {
    if (state === "active") return "le PC est absent, le téléphone réclame";
    if (state === "standby") return "le PC réclame";
    return state === "stopped" ? "le PC doit réclamer" : "lecture de l'état du PC";
  }
  return state === "active" ? "le téléphone reste en veille" : "le téléphone prend le relais";
}

function pruneLedger() {
  const limit = Date.now() - LEDGER_MAX_AGE_MS;
  for (const [code, at] of myCodes) if (at < limit) myCodes.delete(code);
  while (myCodes.size > LEDGER_MAX_CODES) myCodes.delete(myCodes.keys().next().value);
}

function renderStatus(current) {
  pruneLedger();
  const guard = callbacks.getAntiban?.();
  const guardTokens = guard
    ? ` fails=${guard.fails} failsAt=${guard.failsAt ? Math.round(guard.failsAt + clockOffset) : 0}` +
      ` halt=${guard.halted ? 1 : 0}`
    : "";
  const xToken = callbacks.acceptsX?.() ? " x=1" : "";
  const lines = [
    `🤖 Relais Red Packet — ${notifier.LABEL}`,
    `${describeState(current)} · ${consequence(current)}`,
    `Dernier signal : ${fmtClock(Date.now())}`,
    "",
    `${TAG} role=${ROLE} state=${current.state} pause=${current.pauseUntil} ` +
      `inst=${INSTANCE} since=${owner ? ownerSince : 0}${guardTokens}${xToken}`,
  ];
  if (myCodes.size > 0) lines.push(`codes=${[...myCodes.keys()].join(",")}`);
  return lines.join("\n");
}

/** Publie l'état de cet appareil (sérialisé : jamais deux publications en parallèle). */
function publish() {
  if (ROLE === "solo" || !tg || !started) return Promise.resolve();
  publishing = publishing.then(doPublish, doPublish);
  return publishing;
}

function schedulePublish() {
  if (publishTimer || !started) return;
  publishTimer = setTimeout(() => {
    publishTimer = null;
    void publish();
  }, PUBLISH_DEBOUNCE_MS);
}

async function doPublish() {
  lastPublishAttemptAt = Date.now();
  try {
    const current = ownState();
    const text = renderStatus(current);
    let msg = null;

    try {
      if (statusMessageId && Date.now() - statusMessageDate < MESSAGE_MAX_AGE_MS) {
        msg = await tg.editMessage({ chatId: "me", message: statusMessageId, text });
      } else {
        msg = await replaceStatusMessage(text);
      }
    } catch (err) {
      if (!/MESSAGE_NOT_MODIFIED/i.test(err?.message ?? "")) {
        // Message supprimé, trop ancien… : on en crée un nouveau
        msg = await replaceStatusMessage(text);
      }
    }

    lastPublishOkAt = Date.now();
    const stamp = msgStamp(msg);
    if (Number.isFinite(stamp)) clockOffset = stamp - Date.now();

    // Annonce « actif » : point de départ de la responsabilité (heure serveur)
    if (current.state === "active") {
      if (!activePublishedAt) activePublishedAt = Number.isFinite(stamp) ? stamp : serverNow();
    } else if (!owner) {
      activePublishedAt = 0;
    }

    if (current.state !== lastPublishedState) {
      lastPublishedState = current.state;
      logger.info(`🤝 Relais : état publié → ${describeState(current)}`);
    }
  } catch (err) {
    // Hors ligne : un avertissement toutes les 10 min au plus
    if (Date.now() - lastPublishWarnAt > 10 * 60_000) {
      lastPublishWarnAt = Date.now();
      logger.warn(`🤝 Relais : état non publié (${err.message}) — nouvel essai bientôt`);
    }
  }
  evaluate();
}

async function replaceStatusMessage(text) {
  const previous = statusMessageId;
  const msg = await tg.sendText("me", text, { silent: true });
  statusMessageId = msg.id;
  statusMessageDate = Date.now();
  if (previous) await tg.deleteMessagesById("me", [previous]).catch(() => {});
  return msg;
}

function warnDuplicateRole() {
  if (Date.now() - lastDuplicateWarnAt < 30 * 60_000) return;
  lastDuplicateWarnAt = Date.now();
  const roleText = ROLE === "primary" ? "« PC prioritaire » (primary)" : "« relais » (backup)";
  logger.error(
    `🤝 Relais : un AUTRE appareil a aussi le rôle ${roleText} !\n` +
      "    Les deux réclameraient les mêmes codes. Sur le téléphone, BOT_ROLE\n" +
      "    doit valoir « backup » (réglé tout seul par le superviseur Android).",
  );
  notifier.notify(
    `⚠️ Deux appareils ont le rôle ${roleText} : chaque code risque d'être soumis deux fois. ` +
      "Sur le téléphone, BOT_ROLE doit valoir « backup ».",
    { key: "relay-duplicate", cooldownMs: 3 * 3600_000 },
  );
}

// ─── Décision : qui réclame ? ───────────────────────────────────────────────

function evaluate() {
  if (!started || stopping) return;
  pruneLedger();
  if (ROLE === "primary") evaluatePrimary();
  else evaluateBackup();
}

function becomeOwner(since, reason) {
  owner = true;
  ownerSince = since;
  handoverStartedAt = 0;
  logger.success(
    `🤝 Relais : ${notifier.LABEL} réclame les codes publiés depuis ` +
      `${fmtClock(since - clockOffset)} — ${reason}`,
  );
  schedulePublish();
}

function loseOwnership(reason) {
  if (owner) logger.warn(`🤝 Relais : ${notifier.LABEL} cesse de réclamer — ${reason}`);
  owner = false;
  activePublishedAt = 0;
  handoverStartedAt = 0;
}

// ── PC (primary) ──

function evaluatePrimary() {
  const local = ownState();
  if (local.state !== "active") {
    loseOwnership(describeState(local));
    return;
  }
  if (!publishFresh()) {
    loseOwnership("état du relais non publié depuis 2 min (veille, réseau)");
    return;
  }
  // Coupure en cours : on ne réclame pas (canClaim), la suite se décide à la
  // reconnexion selon la durée de la coupure
  if (!connected || resyncing || owner) return;

  // 1. Annoncer « actif » (le téléphone se met en veille en le lisant)
  if (!activePublishedAt) {
    if (Date.now() - lastPublishAttemptAt > PUBLISH_RETRY_MS) void publish();
    return;
  }

  // 2. Attendre que le téléphone ne réclame plus
  const phoneBusy = !peer.known || (peerFresh() && peer.state === "active");
  if (!phoneBusy) {
    const acked = peer.known && peer.serverTs >= activePublishedAt && peer.state !== "active";
    becomeOwner(
      acked ? Math.max(activePublishedAt, peer.serverTs) : activePublishedAt,
      acked ? "le téléphone s'est mis en veille" : "aucun téléphone actif",
    );
    return;
  }

  if (!handoverStartedAt) {
    handoverStartedAt = Date.now();
    logger.info(
      `🤝 Relais : ${peer.known ? "le téléphone est actif" : "état du téléphone inconnu"} — ` +
        `j'attends qu'il se mette en veille (${ACK_TIMEOUT_MS / 1000} s max)`,
    );
  }
  if (Date.now() - handoverStartedAt >= ACK_TIMEOUT_MS) {
    becomeOwner(serverNow(), "le téléphone ne répond pas");
  }
}

// ── Téléphone (backup) ──

function backupDecision() {
  const silentFor = peer.at ? Date.now() - peer.at : Infinity;
  const fresh = peerFresh();

  if (fresh && peer.state === "active") return { next: "standby", reason: "le PC est actif", fresh };
  if (fresh && peer.state === "pause") {
    return { next: "standby", reason: "le PC est en pause anti-ban (même compte Binance)", fresh };
  }
  if (fresh && peer.state === "stopped") return { next: "active", reason: "le PC s'est arrêté", fresh };
  if (fresh && peer.state === "unavailable") {
    return { next: "active", reason: "le PC n'est pas prêt (connexion Binance ou navigateur)", fresh };
  }
  if (peer.at && peer.known) {
    return {
      next: "active",
      reason: `le PC ne répond plus depuis ${stats.formatDuration(silentFor)}`,
      fresh: false,
    };
  }
  return { next: "active", reason: "aucun PC actif détecté", fresh: false };
}

function evaluateBackup() {
  // Notre propre connexion est coupée : impossible de juger le PC. On ne
  // réclame pas (canClaim) et le mode reste figé jusqu'à la reconnexion.
  if (!publishFresh()) {
    if (owner) loseOwnership("état du relais non publié depuis 2 min (réseau)");
    return;
  }
  if (!connected || resyncing) return;

  const { next, reason, fresh } = backupDecision();

  // Prise de relais sur SILENCE ou état inconnu : confirmée par une relecture
  // (une mise à jour manquée ne doit pas faire croire que le PC est parti)
  if (next === "active" && mode !== "active" && !fresh) {
    void confirmThenActivate();
    return;
  }
  applyMode(next, reason);
}

async function confirmThenActivate() {
  if (confirming) return;
  confirming = true;
  try {
    if (Date.now() - lastSearchOkAt > SEARCH_FRESH_MS) {
      const found = await searchStatuses();
      if (stopping) return;
      if (found) applyFound(found);
      else if (searchFailures < SEARCH_RETRY_LIMIT) return; // nouvel essai au prochain passage
    }
    const { next, reason } = backupDecision();
    applyMode(next, reason);
  } finally {
    confirming = false;
  }
}

function applyMode(next, reason) {
  if (next === mode) {
    if (next === "active" && !owner && activePublishedAt && selfHealthy()) {
      becomeOwner(activePublishedAt, reason);
    }
    return;
  }

  const now = Date.now();
  if (mode === "active" || mode === "standby") timeIn[mode] += now - modeSince;
  const previous = mode;
  mode = next;
  modeSince = now;

  // Au démarrage (« vérification »), l'alerte « en ligne » dit déjà tout
  const announce = previous !== "checking";

  if (next === "active") {
    logger.success(`📱 Relais : le téléphone prend la main — ${reason}`);
    if (announce) {
      notifier.notify(`📱 Le téléphone prend le relais : ${reason}.`, {
        level: "all",
        key: "relay-active",
        cooldownMs: RELAY_NOTIFY_COOLDOWN_MS,
      });
    }
    // La responsabilité commence à la publication de l'état « actif »
    activePublishedAt = 0;
    void publish();
    callbacks.onActivate?.(reason);
  } else {
    loseOwnership(reason);
    logger.info(`😴 Relais : téléphone en veille — ${reason}`);
    if (announce) {
      notifier.notify(`😴 Téléphone en veille : ${reason}.`, {
        level: "all",
        key: "relay-standby",
        cooldownMs: RELAY_NOTIFY_COOLDOWN_MS,
      });
    }
    // Acquittement immédiat pour le PC (avec le registre des codes tapés)
    void publish();
    callbacks.onStandby?.(reason);
  }
}

// ─── Pause anti-ban partagée ────────────────────────────────────────────────

function applySharedPause(until, fromRole) {
  if (!(until > sharedPauseUntil)) return;
  sharedPauseUntil = until;
  sharedPauseFrom = fromRole;
  if (started) callbacks.onSharedPause?.(until, fromRole);
}

module.exports = {
  ROLE,
  INSTANCE,
  serverNow,
  canClaim,
  whyNotClaiming,
  shouldRunBrowser,
  currentMode,
  describeRole,
  describeMode,
  start,
  shutdown,
  publish,
  setConnectionState,
  handleSelfMessage,
  recordClaim,
  announcePause,
  announceAntiban,
  peerAcceptsX,
  peerInfo,
  statsRows,
  // Exposé pour les tests
  parseStatus,
};
