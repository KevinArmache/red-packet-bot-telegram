/**
 * telegram.js — Module Userbot Telegram (mtcute)
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  🎯 RÉCUPÉRATION DES RED PACKETS BINANCE                                 ║
 * ║                                                                          ║
 * ║  Ce module écoute TOUS les messages des canaux/groupes configurés        ║
 * ║  et extrait les codes Cryptobox via Regex + analyse des boutons/URLs.    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

const { TelegramClient } = require("@mtcute/node");
const { Dispatcher, filters } = require("@mtcute/dispatcher");
const inputPrompt = require("input");
const path = require("path");
const logger = require("./logger");
const { hasCode, isProcessing, markProcessing } = require("./history");

// ─── Configuration ─────────────────────────────────────────────────────────
// mtcute utilise par défaut un fichier SQLite pour la session.
const SESSION_FILE = path.resolve(__dirname, "..", "client.session");
const MIN_HANDLER_DELAY_MS = 200;
const MAX_HANDLER_DELAY_MS = 600;
const IS_DEBUG = process.env.DEBUG === "true";

/** Normalise les IDs Telegram (number / bigint / string) pour comparaison fiable. */
function normalizeChatId(id) {
  return String(id);
}

// ─── Utilitaires ────────────────────────────────────────────────────────────
const humanDelay = (min = MIN_HANDLER_DELAY_MS, max = MAX_HANDLER_DELAY_MS) =>
  new Promise((r) =>
    setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min),
  );

// ─── Extraction des codes Cryptobox ─────────────────────────────────────────
// Les Red Packets Binance standard font EXACTEMENT 8 caractères (mix lettres/chiffres)
const CODE_REGEX = /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])([A-Z0-9]{8})\b/g;
const URL_CODE_REGEX = /(?:code=|cryptobox\/)([A-Za-z0-9]{6,20})/g;

// Exclure les messages destinés à d'autres plateformes si Binance n'est pas mentionné
const IGNORED_EXCHANGES =
  /bybit|okx|bitget|kucoin|mexc|gate\.?io|huobi|htx|bingx/i;

function extractCodes(text) {
  if (!text) return [];

  // Si le message mentionne un autre exchange sans mentionner Binance/Cryptobox, c'est probablement un faux positif
  if (IGNORED_EXCHANGES.test(text) && !/binance|cryptobox/i.test(text)) {
    return [];
  }

  const upper = text.toUpperCase();
  const unique = new Set();

  for (const match of upper.matchAll(CODE_REGEX)) {
    const code = match[1];
    if (code.startsWith("BP") || hasCode(code)) continue;
    unique.add(code);
  }
  for (const match of text.matchAll(URL_CODE_REGEX)) {
    const code = match[1].toUpperCase();
    if (code.startsWith("BP") || hasCode(code)) continue;
    if (code.length >= 6) unique.add(code);
  }
  return [...unique];
}

// ─── Démarrage du client ────────────────────────────────────────────────────
async function startTelegramClient(targetChannels, onCodeFound) {
  const apiId = parseInt(process.env.API_ID, 10);
  const apiHash = process.env.API_HASH;
  const phone = process.env.PHONE_NUMBER;

  if (!apiId || !apiHash || !phone) {
    throw new Error("❌ Variables manquantes : API_ID, API_HASH, PHONE_NUMBER");
  }

  const tg = new TelegramClient({
    apiId,
    apiHash,
    storage: SESSION_FILE,
  });

  const dp = new Dispatcher(tg);

  // ── Gestion des erreurs internes et réseau de mtcute ──────────────────────
  tg.onError.add((err) => {
    const msg = err.message || "";
    if (
      msg.includes("ECONNRESET") ||
      msg.includes("ENETUNREACH") ||
      err.code === "ECONNRESET" ||
      err.code === "ENETUNREACH"
    ) {
      logger.warn(`📡 Problème réseau temporaire (Telegram) : ${msg}`);
    } else {
      logger.error(`💥 Erreur interne Telegram : ${msg}`);
    }
  });

  dp.onError(async (err, update) => {
    logger.error(`💥 Erreur dispatcher Telegram : ${err.message}`);
    return true; // Marquer comme gérée
  });

  logger.info("🔌 Connexion à Telegram avec mtcute...");

  await tg.start({
    phone: () => phone,
    code: async () => await inputPrompt.text("📱 Code Telegram : "),
    password: async () => await inputPrompt.text("🔐 Mot de passe 2FA : "),
  });

  const me = await tg.getMe();
  logger.success(`✅ Connecté : ${me.displayName} (@${me.username || "N/A"})`);

  // ── Résolution de TOUS les canaux cibles ─────────────────────────────────
  const resolvedIds = new Set();
  const channelMap = new Map();

  for (const raw of targetChannels) {
    const ch = raw.trim();
    if (!ch) continue;

    try {
      const chat = await tg.getChat(ch);
      const chatKey = normalizeChatId(chat.id);
      resolvedIds.add(chatKey);

      const display = chat.username ? `@${chat.username}` : chat.title || ch;
      channelMap.set(chatKey, display);
      logger.success(`✔️  Canal ajouté : ${display}`);

      // Groupe de discussion lié (certains canaux postent les codes dans le groupe)
      try {
        const full = await tg.getFullChat(ch);
        if (full.linkedChat?.id) {
          const linkedKey = normalizeChatId(full.linkedChat.id);
          if (!resolvedIds.has(linkedKey)) {
            resolvedIds.add(linkedKey);
            const linkedName =
              full.linkedChat.title || `discussion:${linkedKey}`;
            channelMap.set(linkedKey, `${display} (discussion)`);
            logger.success(`✔️  Groupe lié ajouté : ${linkedName}`);
          }
        }
      } catch (_) {
        /* pas de groupe lié ou accès refusé */
      }
    } catch (err) {
      logger.warn(`⚠️  Canal non résolu : ${ch}. Erreur : ${err.message}`);
      // Mode dégradé : on ajoute l'ID si c'est un numéro
      if (!isNaN(ch) || ch.startsWith("-100")) {
        const linkedKey = normalizeChatId(Number(ch));
        resolvedIds.add(linkedKey);
        channelMap.set(linkedKey, ch);
        logger.success(`✔️  Canal ajouté en mode ID brut : ${ch}`);
      }
    }
  }

  if (resolvedIds.size === 0) {
    logger.warn(
      "Aucun canal défini trouvé, mais le bot continuera à écouter les messages des chats qu'il connait.",
    );
  }

  const displayNames = [...new Set(channelMap.values())].join(", ");
  logger.success(
    `🚀 Écoute active sur ${resolvedIds.size} canaux : ${displayNames}`,
  );

  // ── Handler des nouveaux messages ────────────────────────────────────────
  dp.onNewMessage(filters.any, async (msg) => {
    try {
      const chatKey = normalizeChatId(msg.chat.id);

      if (IS_DEBUG) {
        logger.debug(
          `MSG reçu — chatId="${chatKey}" titre="${msg.chat.title}" inSet=${resolvedIds.has(chatKey)}`,
        );
      }

      // Filtrer si ce n'est pas dans nos cibles
      if (resolvedIds.size > 0 && !resolvedIds.has(chatKey)) {
        return;
      }

      // ── Constitution du texte complet ──────────────────────────────────
      let fullText = msg.text || msg.caption || "";

      // Ajouter les textes des urls formattées
      if (msg.entities) {
        for (const ent of msg.entities) {
          if (ent.type === "text_link" && ent.url) {
            fullText += " " + ent.url;
          }
        }
      }

      // Analyser les boutons
      if (msg.replyMarkup?.type === "inline") {
        for (const row of msg.replyMarkup.buttons) {
          for (const btn of row) {
            if (btn.text) fullText += " " + btn.text;
            if (btn.url) fullText += " " + btn.url;
          }
        }
      }

      // ── Extraction des codes ───────────────────────────────────────────
      const codes = extractCodes(fullText);
      if (!codes.length) return;

      // ── Nom du canal pour le log ───────────────────────────────────────
      const channelName =
        channelMap.get(chatKey) ||
        msg.chat.title ||
        `@${msg.chat.username}` ||
        `ID:${chatKey}`;

      // ── Micro-délai humain ─────────────────────────────────────────────
      await humanDelay();

      // ── Envoi des codes trouvés ────────────────────────────────────────
      for (const code of codes) {
        if (hasCode(code) || isProcessing(code)) continue;

        markProcessing(code);
        logger.success(`🎁 Code trouvé : ${code} — depuis ${channelName}`);
        onCodeFound(code);
      }
    } catch (err) {
      logger.error(`💥 Erreur handler : ${err.message}`);
    }
  });

  logger.success("🟢 Bot opérationnel — En écoute (via mtcute)...");
  logger.info("⌨️  Ctrl+C pour arrêter");

  return tg;
}

module.exports = { startTelegramClient };
