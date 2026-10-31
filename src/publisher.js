/**
 * publisher.js — Tes gains publiés automatiquement sur TON canal Telegram
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  📣 TES ABONNÉS PROFITENT DE TES RED PACKETS                             ║
 * ║                                                                          ║
 * ║  Chaque Red Packet gagné part tout de suite sur ton canal, avec son      ║
 * ║  code (copiable d'une touche) et le montant gagné :                      ║
 * ║   • par ton bot d'alertes (API Bot), admin du canal : ton compte         ║
 * ║     Telegram, lui, reste passif ;                                        ║
 * ║   • par l'appareil qui a gagné (PC ou téléphone) : un code n'est gagné   ║
 * ║     qu'une fois, il n'est donc jamais publié deux fois ;                 ║
 * ║   • jamais bloquant : la réclamation des codes suivants n'attend pas.    ║
 * ║                                                                          ║
 * ║  Rafale de gains : le premier part aussitôt, les suivants sont groupés   ║
 * ║  (3 s au moins entre deux posts, Telegram limite les canaux).            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Réglages (.env) :
 *   PUBLISH_CHANNEL  ton canal : @pseudo, t.me/pseudo ou ID -100… (vide = rien)
 *   ALERT_BOT_TOKEN  jeton de ton bot d'alertes (le même que pour les alertes)
 *
 * ⚠️ Ajoute ton bot d'alertes comme administrateur du canal, avec le droit
 *    « Publier des messages ».
 */

"use strict";

const logger = require("./logger");
const notifier = require("./notifier");
const { parseGain } = require("./activity");
const { priceUsd } = require("./prices");

const HOUR = 3600_000;
const SEND_TIMEOUT_MS = 8000;
const GAP_MS = 3000; // Telegram : une vingtaine de messages par minute dans un canal
const RETRY_DELAYS_MS = [5000, 15_000, 30_000]; // réseau coupé, Telegram indisponible
const MAX_RETRY_AFTER_S = 60;
const MAX_PER_POST = 10;
const USD_WAIT_MS = 2000; // le prix ne retarde jamais le post de plus de 2 s
const MIN_USD_SHOWN = 0.01;

// Canal créé par le bot (bouton de l'app, npm run channel)
const DEFAULT_TITLE = "🧧 Red Packet Codes";
// Mots-clés des recherches Telegram (titre, description) : Red Packet, Binance, Crypto Box, codes
const DESCRIPTION =
  "🧧 Codes Red Packet Binance gratuits, publiés en direct dès qu'ils tombent. " +
  "Binance Red Packet codes · Crypto Box · free USDT, BNB. " +
  "Copie le code d'une touche et réclame-le vite dans l'appli Binance.";
// Droits de ton bot dans le canal : publier, et soigner le canal (nom, description,
// photo, message épinglé) pour qu'on le trouve dans les recherches
const BOT_RIGHTS = {
  changeInfo: true,
  postMessages: true,
  editMessages: true,
  deleteMessages: true,
  inviteUsers: true,
};

// ─── Format des posts ───────────────────────────────────────────────────────

/**
 * « @pseudo », « t.me/pseudo », « https://t.me/pseudo/ » → « @pseudo » ;
 * un ID numérique reste tel quel. '' si vide, null si illisible (lien
 * d'invitation t.me/+…, espaces…).
 */
function normalizeChannel(raw) {
  const bare = String(raw ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(?:www\.)?(?:t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  if (!bare) return "";
  if (/^-?\d+$/.test(bare)) return bare;
  if (/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(bare)) return `@${bare}`;
  return null;
}

const escapeHtml = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Dollars à la française : « 0,52 $ », « 12,40 $ », « 1 250 $ ». */
function formatUsd(usd) {
  const text = usd >= 100 ? String(Math.round(usd)) : usd.toFixed(2).replace(".", ",");
  return `${text.replace(/\B(?=(\d{3})+(?!\d))/g, " ")} $`;
}

/** « 0,52 USDT (≈ 0,52 $) », « 12 SPELL » (moins d'un centime), ou ''. */
function amountText({ gain, usd }) {
  const amount = String(gain ?? "").trim();
  if (!parseGain(amount)) return "";
  // Montant tel que Binance l'écrit (aucun chiffre perdu), virgule française
  const text = escapeHtml(amount.replace(/(\d)\.(\d)/g, "$1,$2"));
  return Number.isFinite(usd) && usd >= MIN_USD_SHOWN ? `${text} (≈ ${formatUsd(usd)})` : text;
}

/**
 * Texte du post (HTML de Telegram : le code en <code>, copiable d'une touche).
 * @param {Array<{ code: string, gain?: string, usd?: number|null }>} wins
 */
function formatPost(wins) {
  if (wins.length === 1) {
    const amount = amountText(wins[0]);
    return [
      "🧧 Red Packet réclamé !",
      "",
      `🎁 Code : <code>${escapeHtml(wins[0].code)}</code>`,
      ...(amount ? [`💰 Gain : ${amount}`] : []),
    ].join("\n");
  }
  return [
    `🧧 ${wins.length} Red Packets réclamés !`,
    "",
    ...wins.map((win) => {
      const amount = amountText(win);
      return `🎁 <code>${escapeHtml(win.code)}</code>${amount ? ` · ${amount}` : ""}`;
    }),
  ].join("\n");
}

/**
 * Post d'un Red Packet de Binance Square pris à la main : le lien (sans
 * parrainage) et la réponse, pour que tes abonnés le prennent aussi.
 * @param {{ type?: string, coin?: string, answer?: string, link: string }} item
 */
function formatSquarePost(item) {
  return [
    item.type === "quiz" ? "🧧 Red Packet Quiz réclamé !" : "🧧 Red Packet Binance Square réclamé !",
    "",
    ...(item.answer ? [`🎯 Réponse : <code>${escapeHtml(item.answer)}</code>`] : []),
    ...(item.coin ? [`💰 Crypto : ${escapeHtml(item.coin)}`] : []),
    `👉 <a href="${escapeHtml(item.link)}">Ouvrir le post sur Binance Square</a>`,
  ].join("\n");
}

/**
 * @pseudo à essayer pour un nouveau canal : celui demandé (nettoyé), puis
 * « _codes » et un nombre au hasard. Aucun pseudo demandé : canal privé.
 */
function usernameCandidates(raw) {
  const base = String(raw ?? "")
    .trim()
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .replace(/^[^A-Za-z]+/, "")
    .slice(0, 26);
  if (base.length < 4) return [];
  const random = String(Math.floor(1000 + Math.random() * 9000));
  return [base, `${base}_codes`, `${base}_${random}`].filter((name) => name.length >= 5 && name.length <= 32);
}

const ADMIN_HINT =
  " — ajoute ton bot d'alertes comme administrateur du canal, avec le droit « Publier des messages »";

/** Quoi faire quand Telegram refuse, ou ''. */
function hintFor(reason) {
  if (/chat not found/i.test(reason)) {
    return " — canal introuvable : vérifie PUBLISH_CHANNEL (canal privé : mets son ID -100…)";
  }
  if (/not a member|administrator|rights|kicked|not enough/i.test(reason)) return ADMIN_HINT;
  if (/unauthorized|not found/i.test(reason)) return " — vérifie ALERT_BOT_TOKEN";
  return "";
}

// ─── Publication ────────────────────────────────────────────────────────────

/**
 * @param {{ token?: string, channel?: string, targets?: string,
 *   fetchImpl?: typeof fetch, priceUsd?: typeof priceUsd,
 *   notify?: typeof notifier.notify, sleep?: (ms: number) => Promise<void>,
 *   now?: () => number }} [options]
 *   targets : TARGET_CHANNELS, pour signaler un canal publié ET surveillé.
 */
function createPublisher(options = {}) {
  const token = String(options.token ?? "").trim();
  const rawChannel = String(options.channel ?? "").trim();
  const channel = normalizeChannel(rawChannel);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const lookupPrice = options.priceUsd ?? priceUsd;
  const notify = options.notify ?? notifier.notify;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;

  const enabled = Boolean(token && channel);
  const watched =
    enabled &&
    String(options.targets ?? "")
      .split(",")
      .some((target) => normalizeChannel(target)?.toLowerCase() === channel.toLowerCase());

  /** @type {Array<{ code: string, ready: Promise<object> } | { square: object }>} */
  const pending = [];
  let running = false;
  let lastPostAt = 0;
  let idle = [];
  const counts = { published: 0, failed: 0 };

  function describe() {
    if (!rawChannel) return "désactivée (PUBLISH_CHANNEL vide)";
    if (channel === null) {
      return `impossible : PUBLISH_CHANNEL « ${rawChannel} » illisible (@pseudo, t.me/pseudo ou ID -100…)`;
    }
    if (!token) return "impossible : ALERT_BOT_TOKEN vide (c'est ton bot d'alertes qui publie)";
    return (
      `activée — ${channel}, via ton bot d'alertes` +
      (watched ? " · canal aussi surveillé : ses codes, déjà gagnés, sont ignorés comme doublons" : "")
    );
  }

  /** Appel à l'API Bot. Ne lève jamais d'erreur. */
  async function api(method, payload) {
    try {
      const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok !== false) return { ok: true, result: body.result };
      return {
        ok: false,
        status: res.status,
        reason: body.description || `HTTP ${res.status}`,
        retryAfter: Number(body.parameters?.retry_after) || 0,
      };
    } catch (err) {
      return { ok: false, status: 0, reason: err?.name === "TimeoutError" ? "délai dépassé" : err?.message };
    }
  }

  /** WARN + alerte (1 toutes les 3 h au plus). Renvoie le texte, pour l'app. */
  function reportFailure(what, reason) {
    const text = `${what} : ${reason}${hintFor(reason)}`;
    logger.warn(`📣 ${text}`);
    notify(`📣 ${text}.`, { key: "publish-failed", cooldownMs: 3 * HOUR });
    return text;
  }

  /** Valeur en dollars : lue sur Binance, sinon prix public (2 s au plus). */
  async function resolveWin(win) {
    let usd = Number.isFinite(win.gainUsd) ? win.gainUsd : null;
    const parsed = usd === null ? parseGain(win.gain) : null;
    if (parsed) {
      const price = await Promise.race([
        Promise.resolve(lookupPrice(parsed.coin)).catch(() => null),
        sleep(USD_WAIT_MS).then(() => null),
      ]);
      if (price) usd = parsed.amount * price;
    }
    return { code: win.code, gain: win.gain, usd };
  }

  /**
   * Un post, avec ses nouveaux essais. true s'il est parti.
   * @param {string} text
   * @param {string} label - ce qui est publié, pour les logs
   * @param {number} count - gains contenus dans le post
   */
  async function post(text, label, count) {
    const payload = {
      chat_id: channel,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    for (let attempt = 0; ; attempt++) {
      const res = await api("sendMessage", payload);
      if (res.ok) {
        counts.published += count;
        logger.info(`📣 Publié sur ${channel} : ${label}`);
        return true;
      }
      // Refus définitif (bot pas admin, canal introuvable, jeton faux) : inutile d'insister
      const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
      if (permanent || attempt >= RETRY_DELAYS_MS.length) {
        counts.failed += count;
        reportFailure(`Gain non publié sur ${channel} (${label})`, res.reason);
        return false;
      }
      const waitMs = res.retryAfter
        ? (Math.min(res.retryAfter, MAX_RETRY_AFTER_S) + 1) * 1000
        : RETRY_DELAYS_MS[attempt];
      logger.info(`📣 Publication de ${label} : ${res.reason} — nouvel essai dans ${Math.round(waitMs / 1000)} s`);
      await sleep(waitMs);
    }
  }

  async function pump() {
    if (running) return;
    running = true;
    try {
      while (pending.length > 0) {
        const wait = lastPostAt + GAP_MS - now();
        if (wait > 0) await sleep(wait);
        if (pending[0].square) {
          // Un Red Packet de Square a son post à lui
          const { square } = pending.shift();
          await post(formatSquarePost(square), `post Square ${square.id}`, 1);
        } else {
          // Les gains arrivés pendant l'attente partent ensemble
          const next = pending.findIndex((item) => item.square);
          const batch = pending.splice(0, Math.min(MAX_PER_POST, next < 0 ? pending.length : next));
          const wins = await Promise.all(batch.map((item) => item.ready));
          await post(formatPost(wins), wins.map((w) => w.code).join(", "), wins.length);
        }
        lastPostAt = now();
      }
    } finally {
      running = false;
      for (const resolve of idle.splice(0)) resolve();
    }
  }

  /**
   * Publie un gain sur ton canal. « Tire et oublie » : ne bloque jamais.
   * @param {{ code: string, gain?: string, gainUsd?: number|null }} win
   */
  function publish(win) {
    if (!enabled || !win?.code) return;
    pending.push({ code: win.code, ready: resolveWin(win) });
    void pump();
  }

  /**
   * Publie un Red Packet de Binance Square pris à la main. Ne bloque jamais.
   * @param {{ id: string, type?: string, coin?: string, answer?: string, link: string }} item
   * @returns {boolean} false si aucun canal n'est réglé.
   */
  function publishSquare(item) {
    if (!enabled || !item?.id) return false;
    pending.push({ square: item });
    void pump();
    return true;
  }

  /** Attend que les posts en attente soient partis (arrêt propre). */
  function flush() {
    if (!running && pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => idle.push(resolve));
  }

  /**
   * Ton bot peut-il écrire dans `target` ? Rien n'est publié.
   * @returns {Promise<{ ok: boolean|null, text: string }>} ok : null si le
   *   réseau ne répond pas (vérification remise à plus tard).
   */
  async function canPostIn(target) {
    const failed = (res) =>
      res.status === 0
        ? { ok: null, text: `vérification de ${target} remise à plus tard (${res.reason})` }
        : { ok: false, text: `${res.reason}${hintFor(res.reason)}` };
    const me = await api("getMe", {});
    if (!me.ok) return failed(me);
    const bot = me.result?.username ? `@${me.result.username}` : "ton bot d'alertes";
    const member = await api("getChatMember", { chat_id: target, user_id: me.result?.id });
    if (!member.ok) return failed(member);
    const { status, can_post_messages: canPost } = member.result ?? {};
    if (status === "creator" || (status === "administrator" && canPost !== false)) {
      return { ok: true, text: `${bot} peut publier sur ${target} : chaque gain y partira tout de suite` };
    }
    return {
      ok: false,
      text:
        status === "administrator"
          ? `${bot} est administrateur sans le droit « Publier des messages »${ADMIN_HINT}`
          : `${bot} n'est pas administrateur du canal${ADMIN_HINT}`,
    };
  }

  /**
   * Vérifie au démarrage, sans rien publier, que ton bot peut écrire dans le
   * canal. ok : true / false, ou null si désactivée ou réseau indisponible.
   * @returns {Promise<{ ok: boolean|null, text: string }>}
   */
  async function check() {
    if (!enabled) {
      if (!rawChannel) return { ok: null, text: describe() };
      return { ok: false, text: reportFailure("Publication des gains impossible", describe().replace(/^impossible : /, "")) };
    }
    const result = await canPostIn(channel);
    if (result.ok === true) logger.info(`📣 ${result.text}`);
    else if (result.ok === null) logger.info(`📣 ${result.text[0].toUpperCase()}${result.text.slice(1)}`);
    else {
      // Le texte contient déjà le conseil : pas de second conseil ajouté
      logger.warn(`📣 Publication sur ${channel} impossible : ${result.text}`);
      notify(`📣 Publication sur ${channel} impossible : ${result.text}.`, {
        key: "publish-failed",
        cooldownMs: 3 * HOUR,
      });
    }
    return result;
  }

  /**
   * Crée ton canal avec ton compte Telegram (le userbot : seul un compte peut
   * créer un canal), lui donne un @pseudo public si possible, puis y met ton
   * bot d'alertes administrateur avec le droit « Publier des messages ».
   * Action ponctuelle demandée par toi (bouton de l'app, npm run channel).
   * @param {import('@mtcute/node').TelegramClient} tg
   * @param {{ title?: string, username?: string }} [wanted]
   * @returns {Promise<{ ok: boolean, channel: string, title: string, text: string }>}
   *   channel : '' si le canal n'a pas pu être créé.
   */
  async function setupChannel(tg, wanted = {}) {
    const title = String(wanted.title ?? "").trim().slice(0, 128) || DEFAULT_TITLE;
    const fail = (text, created = "") => {
      logger.warn(`📣 ${text}`);
      return { ok: false, channel: created, title, text };
    };
    if (!token) return fail("Mets d'abord le jeton de ton bot d'alertes (ALERT_BOT_TOKEN) : c'est lui qui publiera.");
    if (!tg) return fail("Telegram n'est pas encore connecté : réessaie dans un instant.");

    const me = await api("getMe", {});
    if (!me.ok) return fail(`Ton bot d'alertes ne répond pas : ${me.reason}${hintFor(me.reason)}`);
    const bot = `@${me.result.username}`;

    let chat;
    try {
      chat = await tg.createChannel({ title, description: DESCRIPTION });
    } catch (err) {
      return fail(`Canal non créé : ${err.message}`);
    }
    logger.info(`📣 Canal « ${title} » créé`);

    // @pseudo public : celui demandé, puis des variantes ; sinon canal privé (ID)
    let created = String(chat.id);
    for (const candidate of usernameCandidates(wanted.username)) {
      try {
        await tg.setChatUsername(chat.id, candidate);
        created = `@${candidate}`;
        break;
      } catch (err) {
        if (/USERNAME_(OCCUPIED|INVALID|PURCHASE_AVAILABLE)/.test(err.message)) continue;
        logger.info(`📣 Pas de @pseudo public (${err.message}) : canal privé`);
        break;
      }
    }

    try {
      await tg.editAdminRights({
        chatId: chat.id,
        userId: me.result.username,
        rights: BOT_RIGHTS,
        rank: "Red Packet",
      });
    } catch (err) {
      return fail(
        `Canal ${created} créé, mais ${bot} n'a pas pu y être mis administrateur (${err.message}) : ` +
          "ajoute-le à la main (Administrateurs → Ajouter, droit « Publier des messages »).",
        created,
      );
    }

    const verified = await canPostIn(created);
    const text =
      verified.ok === false
        ? `Canal ${created} créé et ${bot} ajouté, mais la vérification échoue : ${verified.text}`
        : `Canal ${created} créé, ${bot} y publiera chaque gain tout de suite`;
    logger[verified.ok === false ? "warn" : "success"](`📣 ${text}`);
    return { ok: verified.ok !== false, channel: created, title, text };
  }

  /** Lignes du bilan d'activité. */
  function statsRows() {
    if (!enabled) return [];
    return [["📣 Gains publiés", `${counts.published}${counts.failed ? ` (${counts.failed} non publié(s))` : ""}`]];
  }

  /**
   * Canal créé avant que le bot reçoive tous ses droits : ton compte (s'il est
   * propriétaire du canal) les lui redonne. Sans effet sur un autre compte.
   * @param {import('@mtcute/node').TelegramClient} tg
   * @returns {Promise<boolean>} true si les droits ont été complétés.
   */
  async function ensureBotRights(tg) {
    if (!enabled || !tg) return false;
    const me = await api("getMe", {});
    if (!me.ok) return false;
    const member = await api("getChatMember", { chat_id: channel, user_id: me.result.id });
    const rights = member.ok ? member.result : null;
    if (rights?.status === "creator") return false;
    if (rights?.status === "administrator" && rights.can_change_info && rights.can_post_messages && rights.can_edit_messages) {
      return false;
    }
    try {
      await tg.editAdminRights({ chatId: channel, userId: me.result.username, rights: BOT_RIGHTS, rank: "Red Packet" });
      logger.info(`📣 Droits de @${me.result.username} complétés sur ${channel} (publier, nom, description, photo)`);
      return true;
    } catch (err) {
      // Ce compte n'est pas propriétaire du canal (l'autre appareil le sera)
      logger.debug(`📣 Droits du bot sur ${channel} non modifiés : ${err.message}`);
      return false;
    }
  }

  return { enabled, channel, describe, check, publish, publishSquare, flush, statsRows, setupChannel, ensureBotRights };
}

const fromEnv = (channel = process.env.PUBLISH_CHANNEL) =>
  createPublisher({ token: process.env.ALERT_BOT_TOKEN, channel, targets: process.env.TARGET_CHANNELS });

let current = fromEnv();
let settingUp = null;

module.exports = {
  describe: () => current.describe(),
  check: () => current.check(),
  publish: (win) => current.publish(win),
  publishSquare: (item) => current.publishSquare(item),
  flush: () => current.flush(),
  statsRows: () => current.statsRows(),
  /** Canal publié en ce moment ('' si aucun). */
  channel: () => current.channel || "",
  /**
   * Crée ton canal et y met ton bot (voir createPublisher). Les gains
   * suivants y sont publiés tout de suite, sans redémarrer le bot.
   */
  ensureBotRights: (tg) => current.ensureBotRights(tg),
  setupChannel(tg, wanted) {
    // Deux appuis sur le bouton : un seul canal créé
    if (settingUp) return settingUp;
    if (current.enabled) {
      return Promise.resolve({
        ok: false,
        channel: current.channel,
        title: "",
        text: `Un canal est déjà réglé (${current.channel}) : vide le champ et enregistre avant d'en créer un autre.`,
      });
    }
    settingUp = current.setupChannel(tg, wanted).then((result) => {
      if (result.channel) current = fromEnv(result.channel);
      return result;
    });
    return settingUp.finally(() => {
      settingUp = null;
    });
  },
  // Exposés pour les tests
  createPublisher,
  normalizeChannel,
  usernameCandidates,
  formatPost,
  formatSquarePost,
  formatUsd,
};
