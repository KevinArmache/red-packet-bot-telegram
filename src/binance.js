/**
 * binance.js — Module d'automatisation Binance via Playwright
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  💰 RÉCLAMATION AUTOMATIQUE DES CODES CRYPTOBOX                         ║
 * ║                                                                          ║
 * ║  Fonctionnalités :                                                       ║
 * ║  - Navigateur Chromium persistant (session conservée)                    ║
 * ║  - Retry automatique sur timeout (connexion faible)                      ║
 * ║  - Fermeture systématique des onglets (anti-fuite mémoire)              ║
 * ║  - Anti-crash : toute erreur est absorbée sans tuer le processus        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealthPlugin);
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// ─── Configuration ───────────────────────────────────────────────────────────

const CRYPTOBOX_URL = 'https://www.binance.com/fr/my/wallet/account/payment/cryptobox';
const BROWSER_DATA_DIR = path.resolve(__dirname, '..', 'browser-data');
const COOKIES_PATH = path.resolve(BROWSER_DATA_DIR, 'cookies.json');

// Nombre maximum de tentatives si la page ne charge pas
const MAX_RETRIES = 3;

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
const LOGIN_TIMEOUT_MS = parseInt(process.env.BINANCE_LOGIN_TIMEOUT ?? '300000', 10);

// ─── État interne ────────────────────────────────────────────────────────────

/** @type {import('playwright').BrowserContext | null} */
let browserContext = null;
/** @type {import('playwright').Page | null} */
let cryptoboxPage = null;

// Heure de fin de pause en cas d'alerte anti-ban (0 = pas de pause)
let pauseUntil = 0;

// ─── Utilitaires ────────────────────────────────────────────────────────────

function randomDelay(minMs = 800, maxMs = 2000) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
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
    logger.error('❌ Erreur lors de la sauvegarde des cookies : ' + err.message);
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
    logger.error('❌ Erreur lors de la restauration des cookies : ' + err.message);
  }
}

// ─── Initialisation du navigateur ───────────────────────────────────────────

async function initBrowser() {
  logger.info('🌐 Lancement du navigateur Chromium...');

  browserContext = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    // false pour voir le navigateur, true pour ne pas le voir, important de voir le navigateur pour le login binance pour la premiiere fois  etc...
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  await loadSessionCookies(browserContext);

  const pages = browserContext.pages();
  const page = pages.length > 0 ? pages[0] : await browserContext.newPage();

  try {
    await page.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (err) {
    logger.warn(`⚠️ Chargement initial lent — retry... (${err.message})`);
    await page.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  await ensureLoggedIn(page);
  
  // Sauvegarde des cookies après s'être assuré qu'on est connecté
  await saveSessionCookies(browserContext);
  
  cryptoboxPage = page;
  logger.success('🟢 Navigateur Binance prêt');
}

async function ensureLoggedIn(page) {
  await new Promise((r) => setTimeout(r, 2000));

  const { connected, reason } = await checkLoginStatus(page);
  if (connected) {
    logger.success(`🔓 Session Binance active — ${reason}`);
    return;
  }

  logger.warn(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    '  🔑 Connectez-vous manuellement à Binance dans le navigateur\n' +
    `  ⏱️ Timeout : ${LOGIN_TIMEOUT_MS / 60000} minutes\n` +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );

  const deadline = Date.now() + LOGIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const remaining = Math.ceil((deadline - Date.now()) / 1000);

    try {
      const { connected, reason } = await checkLoginStatus(page);
      if (connected) {
        logger.success(`🔓 Connexion Binance détectée — ${reason}`);
        return;
      }
      logger.info(`⏳ En attente de connexion... (${remaining}s restantes)`);
    } catch (_) { /* page en navigation */ }
  }

  throw new Error('⏰ Timeout — connexion Binance non détectée');
}

async function checkLoginStatus(page) {
  // Stratégie 0 : Champ de saisie Cryptobox visible = connecté
  try {
    const codeEl = await page.$(SELECTORS.codeInput).catch(() => null);
    if (codeEl && await codeEl.isVisible().catch(() => false)) {
      return { connected: true, reason: 'champ Cryptobox visible' };
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

// ─── Réclamation d'un code Cryptobox ────────────────────────────────────────

async function claimCode(code) {
  if (Date.now() < pauseUntil) {
    const remainingMins = Math.ceil((pauseUntil - Date.now()) / 60000);
    logger.warn(`⏳ Bot en pause de sécurité Anti-Ban. Code ${code} ignoré. Reprise dans ${remainingMins} min.`);
    return { remember: false, status: 'paused' };
  }

  if (!browserContext || !cryptoboxPage) {
    logger.error(`❌ Navigateur non initialisé — code ${code} perdu`);
    return { remember: false, status: 'browser_unavailable' };
  }

  logger.info(`🚀 Réclamation en cours : ${code}`);

  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;

    try {
      // 1. Vérifier si la page a été accidentellement fermée
      if (cryptoboxPage.isClosed()) {
        logger.warn('⚠️ La page Cryptobox a été fermée, réouverture...');
        cryptoboxPage = await browserContext.newPage();
        await cryptoboxPage.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }

      // 2. Vérifier qu'on est bien sur la bonne URL
      if (!cryptoboxPage.url().includes('cryptobox')) {
        await cryptoboxPage.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } else {
        await cryptoboxPage.bringToFront().catch(() => { });
      }

      // 3. Attendre le champ avec timeout adaptatif
      const inputTimeout = 5000 + (attempt * 5000);
      try {
        await cryptoboxPage.waitForSelector(SELECTORS.codeInput, { state: 'visible', timeout: inputTimeout });
      } catch (inputErr) {
        if (attempt < MAX_RETRIES) {
          logger.warn(`🔄 Tentative ${attempt}/${MAX_RETRIES} — champ introuvable, reload...`);
          await cryptoboxPage.reload({ waitUntil: 'domcontentloaded' });
          continue;
        }
        throw inputErr;
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
        if (closeBtn) await closeBtn.click();
      } catch (_) { }

      // 4. Saisie ultra rapide du code
      await cryptoboxPage.click(SELECTORS.codeInput);
      await cryptoboxPage.fill(SELECTORS.codeInput, '');
      await cryptoboxPage.type(SELECTORS.codeInput, code, { delay: 10 });

      // 5. Soumettre
      const submitBtn = await findFirstVisible(cryptoboxPage, SELECTORS.submitButton);
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await cryptoboxPage.keyboard.press('Enter');
      }

      // 6. Modale de confirmation (Ouvrir)
      await cryptoboxPage.waitForTimeout(500);
      const confirmBtn = await findFirstVisible(cryptoboxPage, SELECTORS.confirmButton);
      if (confirmBtn) {
        await confirmBtn.click();
        await cryptoboxPage.waitForTimeout(1000);
      } else {
        for (const sel of SELECTORS.confirmButton) {
          try {
            const btn = await cryptoboxPage.waitForSelector(sel, { state: 'visible', timeout: 1000 });
            if (btn) {
              await btn.click();
              await cryptoboxPage.waitForTimeout(1000);
              break;
            }
          } catch (_) { }
        }
      }

      // 7. Résultat — attendre que la modale de résultat apparaisse (max 4s)
      await cryptoboxPage.waitForTimeout(1500);

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
          pauseUntil = Date.now() + (5 * 60 * 60 * 1000);
          logger.error(`🚨 ALERTE ANTI-BAN : La limite de Binance a été atteinte.`);
          logger.warn(`🛑 Le bot se met en pause automatique pour 5 heures.`);
          return { remember: false, status: 'rate_limited' };
        }
        if (lowerError.includes('tentative') || lowerError.includes('attempt')) {
          pauseUntil = Date.now() + (2 * 60 * 60 * 1000);
          logger.error(`🚨 AVERTISSEMENT ANTI-BAN : Binance signale des tentatives restantes.`);
          logger.warn(`🛑 Pause de sécurité de 2 heures déclenchée pour réinitialiser le compteur.`);
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
        if (closeBtn) await closeBtn.click();
      } catch (_) { }

      // Fin heureuse
      return { remember: true, status: 'success' };

    } catch (err) {
      logger.error(`❌ Code ${code} — Tentative ${attempt}/${MAX_RETRIES} : ${err.message}`);
      if (attempt === MAX_RETRIES) {
        try { await cryptoboxPage.reload(); } catch (_) { }
        return { remember: false, status: 'temporary_failure' };
      }
    }
  }

  return { remember: false, status: 'temporary_failure' };
}

async function closeBrowser() {
  if (browserContext) {
    await browserContext.close().catch(() => { });
    browserContext = null;
    logger.info('🌐 Navigateur fermé');
  }
}

module.exports = { initBrowser, claimCode, closeBrowser };
