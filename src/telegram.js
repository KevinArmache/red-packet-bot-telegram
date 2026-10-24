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

// Avertissement « CommonJS bundles are deprecated » de mtcute : sans intérêt
// pour l'utilisateur, il polluait chaque démarrage dans les logs
globalThis._MTCUTE_CJS_DEPRECATION_WARNED = true;
const { TelegramClient, NodePlatform, MemoryStorage } = require("@mtcute/node");
const { Dispatcher, filters } = require("@mtcute/dispatcher");
const fs = require("fs");
const logger = require("./logger");
const { hints } = require("./platform");
const { dataPath } = require("./paths");
const stats = require("./stats");
const { hasCode, isProcessing, markProcessing } = require("./history");

// ─── Configuration ─────────────────────────────────────────────────────────
// mtcute utilise par défaut un fichier SQLite pour la session.
const SESSION_FILE = dataPath("client.session");
const IS_DEBUG = process.env.DEBUG === "true";

// App Android : pas de module SQLite natif dans Node.js mobile. La session
// est gardée en mémoire et sauvegardée en texte (export mtcute) dans le
// stockage privé de l'app. TG_SESSION_STORAGE=string est posé par l'app.
const STRING_SESSION = process.env.TG_SESSION_STORAGE === "string";
const STRING_SESSION_FILE = dataPath("telegram-session.txt");

// App Android : connexion demandée depuis l'app (bouton « Connexion
// Telegram ») — le code et le mot de passe 2FA sont saisis dans l'app.
const LOGIN_VIA_APP = process.env.BOT_TG_LOGIN === "1" && Boolean(globalThis.__rpbHost);

// Bot lancé sans personne devant l'écran (app Android, PM2, systemd) : il ne
// doit JAMAIS demander de code Telegram. Une session invalide devient une
// erreur TG_LOGIN_REQUIRED (connexion à refaire) au lieu d'un prompt bloquant.
const UNATTENDED = ["1", "true"].includes(
  String(process.env.BOT_UNATTENDED ?? "").toLowerCase(),
);

// Intervalle des pings Telegram (secondes, entre 10 et 60)
const TELEGRAM_PING_MS =
  Math.min(60, Math.max(10, parseInt(process.env.TELEGRAM_PING_S ?? "15", 10) || 15)) * 1000;

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
/** Pourquoi un canal de la liste est introuvable, et quoi faire. */
function explainResolveError(err) {
  const msg = String(err?.message ?? err);
  if (/was not found|USERNAME_NOT_OCCUPIED|USERNAME_INVALID|No user has/i.test(msg)) {
    return "ce @pseudo n'existe pas (canal supprimé ou renommé) : corrige-le ou retire-le";
  }
  if (/not a chat or channel/i.test(msg)) {
    return "c'est un compte personnel, pas un canal : retire-le de la liste";
  }
  if (/CHANNEL_PRIVATE|CHAT_FORBIDDEN|private/i.test(msg)) {
    return "canal privé ou compte exclu : rejoins-le d'abord avec ce compte Telegram";
  }
  return `${msg} — il sera capté à son premier message si le compte y est abonné`;
}

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
// Émojis, flèches et symboles (« 👉 », « ➡️ », « ⏩ », « ✅ »), en plages
// explicites : le Node.js mobile du téléphone n'a pas les tables Unicode,
// et y refuse `\p{…}` (« Invalid property name », bot arrêté le 24/10/2026).
const EMOJI =
  "[\\u{A9}\\u{AE}\\u{203C}\\u{2049}\\u{2122}\\u{2139}\\u{2190}-\\u{21FF}\\u{2300}-\\u{23FF}" +
  "\\u{2460}-\\u{24FF}\\u{25A0}-\\u{27BF}\\u{2900}-\\u{297F}\\u{2B00}-\\u{2BFF}\\u{3030}\\u{303D}" +
  "\\u{3297}\\u{3299}\\u{1F000}-\\u{1FAFF}]";

// Libellé explicite « Code : XXXXXXXX » dans plusieurs langues. Entre les
// deux : un numéro (« Code 2 : »), des flèches, des émojis (« Code 👉 »),
// des guillemets. Le pluriel (« Codes 🎁 ») annonce une liste, pas un code.
// Un code 100 % lettres doit y être en MAJUSCULES : « code tomorrow » n'est
// pas un code.
const RE_LABELLED = new RegExp(
  "(?:code|c[oó]digo|codice|кода?|كود|رمز|کد|कोड|কোড|รหัส|코드|口令|码|コード|(?<![A-Za-z])(?:kode|kodu|kod|mã))" +
    "\\s*#?\\d{0,2}" +
    "(?:[\\s:：=＝\\-–—>«»“”‘’„\"'`*_\\[\\]()|•·]|" + EMOJI + "|\\uFE0F|\\u20E3)*" +
    "([A-Za-z0-9]{8})(?![A-Za-z0-9])",
  "giu",
);

// Code seul sur sa ligne (« OWUVALT5 », « 1. LJSSNXTT », « 1️⃣ LJSSNXTT »,
// « 🎁 LJSSNXTT »), ou plusieurs codes et rien d'autre (« OWUVALT5 | LJSSNXTT ») :
// la forme des listes de codes publiées sur X et dans beaucoup de canaux.
// Numérotation et symboles autour sont ignorés ; le code reste en MAJUSCULES.
const RE_LINE_NUMBER = /^\s*(?:\d{1,2}\s*[.)\-–:]|[0-9#*]\u{FE0F}?\u{20E3}|\u{1F51F})\s*/u;
const RE_LINE_EDGES = /^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g;
const RE_LINE_CODE = /^[A-Z0-9]{8}$/;
// … et seulement dans un message qui annonce des codes
const RE_CODE_CONTEXT = /red\s*packets?|cryptobox|\bcodes?\b|c[oó]digos?|🧧|🎁/i;

// Code 100 % lettres au milieu d'une phrase (« Red packet LJSSNXTT vite ») :
// option `inlineLetters`, pour X seulement (comptes suivis pour leurs codes).
// Pris en MAJUSCULES, dans un post qui annonce des codes, et s'il a l'air
// tiré au hasard : 2 voyelles au plus et une lettre rare (J K Q V W X Z). Les
// mots (« STANDARD », « STRENGTH ») et les paires de trading (« LINKUSDT »)
// restent écartés.
const RE_INLINE_LETTERS = /(?<![A-Za-z0-9])[A-Z]{8}(?![A-Za-z0-9])/g;
const RE_RARE_LETTER = /[JKQVWXZ]/;
const RE_TRADING_PAIR = /(?:USDT|USDC|BUSD|TUSD|USD|EUR|TRY|BTC|ETH|BNB)$/;

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
  // Mots des listes de codes (X, canaux) : seuls sur une ligne, en majuscules
  "AIRDROPS", "FOLLOWUS", "GOODLUCK", "GIFTCODE", "REDPACKS", "CODELIST",
  "NEWCODES", "ALLCODES", "LISTINGS", "BULLRUNS", "DAILYBOX", "FREEBOXS",
  // Mots en majuscules des posts crypto et des annonces
  "BREAKING", "BITCOINS", "ALTCOINS", "DOGECOIN", "TRENDING", "OFFICIAL",
  "REMINDER", "UPCOMING", "ANNOUNCE", "LAUNCHED", "CONGRATS", "THANKYOU",
  "TOMORROW", "TOGETHER", "RETWEETS", "COMMENTS", "FOLLOWER", "MILLIONS",
  "STANDARD", "SNAPSHOT", "UNLOCKED", "DEADLINE", "PROTOCOL", "SURPRISE",
  "THURSDAY", "SATURDAY", "FEBRUARY", "NOVEMBER", "DECEMBER",
  // Français
  "NOUVEAUX", "NOUVELLE", "TOUJOURS", "PARTAGER", "GAGNANTS", "MONTANTS",
  "PATIENCE", "ENSEMBLE", "PERSONNE", "RESULTAT", "GRATUITE", "PREMIERE",
  "DERNIERE", "REJOINDR", "FELICITE", "CADEAUXX", "MERCIIII", "NOVEMBRE",
  "DECEMBRE",
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
  // Codes « BP… » ignorés, volontairement : les vrais font 10 caractères (BP +
  // 8, jamais détectés ici), et un « BP » de 8 caractères est un code coupé.
  if (code.startsWith("BP")) return false;
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

/** Message visiblement destiné à un autre exchange (Bybit, OKX…) ? */
function isOtherExchange(plain) {
  return IGNORED_EXCHANGES.test(plain) && !/binance|cryptobox/i.test(plain);
}

/** Code 100 % lettres qui a l'air tiré au hasard (règle `inlineLetters`). */
function looksRandomLetters(code) {
  return (code.match(VOWELS) ?? []).length <= 2 && RE_RARE_LETTER.test(code) && !RE_TRADING_PAIR.test(code);
}

/** Codes d'une ligne qui n'est faite que de codes, sinon []. */
function lineCodes(line) {
  const bare = line.replace(RE_LINE_NUMBER, "").replace(RE_LINE_EDGES, "");
  if (RE_LINE_CODE.test(bare)) return [bare];
  const parts = bare.split(/[^A-Za-z0-9]+/);
  return parts.length >= 2 && parts.every((part) => RE_LINE_CODE.test(part)) ? parts : [];
}

/**
 * Extrait les codes d'un message pré-découpé en sources.
 *
 * Chaque code garde la source la plus sûre où il a été trouvé : « monospace »,
 * « lien » (URL Cryptobox) et « label » (« Code : XXXXXXXX ») sont des codes
 * CLAIRS ; « texte » vient du texte libre, d'où sortent la plupart des faux
 * codes. L'anti-blocage (src/antiban.js) s'en sert quand la marge d'essais
 * Binance devient faible.
 *
 * @param {{ plain: string, trusted: string[] }} sources
 * @param {{ includeKnown?: boolean, inlineLetters?: boolean }} [options]
 *   includeKnown : ne pas écarter les codes déjà traités (l'appelant les
 *   compte lui-même). inlineLetters : codes 100 % lettres pris aussi au
 *   milieu d'une phrase (posts X).
 * @returns {{ code: string, source: 'monospace'|'lien'|'label'|'texte' }[]}
 *   Codes uniques, jamais encore traités.
 */
function extractCodes(sources, options = {}) {
  const plain = sources.plain;
  // includeKnown : garder aussi les codes déjà traités (compte rendu d'un post X)
  const known = options.includeKnown ? () => false : hasCode;
  if (!plain && sources.trusted.length === 0) return [];

  // Message visiblement destiné à un autre exchange → on ignore
  if (isOtherExchange(plain)) return [];

  /** code → source (la première trouvée est la plus sûre) */
  const found = new Map();

  const add = (candidate, relaxed, source) => {
    const code = candidate.toUpperCase();
    if (!isPlausibleCode(code, relaxed)) return;
    if (known(code)) return;
    if (!found.has(code)) found.set(code, source);
  };

  // 1. Sources de confiance (monospace, boutons cryptobox…) — niveau souple
  for (const segment of sources.trusted) {
    for (const m of segment.toUpperCase().matchAll(RE_RELAXED)) {
      add(m[0], true, "monospace");
    }
  }

  // 2. URLs cryptobox explicites — niveau souple
  for (const m of plain.matchAll(RE_URL_PATH)) add(m[1], true, "lien");
  for (const m of plain.matchAll(RE_URL_PARAM)) add(m[1], true, "lien");

  // 3. Codes explicitement étiquetés « Code : XXXXXXXX » — niveau souple
  for (const m of plain.matchAll(RE_LABELLED)) {
    if (/\d/.test(m[1]) || m[1] === m[1].toUpperCase()) add(m[1], true, "label");
  }

  // 4. Code seul sur sa ligne — niveau souple : les codes 100 % lettres
  //    (« LJSSNXTT », « PABVFEBL ») ne sont plus ratés. Seulement dans un
  //    message qui annonce des codes, qui n'est QU'une liste de codes, ou qui
  //    contient déjà un vrai code (lettres + chiffres) seul sur sa ligne.
  //    Source « texte » : l'anti-blocage le traite comme du texte libre.
  const perLine = plain.split("\n").filter((line) => line.trim()).map(lineCodes);
  const tokens = perLine.flat();
  if (
    tokens.length > 0 &&
    (RE_CODE_CONTEXT.test(plain) ||
      perLine.every((codes) => codes.length > 0) ||
      tokens.some((token) => isPlausibleCode(token, false)))
  ) {
    for (const token of tokens) add(token, true, "texte");
  }

  // 5. Texte libre — niveau strict (lettres + chiffres obligatoires)
  for (const m of plain.toUpperCase().matchAll(RE_STRICT)) add(m[0], false, "texte");

  // 6. Posts X : code 100 % lettres au milieu d'une phrase (voir RE_INLINE_LETTERS)
  if (options.inlineLetters && RE_CODE_CONTEXT.test(plain)) {
    for (const m of plain.matchAll(RE_INLINE_LETTERS)) {
      if (looksRandomLetters(m[0])) add(m[0], true, "texte");
    }
  }

  return [...found].map(([code, source]) => ({ code, source }));
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

// ─── Création et authentification du client ───────────────────────────────

/**
 * Par défaut, mtcute intercepte Ctrl+C / SIGTERM, ferme la session puis
 * relance le signal avec process.kill() — sous Windows, c'est une fin
 * immédiate du processus : l'arrêt propre du bot (file terminée, relais
 * « arrêté » publié, navigateur fermé) n'avait jamais le temps de s'exécuter.
 * Cette plateforme garde seulement la sauvegarde de la session à la sortie.
 */
class ExitOnlyPlatform extends NodePlatform {
  beforeExit(fn) {
    const onExit = () => fn();
    process.once("exit", onExit);
    return () => process.off("exit", onExit);
  }
}

/** Session Telegram révoquée, expirée ou utilisée ailleurs ? */
function isAuthDeadError(err) {
  return err?.code === 401 || err?.text === "AUTH_KEY_DUPLICATED";
}

function loginRequiredError() {
  const err = new Error(
    `Session Telegram absente ou expirée — ${hints.telegramLogin}`,
  );
  err.code = "TG_LOGIN_REQUIRED";
  return err;
}

/**
 * @param {{ ownSignals?: boolean }} [opts]
 *   ownSignals : le bot gère lui-même les signaux (arrêt propre) — pas en
 *   mode connexion (--setup), qui n'a pas de gestionnaire à lui.
 */
function createClient({ ownSignals = false } = {}) {
  const apiId = parseInt(process.env.API_ID, 10);
  const apiHash = process.env.API_HASH;
  const phone = process.env.PHONE_NUMBER;

  if (!apiId || !apiHash || !phone) {
    throw new Error("❌ Variables manquantes : API_ID, API_HASH, PHONE_NUMBER");
  }

  return new TelegramClient({
    apiId,
    apiHash,
    storage: STRING_SESSION ? new MemoryStorage() : SESSION_FILE,
    // Journal interne de mtcute : erreurs seulement (ses avertissements de
    // reconnexion, avec traces de pile, sont résumés par nos propres logs 📡).
    // DEBUG=true les réaffiche.
    logLevel: IS_DEBUG ? 3 : 1,
    // Ping toutes les 15 s (60 s par défaut) : garde la connexion ouverte à
    // travers les box et réseaux mobiles qui ferment en silence une connexion
    // inactive, et détecte une connexion morte en < 30 s au lieu de 2 min.
    network: { pingInterval: TELEGRAM_PING_MS },
    ...(ownSignals ? { platform: new ExitOnlyPlatform() } : {}),
    updates: {
      // ⛔ Pas de rattrapage de l'historique au démarrage : le bot repart de
      // l'état courant du serveur. Aucun code publié avant le lancement du
      // script ne sera récupéré — ils sont de toute façon déjà épuisés et
      // brûleraient inutilement le compteur anti-fraude Binance.
      catchUp: false,
    },
  });
}

/**
 * Connecte le client. En mode interactif, demande le code (et le mot de passe
 * 2FA) au clavier si la session est absente.
 *
 * En mode sans surveillance, les callbacks LÈVENT une erreur au lieu de
 * demander quoi que ce soit : @mtcute/node remplacerait sinon les callbacks
 * absents par une invite clavier qui attendrait indéfiniment (stdin vide).
 * mtcute les appelle AVANT d'envoyer le moindre code : aucun SMS en boucle.
 */
async function authenticate(tg, { interactive }) {
  const session = readStringSession();

  if (!interactive) {
    const need = () => {
      throw loginRequiredError();
    };
    // Ceinture et bretelles : toute future invite de mtcute échoue aussi
    tg.input = () => Promise.reject(loginRequiredError());
    try {
      await tg.start({ session, phone: need, code: need, password: need });
    } catch (err) {
      if (err?.code === "TG_LOGIN_REQUIRED") throw err;
      if (isAuthDeadError(err)) throw loginRequiredError();
      throw err;
    }
    await saveStringSession(tg);
    return;
  }

  const phone = process.env.PHONE_NUMBER;
  const ask = loginPrompter();
  await tg.start({
    session,
    phone: () => phone,
    code: () => ask.code(),
    password: () => ask.password(),
    codeSentCallback: (sent) => ask.codeSent(sent),
    invalidCodeCallback: (type) => ask.invalid(type),
  });
  await saveStringSession(tg);
}

/**
 * Où saisir le code Telegram : dans l'app Android (connexion demandée depuis
 * l'app), sinon au clavier, dans le terminal.
 */
function loginPrompter() {
  if (LOGIN_VIA_APP) {
    const host = globalThis.__rpbHost;
    return {
      code: () => host.ask("telegram_code"),
      password: () => host.ask("telegram_password"),
      codeSent: (sent) => {
        assertCodeDeliverable(sent);
        logger.info(`📨 Code Telegram envoyé (${sent.type}) — saisis-le dans l'app`);
        host.event("telegram_code_sent", { via: sent.type });
      },
      invalid: (kind) => {
        logger.warn(kind === "code" ? "❌ Code Telegram incorrect" : "❌ Mot de passe 2FA incorrect");
        host.event("telegram_invalid", { kind });
      },
    };
  }
  const inputPrompt = require("input");
  return {
    code: () => inputPrompt.text("📱 Code Telegram : "),
    password: () => inputPrompt.text("🔐 Mot de passe 2FA : "),
    codeSent: (sent) => {
      assertCodeDeliverable(sent);
      logger.info("📨 Code Telegram envoyé — regarde ton app Telegram (ou tes SMS)");
    },
    invalid: (kind) =>
      logger.warn(kind === "code" ? "❌ Code incorrect — réessaie" : "❌ Mot de passe incorrect — réessaie"),
  };
}

/**
 * Telegram exige parfois une adresse e-mail de connexion avant d'envoyer le
 * code : aucun code n'arrivera, on le dit clairement (comme mtcute le fait
 * quand aucun rappel n'est fourni).
 */
function assertCodeDeliverable(sent) {
  if (sent?.type === "email_required") {
    throw new Error(
      "Telegram exige une adresse e-mail de connexion pour ce compte : configure-la " +
        "dans l'app Telegram officielle (Réglages → Confidentialité), puis réessaie",
    );
  }
}

/** Session texte de l'app Android (undefined ailleurs, ou si absente). */
function readStringSession() {
  if (!STRING_SESSION) return undefined;
  try {
    return fs.readFileSync(STRING_SESSION_FILE, "utf-8").trim() || undefined;
  } catch (_) {
    return undefined;
  }
}

/** Sauvegarde la session (app Android) : écriture atomique, fichier privé. */
async function saveStringSession(tg) {
  if (!STRING_SESSION) return;
  try {
    const session = await tg.exportSession();
    const tmp = `${STRING_SESSION_FILE}.tmp`;
    fs.writeFileSync(tmp, session, { mode: 0o600 });
    fs.renameSync(tmp, STRING_SESSION_FILE);
  } catch (err) {
    logger.warn(`💾 Sauvegarde de la session Telegram impossible : ${err.message}`);
  }
}

/**
 * Connexion seule, pour `node index.js --setup` :
 * code au clavier si besoin, puis on rend la main.
 * @returns {Promise<{ tg: TelegramClient, me: import('@mtcute/node').User }>}
 */
async function loginTelegram() {
  const tg = createClient();
  logger.info("🔌 Connexion à Telegram avec mtcute...");
  await authenticate(tg, { interactive: true });
  const me = await tg.getMe();
  logger.success(`👤 Connecté : ${me.displayName} (@${me.username || "N/A"})`);
  return { tg, me };
}

// ─── Démarrage du client ────────────────────────────────────────────────────

/**
 * @param {string[]} targetChannels
 * @param {(code: string, meta: object) => void} onCodeFound
 * @param {object} [options]
 * @param {(msg: import('@mtcute/node').Message, isEdit: boolean) => void} [options.onSelfMessage]
 *   Messages de tes « Messages enregistrés » (état du relais PC ⇄ téléphone).
 * @param {(state: string) => void} [options.onConnectionState]
 *   offline / connecting / updating / connected.
 * @param {(channel: string) => void} [options.onChannelMessage]
 *   Nouveau message d'un canal surveillé (statistiques par canal de l'app).
 * @param {(tg: TelegramClient, me: import('@mtcute/node').User) => Promise<void>} [options.onAuthenticated]
 *   Appelé juste après la connexion, AVANT la résolution des canaux (qui peut
 *   durer) : le relais démarre ainsi au plus tôt.
 * @returns {Promise<{ tg: TelegramClient, me: import('@mtcute/node').User }>}
 */
async function startTelegramClient(targetChannels, onCodeFound, options = {}) {
  const { onSelfMessage, onConnectionState, onAuthenticated, onChannelMessage } = options;
  const tg = createClient({ ownSignals: true });

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
  // Coupures réseau : mtcute se reconnecte seul, et la ligne
  // « 📡 Connexion Telegram perdue — reconnexion automatique... » le dit
  // déjà. Le détail technique n'apparaît qu'avec DEBUG=true.
  const NETWORK_ERROR =
    /ECONNRESET|ECONNABORTED|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND|socket hang up|timed? ?out/i;
  tg.onError.add((err) => {
    const msg = err.message || "";
    if (NETWORK_ERROR.test(msg) || NETWORK_ERROR.test(String(err.code ?? ""))) {
      logger.debug(`📡 Détail réseau (Telegram) : ${msg}`);
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
  // Sous Node, mtcute signale une coupure par « connecting » (rarement
  // « offline ») : les deux comptent comme une déconnexion.
  let wasConnected = false;
  try {
    tg.onConnectionState.add((state) => {
      try {
        onConnectionState?.(state);
      } catch (_) {
        /* jamais bloquant */
      }
      if (state === "connected") {
        logger.success(
          wasConnected === null
            ? "📡 Connexion Telegram rétablie — écoute active"
            : "📡 Connecté à Telegram — écoute active",
        );
        wasConnected = true;
      } else if (state === "offline" || state === "connecting") {
        if (wasConnected) {
          stats.bump("disconnects");
          logger.warn("📡 Connexion Telegram perdue — reconnexion automatique...");
          wasConnected = null; // null = déjà connecté une fois, puis coupé
        } else {
          logger.debug(`📡 État connexion : ${state}`);
        }
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

      // Messages enregistrés : jamais une source de codes, mais le canal du
      // relais PC ⇄ téléphone (message d'état #botrelay).
      if (chat.type === "user" && chat.isSelf) {
        if (onSelfMessage) onSelfMessage(msg, isEdit);
        return;
      }

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

      // ── Nom du canal (logs, statistiques par canal de l'app) ───────────
      const channelName =
        channelMap.get(chatKey) ||
        (chat.username ? `@${chat.username}` : null) ||
        chat.title ||
        `ID:${chatKey}`;
      if (onChannelMessage && !isEdit) onChannelMessage(channelName);

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

      // ── Envoi immédiat des codes trouvés ───────────────────────────────
      // Aucun délai artificiel : la lecture est passive côté Telegram (aucun
      // risque de ban) et chaque milliseconde compte face aux autres bots.
      for (const { code, source } of codes) {
        if (hasCode(code) || isProcessing(code)) {
          stats.bump("codesDuplicate");
          continue;
        }

        markProcessing(code);
        stats.bump("codesDetected");
        stats.state.lastCodeAt = Date.now();

        logger.success(
          `🎁 Code trouvé : ${code} — depuis ${channelName}${isEdit ? " (édition)" : ""}` +
            (source === "texte" ? " · texte libre" : ""),
        );
        // postedAt : heure SERVEUR Telegram de la publication (ou de
        // l'édition) — le relais PC ⇄ téléphone s'en sert pour décider quel
        // appareil est responsable du code, sans dépendre des horloges locales.
        // source : où le code a été trouvé (codes clairs ou texte libre).
        onCodeFound(code, {
          channel: channelName,
          detectedAt: Date.now(),
          postedAt: stampMs,
          source,
        });
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

  await authenticate(tg, { interactive: !UNATTENDED || LOGIN_VIA_APP });

  const me = await tg.getMe();
  logger.success(`👤 Connecté : ${me.displayName} (@${me.username || "N/A"})`);
  // App Android : l'écran « Connexion Telegram » affiche le compte connecté
  globalThis.__rpbHost?.event("telegram_ok", {
    name: me.displayName,
    username: me.username || "",
  });

  // Relais PC ⇄ téléphone : démarré AVANT la résolution des canaux (qui peut
  // durer plusieurs minutes avec FLOOD_WAIT) pour réduire au minimum la
  // période où ce bot détecte des codes sans savoir s'il doit les réclamer.
  if (onAuthenticated) await onAuthenticated(tg, me);

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
    // Le plus souvent FLOOD_WAIT après des redémarrages rapprochés : le repli
    // canal par canal fonctionne, ce n'est pas une panne
    const wait = /FLOOD_WAIT_(\d+)/.exec(err.message ?? "");
    logger.info(
      wait
        ? `🗂️  Indexation des dialogues freinée par Telegram (attente ${wait[1]} s) — résolution canal par canal`
        : `🗂️  Indexation des dialogues impossible (${err.message}) — résolution canal par canal`,
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
            failed.push(`${target} — ${explainResolveError(err)}`);
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
    logger.warn(`🚧 ${failed.length} canal(aux) de ta liste introuvable(s) — à corriger dans tes réglages :`);
    logger.list(failed, 1, logger.colors.yellow);
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

  logger.info(UNATTENDED ? `⏹️  Arrêt : ${hints.stop}` : "⌨️  Ctrl+C pour arrêter");

  return { tg, me };
}

module.exports = {
  startTelegramClient,
  loginTelegram,
  isAuthDeadError,
  extractCodes,
  isPlausibleCode,
  isOtherExchange,
  buildMessageSources,
  // Exposés pour les tests
  authenticate,
  createClient,
};
