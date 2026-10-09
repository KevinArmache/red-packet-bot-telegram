/**
 * antiban.js — Protection contre le blocage Binance des Red Packets
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  🛡️ COMPTER LES CODES FAUX D'AFFILÉE, AGIR AVANT LE BLOCAGE              ║
 * ║                                                                          ║
 * ║  FAQ officielle Binance : « votre compte sera verrouillé pendant 5       ║
 * ║  heures après 10 tentatives de saisie de code de Red Packet erronées     ║
 * ║  consécutives ». Un code qui marche casse la série.                      ║
 * ║                                                                          ║
 * ║  Le bot compte les codes faux d'affilée (recalé sur le nombre d'essais   ║
 * ║  restants annoncé par Binance) et, selon ANTIBAN_MODE :                  ║
 * ║   • stop  : codes clairs seulement à ANTIBAN_SELECTIVE_AT (8), puis      ║
 * ║             arrêt total ⛔ à ANTIBAN_STOP_AT (9) : le bot ne tape        ║
 * ║             jamais le 10e code faux. Reprise : #reprendre dans les       ║
 * ║             Messages enregistrés, ou après ANTIBAN_STOP_RESUME_H heures. ║
 * ║   • light : codes clairs seulement à ANTIBAN_SELECTIVE_AT, sans arrêt.   ║
 * ║                                                                          ║
 * ║  Code « clair » : publié en monospace, dans un lien Cryptobox ou après   ║
 * ║  « Code : ». Les codes trouvés en texte libre sont les plus souvent      ║
 * ║  faux (mots ou identifiants qui ressemblent à un code).                  ║
 * ║                                                                          ║
 * ║  L'état (compteur, arrêt, blocage Binance en cours) est gardé dans       ║
 * ║  .run/antiban.json et partagé avec l'autre appareil par le relais :      ║
 * ║  c'est le même compte Binance, donc le même compteur.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const { dataPath } = require("./paths");

// Binance verrouille les Red Packets au 10e code faux consécutif
const LOCK_AFTER = 10;
const HOUR = 3600_000;

const STATE_FILE = dataPath(".run", "antiban.json");
// Une commande #reprendre plus ancienne (livrée en retard) est ignorée
const RESUME_MAX_AGE_MS = 10 * 60_000;
// Remises à zéro observées gardées en mémoire (et dans le fichier)
const MAX_RESETS = 20;

// ─── Réglages ───────────────────────────────────────────────────────────────

function readInt(raw, fallback, min, max) {
  const value = parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const MODE = ["stop", "light"].includes(String(process.env.ANTIBAN_MODE ?? "").trim().toLowerCase())
  ? String(process.env.ANTIBAN_MODE).trim().toLowerCase()
  : "stop";
// 0 = mode « codes clairs » désactivé
const SELECTIVE_AT = readInt(process.env.ANTIBAN_SELECTIVE_AT, 8, 0, LOCK_AFTER - 1);
// Jamais au-delà de 9 : le 10e code faux déclencherait le blocage
const STOP_AT = readInt(process.env.ANTIBAN_STOP_AT, 9, Math.max(1, SELECTIVE_AT), LOCK_AFTER - 1);
// 0 = reprise manuelle seulement (#reprendre)
const STOP_RESUME_MS = readInt(process.env.ANTIBAN_STOP_RESUME_H, 0, 0, 168) * HOUR;

// ─── État ───────────────────────────────────────────────────────────────────

const state = {
  fails: 0, // codes faux d'affilée (estimation prudente, recalée sur Binance)
  failsAt: 0, // dernière modification du compteur (horloge locale)
  halted: false, // ⛔ arrêt anti-blocage (mode stop)
  haltedAt: 0,
  pauseUntil: 0, // blocage Binance en cours (gardé pour les redémarrages)
  lastReport: null, // { at, remaining } : dernier nombre d'essais annoncé par Binance
  wonSince: false, // un code a marché depuis ce dernier relevé
  neutralSince: 0, // codes épuisés / déjà pris depuis ce dernier relevé
  resets: [], // remises à zéro observées : { from, to, cause }
};

let hooks = {};
let loaded = false;

/**
 * Rappels vers l'orchestrateur (index.js).
 * @param {{ onChange?: (event: object) => void }} newHooks
 *   event.type : 'level' (niveau changé), 'reset' (remise à zéro observée).
 */
function setHooks(newHooks = {}) {
  hooks = newHooks;
}

function emit(event) {
  try {
    hooks.onChange?.(event);
  } catch (_) {
    /* jamais bloquant */
  }
}

/** Charge l'état sauvegardé. @returns {{ pauseUntil: number }} */
function init() {
  loaded = true;
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      state.fails = readInt(saved.fails, 0, 0, LOCK_AFTER);
      state.failsAt = Number(saved.failsAt) || 0;
      state.halted = Boolean(saved.halted);
      state.haltedAt = Number(saved.haltedAt) || 0;
      state.pauseUntil = Number(saved.pauseUntil) || 0;
      state.lastReport = saved.lastReport ?? null;
      state.wonSince = Boolean(saved.wonSince);
      state.neutralSince = Number(saved.neutralSince) || 0;
      state.resets = Array.isArray(saved.resets) ? saved.resets.slice(-MAX_RESETS) : [];
    }
  } catch (err) {
    logger.warn(`🛡️ État anti-blocage illisible (${err.message}) — compteur remis à zéro`);
  }
  // Un arrêt ⛔ n'a pas de sens en mode léger (réglage changé depuis)
  if (MODE !== "stop" && state.halted) {
    state.halted = false;
    save();
  }
  refresh();
  return { pauseUntil: state.pauseUntil };
}

function save() {
  const tmp = `${STATE_FILE}.tmp`;
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const data = JSON.stringify(state, null, 2);
    try {
      fs.writeFileSync(tmp, data, "utf-8");
      fs.renameSync(tmp, STATE_FILE);
    } catch (_) {
      // Repli : écriture directe (Windows, fichier ouvert ailleurs)
      fs.writeFileSync(STATE_FILE, data, "utf-8");
      try {
        fs.unlinkSync(tmp);
      } catch (__) {
        /* rien à nettoyer */
      }
    }
  } catch (err) {
    logger.error(`💾 État anti-blocage non sauvegardé : ${err.message}`);
  }
}

// ─── Niveau courant ─────────────────────────────────────────────────────────

/**
 * Fin d'un blocage Binance (compteur remis à zéro par Binance) et reprise
 * automatique après un arrêt ⛔ (si ANTIBAN_STOP_RESUME_H > 0).
 */
function refresh() {
  const now = Date.now();
  if (state.pauseUntil && now >= state.pauseUntil) {
    state.pauseUntil = 0;
    if (state.fails >= LOCK_AFTER) {
      logger.success("🔓 Fin du blocage Binance — compteur de codes faux remis à zéro");
      setFails(0, "fin du blocage Binance");
    }
    save();
  }
  if (state.halted && STOP_RESUME_MS > 0 && now - state.haltedAt >= STOP_RESUME_MS) {
    // Reprise prudente, juste sous le seuil d'arrêt : un seul code faux de
    // plus suffit à revenir en ⛔ (le 10e n'est jamais tapé)
    logger.warn(
      `🛡️ Reprise automatique après ${STOP_RESUME_MS / HOUR} h d'arrêt (ANTIBAN_STOP_RESUME_H)`,
    );
    change(() => {
      state.halted = false;
      state.fails = Math.min(state.fails, STOP_AT - 1);
      state.failsAt = now;
    }, "reprise automatique");
  }
}

/** 'normal' | 'selective' | 'halt' | 'lock' */
function level() {
  if (loaded) refresh();
  if (state.pauseUntil > Date.now()) return "lock";
  if (state.halted) return "halt";
  if (SELECTIVE_AT > 0 && state.fails >= SELECTIVE_AT) return "selective";
  return "normal";
}

/** Essais restants avant le blocage, d'après notre compteur. */
function remainingAttempts() {
  return Math.max(0, LOCK_AFTER - state.fails);
}

/** Code publié clairement comme un code (monospace, lien Cryptobox, « Code : ») ? */
function isClearSource(source) {
  return source === "monospace" || source === "lien" || source === "label";
}

/**
 * Applique une modification de l'état, la sauvegarde, puis annonce le
 * changement de niveau éventuel (log, alerte, publication au relais).
 * @param {() => void} mutate
 * @param {string} why
 */
function change(mutate, why) {
  const before = levelOf(state);
  mutate();
  // Mode stop : arrêt dès le seuil, jamais au 10e (blocage Binance)
  if (MODE === "stop" && state.fails >= STOP_AT && state.fails < LOCK_AFTER && !state.halted) {
    state.halted = true;
    state.haltedAt = Date.now();
  }
  if (state.fails === 0 || MODE !== "stop") state.halted = false;
  save();
  const after = levelOf(state);
  if (after !== before) {
    announceLevel(after, why);
    emit({ type: "level", level: after, fails: state.fails, remaining: remainingAttempts(), why });
  }
}

/** Nouveau nombre de codes faux d'affilée. */
function setFails(fails, why) {
  change(() => {
    state.fails = Math.max(0, Math.min(LOCK_AFTER, fails));
    state.failsAt = Date.now();
  }, why);
}

/** Niveau sans effet de bord (pas de refresh). */
function levelOf(s) {
  if (s.pauseUntil > Date.now()) return "lock";
  if (s.halted) return "halt";
  if (SELECTIVE_AT > 0 && s.fails >= SELECTIVE_AT) return "selective";
  return "normal";
}

function announceLevel(next, why) {
  const count = `${state.fails} code(s) faux d'affilée`;
  if (next === "halt") {
    logger.error(
      `⛔ ARRÊT ANTI-BLOCAGE : ${count} — plus que ${remainingAttempts()} essai(s) avant le blocage\n` +
        "    Binance de 5 h. Plus aucun code n'est tapé (PC et téléphone).\n" +
        "    Pour reprendre : réclame toi-même dans l'app Binance un code qui marche,\n" +
        "    puis envoie #reprendre dans tes « Messages enregistrés » Telegram.",
    );
  } else if (next === "selective") {
    logger.warn(
      `🟠 Anti-blocage : ${count} — seuls les codes clairs (monospace, lien\n` +
        "    Cryptobox, « Code : ») sont tapés jusqu'au prochain code qui marche",
    );
  } else if (next === "normal") {
    logger.success(`🟢 Anti-blocage : retour à la normale (${why}) — tous les codes sont réclamés`);
  }
}

// ─── Décision avant la saisie ───────────────────────────────────────────────

/**
 * Ce code peut-il être tapé maintenant ?
 * @param {{ source?: string }} [meta] source : monospace | lien | label | texte
 * @returns {{ ok: true } | { ok: false, why: string }}
 */
function decide(meta = {}) {
  const current = level();
  if (current === "halt") {
    return {
      ok: false,
      why: `⛔ arrêt anti-blocage (${state.fails} codes faux d'affilée) — envoie #reprendre pour reprendre`,
    };
  }
  if (current === "selective" && !isClearSource(meta.source)) {
    return {
      ok: false,
      why: `${state.fails} codes faux d'affilée — codes clairs seulement (celui-ci est en texte libre)`,
    };
  }
  return { ok: true };
}

// ─── Résultat d'une réclamation ─────────────────────────────────────────────

/**
 * Met à jour le compteur après une réclamation.
 * @param {{ status: string, reason?: string, remaining?: number|null, submitted?: boolean }} result
 */
function record(result = {}) {
  const { status, reason } = result;
  const remaining = Number.isInteger(result.remaining) ? result.remaining : null;

  if (status === "success") {
    state.wonSince = true;
    if (state.fails > 0) setFails(0, "un code a marché");
    else save();
    return;
  }

  if (reason === "locked") return; // géré par noteLock (pause Binance)

  if (reason === "exhausted" || reason === "grabbed") {
    // Code reconnu par Binance, mais rien ne prouve qu'il casse la série
    state.neutralSince++;
    save();
    return;
  }

  // Refus compté comme un code faux : invalide, inclassable, ou soumis sans
  // réponse de Binance (prudence : le chiffre de Binance corrigera)
  const counted =
    reason === "invalid" ||
    reason === "other" ||
    status === "unknown" ||
    (status === "temporary_failure" && result.submitted);
  if (!counted && remaining === null) return;

  if (remaining !== null) {
    observeReport(remaining);
    setFails(LOCK_AFTER - remaining, `Binance annonce ${remaining} essai(s) restant(s)`);
  } else {
    setFails(state.fails + 1, "code faux");
  }
}

/**
 * Binance vient d'annoncer N essais restants : si son compteur a baissé tout
 * seul depuis le relevé précédent (sans code gagné entre-temps), on le note.
 * C'est ainsi que le bot découvre la vraie règle de remise à zéro.
 */
function observeReport(remaining) {
  const now = Date.now();
  const previous = state.lastReport;
  if (previous && !state.wonSince && remaining > previous.remaining - 1) {
    const cause = state.neutralSince > 0 ? "neutral" : "time";
    const reset = { from: previous.at, to: now, cause };
    state.resets.push(reset);
    state.resets = state.resets.slice(-MAX_RESETS);
    emit({ type: "reset", ...reset });
  }
  state.lastReport = { at: now, remaining };
  state.wonSince = false;
  state.neutralSince = 0;
}

/**
 * Blocage Binance (10 codes faux, limite atteinte, captcha) : le compteur
 * est plein jusqu'à la fin du blocage, puis Binance le remet à zéro.
 */
function noteLock(until, reason = "locked") {
  state.pauseUntil = Math.max(state.pauseUntil, until);
  if (reason === "locked") {
    state.fails = LOCK_AFTER;
    state.failsAt = Date.now();
    state.halted = false;
  }
  save();
}

/** Pause partagée par l'autre appareil : gardée pour les redémarrages. */
function notePause(until) {
  if (!(until > state.pauseUntil)) return;
  state.pauseUntil = until;
  save();
}

// ─── #reprendre ─────────────────────────────────────────────────────────────

/** Message « #reprendre » récent tapé dans les Messages enregistrés ? */
function isResumeCommand(msg) {
  const text = String(msg?.text ?? "");
  if (!/^\s*#reprendre\b/i.test(text)) return false;
  const at = msg?.date?.getTime?.() ?? Date.now();
  return Date.now() - at < RESUME_MAX_AGE_MS;
}

/**
 * Reprise demandée : tu as remis le compteur Binance à zéro (un code qui
 * marche, réclamé dans l'app). Un blocage Binance en cours reste respecté.
 * @returns {{ lockedUntil: number }}
 */
function resume() {
  if (state.pauseUntil > Date.now()) return { lockedUntil: state.pauseUntil };
  setFails(0, "#reprendre");
  return { lockedUntil: 0 };
}

// ─── Relais PC ⇄ téléphone ──────────────────────────────────────────────────

/** État partagé avec l'autre appareil (failsAt : horloge locale). */
function exportState() {
  return { fails: state.fails, failsAt: state.failsAt, halted: state.halted };
}

/**
 * État publié par l'autre appareil : le plus récent gagne (même compte
 * Binance, donc même compteur).
 * @param {{ fails: number, failsAt: number, halted: boolean }} peer failsAt en horloge locale
 * @returns {boolean} true si l'état local a changé
 */
function mergePeer(peer) {
  if (!peer || !(peer.failsAt > state.failsAt)) return false;
  change(() => {
    state.fails = readInt(peer.fails, 0, 0, LOCK_AFTER);
    state.failsAt = peer.failsAt;
    // Arrêt de l'autre appareil respecté ; sinon, nos propres seuils s'appliquent
    if (peer.halted && !state.halted) {
      state.halted = true;
      state.haltedAt = Date.now();
    } else if (!peer.halted) {
      state.halted = false;
    }
  }, "état de l'autre appareil");
  return true;
}

// ─── Affichage ──────────────────────────────────────────────────────────────

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function describeReset({ from, to, cause }) {
  const when = `entre ${fmtTime(from)} et ${fmtTime(to)}`;
  return cause === "neutral"
    ? `revenu à zéro ${when}, après un code épuisé ou déjà pris (ou avec le temps)`
    : `revenu à zéro tout seul ${when}, sans code gagné entre-temps`;
}

/** Réglages en une ligne, pour le démarrage. */
function describe() {
  const selective = SELECTIVE_AT > 0 ? `codes clairs à ${SELECTIVE_AT}` : "codes clairs désactivés";
  if (MODE === "light") return `garde-fou léger (${selective}, pas d'arrêt)`;
  const resumeText = STOP_RESUME_MS > 0 ? `reprise auto après ${STOP_RESUME_MS / HOUR} h` : "reprise : #reprendre";
  return `garde-fou + arrêt ⛔ (${selective}, arrêt à ${STOP_AT}, ${resumeText})`;
}

/** Lignes du bilan d'activité. */
function statsRows() {
  const current = level();
  const label = {
    normal: "🟢 normal",
    selective: "🟠 codes clairs seulement",
    halt: "⛔ arrêt (#reprendre)",
    lock: `🔒 blocage Binance jusqu'à ${fmtTime(state.pauseUntil)}`,
  }[current];
  const rows = [["🛡️ Anti-blocage", `${label} · ${state.fails} faux d'affilée / ${LOCK_AFTER}`]];
  const last = state.resets[state.resets.length - 1];
  if (last) rows.push(["🔄 Compteur Binance", describeReset(last)]);
  return rows;
}

/** Champs du signe de vie pour l'app Android. */
function heartbeatFields() {
  return { antiban: level(), fails: state.fails };
}

module.exports = {
  LOCK_AFTER,
  MODE,
  SELECTIVE_AT,
  STOP_AT,
  init,
  setHooks,
  level,
  decide,
  record,
  noteLock,
  notePause,
  isResumeCommand,
  resume,
  exportState,
  mergePeer,
  remainingAttempts,
  isClearSource,
  describe,
  describeReset,
  statsRows,
  heartbeatFields,
};
