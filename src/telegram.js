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
const inputPrompt = require('input'); // Alias pour éviter tout conflit de variable locale
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { hasCode, addCode } = require('./history');

// ─── Configuration ─────────────────────────────────────────────────────────
const SESSION_FILE = path.resolve(__dirname, '..', 'session.txt');
const MAX_CODES_PER_MINUTE = 10;
const RATE_WINDOW_MS = 60 * 1000;
const MIN_HANDLER_DELAY_MS = 200;
const MAX_HANDLER_DELAY_MS = 600;
const IS_DEBUG = process.env.DEBUG === 'true';

// ─── Rate limiter ───────────────────────────────────────────────────────────
const codeTimestamps = [];

function isRateLimitOk() {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  while (codeTimestamps.length && codeTimestamps[0] < cutoff) codeTimestamps.shift();
  if (codeTimestamps.length >= MAX_CODES_PER_MINUTE) {
    logger.warn(`🛡️ Rate limit : ${codeTimestamps.length}/${MAX_CODES_PER_MINUTE} codes/min`);
    return false;
  }
  codeTimestamps.push(now);
  return true;
}

// ─── Session persistante ────────────────────────────────────────────────────
function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const s = fs.readFileSync(SESSION_FILE, 'utf-8').trim();
      if (s) return s;
    }
  } catch (_) { }
  return '';
}

function saveSession(str) {
  try {
    fs.writeFileSync(SESSION_FILE, str, 'utf-8');
  } catch (e) {
    logger.error(`💾 Erreur session : ${e.message}`);
  }
}

// ─── Utilitaires ────────────────────────────────────────────────────────────
const humanDelay = (min = MIN_HANDLER_DELAY_MS, max = MAX_HANDLER_DELAY_MS) =>
  new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));

async function handleFloodWait(err) {
  if (err.seconds !== undefined || err.message?.includes('FLOOD_WAIT')) {
    const wait = (err.seconds ?? 60) + 5;
    logger.warn(`🛑 FLOOD_WAIT — pause ${wait}s...`);
    await new Promise(r => setTimeout(r, wait * 1000));
    return true;
  }
  return false;
}

// ─── Conversion sûre d'un ID GramJS (BigInt/Long/objet) en String ──────────
// GramJS utilise son propre type BigInt — on ne peut pas faire confiance à String() seul
function idToString(id) {
  if (id === null || id === undefined) return '';
  // Si c'est un BigInt natif JS
  if (typeof id === 'bigint') return id.toString();
  // Si c'est un objet GramJS avec .value ou .toString()
  if (typeof id === 'object') {
    if (typeof id.toString === 'function') return id.toString();
    if (id.value !== undefined) return String(id.value);
  }
  return String(id);
}

// ─── Extraction des codes Cryptobox ─────────────────────────────────────────
const CODE_REGEX = /\b(?=[A-Z0-9]*[0-9])([A-Z0-9]{8,20})\b/g;
const URL_CODE_REGEX = /(?:code=|cryptobox\/)([A-Za-z0-9]{6,20})/g;

function extractCodes(text) {
  if (!text) return [];
  const upper = text.toUpperCase();
  const unique = new Set();

  for (const match of upper.matchAll(CODE_REGEX)) {
    const code = match[1];
    if (code.startsWith('BP') || hasCode(code)) continue;
    unique.add(code);
  }
  for (const match of text.matchAll(URL_CODE_REGEX)) {
    const code = match[1].toUpperCase();
    if (code.startsWith('BP') || hasCode(code)) continue;
    if (code.length >= 6) unique.add(code);
  }
  return [...unique];
}

// ─── Normalisation des IDs ──────────────────────────────────────────────────
// GramJS retourne parfois les IDs avec -100, parfois sans.
// On normalise tout en ID "brut" positif (ex: "2038952405").
function normalizeId(raw) {
  const str = idToString(raw).trim();
  // -1002038952405  →  2038952405
  const m = str.match(/^-100(\d+)$/);
  if (m) return m[1];
  // -2038952405  →  2038952405
  if (/^-\d+$/.test(str)) return str.slice(1);
  // @username  →  username (lowercase, sans @)
  if (str.startsWith('@')) return str.slice(1).toLowerCase();
  return str.toLowerCase();
}

// ─── Démarrage du client ────────────────────────────────────────────────────
async function startTelegramClient(targetChannels, onCodeFound) {
  const apiId = parseInt(process.env.API_ID, 10);
  const apiHash = process.env.API_HASH;
  const phone = process.env.PHONE_NUMBER;

  if (!apiId || !apiHash || !phone) {
    throw new Error('❌ Variables manquantes : API_ID, API_HASH, PHONE_NUMBER');
  }

  const session = new StringSession(loadSession());
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 10,
    retryDelay: 2000,
    autoReconnect: true,
    useWSS: true,
  });

  logger.info('🔌 Connexion à Telegram...');
  await client.start({
    phoneNumber: async () => phone,
    phoneCode: async () => {
      logger.info('📱 Code vérification envoyé');
      return await inputPrompt.text('Code : ');
    },
    password: async () => {
      logger.info('🔐 2FA requis');
      return await inputPrompt.text('Mot de passe : ');
    },
    onError: async (err) => {
      if (!(await handleFloodWait(err))) logger.error(`🔒 Erreur auth : ${err.message}`);
    },
  });

  saveSession(client.session.save());
  const me = await client.getMe();
  logger.success(`✅ Connecté : ${me.firstName || ''} (@${me.username || 'N/A'})`);

  // ── Synchronisation des dialogues (OBLIGATOIRE pour activer l'écoute) ────
  // Sans getDialogs(), GramJS ne reçoit pas les updates des canaux même rejoints.
  logger.info('📡 Synchronisation des dialogues...');
  try {
    const dialogs = await client.getDialogs({ limit: 500 });
    logger.success(`✅ ${dialogs.length} dialogues synchronisés.`);
  } catch (e) {
    logger.warn(`⚠️ Synchronisation échouée : ${e.message}`);
  }

  // ── Résolution de TOUS les canaux cibles ─────────────────────────────────
  // channelMap : normalizedId → nom lisible (@username ou titre)
  // Deux approches en parallèle :
  //   1. resolvedEntities → pour NewMessage({ chats: ... }) = filtrage GramJS natif
  //   2. normalizedSet    → pour fallback de vérification dans le handler
  const resolvedEntities = [];
  const channelMap = new Map();
  const normalizedSet = new Set();

  for (const raw of targetChannels) {
    const ch = raw.trim();
    if (!ch) continue;

    try {
      const entity = await Promise.race([
        client.getEntity(ch),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout 7s')), 7000)
        ),
      ]);

      if (entity?.id) {
        const nid = normalizeId(entity.id);
        resolvedEntities.push(entity);
        normalizedSet.add(nid);

        // Construire le nom d'affichage
        const display = entity.username
          ? `@${entity.username}`
          : (entity.title || ch);

        channelMap.set(nid, display);
        if (entity.username) {
          channelMap.set(entity.username.toLowerCase(), display);
        }

        logger.success(`✔️  Canal ajouté : ${display} (ID normalisé: ${nid})`);
      }
    } catch (err) {
      // Mode dégradé : on ajoute l'ID brut sans résolution réseau
      // Utile pour les canaux privés dont on connaît déjà l'ID numérique
      const nid = normalizeId(ch);
      normalizedSet.add(nid);
      channelMap.set(nid, ch);
      logger.warn(`⚠️  Canal non résolu : ${ch} → ajouté en mode dégradé (ID: ${nid}). Erreur : ${err.message}`);
    }
  }

  if (resolvedEntities.length === 0 && normalizedSet.size === 0) {
    throw new Error('Aucun canal valide. Vérifiez TARGET_CHANNELS dans votre .env');
  }

  const displayNames = [...new Set(channelMap.values())].join(', ');
  const totalCount = Math.max(resolvedEntities.length, normalizedSet.size);
  logger.success(`🚀 Écoute active sur ${totalCount} canaux : ${displayNames}`);
  logger.info(`🛡️ Rate limit : ${MAX_CODES_PER_MINUTE} codes/min`);

  // ── Handler des nouveaux messages ────────────────────────────────────────
  // On passe chats:resolvedEntities pour que GramJS filtre NATIVEMENT.
  // Le normalizedSet est un filet de sécurité pour les canaux en mode dégradé.
  client.addEventHandler(
    async (event) => {
      try {
        const msg = event.message;
        if (!msg) return;

        // ── Constitution du texte complet ──────────────────────────────────
        let fullText = msg.message || msg.text || msg.rawText || '';

        if (msg.entities) {
          for (const e of msg.entities) {
            if (e.className === 'MessageEntityTextUrl' && e.url) {
              fullText += ' ' + e.url;
            }
          }
        }

        if (msg.replyMarkup?.rows) {
          for (const row of msg.replyMarkup.rows) {
            for (const btn of row.buttons) {
              if (btn.text) fullText += ' ' + btn.text;
              if (btn.url) fullText += ' ' + btn.url;
              if (btn.data) {
                try { fullText += ' ' + Buffer.from(btn.data).toString('utf-8'); } catch (_) { }
              }
            }
          }
        }

        // ── Identification du canal source ─────────────────────────────────
        const rawId = idToString(msg.chatId || msg.peerId?.channelId || msg.peerId?.chatId || msg.peerId?.userId || '');
        if (!rawId) {
          console.log("⚠️ Message reçu mais aucun ID détecté");
          return;
        }

        const nid = normalizeId(rawId);

        console.log(`[DIAGNOSTIC] Message reçu! rawId=${rawId} | nid=${nid} | set.has=${normalizedSet.has(nid)}`);
        if (!normalizedSet.has(nid)) {
          // console.log(`Ignoré : nid ${nid} absent de [${Array.from(normalizedSet).join(', ')}]`);
          return; // On ignore discrètement les messages des autres canaux
        }

        // Log debug : permet de voir les IDs reçus pour diagnostiquer
        if (IS_DEBUG) {
          logger.debug(`MSG reçu — rawId="${rawId}" normalisé="${nid}" — inSet=${normalizedSet.has(nid)}`);
        }

        // ── Extraction des codes ───────────────────────────────────────────
        const codes = extractCodes(fullText);
        if (!codes.length) return;

        // ── Nom du canal pour le log ───────────────────────────────────────
        const channelName = channelMap.get(nid) || channelMap.get(rawId.toLowerCase()) || `ID:${rawId}`;

        // ── Micro-délai humain ─────────────────────────────────────────────
        await humanDelay();

        // ── Envoi des codes trouvés ────────────────────────────────────────
        for (const code of codes) {
          if (!isRateLimitOk()) continue;
          logger.success(`🎁 Code trouvé : ${code} — depuis ${channelName}`);
          addCode(code);
          onCodeFound(code);
        }

      } catch (err) {
        if (!(await handleFloodWait(err))) {
          logger.error(`💥 Erreur handler : ${err.message}`);
        }
      }
    },
    // On écoute tout (entrants et sortants) pour permettre au User de tester lui-même
    new NewMessage({})
  );

  logger.success('🟢 Bot opérationnel — En écoute...');
  logger.info('⌨️  Ctrl+C pour arrêter');
  return client;
}

module.exports = { startTelegramClient };