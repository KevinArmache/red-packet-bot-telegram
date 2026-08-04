/**
 * telegram.js — Module Userbot Telegram (mtcute)
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  🎯 RÉCUPÉRATION DES RED PACKETS BINANCE                                 ║
 * ║                                                                          ║
 * ║  Ce module écoute TOUS les messages des canaux/groupes configurés        ║
 * ║  et extrait les codes Cryptobox via Regex + analyse des boutons/URLs.    ║
 * ║                                                                          ║
 * ║  Conçu pour tenir 100+ canaux sans rien rater :                          ║
 * ║   • Écoute active AVANT même la résolution des canaux (zéro angle mort)  ║
 * ║   • Résolution groupée via la liste des dialogues (≈3 appels au lieu     ║
 * ║     de 200) + repli individuel throttlé et résistant au FLOOD_WAIT       ║
 * ║   • Messages ÉDITÉS analysés (beaucoup de canaux ajoutent le code après) ║
 * ║   • Boutons inline & liens masqués réellement lus                        ║
 * ║   • Handler 100 % non bloquant : aucun message ne peut en retarder un    ║
 * ║     autre, quel que soit le nombre de canaux                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

const { TelegramClient } = require("@mtcute/node");
const { Dispatcher, filters } = require("@mtcute/dispatcher");
const inputPrompt = require("input");
const path = require("path");
const logger = require("./logger");
const stats = require("./stats");
const { hasCode, isProcessing, markProcessing } = require("./history");

// ─── Configuration ─────────────────────────────────────────────────────────
// mtcute utilise par défaut un fichier SQLite pour la session.
const SESSION_FILE = path.resolve(__dirname, "..", "client.session");
const IS_DEBUG = process.env.DEBUG === "true";

// ⛔ AUCUN RATTRAPAGE : seuls les messages publiés APRÈS le démarrage du bot
// sont analysés. Tout l'historique antérieur est ignoré, quoi qu'il arrive.
// Rempli au moment où l'écoute démarre réellement.
let listeningSince = 0;

// Garde-fou complémentaire : même publié après le démarrage, un message livré
// en retard (reconnexion réseau) au-delà de ce délai est périmé — son code est
// déjà épuisé et le soumettre brûlerait une tentative Binance pour rien.
// 0 = garde-fou désactivé.
const MAX_MESSAGE_AGE_MS =
  Math.max(0, parseInt(process.env.MAX_MESSAGE_AGE_S ?? "180", 10)) * 1000;

// Résolution des canaux
const RESOLVE_CONCURRENCY = 4; // Appels getChat simultanés (repli)
const DIALOG_SCAN_LIMIT = 3000; // Dialogues parcourus pour l'index groupé
const LINKED_LOOKUP_DELAY_MS = 250; // Espacement des getFullChat en arrière-plan
const RESOLVE_LINKED_CHATS = process.env.RESOLVE_LINKED_CHATS !== "false";

/** Normalise les IDs Telegram (number / bigint / string) pour comparaison fiable. */
function normalizeChatId(id) {
  return String(id);
}

// ─── Utilitaires ────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exécute `worker` sur tous les `items` avec un parallélisme borné. */
async function runPool(items, worker, concurrency) {
  const pending = [...items];
  const runners = Array.from(
    { length: Math.max(1, Math.min(concurrency, pending.length)) },
    async () => {
      while (pending.length > 0) {
        const item = pending.shift();
        try {
          await worker(item);
        } catch (_) {
          /* déjà journalisé par le worker */
        }
      }
    },
  );
  await Promise.all(runners);
}

/** Rejoue un appel Telegram une fois si le serveur impose un FLOOD_WAIT. */
async function withFloodRetry(fn, label, maxAttempts = 2) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const match = /FLOOD_WAIT_(\d+)/.exec(err?.message ?? "");
      if (match && attempt < maxAttempts) {
        const wait = Math.min(parseInt(match[1], 10), 60);
        logger.warn(
          `🐢 Limite Telegram atteinte (${label}) — pause de ${wait}s puis reprise`,
        );
        await sleep((wait + 1) * 1000);
        continue;
      }
      throw err;
    }
  }
}

/** Nettoie une entrée TARGET_CHANNELS (@nom, lien t.me, ID brut). */
function normalizeTarget(raw) {
  return String(raw)
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
}

// ─── Extraction des codes Cryptobox ─────────────────────────────────────────
// Les Red Packets Binance standard font EXACTEMENT 8 caractères alphanumériques.
//
// Deux niveaux de confiance pour ne rien rater sans déclencher de faux positifs :
//
//  • STRICT  — appliqué au texte libre : le code doit mélanger lettres ET
//              chiffres (sinon n'importe quel mot de 8 lettres passerait).
//  • SOUPLE  — appliqué uniquement aux sources fiables (texte en `monospace`,
//              « Code : XXXXXXXX », URL cryptobox) : accepte aussi les codes
//              100 % alphabétiques, qui représentent ~10 % des Red Packets et
//              étaient donc systématiquement ratés jusqu'ici.

const RE_STRICT =
  /(?<![A-Z0-9])(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{8}(?![A-Z0-9])/g;
const RE_RELAXED = /(?<![A-Z0-9])[A-Z0-9]{8}(?![A-Z0-9])/g;

// URL de type https://www.binance.com/.../cryptobox/XXXXXXXX
const RE_URL_PATH = /cryptobox[/=]([A-Za-z0-9]{6,20})/gi;
// Paramètre explicite ?code=XXXXXXXX / &c=XXXXXXXX
const RE_URL_PARAM = /[?&](?:code|c|cb)=([A-Za-z0-9]{8})(?![A-Za-z0-9])/gi;
// Libellé explicite « Code : XXXXXXXX » dans plusieurs langues
const RE_LABELLED =
  /(?:code|codigo|código|codice|кода?|كود|码|コード)\s*[:：=＝\-–—]?\s*[`"'*_[(]*\s*([A-Za-z0-9]{8})(?![A-Za-z0-9])/gi;

// Exclure les messages destinés à d'autres plateformes si Binance n'est pas mentionné
const IGNORED_EXCHANGES =
  /bybit|okx|bitget|kucoin|mexc|gate\.?io|huobi|htx|bingx/i;

// Mots courants de 8 lettres susceptibles d'apparaître en monospace / après
// « Code : » — filet de sécurité du niveau SOUPLE.
const STOPWORDS = new Set([
  // Anglais
  "TELEGRAM", "GIVEAWAY", "ETHEREUM", "RECEIVED", "CLAIMING", "DISCOUNT",
  "REGISTER", "WITHDRAW", "TRANSFER", "REFERRAL", "ORIGINAL", "CONTINUE",
  "COMPLETE", "PASSWORD", "SECURITY", "ACTIVITY", "DOWNLOAD", "INTERNET",
  "CONTRACT", "EXCHANGE", "CURRENCY", "MESSAGES", "CHANNELS", "PLATFORM",
  "SETTINGS", "REWARDED", "FINISHED", "SPONSORS", "DEPOSITS", "FEATURED",
  "SHARING", "WINNERS", "INSTANTLY", "QUANTITY", "SOLDOUTT", "CLAIMNOW",
  // Français
  "NOUVEAUX", "NOUVELLE", "TOUJOURS", "PARTAGER", "GAGNANTS", "MONTANTS",
  "PATIENCE", "ENSEMBLE", "PERSONNE", "RESULTAT", "GRATUITE", "PREMIERE",
  "DERNIERE", "REJOINDR", "FELICITE", "CADEAUXX", "MERCIIII",
]);

const VOWELS = /[AEIOUY]/g;

/**
 * Un candidat est-il un code Cryptobox plausible ?
 * @param {string} code - Candidat en majuscules.
 * @param {boolean} relaxed - Provient d'une source de confiance.
 */
function isPlausibleCode(code, relaxed) {
  if (code.length !== 8) return false;
  if (!/^[A-Z0-9]{8}$/.test(code)) return false;
  if (code.startsWith("BP")) return false; // Comportement historique conservé
  if (/^[0-9]{8}$/.test(code)) return false; // 8 chiffres = date / identifiant

  const hasLetter = /[A-Z]/.test(code);
  const hasDigit = /[0-9]/.test(code);

  if (!relaxed) return hasLetter && hasDigit;

  // Niveau souple : on autorise les codes purement alphabétiques, mais on
  // écarte les vrais mots (liste noire + densité de voyelles trop élevée).
  if (!hasDigit) {
    if (STOPWORDS.has(code)) return false;
    if ((code.match(VOWELS) ?? []).length >= 4) return false;
  }
  return true;
}

/**
 * Extrait les codes d'un message pré-découpé en sources.
 * @param {{ plain: string, trusted: string[] }} sources
 * @returns {string[]} Codes uniques, jamais encore traités.
 */
function extractCodes(sources) {
  const plain = sources.plain;
  if (!plain && sources.trusted.length === 0) return [];

  // Message visiblement destiné à un autre exchange → on ignore
  if (IGNORED_EXCHANGES.test(plain) && !/binance|cryptobox/i.test(plain)) {
    return [];
  }

  const found = new Set();

  const add = (candidate, relaxed) => {
    const code = candidate.toUpperCase();
    if (!isPlausibleCode(code, relaxed)) return;
    if (hasCode(code)) return;
    found.add(code);
  };

  // 1. Sources de confiance (monospace, boutons cryptobox…) — niveau souple
  for (const segment of sources.trusted) {
    for (const m of segment.toUpperCase().matchAll(RE_RELAXED)) {
      add(m[0], true);
    }
  }

  // 2. URLs cryptobox explicites — niveau souple
  for (const m of plain.matchAll(RE_URL_PATH)) add(m[1], true);
  for (const m of plain.matchAll(RE_URL_PARAM)) add(m[1], true);

  // 3. Codes explicitement étiquetés « Code : XXXXXXXX » — niveau souple
  for (const m of plain.matchAll(RE_LABELLED)) add(m[1], true);

  // 4. Texte libre — niveau strict (lettres + chiffres obligatoires)
  for (const m of plain.toUpperCase().matchAll(RE_STRICT)) add(m[0], false);

  return [...found];
}

/**
 * Découpe un message mtcute en texte brut + segments de confiance.
 *
 * ⚠️ Corrige deux bugs silencieux de la version précédente :
 *   - les entités sont exposées via `ent.kind` / `ent.params.url` (et non
 *     `ent.type` / `ent.url`) → les liens masqués n'étaient jamais lus ;
 *   - le clavier inline est exposé via `msg.markup` (et non `msg.replyMarkup`)
 *     → les codes cachés dans les boutons n'étaient jamais lus.
 *
 * @param {import('@mtcute/node').Message} msg
 */
function buildMessageSources(msg) {
  const parts = [];
  const trusted = [];

  const text = msg.text || "";
  if (text) parts.push(text);

  // ── Entités : liens masqués + blocs monospace ────────────────────────────
  try {
    for (const ent of msg.entities ?? []) {
      const params = ent.params ?? {};
      const kind = params.kind ?? ent.kind;

      if (kind === "text_link" && params.url) {
        parts.push(params.url);
      } else if (kind === "code" || kind === "pre") {
        // Le monospace est LA convention pour publier un code : confiance max
        const value = ent.text;
        if (value) trusted.push(value);
      }
    }
  } catch (_) {
    /* entités illisibles — on continue avec le texte brut */
  }

  // ── Boutons inline (texte + URL) ─────────────────────────────────────────
  try {
    const markup = msg.markup ?? msg.replyMarkup;
    const rows = markup?.buttons;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        for (const btn of row ?? []) {
          if (btn?.text) parts.push(btn.text);
          if (btn?.url) parts.push(btn.url);
        }
      }
    } else if (Array.isArray(msg.raw?.replyMarkup?.rows)) {
      // Repli sur l'objet TL brut si la version de mtcute change d'API
      for (const row of msg.raw.replyMarkup.rows) {
        for (const btn of row?.buttons ?? []) {
          if (btn?.text) parts.push(btn.text);
          if (btn?.url) parts.push(btn.url);
        }
      }
    }
  } catch (_) {
    /* clavier illisible */
  }

  // ── Aperçu de lien (le code se cache parfois dans l'URL de la preview) ───
  try {
    const media = msg.media;
    if (media && media.type === "webpage") {
      if (media.url) parts.push(media.url);
      if (media.title) parts.push(media.title);
      if (media.description) parts.push(media.description);
    }
  } catch (_) {
    /* média illisible */
  }

  return { plain: parts.join("\n"), trusted };
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
    updates: {
      // ⛔ Pas de rattrapage de l'historique au démarrage : le bot repart de
      // l'état courant du serveur. Aucun code publié avant le lancement du
      // script ne sera récupéré — ils sont de toute façon déjà épuisés et
      // brûleraient inutilement le compteur anti-fraude Binance.
      catchUp: false,
    },
  });

  const dp = new Dispatcher(tg);

  // ── État d'écoute ────────────────────────────────────────────────────────
  /** IDs des chats surveillés. */
  const resolvedIds = new Set();
  /** ID → libellé lisible pour les logs. */
  const channelMap = new Map();
  /** username (minuscules) → libellé cible, pour le rattrapage à la volée. */
  const targetUsernames = new Map();
  /** 'resolving' → filtre par username seul | 'filtered' → IDs + usernames | 'open' → tout. */
  let listenMode = "resolving";
  let staleStreak = 0;
  let backlogStreak = 0;

  // ── Gestion des erreurs internes et réseau de mtcute ──────────────────────
  tg.onError.add((err) => {
    const msg = err.message || "";
    if (
      msg.includes("ECONNRESET") ||
      msg.includes("ENETUNREACH") ||
      msg.includes("ETIMEDOUT") ||
      err.code === "ECONNRESET" ||
      err.code === "ENETUNREACH"
    ) {
      logger.warn(`📡 Problème réseau temporaire (Telegram) : ${msg}`);
    } else {
      logger.error(`💥 Erreur interne Telegram : ${msg}`);
    }
  });

  dp.onError(async (err) => {
    logger.error(`💥 Erreur dispatcher Telegram : ${err.message}`);
    return true; // Marquer comme gérée
  });

  // Visibilité sur l'état de la connexion : une déconnexion silencieuse est la
  // première cause de Red Packets ratés.
  try {
    tg.onConnectionState.add((state) => {
      if (state === "connected") {
        logger.success("📡 Connexion Telegram rétablie — écoute active");
      } else if (state === "offline") {
        stats.bump("disconnects");
        logger.warn("📡 Telegram hors ligne — reconnexion automatique...");
      } else if (state === "updating") {
        logger.info("📡 Synchronisation des messages manqués...");
      } else {
        logger.debug(`📡 État connexion : ${state}`);
      }
    });
  } catch (_) {
    /* émetteur indisponible sur cette version */
  }

  // ── Analyse d'un message (100 % synchrone : jamais bloquante) ────────────
  /**
   * @param {import('@mtcute/node').Message} msg
   * @param {boolean} isEdit
   */
  function handleMessage(msg, isEdit) {
    try {
      const chat = msg.chat;
      const chatKey = normalizeChatId(chat.id);
      const username = chat.username ? chat.username.toLowerCase() : null;

      // ── Filtrage du chat ───────────────────────────────────────────────
      let watched = resolvedIds.has(chatKey);

      if (!watched && username && targetUsernames.has(username)) {
        // Canal ciblé mais pas encore résolu : on l'adopte à la volée
        resolvedIds.add(chatKey);
        channelMap.set(chatKey, `@${chat.username}`);
        logger.success(
          `✔️  Canal identifié à la volée : @${chat.username} (ID ${chatKey})`,
        );
        watched = true;
      }

      if (!watched && listenMode !== "open") return;

      stats.bump("messagesSeen");
      if (isEdit) stats.bump("messagesEdited");

      if (IS_DEBUG) {
        logger.debug(
          `MSG ${isEdit ? "édité" : "reçu"} — chatId="${chatKey}" titre="${chat.title}"`,
        );
      }

      // ── ⛔ Aucun code publié avant le démarrage du script ───────────────
      // Pour une édition, c'est la date d'édition qui compte : un canal qui
      // ajoute le code MAINTENANT dans un vieux message reste un code neuf.
      const stamp = isEdit ? (msg.editDate ?? msg.date) : msg.date;
      const stampMs = stamp ? stamp.getTime() : Date.now();

      if (stampMs < listeningSince) {
        stats.bump("messagesBacklog");
        backlogStreak++;
        logger.debug(
          `⏮️  Message antérieur au démarrage ignoré (publié il y a ${Math.round((Date.now() - stampMs) / 1000)}s)`,
        );
        // Filet de sécurité : si absolument TOUT est jugé antérieur au
        // démarrage, c'est l'horloge de la machine qui avance sur celle de
        // Telegram — sans cette alerte le bot semblerait muet sans raison.
        if (backlogStreak === 25 && stats.state.codesDetected === 0) {
          logger.warn(
            "⏰ 25 messages d'affilée jugés antérieurs au démarrage — l'horloge\n" +
              "    de cette machine avance probablement sur l'heure réelle.\n" +
              "    Synchronisez-la (w32tm /resync) sinon aucun code ne passera.",
          );
        }
        return;
      }
      backlogStreak = 0;

      // ── Garde-fou : message livré trop tard (reconnexion réseau) ────────
      if (MAX_MESSAGE_AGE_MS > 0) {
        const ageMs = Date.now() - stampMs;

        if (ageMs > MAX_MESSAGE_AGE_MS) {
          stats.bump("messagesStale");
          staleStreak++;
          logger.debug(
            `🕰️  Message périmé ignoré (${Math.round(ageMs / 1000)}s > ${MAX_MESSAGE_AGE_MS / 1000}s)`,
          );
          // Si TOUT est jugé périmé, c'est l'horloge système qui dérive
          if (staleStreak === 25 && stats.state.codesDetected === 0) {
            logger.warn(
              "🕰️  Beaucoup de messages jugés périmés — vérifiez l'horloge du\n" +
                "    système, ou augmentez MAX_MESSAGE_AGE_S dans le .env.",
            );
          }
          return;
        }
        staleStreak = 0;
      }

      // ── Extraction des codes ───────────────────────────────────────────
      const sources = buildMessageSources(msg);
      const codes = extractCodes(sources);
      if (codes.length === 0) return;

      // ── Nom du canal pour le log ───────────────────────────────────────
      const channelName =
        channelMap.get(chatKey) ||
        (chat.username ? `@${chat.username}` : null) ||
        chat.title ||
        `ID:${chatKey}`;

      // ── Envoi immédiat des codes trouvés ───────────────────────────────
      // Aucun délai artificiel : la lecture est passive côté Telegram (aucun
      // risque de ban) et chaque milliseconde compte face aux autres bots.
      for (const code of codes) {
        if (hasCode(code) || isProcessing(code)) {
          stats.bump("codesDuplicate");
          continue;
        }

        markProcessing(code);
        stats.bump("codesDetected");
        stats.state.lastCodeAt = Date.now();

        logger.success(
          `🎁 Code trouvé : ${code} — depuis ${channelName}${isEdit ? " (édition)" : ""}`,
        );
        onCodeFound(code, { channel: channelName, detectedAt: Date.now() });
      }
    } catch (err) {
      logger.error(`💥 Erreur handler : ${err.message}`);
    }
  }

  // ── Handlers enregistrés AVANT toute résolution ──────────────────────────
  // Objectif : dès la première milliseconde de connexion, aucun message
  // n'échappe au bot — même pendant que les 100 canaux se résolvent.
  //
  // ⛔ `listeningSince` fige la frontière : tout ce qui a été publié avant
  //    cet instant est définitivement hors périmètre.
  listeningSince = Date.now();
  dp.onNewMessage(filters.any, (msg) => handleMessage(msg, false));
  dp.onEditMessage(filters.any, (msg) => handleMessage(msg, true));

  // ── Connexion ────────────────────────────────────────────────────────────
  logger.info("🔌 Connexion à Telegram avec mtcute...");

  await tg.start({
    phone: () => phone,
    code: async () => await inputPrompt.text("📱 Code Telegram : "),
    password: async () => await inputPrompt.text("🔐 Mot de passe 2FA : "),
  });

  const me = await tg.getMe();
  logger.success(`👤 Connecté : ${me.displayName} (@${me.username || "N/A"})`);

  // ── Résolution des canaux cibles ─────────────────────────────────────────
  const targets = targetChannels
    .map(normalizeTarget)
    .filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i);

  for (const target of targets) {
    if (!/^-?\d+$/.test(target)) targetUsernames.set(target.toLowerCase(), target);
  }

  /** Enregistre un chat résolu dans les tables d'écoute. */
  function register(chat, fallbackLabel, suffix = "") {
    const key = normalizeChatId(chat.id);
    const label =
      (chat.username ? `@${chat.username}` : chat.title) || fallbackLabel;
    const display = suffix ? `${label} ${suffix}` : label;

    const isNew = !resolvedIds.has(key);
    resolvedIds.add(key);
    channelMap.set(key, display);

    for (const name of usernamesOf(chat)) {
      targetUsernames.set(name.toLowerCase(), display);
    }
    return isNew ? display : null;
  }

  function usernamesOf(chat) {
    const names = [];
    if (chat?.username) names.push(chat.username);
    for (const u of chat?.usernames ?? []) {
      if (u?.username) names.push(u.username);
    }
    return names;
  }

  logger.info(
    `🗂️  Indexation des dialogues pour résoudre ${targets.length} canal(aux)...`,
  );

  // Étape 1 — un seul balayage de la liste des dialogues résout la quasi-
  // totalité des cibles. C'est ~3 requêtes au lieu de ~200 avec getChat().
  const dialogsByUsername = new Map();
  const dialogsById = new Map();
  let dialogCount = 0;

  try {
    for await (const dialog of tg.iterDialogs({
      archived: "keep", // Les canaux Red Packet sont souvent archivés/mis en sourdine
      limit: DIALOG_SCAN_LIMIT,
    })) {
      const peer = dialog.peer;
      if (!peer) continue;
      dialogCount++;
      dialogsById.set(normalizeChatId(peer.id), peer);
      for (const name of usernamesOf(peer)) {
        dialogsByUsername.set(name.toLowerCase(), peer);
      }
    }
    logger.success(`🗂️  ${dialogCount} dialogue(s) indexé(s)`);
  } catch (err) {
    logger.warn(
      `⚠️  Indexation des dialogues impossible (${err.message}) — repli sur getChat()`,
    );
  }

  const resolved = [];
  const unresolved = [];
  const failed = [];

  for (const target of targets) {
    const peer = /^-?\d+$/.test(target)
      ? dialogsById.get(normalizeChatId(target))
      : dialogsByUsername.get(target.toLowerCase());

    if (peer) {
      const label = register(peer, target);
      if (label) resolved.push(label);
    } else {
      unresolved.push(target);
    }
  }

  // Étape 2 — repli individuel pour les cibles absentes des dialogues
  // (canaux publics non rejoints), en parallélisme borné et anti-FLOOD_WAIT.
  if (unresolved.length > 0) {
    logger.info(
      `🔎 Résolution individuelle de ${unresolved.length} canal(aux) restant(s)...`,
    );

    await runPool(
      unresolved,
      async (target) => {
        try {
          const chat = await withFloodRetry(
            () => tg.getChat(/^-?\d+$/.test(target) ? Number(target) : target),
            target,
          );
          const label = register(chat, target);
          if (label) resolved.push(label);
        } catch (err) {
          // Mode dégradé : on écoute quand même l'ID brut s'il est numérique
          if (/^-?\d+$/.test(target)) {
            const key = normalizeChatId(target);
            resolvedIds.add(key);
            channelMap.set(key, target);
            resolved.push(`${target} (ID brut)`);
          } else {
            failed.push(`${target} — ${err.message}`);
          }
        }
      },
      RESOLVE_CONCURRENCY,
    );
  }

  // ── Bascule en mode filtré ───────────────────────────────────────────────
  if (resolvedIds.size === 0) {
    listenMode = "open";
    logger.warn(
      "⚠️  Aucun canal résolu — le bot écoute TOUS les chats connus par prudence.",
    );
  } else {
    listenMode = "filtered";
  }

  // ── Récapitulatif de résolution ──────────────────────────────────────────
  logger.blank();
  logger.rule("📡 Canaux surveillés", logger.colors.green);
  logger.list([...new Set(channelMap.values())].sort(), 3);
  logger.blank();
  logger.success(
    `🚀 Écoute active sur ${resolvedIds.size} chat(s) — ${resolved.length} résolu(s) sur ${targets.length} cible(s)`,
  );
  logger.info(
    `⏮️ Aucun rattrapage : seuls les codes publiés après ${new Date(listeningSince).toLocaleTimeString("fr-FR")} sont pris`,
  );

  if (failed.length > 0) {
    logger.warn(`🚧 ${failed.length} canal(aux) non résolu(s) :`);
    logger.list(failed, 1, logger.colors.yellow);
    logger.warn(
      "    Ils seront captés automatiquement dès leur premier message si le\n" +
        "    compte est abonné (rattrapage à la volée par @username).",
    );
  }

  // ── Étape 3 (arrière-plan) — groupes de discussion liés ──────────────────
  // Certains canaux publient les codes dans leur groupe de commentaires.
  // On l'explore APRÈS le démarrage de l'écoute, en douceur, pour ne bloquer
  // ni retarder la détection.
  if (RESOLVE_LINKED_CHATS && targets.length > 0) {
    const toEnrich = [...targets];
    void (async () => {
      let added = 0;
      for (const target of toEnrich) {
        await sleep(LINKED_LOOKUP_DELAY_MS);
        try {
          const full = await tg.getFullChat(
            /^-?\d+$/.test(target) ? Number(target) : target,
          );
          if (!full?.linkedChat?.id) continue;

          const label = register(
            full.linkedChat,
            `discussion:${target}`,
            "(discussion)",
          );
          if (label) {
            added++;
            logger.success(`✔️  Groupe lié ajouté : ${label}`);
          }
        } catch (_) {
          /* pas de groupe lié, ou accès refusé */
        }
      }
      if (added > 0) {
        logger.success(
          `🔗 ${added} groupe(s) de discussion lié(s) ajouté(s) — ${resolvedIds.size} chats surveillés au total`,
        );
      }
    })();
  }

  logger.info("⌨️  Ctrl+C pour arrêter");

  return tg;
}

module.exports = { startTelegramClient, extractCodes, buildMessageSources };
