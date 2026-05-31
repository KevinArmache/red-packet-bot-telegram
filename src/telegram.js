/**
 * telegram.js — Module Userbot Telegram (gramjs / MTProto)
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  🎯 RÉCUPÉRATION DES RED PACKETS BINANCE                                 ║
 * ║                                                                          ║
 * ║  Ce module écoute TOUS les messages des canaux/groupes configurés        ║
 * ║  et extrait les codes Cryptobox via Regex + analyse des boutons/URLs.    ║
 * ║                                                                          ║
 * ║  Protections anti-ban :                                                  ║
 * ║  1. FloodWaitError : attente forcée si Telegram demande de ralentir.     ║
 * ║  2. Rate limiting  : max MAX_CODES_PER_MINUTE codes traités / minute.    ║
 * ║  3. Délai humain court avant chaque action Telegram.                     ║
 * ║  4. Aucun getHistory : le bot n'accède JAMAIS aux anciens messages.      ║
 * ║  5. Backoff exponentiel sur reconnexion.                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const input = require('input');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { hasCode, addCode } = require('./history');

// ─── Chemins & configuration ────────────────────────────────────────────────

const SESSION_FILE = path.resolve(__dirname, '..', 'session.txt');

// ─── Paramètres anti-ban ─────────────────────────────────────────────────────
const MAX_CODES_PER_MINUTE = 10; // Limite pour éviter les blocages de compte
const RATE_WINDOW_MS = 60 * 1000;

// Délai humain court (vitesse > sécurité pour les red packets)
const MIN_HANDLER_DELAY_MS = 200;
const MAX_HANDLER_DELAY_MS = 600;

// ─── État interne du rate limiter ────────────────────────────────────────────

const codeTimestamps = [];

function isRateLimitOk() {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;

  while (codeTimestamps.length > 0 && codeTimestamps[0] < cutoff) {
    codeTimestamps.shift();
  }

  if (codeTimestamps.length >= MAX_CODES_PER_MINUTE) {
    logger.warn(`🛡️ Rate limit : ${codeTimestamps.length}/${MAX_CODES_PER_MINUTE} codes/min — ignoré`);
    return false;
  }

  codeTimestamps.push(now);
  return true;
}

// ─── Session persistante ─────────────────────────────────────────────────────

function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const s = fs.readFileSync(SESSION_FILE, 'utf-8').trim();
      if (s) return s;
    }
  } catch (_) { /* ignore */ }
  return '';
}

function saveSession(sessionString) {
  try {
    fs.writeFileSync(SESSION_FILE, sessionString, 'utf-8');
  } catch (err) {
    logger.error(`💾 Impossible de sauvegarder la session : ${err.message}`);
  }
}

// ─── Utilitaires ────────────────────────────────────────────────────────────

function humanDelay(minMs = MIN_HANDLER_DELAY_MS, maxMs = MAX_HANDLER_DELAY_MS) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleFloodWait(err) {
  if (err.seconds !== undefined || err.message?.includes('FLOOD_WAIT')) {
    const waitSeconds = err.seconds ?? 60;
    const totalWait = waitSeconds + 5;
    logger.warn(`🛑 FLOOD_WAIT — Telegram exige une pause de ${totalWait}s...`);
    await new Promise((r) => setTimeout(r, totalWait * 1000));
    return true;
  }
  return false;
}

// ─── Regex d'extraction des codes Cryptobox ─────────────────────────────────
const CODE_REGEX = /\b(?=[A-Z0-9]*[0-9])([A-Z0-9]{8,20})\b/g;
const URL_CODE_REGEX = /(?:code=|cryptobox\/)([A-Za-z0-9]{6,20})/g;

/**
 * Extrait tous les codes potentiels d'un texte de message.
 * @param {string} text — Texte brut du message Telegram.
 * @returns {string[]} — Tableau de codes uniques et valides.
 */
function extractCodes(text) {
  if (!text) return [];

  const upperText = text.toUpperCase();
  const unique = new Set();

  // Extraction 1 : codes directs dans le texte
  const matches = [...upperText.matchAll(CODE_REGEX)];
  for (const match of matches) {
    const code = match[1];
    if (code.startsWith('BP')) continue;    // Écarter les codes promotionnels connus
    if (hasCode(code)) continue;            // Écarter si déjà traité
    unique.add(code);
  }

  // Extraction 2 : codes dans les URLs (?code=XXX ou /cryptobox/XXX)
  const urlMatches = [...text.matchAll(URL_CODE_REGEX)];
  for (const match of urlMatches) {
    const code = match[1].toUpperCase();
    if (code.startsWith('BP')) continue;
    if (hasCode(code)) continue;
    if (code.length >= 6) unique.add(code);
  }

  return [...unique];
}

// ─── Normalisation des IDs de canaux ────────────────────────────────────────

/**
 * Normalise un identifiant de canal pour la comparaison stricte.
 * GramJS retourne les IDs de canaux sans le préfixe "-100" ou sous forme d'objets BigInt.
 */
function normalizeChannelId(ch) {
  if (typeof ch !== 'string') ch = String(ch);
  const trimmed = ch.trim();

  // ID numérique avec préfixe -100 → supprimer le préfixe
  const match = trimmed.match(/^-100(\d+)$/);
  if (match) return match[1];

  // ID négatif standard → supprimer le tiret
  if (/^-\d+$/.test(trimmed)) return trimmed.replace('-', '');

  // Si c'est un @username, on le passe en minuscule sans le @ pour simplifier
  if (trimmed.startsWith('@')) return trimmed.slice(1).toLowerCase();

  return trimmed.toLowerCase();
}

// ─── Démarrage du client ────────────────────────────────────────────────────

async function startTelegramClient(targetChannels, onCodeFound) {
  const apiId = parseInt(process.env.API_ID, 10);
  const apiHash = process.env.API_HASH;
  const phone = process.env.PHONE_NUMBER;

  if (!apiId || !apiHash || !phone) {
    throw new Error("❌ Variables manquantes : API_ID, API_HASH, PHONE_NUMBER");
  }

  const sessionString = loadSession();
  const session = new StringSession(sessionString);

  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 10,
    retryDelay: 2000,
    autoReconnect: true,
    useWSS: true,
  });

  logger.info('🔌 Connexion à Telegram en cours...');

  await client.start({
    phoneNumber: async () => phone,
    phoneCode: async () => {
      logger.info('📱 Code de vérification envoyé par Telegram');
      return await input.text('Entrez le code de vérification : ');
    },
    password: async () => {
      logger.info('🔐 Mot de passe 2FA requis');
      return await input.text('Entrez votre mot de passe 2FA : ');
    },
    onError: async (err) => {
      const handled = await handleFloodWait(err);
      if (!handled) logger.error(`🔒 Erreur authentification : ${err.message}`);
    },
  });

  const newSession = client.session.save();
  saveSession(newSession);
  const me = await client.getMe();

  // Sets de stockage pour le filtrage rapide et l'affichage des logs
  const normalizedSet = new Set();
  const channelMap = new Map(); // Permet d'associer un ID normalisé à son nom d'affichage (@username ou titre)

  // Résolution et abonnement à TOUS les canaux
  for (const ch of targetChannels) {
    const trimmed = ch.trim();
    if (!trimmed) continue;

    try {
      // Résolution de l'entité Telegram (détecte l'ID et l'username réel du canal)
      const entity = await Promise.race([
        client.getEntity(trimmed),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout réseau (6s)')), 6000)
        ),
      ]);

      if (entity && entity.id) {
        const idStr = normalizeChannelId(String(entity.id));
        normalizedSet.add(idStr);

        // Construction du nom d'affichage idéal (@username public, sinon titre, sinon fallback brute)
        let displayName;
        if (entity.username) {
          displayName = `@${entity.username}`;
          // On ajoute aussi le username normalisé dans le Set pour parer à tous les cas de figure
          normalizedSet.add(entity.username.toLowerCase());
        } else if (entity.title) {
          displayName = entity.title;
        } else {
          displayName = trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
        }

        channelMap.set(idStr, displayName);
        if (entity.username) {
          channelMap.set(entity.username.toLowerCase(), displayName);
        }
      }
    } catch (err) {
      // Fallback dégradé si le canal n'est pas résolu directement par le réseau (canal privé non rejoint par exemple)
      const fallbackId = normalizeChannelId(trimmed);
      normalizedSet.add(fallbackId);
      channelMap.set(fallbackId, trimmed);
    }
  }

  // Log de démarrage épuré (les logs DEBUG polluants ont été complètement nettoyés)
  logger.success(`Connecté : ${me.firstName ?? ''} (@${me.username ?? 'N/A'})`);
  const channelNames = [...new Set(channelMap.values())].join(', ');
  logger.success(`🚀 Bot démarré ! Écoute active sur ${targetChannels.length} canaux : ${channelNames}`);
  logger.info(`Rate limit : ${MAX_CODES_PER_MINUTE} codes/min`);

  logger.info('Synchronisation des dialogues...');
  try {
    await client.getDialogs();
    logger.success('✅ Synchronisation terminée !');
  } catch (err) {
    logger.warn(`⚠️ Erreur lors de la synchronisation : ${err.message}`);
  }

  // ── Handler de nouveaux messages ────────────────────────────────────────
  client.addEventHandler(
    async (event) => {
      try {
        const message = event.message;
        if (!message) return;

        let fullText = message.message || message.text || message.rawText || '';

        // Extraction des URLs cachées dans les entités de message
        if (message.entities) {
          for (const entity of message.entities) {
            if (entity.className === 'MessageEntityTextUrl' && entity.url) {
              fullText += ' ' + entity.url;
            }
          }
        }

        // Extraction des URLs et données des boutons du message (redpacket interactifs)
        if (message.replyMarkup && message.replyMarkup.rows) {
          for (const row of message.replyMarkup.rows) {
            for (const button of row.buttons) {
              if (button.text) fullText += ' ' + button.text;
              if (button.url) fullText += ' ' + button.url;
              if (button.data) {
                try {
                  fullText += ' ' + Buffer.from(button.data).toString('utf-8');
                } catch (_) { /* ignore */ }
              }
            }
          }
        }

        // ── 1. Extraire les codes
        const codes = extractCodes(fullText);

        // ── 2. Identifier le canal d'origine
        let rawChatId = message.chatId ? String(message.chatId) : null;

        if (!rawChatId && message.peerId) {
          if (message.peerId.channelId) rawChatId = String(message.peerId.channelId);
          else if (message.peerId.chatId) rawChatId = String(message.peerId.chatId);
          else if (message.peerId.userId) rawChatId = String(message.peerId.userId);
        }

        if (!rawChatId) return;

        // Normalisation de l'ID reçu
        const normalizedChatId = normalizeChannelId(rawChatId);

        // Vérification d'écoute active (sur ID numérique)
        if (!normalizedSet.has(normalizedChatId)) {
          return; // Message ignoré, ne fait pas partie des cibles
        }

        // Récupération du nom d'affichage résolu pour ce canal (ex: @vgfboxes)
        const channelName = channelMap.get(normalizedChatId) || `@${normalizedChatId}`;

        if (codes.length === 0) {
          return; // Aucun code détecté dans le message reçu, on s'arrête discrètement
        }

        // Micro-délai humain avant de lancer l'action
        await humanDelay();

        // Traitement de chaque code trouvé
        for (const code of codes) {
          if (!isRateLimitOk()) continue;

          // LOG DE SUCCÈS NETTOYÉ : Affiche le @nom_du_canal à la place de l'ID brut
          logger.success(`✅ OK — 🎁 Code trouvé : ${code} — depuis ${channelName}`);

          addCode(code);
          onCodeFound(code);
        }

      } catch (err) {
        const handled = await handleFloodWait(err);
        if (!handled) {
          logger.error(`💥 Erreur handler : ${err.message}`);
        }
      }
    },
    new NewMessage({ incoming: true }) // Écoute uniquement les messages reçus en temps réel
  );

  logger.success('🟢 Bot Telegram opérationnel — En écoute...');
  logger.info('⌨️ Appuyez sur Ctrl+C pour arrêter');
  return client;
}

module.exports = { startTelegramClient };