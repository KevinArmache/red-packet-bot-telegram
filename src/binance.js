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

const { chromium } = require('playwright');
const path         = require('path');
const logger       = require('./logger');

// ─── Configuration ───────────────────────────────────────────────────────────

const CRYPTOBOX_URL    = 'https://www.binance.com/fr/my/wallet/account/payment/cryptobox';
const BROWSER_DATA_DIR = path.resolve(__dirname, '..', 'browser-data');

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

  // Messages de résultat
  successMessage: '[class*="success"], [class*="amount"], [data-testid*="success"]',
  errorMessage: '[class*="error"], [class*="Error"], [class*="invalid"], [role="alert"]',
};

const SESSION_COOKIES = ['BNC_FV_KEY', 'bnc-uuid', 'csrftoken', 'logined', 'se_sd'];
const LOGIN_TIMEOUT_MS = parseInt(process.env.BINANCE_LOGIN_TIMEOUT ?? '300000', 10);

// ─── État interne ────────────────────────────────────────────────────────────

/** @type {import('playwright').BrowserContext | null} */
let browserContext = null;

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

// ─── Initialisation du navigateur ───────────────────────────────────────────

async function initBrowser() {
  logger.info('🌐 Lancement du navigateur Chromium...');

  browserContext = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
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

  const pages = browserContext.pages();
  const page = pages.length > 0 ? pages[0] : await browserContext.newPage();

  try {
    await page.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (err) {
    logger.warn(`⚠️ Chargement initial lent — retry... (${err.message})`);
    await page.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  await ensureLoggedIn(page);
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
    const cookies     = await page.context().cookies();
    const cookieNames = cookies.map((c) => c.name);
    const found       = SESSION_COOKIES.find((n) => cookieNames.includes(n));
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
  if (!browserContext) {
    logger.error(`❌ Navigateur non initialisé — code ${code} perdu`);
    return;
  }

  logger.info(`🚀 Réclamation en cours : ${code}`);
  await randomDelay(500, 1500);

  let page = null;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;

    try {
      page = await browserContext.newPage();

      // ── Étape 1 : Navigation avec timeout adaptatif ─────────────────────
      const navTimeout = 30000 + (attempt * 15000); // 30s, 45s, 60s
      try {
        await page.goto(CRYPTOBOX_URL, { waitUntil: 'domcontentloaded', timeout: navTimeout });
      } catch (navErr) {
        if (attempt < MAX_RETRIES) {
          logger.warn(`🔄 Tentative ${attempt}/${MAX_RETRIES} — page lente, retry...`);
          try { await page.close(); } catch (_) { /* ignore */ }
          page = null;
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw navErr;
      }

      // Vérifier la session
      const { connected } = await checkLoginStatus(page);
      if (!connected) {
        logger.warn('🔑 Session Binance expirée — reconnectez-vous');
        await ensureLoggedIn(page);
      }

      // ── Étape 2 : Trouver le champ de saisie avec timeout adaptatif ────
      const inputTimeout = 15000 + (attempt * 10000); // 15s, 25s, 35s
      try {
        await page.waitForSelector(SELECTORS.codeInput, { timeout: inputTimeout });
      } catch (inputErr) {
        if (attempt < MAX_RETRIES) {
          logger.warn(`🔄 Tentative ${attempt}/${MAX_RETRIES} — champ introuvable, reload...`);
          try { await page.close(); } catch (_) { /* ignore */ }
          page = null;
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        throw inputErr;
      }

      // ── Étape 3 : Saisie du code ────────────────────────────────────────
      await page.click(SELECTORS.codeInput);
      await page.fill(SELECTORS.codeInput, '');
      await page.type(SELECTORS.codeInput, code, { delay: 50 });

      // ── Étape 4 : Soumettre ─────────────────────────────────────────────
      const submitBtn = await findFirstVisible(page, SELECTORS.submitButton);
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }

      // ── Étape 5 : Modale de confirmation ────────────────────────────────
      await page.waitForTimeout(2000);

      const confirmBtn = await findFirstVisible(page, SELECTORS.confirmButton);
      if (confirmBtn) {
        await confirmBtn.click();
        await page.waitForTimeout(2500);
      } else {
        // Essayer de trouver le bouton avec waitForSelector
        for (const sel of SELECTORS.confirmButton) {
          try {
            const btn = await page.waitForSelector(sel, { state: 'visible', timeout: 3000 });
            if (btn) {
              await btn.click();
              await page.waitForTimeout(2500);
              break;
            }
          } catch (_) { /* continuer */ }
        }
      }

      // ── Étape 6 : Lire le résultat ──────────────────────────────────────
      await page.waitForTimeout(1000);
      const errorEl = await page.$(SELECTORS.errorMessage);

      if (errorEl) {
        const errorText = await errorEl.innerText().catch(() => 'Erreur inconnue');
        const cleanError = errorText.trim().substring(0, 100);
        logger.warn(`📭 Code ${code} — ${cleanError}`);
      } else {
        let gain = 'Montant inconnu';
        try {
          const successEls = await page.$$(SELECTORS.successMessage);
          let text = '';
          for (const el of successEls) {
            text += (await el.innerText().catch(() => '')) + ' ';
          }
          if (!text.trim()) {
            text = await page.innerText('body').catch(() => '');
          }

          const gainMatches = [...text.matchAll(/([0-9]+[.,]?[0-9]*)\s*([A-Z]{2,10})/g)];
          const valid = gainMatches.filter(
            (m) => !['H', 'UTC', 'PM', 'AM', 'OK', 'ID', 'FR', 'EN'].includes(m[2])
          );
          if (valid.length > 0) {
            gain = `${valid[0][1]} ${valid[0][2]}`;
          }
        } catch (_) { /* ignore */ }

        logger.success(`💰 GAGNÉ ! Code ${code} → ${gain}`);
      }

      // Succès — on sort de la boucle de retry
      break;

    } catch (err) {
      logger.error(`❌ Code ${code} — Tentative ${attempt}/${MAX_RETRIES} : ${err.message}`);

      // Screenshot de debug silencieux
      try {
        if (page) {
          const screenshotPath = path.resolve(__dirname, '..', `error_${code}_${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
        }
      } catch (_) { /* ignore */ }

    } finally {
      // Toujours fermer l'onglet
      try { if (page) await page.close(); } catch (_) { /* ignore */ }
      page = null;
    }
  }
}

async function closeBrowser() {
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
    logger.info('🌐 Navigateur fermé');
  }
}

module.exports = { initBrowser, claimCode, closeBrowser };
