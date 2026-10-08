/**
 * binance.js — Module d'automatisation Binance via Playwright
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  💰 RÉCLAMATION AUTOMATIQUE DES CODES CRYPTOBOX                         ║
 * ║                                                                          ║
 * ║  Fonctionnalités :                                                       ║
 * ║  - Navigateur Chromium persistant (session conservée)                    ║
 * ║  - ZÉRO RETRY : un code n'est soumis QU'UNE SEULE FOIS. S'il échoue,     ║
 * ║    on passe au suivant (protection du compteur anti-fraude Binance).    ║
 * ║  - Fermeture systématique des onglets (anti-fuite mémoire)              ║
 * ║  - Anti-crash : toute erreur est absorbée sans tuer le processus        ║
 * ║  - Session expirée détectée : aucun code tapé dans le formulaire de     ║
 * ║    connexion, et la page n'est plus touchée pendant que tu te           ║
 * ║    reconnectes (écran « Connexion Binance » de l'app sur téléphone)      ║
 * ║  - Chromium fermé ou onglet planté signalés (relance automatique)       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const { ANDROID_APP } = require('./platform');
const { dataPath } = require('./paths');

// App Android : la page Binance tourne dans une WebView de l'app, pilotée par
// le même Playwright (voir webview-browser.js). Pas de Chromium à lancer.
const webview = ANDROID_APP ? require('./webview-browser') : null;

/** Chromium furtif du PC (chargé seulement hors de l'app Android). */
function loadDesktopChromium() {
  const { chromium } = require('playwright-extra');
  const stealthPlugin = require('puppeteer-extra-plugin-stealth')();
  // BROWSER_USER_AGENT=native : on garde l'identité réelle du navigateur. Sans
  // ça, l'évasion « user-agent-override » ferait passer Linux pour Windows sur
  // les onglets ouverts ensuite, en contradiction avec le reste (WebGL, polices).
  if ((process.env.BROWSER_USER_AGENT ?? '').trim().toLowerCase() === 'native') {
    stealthPlugin.enabledEvasions.delete('user-agent-override');
  }
  chromium.use(stealthPlugin);
  return chromium;
}

// Clics : sans écran allumé, la WebView ne produit pas d'images, et l'attente
// de « stabilité » de Playwright (une image sur deux) ne finirait jamais. Le
// clic est donc direct sur le téléphone ; inchangé sur le PC.
const CLICK = ANDROID_APP ? { force: true } : {};

// ─── Configuration ───────────────────────────────────────────────────────────

const CRYPTOBOX_URL = 'https://www.binance.com/fr/my/wallet/account/payment/cryptobox';
const BROWSER_DATA_DIR = dataPath('browser-data');
const COOKIES_PATH = path.resolve(BROWSER_DATA_DIR, 'cookies.json');

// ⛔ AUCUN RETRY SUR UN CODE : un code n'est jamais soumis deux fois.
// Seule la PRÉPARATION de la page (avant toute saisie) tolère un rechargement,
// ce qui ne consomme aucune tentative côté Binance.
const PAGE_READY_TIMEOUT_MS = 10000;

// Session expirée : vérification passive (sans navigation) du retour de la
// connexion, pour ne jamais perturber une reconnexion en cours dans la fenêtre.
const LOGIN_WATCH_INTERVAL_MS = 20000;

// Détection « faible » de la session : délai max pour la confirmer.
const WEAK_LOGIN_CONFIRM_MS = 15000;

// User-agent historique (Windows). BROWSER_USER_AGENT=native garde celui du
// Chromium réel : indispensable sur Android/Linux pour ne pas contredire les
// autres indices du navigateur (plateforme, WebGL…). Toute autre valeur est
// utilisée telle quelle.
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Options Chromium supplémentaires (séparées par des espaces).
// ⚠️ Jamais de --disable-features : écraserait la liste de Playwright.
const EXTRA_ARGS = (process.env.CHROMIUM_EXTRA_ARGS ?? '').split(/\s+/).filter(Boolean);

// ─── Sélecteurs Playwright ───────────────────────────────────────────────────

const SELECTORS = {
  loggedInIndicators: [
    '[data-testid="header-user-center"]',
    '[data-testid="user-center"]',
    '[data-testid="avatar"]',
    'a[href*="/my/wallet"]',
    'a[href*="/dashboard"]',
    'a[href*="/my/profile"]',
    'a[href*="/my/dashboard"]',
    '[class*="UserAvatar"]',
    '[class*="user-center"]',
    '[class*="headerUser"]',
    '[class*="HeaderProfile"]',
    'button:has-text("Dépôt")',
    'button:has-text("Deposit")',
    'a:has-text("Portefeuille")',
    'a:has-text("Wallet")',
  ],

  loggedOutIndicators: [
    'a[href*="/login"]:visible',
    'button:has-text("Connexion"):visible',
    'button:has-text("Log In"):visible',
    'button:has-text("Sign In"):visible',
    'a:has-text("S\'inscrire"):visible',
  ],

  // Champ de saisie du code — multiples sélecteurs pour robustesse
  codeInput: 'input[placeholder*="code" i], input[placeholder*="Code" i], input[name="code"], input[type="text"]:visible',

  // Bouton de soumission du code
  submitButton: [
    'button:has-text("Réclamer")',
    'button:has-text("Reclamer")',
    'button:has-text("Claim")',
    'button:has-text("Submit")',
    'button:has-text("Recevoir")',
    '[role="button"]:has-text("Réclamer")',
    '[role="button"]:has-text("Claim")',
  ],

  // Bouton de confirmation dans la modale
  confirmButton: [
    'button:has-text("Ouvrir")',
    'button:has-text("Open")',
    'button:has-text("Confirmer")',
    'button:has-text("Confirm")',
    '[role="button"]:has-text("Ouvrir")',
    '[role="button"]:has-text("Open")',
  ],

  // Messages de résultat — sélecteurs de la modale de succès Binance
  successModal: [
    '[class*="result"]',
    '[class*="success"]',
    '[class*="reward"]',
    '[class*="amount"]',
    '[data-testid*="success"]',
    '[data-testid*="result"]',
    'div[class*="modal"] [class*="amount"]',
    'div[class*="modal"] strong',
    'div[class*="modal"] b',
  ],
  // Sélecteurs d'erreur : on les vérifie en dernier
  errorMessage: '[role="alert"]:visible, [class*="errorMessage"]:visible, [class*="error-message"]:visible, [class*="invalid-tip"]:visible',
};

const SESSION_COOKIES = ['BNC_FV_KEY', 'bnc-uuid', 'csrftoken', 'logined', 'se_sd'];

// Délai de connexion manuelle — 0 = attendre indéfiniment (téléphone)
const RAW_LOGIN_TIMEOUT = parseInt(process.env.BINANCE_LOGIN_TIMEOUT ?? '300000', 10);
const LOGIN_TIMEOUT_MS =
  Number.isFinite(RAW_LOGIN_TIMEOUT) && RAW_LOGIN_TIMEOUT >= 0 ? RAW_LOGIN_TIMEOUT : 300000;

// ─── État interne ────────────────────────────────────────────────────────────

/** @type {import('playwright').BrowserContext | null} */
let browserContext = null;
/** @type {import('playwright').Page | null} */
let cryptoboxPage = null;

// Heure de fin de pause en cas d'alerte anti-ban (0 = pas de pause)
let pauseUntil = 0;

// Session Binance expirée en cours de route : aucun code n'est tenté et la
// page n'est plus touchée tant que la connexion n'est pas revenue.
let awaitingLogin = false;
// Première connexion au lancement du navigateur (ensureLoggedIn) : signalée
// comme « connexion requise » dans l'état, comme une session expirée.
let initialLoginWait = false;
let loginWatchTimer = null;
let loginCheckRunning = false;
let appPageSeen = 0;

// Navigateurs fermés volontairement (veille, arrêt) : leur fermeture n'est
// pas un plantage.
const closedOnPurpose = new WeakSet();
// Navigateurs dont la perte a déjà été signalée (un onglet planté PUIS la
// fermeture de Chromium ne doivent déclencher qu'une seule relance)
const lossReported = new WeakSet();
// Onglets plantés (un onglet planté n'est pas « fermé » pour Playwright)
const crashedPages = new WeakSet();

// Lancement en cours, et numéro de génération : closeBrowser() l'incrémente,
// ce qui annule un lancement ou une attente de connexion en cours.
let launching = false;
let initGen = 0;

/**
 * Rappels vers l'orchestrateur (index.js) — tous facultatifs.
 * @type {{
 *   onLoginRequired?: () => void,
 *   onLoginRestored?: () => void,
 *   onUnexpectedClose?: (reason: string) => void,
 *   onPause?: (until: number) => void,
 * }}
 */
let hooks = {};

// ─── Utilitaires ────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomDelay(minMs = 800, maxMs = 2000) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return sleep(delay);
}

/**
 * Tente de trouver un élément parmi une liste de sélecteurs.
 * @param {import('playwright').Page} page
 * @param {string[]} selectors
 * @returns {Promise<import('playwright').ElementHandle|null>}
 */
async function findFirstVisible(page, selectors) {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el && await el.isVisible().catch(() => false)) {
        return el;
      }
    } catch (_) { /* continuer */ }
  }
  return null;
}

async function saveSessionCookies(context) {
  try {
    const cookies = await context.cookies();
    // Transform session cookies into persistent cookies for 30 days so they don't expire
    const persistentCookies = cookies.map(c => {
      if (c.expires === -1) {
        c.expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
      }
      return c;
    });
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(persistentCookies, null, 2));
    logger.info('🍪 Cookies de session sauvegardés localement');
  } catch (err) {
    logger.error('🍪 Sauvegarde des cookies échouée : ' + err.message);
  }
}

async function loadSessionCookies(context) {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
      await context.addCookies(cookies);
      logger.info('🍪 Cookies de session restaurés');
    }
  } catch (err) {
    logger.error('🍪 Restauration des cookies échouée : ' + err.message);
  }
}

function resolveUserAgent() {
  const raw = (process.env.BROWSER_USER_AGENT ?? '').trim();
  if (!raw) return DEFAULT_USER_AGENT;
  if (raw.toLowerCase() === 'native') return undefined;
  return raw;
}

/** Où se connecter : fenêtre du PC, ou écran de connexion de l'app Android. */
function loginWhereHint() {
  return ANDROID_APP
    ? '📱 Dans l\'app : bouton « Connexion Binance » (ou la notification 🔑)'
    : '💻 Dans la fenêtre Chromium ouverte par le bot';
}

function browserClosedError() {
  const err = new Error('Navigateur fermé pendant l\'attente de connexion');
  err.code = 'BROWSER_CLOSED';
  return err;
}

// ─── Analyse des URL ────────────────────────────────────────────────────────

function parseUrl(url) {
  try {
    return new URL(url);
  } catch (_) {
    return null;
  }
}

/** Page de connexion Binance (redirection quand la session a expiré) ? */
function isLoginPage(url) {
  const u = parseUrl(url);
  if (!u) return false;
  return /^accounts\.binance\./i.test(u.hostname) || /\/login(?:\/|$)/i.test(u.pathname);
}

/**
 * Sommes-nous VRAIMENT sur la page Cryptobox ? Hôte ET chemin sont vérifiés :
 * l'adresse de la page de connexion contient elle aussi « cryptobox » (dans
 * son paramètre return_to).
 */
function isOnCryptobox(url) {
  const u = parseUrl(url);
  return (
    Boolean(u) &&
    /^(www\.)?binance\.com$/i.test(u.hostname) &&
    u.pathname.includes('/payment/cryptobox')
  );
}

/** Page binance.com « connectée » quelconque (ni connexion, ni page vide) ? */
function isBinanceAppPage(url) {
  const u = parseUrl(url);
  return Boolean(u) && /^(www\.)?binance\.com$/i.test(u.hostname) && !isLoginPage(url);
}

// ─── Initialisation du navigateur ───────────────────────────────────────────

/**
 * Lance Chromium et attend une session Binance valide.
 * Peut être rappelée après closeBrowser() : relance après un plantage, ou
 * téléphone qui sort de veille (mode relais).
 *
 * @param {typeof hooks} [newHooks]
 */
async function initBrowser(newHooks = {}) {
  hooks = newHooks;
  if (browserContext || launching) return;

  const gen = ++initGen;
  logger.info(webview
    ? '🌐 Ouverture de la page Binance (WebView de l\'app)...'
    : '🌐 Lancement du navigateur Chromium...');

  let context;
  let firstPage = null;
  launching = true;
  try {
    if (webview) {
      ({ context, page: firstPage } = await webview.open());
    } else {
      context = await launchDesktopContext();
    }
  } finally {
    launching = false;
  }

  // Fermeture demandée pendant le lancement (veille, arrêt) : on abandonne
  if (gen !== initGen) {
    closedOnPurpose.add(context);
    await closeContext(context);
    throw browserClosedError();
  }

  browserContext = context;
  context.on('close', () => {
    if (browserContext === context) {
      browserContext = null;
      cryptoboxPage = null;
      awaitingLogin = false;
      stopLoginWatch();
    }
    reportLoss(context, webview ? 'la WebView Binance s\'est fermée' : 'Chromium s\'est fermé');
  });
  // WebView tuée par Android (mémoire) : l'app la signale, on relance
  webview?.onGone(() => reportLoss(context, 'la WebView Binance a planté'));

  try {
    if (!webview) await loadSessionCookies(context);

    const pages = context.pages();
    const page = firstPage || (pages.length > 0 ? pages[0] : await context.newPage());
    watchPage(page);
    assertCurrent(gen, page);

    try {
      await page.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (err) {
      assertCurrent(gen, page);
      logger.warn(`🐌 Chargement initial lent — nouvelle tentative... (${err.message})`);
      await page.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    await ensureLoggedIn(page, gen);

    // Sauvegarde des cookies après s'être assuré qu'on est connecté (la
    // WebView de l'app garde elle-même ses cookies)
    if (!webview) await saveSessionCookies(context);
    assertCurrent(gen, page);

    cryptoboxPage = page;
    logger.success('🟢 Navigateur Binance prêt');
  } catch (err) {
    // Échec (réseau, fermeture volontaire pendant l'attente…) : on ne laisse
    // pas un navigateur à moitié initialisé derrière nous.
    if (browserContext === context) {
      closedOnPurpose.add(context);
      browserContext = null;
      cryptoboxPage = null;
      await closeContext(context);
    }
    throw err;
  }
}

/** Chromium persistant du PC (profil browser-data, fenêtre visible). */
async function launchDesktopContext() {
  return loadDesktopChromium().launchPersistentContext(BROWSER_DATA_DIR, {
    // false pour voir le navigateur, true pour ne pas le voir, important de voir le navigateur pour le login binance pour la premiiere fois  etc...
    headless: false,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    viewport: { width: 1280, height: 800 },
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      ...EXTRA_ARGS,
    ],
    userAgent: resolveUserAgent(),
    // Le bot gère lui-même Ctrl+C / SIGTERM / SIGHUP : la file d'attente se
    // termine AVANT la fermeture du navigateur (arrêt propre).
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
}

/** Ferme Chromium (PC) ou la WebView de l'app (téléphone). */
async function closeContext(context) {
  if (webview) {
    await webview.close().catch(() => { });
  } else {
    await context.close().catch(() => { });
  }
}

/**
 * Le lancement / l'attente en cours est-il toujours d'actualité ?
 * closeBrowser() (veille, arrêt, relance) et un onglet planté l'annulent.
 */
function assertCurrent(gen, page) {
  if (gen !== initGen || !browserContext || page.isClosed() || crashedPages.has(page)) {
    throw browserClosedError();
  }
}

/** Perte d'un navigateur : signalée UNE seule fois par navigateur. */
function reportLoss(context, reason) {
  if (closedOnPurpose.has(context) || lossReported.has(context)) return;
  lossReported.add(context);
  hooks.onUnexpectedClose?.(reason, context);
}

const watchedPages = new WeakSet();

/** Un onglet tué par Android (mémoire) n'est pas « fermé » : on le surveille. */
function watchPage(page) {
  if (watchedPages.has(page)) return;
  watchedPages.add(page);
  page.on('crash', () => {
    crashedPages.add(page);
    if (page === cryptoboxPage) cryptoboxPage = null;
    const context = page.context();
    if (closedOnPurpose.has(context)) return;
    logger.error('💥 L\'onglet Binance a planté (mémoire insuffisante ?)');
    reportLoss(context, 'l\'onglet Binance a planté');
  });
}

/** Ce navigateur est-il toujours celui du bot ? (relance déjà faite sinon) */
function isCurrentContext(context) {
  return Boolean(context) && context === browserContext;
}

// App Android : la connexion Binance se fait dans un autre écran (autre
// WebView, mêmes cookies). La page de réclamation est rechargée quand l'app
// le signale, et au plus tard toutes les 10 min (au cas où le signal se perd).
const APP_LOGIN_RELOAD_MS = 10 * 60_000;
let lastAppReloadAt = 0;

async function reloadAfterAppLogin(page) {
  if (!webview) return;
  const signalled = webview.consumeLoginSignal();
  if (!signalled && Date.now() - lastAppReloadAt < APP_LOGIN_RELOAD_MS) return;
  lastAppReloadAt = Date.now();
  if (signalled) logger.info('🔑 Connexion Binance faite dans l\'app — rechargement de la page Cryptobox');
  await page.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => { });
}

async function ensureLoggedIn(page, gen) {
  await sleep(2000);
  assertCurrent(gen, page);

  const first = await checkLoginConfirmed(page);
  if (first.connected) {
    logger.success(`🔓 Session Binance active — ${first.reason}`);
    return;
  }

  logger.warn(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    '  🔑 Connectez-vous manuellement à Binance dans le navigateur\n' +
    `  ${loginWhereHint()}\n` +
    (LOGIN_TIMEOUT_MS > 0
      ? `  ⏱️ Timeout : ${Math.round(LOGIN_TIMEOUT_MS / 60000)} minutes\n`
      : '  ⏱️ Le bot attend ta connexion, sans limite de temps\n') +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );
  hooks.onLoginRequired?.();

  const deadline = LOGIN_TIMEOUT_MS > 0 ? Date.now() + LOGIN_TIMEOUT_MS : Infinity;
  let lastReminder = Date.now();
  lastAppReloadAt = Date.now();
  initialLoginWait = true;
  try {
    await waitForLogin(page, gen, deadline, lastReminder);
  } finally {
    initialLoginWait = false;
  }
}

/** Boucle d'attente de la première connexion (vérification toutes les 5 s). */
async function waitForLogin(page, gen, deadline, lastReminder) {
  while (Date.now() < deadline) {
    await sleep(5000);
    assertCurrent(gen, page);

    try {
      await reloadAfterAppLogin(page);
      assertCurrent(gen, page);
      const { connected, reason } = await checkLoginConfirmed(page);
      assertCurrent(gen, page);
      if (connected) {
        logger.success(`🔓 Connexion Binance détectée — ${reason}`);
        hooks.onLoginRestored?.();
        return;
      }
    } catch (err) {
      if (err?.code === 'BROWSER_CLOSED') throw err;
      /* page en navigation : prochain passage */
    }

    // Rappel une fois par minute (et non toutes les 5 s) : le bot peut
    // attendre des heures sur le téléphone sans noyer les logs.
    if (Date.now() - lastReminder >= 60000) {
      lastReminder = Date.now();
      const remaining = Number.isFinite(deadline)
        ? ` (${Math.ceil((deadline - Date.now()) / 1000)}s restantes)`
        : '';
      logger.info(`⏳ En attente de ta connexion Binance...${remaining}`);
    }
  }

  throw new Error('⏰ Timeout — connexion Binance non détectée');
}

async function checkLoginStatus(page) {
  // Stratégie -1 : page de connexion = déconnecté (session expirée, redirection)
  if (isLoginPage(page.url())) {
    return { connected: false, reason: 'page de connexion Binance' };
  }

  // Stratégie 0 : Champ de saisie Cryptobox visible = connecté
  try {
    const codeEl = await page.$(SELECTORS.codeInput).catch(() => null);
    if (codeEl && await codeEl.isVisible().catch(() => false)) {
      return { connected: true, reason: 'champ Cryptobox visible', strong: isOnCryptobox(page.url()) };
    }
  } catch (_) { /* continuer */ }

  // Stratégie 1 : Cookies de session
  try {
    const cookies = await page.context().cookies();
    const cookieNames = cookies.map((c) => c.name);
    const found = SESSION_COOKIES.find((n) => cookieNames.includes(n));
    if (found) return { connected: true, reason: `cookie "${found}"` };
  } catch (_) { /* continuer */ }

  // Stratégie 2 : URL réservée
  try {
    const url = page.url();
    const connectedPaths = ['/my/', '/dashboard', '/account', '/asset', '/trade'];
    if (connectedPaths.some((p) => url.includes(p)) && !url.includes('/login')) {
      return { connected: true, reason: 'URL connectée' };
    }
  } catch (_) { /* continuer */ }

  // Stratégie 3 : Sélecteurs positifs
  try {
    for (const sel of SELECTORS.loggedInIndicators) {
      const el = await page.$(sel).catch(() => null);
      if (el && await el.isVisible().catch(() => false)) {
        return { connected: true, reason: `sélecteur "${sel}"` };
      }
    }
  } catch (_) { /* continuer */ }

  // Stratégie 4 : Absence de bouton login
  try {
    let loginFound = false;
    for (const sel of SELECTORS.loggedOutIndicators) {
      const el = await page.$(sel).catch(() => null);
      if (el && await el.isVisible().catch(() => false)) { loginFound = true; break; }
    }
    const url = page.url();
    if (url.includes('binance.com') && !url.includes('about:blank') && !loginFound) {
      await new Promise((r) => setTimeout(r, 800));
      let stillNoLogin = true;
      for (const sel of SELECTORS.loggedOutIndicators) {
        const el = await page.$(sel).catch(() => null);
        if (el && await el.isVisible().catch(() => false)) { stillNoLogin = false; break; }
      }
      if (stillNoLogin) return { connected: true, reason: 'bouton Login absent' };
    }
  } catch (_) { /* continuer */ }

  return { connected: false, reason: 'aucun indicateur trouvé' };
}

/**
 * Comme checkLoginStatus, mais une détection « faible » (cookie, URL, bouton
 * absent…) est reconfirmée : Binance redirige parfois vers la page de
 * connexion côté client, bien après le chargement (plus de 10 s sur un
 * réseau lent). On attend jusqu'à 15 s la preuve forte (champ Cryptobox
 * visible) ou la redirection.
 */
async function checkLoginConfirmed(page) {
  const status = await checkLoginStatus(page);
  if (!status.connected || status.strong) return status;
  const deadline = Date.now() + WEAK_LOGIN_CONFIRM_MS;
  while (Date.now() < deadline) {
    await sleep(1000);
    if (isLoginPage(page.url())) {
      return { connected: false, reason: 'redirection vers la connexion' };
    }
    if (await isCodeInputVisible(page)) {
      return { connected: true, reason: 'champ Cryptobox visible', strong: isOnCryptobox(page.url()) };
    }
  }
  return status;
}

async function isCodeInputVisible(page) {
  try {
    const el = await page.$(SELECTORS.codeInput);
    return Boolean(el) && await el.isVisible().catch(() => false);
  } catch (_) {
    return false; // page en navigation
  }
}

// ─── Session expirée en cours de route ──────────────────────────────────────

/** Code refusé car la session Binance a expiré (aucune tentative brûlée). */
function loginRequired(code) {
  logger.error(`🔑 Session Binance expirée — code ${code} non soumis`);
  enterAwaitingLogin();
  return { remember: false, status: 'logged_out' };
}

function enterAwaitingLogin() {
  if (awaitingLogin) return;
  awaitingLogin = true;
  appPageSeen = 0;
  logger.warn(
    `🔑 Reconnecte-toi à Binance — ${loginWhereHint()}\n` +
    '    Les codes sont ignorés en attendant (aucune tentative brûlée).'
  );
  hooks.onLoginRequired?.();
  lastAppReloadAt = Date.now();
  startLoginWatch();
}

/**
 * Un autre onglet ouvert sur binance.com et connecté (Cryptobox de préférence).
 * App Android : jamais — l'autre WebView est l'écran de connexion de l'app,
 * où tu tapes peut-être encore ton mot de passe.
 */
function pickLoggedInPage() {
  if (webview) return null;
  const pages = (browserContext?.pages() ?? []).filter(
    (p) => p !== cryptoboxPage && !p.isClosed() && !crashedPages.has(p) && isBinanceAppPage(p.url())
  );
  return pages.find((p) => isOnCryptobox(p.url())) || pages[0] || null;
}

/** N'importe quel autre onglet utilisable (par exemple celui de la connexion). */
function pickOpenPage() {
  if (webview) return null;
  return (browserContext?.pages() ?? []).find(
    (p) => p !== cryptoboxPage && !p.isClosed() && !crashedPages.has(p)
  ) || null;
}

/** Nouvel onglet (PC) ou nouvelle WebView demandée à l'app (téléphone). */
async function openPage() {
  return webview ? webview.reopenPage(browserContext) : browserContext.newPage();
}

function adoptPage(page) {
  cryptoboxPage = page;
  watchPage(page);
  appPageSeen = 0;
}

function startLoginWatch() {
  stopLoginWatch();
  loginWatchTimer = setInterval(() => { void passiveLoginCheck(); }, LOGIN_WATCH_INTERVAL_MS);
}

function stopLoginWatch() {
  if (loginWatchTimer) clearInterval(loginWatchTimer);
  loginWatchTimer = null;
}

/**
 * Détecte le retour de la session SANS naviguer tant que tu es sur la page de
 * connexion : la saisie de ton mot de passe ou du code 2FA n'est jamais effacée.
 */
async function passiveLoginCheck() {
  if (loginCheckRunning || !awaitingLogin || !browserContext) return;
  loginCheckRunning = true;
  try {
    // Onglet principal fermé ou planté (par exemple pendant la connexion) :
    // on adopte un autre onglet, sinon on en rouvre un — personne ne tape
    // dans un onglet fermé.
    if (!cryptoboxPage || cryptoboxPage.isClosed() || crashedPages.has(cryptoboxPage)) {
      const replacement = pickLoggedInPage() || pickOpenPage();
      if (replacement) {
        adoptPage(replacement);
      } else {
        const page = await openPage();
        adoptPage(page);
        await page.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
        return; // vérifié au prochain passage
      }
    }

    // App Android : connexion faite dans l'écran de l'app → on recharge
    await reloadAfterAppLogin(cryptoboxPage);
    let url = cryptoboxPage.url();

    // Toujours sur la connexion (identifiants, 2FA, captcha) : on ne touche à
    // rien… sauf si la connexion a été faite dans un AUTRE onglet, qu'on
    // adopte (l'onglet de connexion abandonné n'est pas touché).
    if (isLoginPage(url)) {
      const other = pickLoggedInPage();
      if (!other) {
        appPageSeen = 0;
        return;
      }
      adoptPage(other);
      url = other.url();
    }

    // Connecté mais arrivé ailleurs (tableau de bord…) : après deux constats
    // d'affilée, retour à la page Cryptobox
    if (isBinanceAppPage(url) && !isOnCryptobox(url)) {
      appPageSeen++;
      if (appPageSeen >= 2) {
        appPageSeen = 0;
        await cryptoboxPage
          .goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
          .catch(() => { });
      }
      return;
    }

    if (!isOnCryptobox(url)) return;

    const el = await cryptoboxPage.$(SELECTORS.codeInput).catch(() => null);
    if (el && await el.isVisible().catch(() => false)) {
      awaitingLogin = false;
      stopLoginWatch();
      logger.success('🔓 Session Binance rétablie — les codes sont de nouveau réclamés');
      if (browserContext && !webview) await saveSessionCookies(browserContext);
      hooks.onLoginRestored?.();
    }
  } catch (_) {
    /* page en navigation : prochain passage */
  } finally {
    loginCheckRunning = false;
  }
}

// ─── Pause anti-ban ─────────────────────────────────────────────────────────

/** Déclenche une pause anti-ban locale et prévient l'orchestrateur. */
function startPause(durationMs) {
  pauseUntil = Date.now() + durationMs;
  hooks.onPause?.(pauseUntil);
}

/**
 * Applique une pause anti-ban décidée ailleurs (relais : l'autre appareil a
 * atteint la limite du MÊME compte Binance).
 * @returns {boolean} true si la pause a été prolongée.
 */
function setPauseUntil(until) {
  if (!(until > pauseUntil)) return false;
  pauseUntil = until;
  return true;
}

/** État courant, pour le relais PC ⇄ téléphone et les logs. */
function getStatus() {
  return {
    launched: Boolean(browserContext) || launching,
    ready: Boolean(browserContext && cryptoboxPage),
    awaitingLogin: awaitingLogin || initialLoginWait,
    pauseUntil,
  };
}

// ─── Réclamation d'un code Cryptobox ────────────────────────────────────────

/**
 * @param {string} code
 * @param {object} [opts]
 * @param {() => boolean} [opts.canSubmit] Dernier contrôle juste avant de
 *   taper le code (relais PC ⇄ téléphone : l'autre appareil a peut-être repris
 *   la main pendant l'attente). false → status 'deferred', rien n'est tapé.
 * @param {() => void} [opts.onSubmitting] Appelé juste avant la saisie : le
 *   code est inscrit à l'historique et au registre partagé AVANT d'être tapé.
 */
async function claimCode(code, opts = {}) {
  if (Date.now() < pauseUntil) {
    const remainingMins = Math.ceil((pauseUntil - Date.now()) / 60000);
    logger.warn(`⏳ Bot en pause de sécurité Anti-Ban. Code ${code} ignoré. Reprise dans ${remainingMins} min.`);
    return { remember: false, status: 'paused' };
  }

  if (!browserContext || !cryptoboxPage) {
    logger.error(`🚫 Navigateur non prêt — code ${code} non tenté`);
    return { remember: false, status: 'browser_unavailable' };
  }

  if (awaitingLogin) {
    logger.warn(`🔑 Code ${code} non tenté — session Binance à reconnecter`);
    return { remember: false, status: 'logged_out' };
  }

  logger.info(`🚀 Réclamation en cours : ${code}`);

  {
    try {
      // 1. Vérifier si la page a été accidentellement fermée
      if (cryptoboxPage.isClosed()) {
        logger.warn('📄 La page Cryptobox a été fermée, réouverture...');
        cryptoboxPage = await openPage();
        watchPage(cryptoboxPage);
        await cryptoboxPage.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }

      // 2. Vérifier qu'on est bien sur la bonne page (hôte + chemin)
      if (isLoginPage(cryptoboxPage.url())) return loginRequired(code);
      if (!isOnCryptobox(cryptoboxPage.url())) {
        await cryptoboxPage.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (isLoginPage(cryptoboxPage.url())) return loginRequired(code);
      } else {
        await cryptoboxPage.bringToFront().catch(() => { });
      }

      // 3. Attendre le champ de saisie.
      //    ⚠️ Ceci se produit AVANT toute saisie : un rechargement ici ne
      //    consomme aucune tentative Binance, ce n'est donc pas un retry
      //    sur le code. Au-delà, on abandonne le code sans jamais le rejouer.
      let inputReady = await cryptoboxPage
        .waitForSelector(SELECTORS.codeInput, { state: 'visible', timeout: PAGE_READY_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false);

      if (!inputReady) {
        if (isLoginPage(cryptoboxPage.url())) return loginRequired(code);
        logger.warn(`🔄 Page non prête — rechargement (code ${code} pas encore soumis)`);
        await cryptoboxPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => { });
        inputReady = await cryptoboxPage
          .waitForSelector(SELECTORS.codeInput, { state: 'visible', timeout: PAGE_READY_TIMEOUT_MS })
          .then(() => true)
          .catch(() => false);
      }

      if (!inputReady) {
        if (isLoginPage(cryptoboxPage.url())) return loginRequired(code);
        logger.warn(`⏭️ Code ${code} abandonné — champ de saisie introuvable (aucun retry)`);
        return { remember: false, status: 'page_unavailable' };
      }

      // Dernier contrôle juste avant la saisie (redirection côté client possible)
      if (!isOnCryptobox(cryptoboxPage.url())) {
        if (isLoginPage(cryptoboxPage.url())) return loginRequired(code);
        const host = parseUrl(cryptoboxPage.url())?.hostname || 'page inconnue';
        logger.warn(`⏭️ Code ${code} abandonné — page inattendue (${host}), aucun retry`);
        return { remember: false, status: 'page_unavailable' };
      }

      // Fermer d'anciennes modales si présentes (au cas où la précédente a laissé des traces)
      try {
        const closeSelectors = [
          '[data-testid="modal-close"]',
          'svg[color="textIconNormal"]',
          '.binance-icon-close',
          'button:has-text("OK")',
          'svg.text-PrimaryText.cursor-pointer' // Nouveau sélecteur fourni
        ];
        const closeBtn = await findFirstVisible(cryptoboxPage, closeSelectors);
        if (closeBtn) await closeBtn.click(CLICK);
      } catch (_) { }

      // 4. Dernier contrôle du relais, puis inscription AVANT la saisie
      if (opts.canSubmit && !opts.canSubmit()) {
        return { remember: false, status: 'deferred' };
      }
      opts.onSubmitting?.();

      // Saisie ultra rapide du code
      await cryptoboxPage.click(SELECTORS.codeInput, CLICK);
      await cryptoboxPage.fill(SELECTORS.codeInput, '');
      await cryptoboxPage.type(SELECTORS.codeInput, code, { delay: 10 });

      // 5. Soumettre
      const submitBtn = await findFirstVisible(cryptoboxPage, SELECTORS.submitButton);
      if (submitBtn) {
        await submitBtn.click(CLICK);
      } else {
        await cryptoboxPage.keyboard.press('Enter');
      }

      // 6. Modale de confirmation (Ouvrir)
      await cryptoboxPage.waitForTimeout(500);
      const confirmBtn = await findFirstVisible(cryptoboxPage, SELECTORS.confirmButton);
      if (confirmBtn) {
        await confirmBtn.click(CLICK);
        await cryptoboxPage.waitForTimeout(1000);
      } else {
        for (const sel of SELECTORS.confirmButton) {
          try {
            const btn = await cryptoboxPage.waitForSelector(sel, { state: 'visible', timeout: 1000 });
            if (btn) {
              await btn.click(CLICK);
              await cryptoboxPage.waitForTimeout(1000);
              break;
            }
          } catch (_) { }
        }
      }

      // 7. Résultat — attendre que la modale de résultat apparaisse (max 4s)
      await cryptoboxPage.waitForTimeout(1500);

      // Renvoyé vers la connexion après la soumission : la session venait
      // d'expirer, Binance n'a pas pris le code en compte.
      if (isLoginPage(cryptoboxPage.url())) return loginRequired(code);

      // Tenter d'abord de lire le montant depuis la modale de succès
      let gain = '';
      try {
        for (const sel of SELECTORS.successModal) {
          const els = await cryptoboxPage.$$(sel);
          for (const el of els) {
            if (!await el.isVisible().catch(() => false)) continue;
            const t = (await el.innerText().catch(() => '')).trim();
            if (!t) continue;
            const matches = [...t.matchAll(/([0-9]+[.,]?[0-9]*)\s*([A-Z]{2,10})/g)];
            const valid = matches.filter(
              (m) => !['H', 'UTC', 'PM', 'AM', 'OK', 'ID', 'FR', 'EN', 'VIP', 'KYC'].includes(m[2])
            );
            if (valid.length > 0) {
              gain = `${valid[0][1]} ${valid[0][2]}`;
              break;
            }
          }
          if (gain) break;
        }
      } catch (_) { }

      // Si pas trouvé via les sélecteurs ciblés, scanner tout le body
      if (!gain) {
        try {
          const bodyText = await cryptoboxPage.innerText('body').catch(() => '');
          const gainMatches = [...bodyText.matchAll(/([0-9]+[.,]?[0-9]*)\s*([A-Z]{2,10})/g)];
          const valid = gainMatches.filter(
            (m) => !['H', 'UTC', 'PM', 'AM', 'OK', 'ID', 'FR', 'EN', 'VIP', 'KYC'].includes(m[2])
          );
          if (valid.length > 0) gain = `${valid[0][1]} ${valid[0][2]}`;
        } catch (_) { }
      }

      // Vérifier si un vrai message d'erreur est visible
      let isError = false;
      let errorText = '';
      try {
        const errorEl = await cryptoboxPage.$(SELECTORS.errorMessage);
        if (errorEl && await errorEl.isVisible().catch(() => false)) {
          errorText = (await errorEl.innerText().catch(() => '')).trim();
          if (errorText.length > 0) isError = true;
        }
      } catch (_) { }

      if (isError) {
        logger.warn(`📭 Code ${code} — ${errorText.substring(0, 120)}`);

        // ─── Protection Anti-Ban Binance ─────────────────────────────────────
        const lowerError = errorText.toLowerCase();
        if (lowerError.includes('limite') || lowerError.includes('limit') || lowerError.includes('dépassé')) {
          logger.error(`🚨 ALERTE ANTI-BAN : La limite de Binance a été atteinte.`);
          logger.warn(`🛑 Le bot se met en pause automatique pour 5 heures.`);
          startPause(5 * 60 * 60 * 1000);
          return { remember: false, status: 'rate_limited' };
        }
        if (lowerError.includes('tentative') || lowerError.includes('attempt')) {
          logger.error(`🚨 AVERTISSEMENT ANTI-BAN : Binance signale des tentatives restantes.`);
          logger.warn(`🛑 Pause de sécurité de 2 heures déclenchée pour réinitialiser le compteur.`);
          startPause(2 * 60 * 60 * 1000);
          return { remember: false, status: 'rate_limited' };
        }

        return { remember: true, status: 'permanent_failure' };
      }

      logger.success(`💰 GAGNÉ ! Code ${code} → ${gain || 'montant à vérifier sur Binance'}`);

      // On a réussi l'opération, fermer la modale pour le code suivant
      try {
        const closeSelectors = [
          '[data-testid="modal-close"]',
          'svg[color="textIconNormal"]',
          '.binance-icon-close',
          'button:has-text("OK")',
          'svg.text-PrimaryText.cursor-pointer' // Nouveau sélecteur fourni
        ];
        const closeBtn = await findFirstVisible(cryptoboxPage, closeSelectors);
        if (closeBtn) await closeBtn.click(CLICK);
      } catch (_) { }

      // Fin heureuse
      return { remember: true, status: 'success', gain };

    } catch (err) {
      // ⛔ Pas de seconde tentative : on remet la page à zéro et on passe au
      //    code suivant. Rejouer un code brûlerait le compteur anti-fraude.
      logger.error(`⛔ Code ${code} — abandonné, aucun retry : ${err.message}`);
      // Pas de rechargement si la session a expiré : une reconnexion en cours
      // dans la fenêtre ne doit pas être effacée.
      if (!awaitingLogin && cryptoboxPage && !cryptoboxPage.isClosed()) {
        try { await cryptoboxPage.reload(); } catch (_) { }
      }
      return { remember: false, status: 'temporary_failure' };
    }
  }
}

async function closeBrowser() {
  // Annule aussi un lancement ou une attente de connexion en cours
  initGen++;
  stopLoginWatch();
  const context = browserContext;
  if (!context) return;
  closedOnPurpose.add(context);
  browserContext = null;
  cryptoboxPage = null;
  awaitingLogin = false;
  await closeContext(context);
  logger.info('🌐 Navigateur fermé');
}

module.exports = {
  initBrowser,
  claimCode,
  closeBrowser,
  getStatus,
  setPauseUntil,
  isCurrentContext,
  // Exposés pour les tests
  isLoginPage,
  isOnCryptobox,
};
