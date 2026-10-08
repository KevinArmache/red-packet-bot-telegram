/**
 * webview-browser.js — Navigateur Binance de l'app Android
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Sur le téléphone, il n'y a pas de Chromium à lancer : la page Binance   ║
 * ║  tourne dans une WebView créée par l'app (jamais affichée, donc jamais   ║
 * ║  gelée par Android). Playwright la pilote par le protocole DevTools      ║
 * ║  de la WebView, exactement comme Chromium sur le PC (vrais clics).       ║
 * ║                                                                          ║
 * ║  Le socket DevTools n'accepte que le processus de l'app lui-même :       ║
 * ║  un petit relais local (127.0.0.1, jeton secret dans l'adresse) le       ║
 * ║  rend accessible à Playwright, et à personne d'autre.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

const net = require("net");
const crypto = require("crypto");
const logger = require("./logger");

const PAGE_LOOKUP_TIMEOUT_MS = 15_000;

/** Pont vers l'app Android (fourni par android/node/entry.js). */
function host() {
  const h = globalThis.__rpbHost;
  if (!h) throw new Error("Pont vers l'app Android indisponible");
  return h;
}

/** @type {import('playwright-core').Browser | null} */
let browser = null;
let relay = null;
let loginSignal = false;
let listenersReady = false;
/** Appelé quand Android tue la WebView (mémoire) : le bot la relance. */
let goneHandler = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listenToApp() {
  if (listenersReady) return;
  listenersReady = true;
  // Connexion Binance faite dans l'écran de connexion de l'app : la page de
  // réclamation peut être rechargée (mêmes cookies)
  host().on("binance.loginDone", () => {
    loginSignal = true;
  });
  host().on("webview.gone", () => {
    goneHandler?.();
  });
}

/** Que faire si Android tue la WebView (le dernier navigateur ouvert gagne). */
function onGone(handler) {
  goneHandler = handler;
}

/**
 * La connexion Binance vient-elle d'être faite dans l'app ? (une seule fois
 * par connexion : l'appelant recharge alors la page Cryptobox)
 */
function consumeLoginSignal() {
  const value = loginSignal;
  loginSignal = false;
  return value;
}

// ─── Relais local vers le socket DevTools de la WebView ─────────────────────

/**
 * Accès au protocole DevTools de la WebView. Chromium l'ouvre sur un socket
 * abstrait (webview_devtools_remote_<pid>) que Node 18 ne sait pas joindre :
 * l'app (Kotlin) le relaie sur un socket fichier, RPB_DEVTOOLS_SOCKET.
 * RPB_DEVTOOLS_TCP=hôte:port (tests sur PC uniquement) : un Chromium local.
 */
function devtoolsTarget() {
  const tcp = (process.env.RPB_DEVTOOLS_TCP ?? "").trim();
  if (tcp) {
    const [hostName, port] = tcp.split(":");
    return { host: hostName, port: Number(port) };
  }
  const socketPath = (process.env.RPB_DEVTOOLS_SOCKET ?? "").trim();
  if (!socketPath) throw new Error("RPB_DEVTOOLS_SOCKET absent (posé par l'app Android)");
  return { path: socketPath };
}

/**
 * Node.js mobile annonce la plateforme « android », que Playwright refuse au
 * chargement (« Unsupported platform »). Playwright ne lance aucun navigateur
 * ici : il est chargé en se présentant comme Linux, puis la vraie valeur revient.
 */
function loadPlaywright() {
  if (process.platform !== "android") return require("playwright-core");
  const real = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { ...real, value: "linux" });
  try {
    return require("playwright-core");
  } finally {
    Object.defineProperty(process, "platform", real);
  }
}

/**
 * Relais 127.0.0.1 → socket DevTools. Seules les requêtes dont l'adresse
 * commence par le jeton secret passent ; le jeton est retiré au passage.
 */
function startRelay() {
  return new Promise((resolve, reject) => {
    const token = crypto.randomBytes(16).toString("hex");
    const server = net.createServer((client) => {
      let buffered = Buffer.alloc(0);

      const onData = (chunk) => {
        buffered = Buffer.concat([buffered, chunk]);
        const end = buffered.indexOf("\r\n\r\n");
        if (end === -1) {
          if (buffered.length > 16384) client.destroy();
          return;
        }
        client.removeListener("data", onData);
        client.pause();

        const head = buffered.subarray(0, end).toString("latin1");
        const rest = buffered.subarray(end);
        const firstLine = head.split("\r\n", 1)[0];
        const match = /^([A-Z]+) \/([0-9a-f]{32})(\/\S*) (HTTP\/1\.[01])$/.exec(firstLine);
        if (!match || match[2] !== token) {
          client.destroy();
          return;
        }

        let upstream;
        try {
          upstream = net.connect(devtoolsTarget());
        } catch (err) {
          logger.error(`🌐 ${err.message}`);
          client.destroy();
          return;
        }
        const closeBoth = () => {
          client.destroy();
          upstream.destroy();
        };
        upstream.on("error", closeBoth);
        client.on("error", closeBoth);
        upstream.on("close", closeBoth);
        client.on("close", closeBoth);
        upstream.on("connect", () => {
          const rewritten = head.replace(firstLine, `${match[1]} ${match[3]} ${match[4]}`);
          upstream.write(Buffer.concat([Buffer.from(rewritten, "latin1"), rest]));
          client.pipe(upstream);
          upstream.pipe(client);
          client.resume();
        });
      };

      client.on("data", onData);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port, token });
    });
  });
}

function stopRelay() {
  if (!relay) return;
  try {
    relay.server.close();
  } catch (_) {
    /* déjà fermé */
  }
  relay = null;
}

// ─── Connexion de Playwright ────────────────────────────────────────────────

async function ensureConnected() {
  if (browser && browser.isConnected()) return browser;
  stopRelay();
  relay = await startRelay();
  const { chromium } = loadPlaywright();
  // noDefaults : pas de réglage des téléchargements ni d'émulation (la
  // WebView refuse Browser.setDownloadBehavior)
  browser = await chromium.connectOverCDP(
    `ws://127.0.0.1:${relay.port}/${relay.token}/devtools/browser`,
    { noDefaults: true, timeout: 30_000 },
  );
  const current = browser;
  current.on("disconnected", () => {
    if (browser === current) {
      browser = null;
      stopRelay();
    }
  });
  logger.debug("🌐 Playwright connecté à la WebView de l'app");
  return browser;
}

/** Retrouve la page de la WebView que l'app vient de créer (adresse repère). */
async function findPage(context, marker) {
  const deadline = Date.now() + PAGE_LOOKUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const page = context.pages().find((p) => p.url() === marker);
    if (page) return page;
    await sleep(250);
  }
  throw new Error("WebView Binance introuvable (l'app ne l'a pas créée)");
}

/** Demande à l'app une WebView neuve, ouverte sur une adresse repère. */
async function createWebView() {
  const marker = `about:blank#rpb-${crypto.randomBytes(6).toString("hex")}`;
  await host().request("webview.create", { url: marker }, 30_000);
  return marker;
}

/**
 * Ouvre le navigateur de réclamation : WebView neuve + Playwright connecté.
 * @returns {Promise<{ context: import('playwright-core').BrowserContext, page: import('playwright-core').Page }>}
 */
async function open() {
  listenToApp();
  loginSignal = false;
  // La WebView doit exister avant la connexion : le socket DevTools n'est
  // ouvert qu'une fois la première WebView créée
  const marker = await createWebView();
  const connected = await ensureConnected();
  const context = connected.contexts()[0];
  if (!context) throw new Error("Contexte de la WebView introuvable");
  const page = await findPage(context, marker);
  return { context, page };
}

/** Page de réclamation perdue (fermée, plantée) : l'app en recrée une. */
async function reopenPage(context) {
  return findPage(context, await createWebView());
}

/** Ferme la WebView (mémoire libérée) et déconnecte Playwright. */
async function close() {
  const current = browser;
  browser = null;
  stopRelay();
  try {
    await host().request("webview.destroy", {}, 10_000);
  } catch (_) {
    /* l'app a peut-être déjà détruit la WebView */
  }
  if (current) {
    await current.close().catch(() => {});
  }
}

module.exports = { open, reopenPage, close, consumeLoginSignal, onGone };
