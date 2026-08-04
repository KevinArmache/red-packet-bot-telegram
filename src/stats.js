/**
 * stats.js — Compteurs d'activité du bot (mémoire uniquement)
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  📊 SUIVI DE PERFORMANCE                                                 ║
 * ║                                                                          ║
 * ║  Permet de vérifier d'un coup d'œil qu'aucun Red Packet n'est raté :     ║
 * ║  messages vus, codes détectés, réclamations, gains, latences.            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

const state = {
  startedAt: Date.now(),

  // Flux Telegram
  messagesSeen: 0, // Messages reçus depuis les canaux surveillés
  messagesEdited: 0, // Messages édités analysés (code ajouté après coup)
  messagesBacklog: 0, // Messages publiés AVANT le démarrage → jamais traités
  messagesStale: 0, // Messages livrés trop tard (reconnexion) → ignorés

  // Codes
  codesDetected: 0,
  codesDuplicate: 0, // Déjà vus (historique ou déjà en cours)
  codesClaimed: 0, // Réclamations réellement tentées
  codesWon: 0,
  codesFailed: 0, // Code invalide / expiré / déjà pris
  codesSkipped: 0, // Non tentés (pause anti-ban, navigateur indisponible)

  // Latences (ms)
  totalDetectToClaimMs: 0,
  worstDetectToClaimMs: 0,
  totalClaimMs: 0,

  // File d'attente
  queuePeak: 0,

  // Réseau
  disconnects: 0,

  lastCodeAt: 0,
  lastWinAt: 0,
};

/** Incrémente un compteur. */
function bump(key, amount = 1) {
  if (typeof state[key] === "number") state[key] += amount;
}

/** Enregistre la valeur si elle dépasse le maximum connu. */
function peak(key, value) {
  if (value > state[key]) state[key] = value;
}

/** Latence entre la détection du code et le début de la réclamation. */
function recordQueueWait(ms) {
  state.totalDetectToClaimMs += ms;
  if (ms > state.worstDetectToClaimMs) state.worstDetectToClaimMs = ms;
}

/** Durée d'une réclamation Binance. */
function recordClaimDuration(ms) {
  state.totalClaimMs += ms;
}

/** Formate une durée en `2j 03h 14m 09s`. */
function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const parts = [];
  if (days) parts.push(`${days}j`);
  if (days || hours) parts.push(`${String(hours).padStart(2, "0")}h`);
  parts.push(`${String(minutes).padStart(2, "0")}m`);
  parts.push(`${String(seconds).padStart(2, "0")}s`);
  return parts.join(" ");
}

/** Instantané formaté prêt à être affiché par `logger.table()`. */
function snapshot() {
  const uptime = Date.now() - state.startedAt;
  const attempts = state.codesClaimed || 1;
  const avgWait = Math.round(state.totalDetectToClaimMs / attempts);
  const avgClaim = Math.round(state.totalClaimMs / attempts);
  const successRate = state.codesClaimed
    ? Math.round((state.codesWon / state.codesClaimed) * 100)
    : 0;

  return {
    raw: state,
    rows: [
      ["⏱️ Uptime", formatDuration(uptime)],
      ["📨 Messages analysés", `${state.messagesSeen} (dont ${state.messagesEdited} éditions)`],
      ["🎁 Codes détectés", state.codesDetected],
      ["🚀 Réclamations", state.codesClaimed],
      ["💰 Gains", `${state.codesWon} (${successRate} %)`],
      ["📭 Échecs", state.codesFailed],
      ["⏭️ Ignorés", `${state.codesSkipped} (pause/navigateur)`],
      ["🔁 Doublons filtrés", state.codesDuplicate],
      ["⏮️ Avant démarrage", `${state.messagesBacklog} (jamais traités)`],
      ["🕰️ Messages périmés", state.messagesStale],
      ["⚡ Détection → clic", `${avgWait} ms (pire : ${state.worstDetectToClaimMs} ms)`],
      ["⌛ Durée réclamation", `${avgClaim} ms en moyenne`],
      ["📥 Pic de file", state.queuePeak],
      ["📡 Déconnexions", state.disconnects],
    ],
  };
}

module.exports = {
  state,
  bump,
  peak,
  recordQueueWait,
  recordClaimDuration,
  formatDuration,
  snapshot,
};
