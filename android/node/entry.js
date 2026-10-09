/**
 * entry.js — Démarrage du bot dans l'app Android (Node.js mobile)
 *
 * L'app lance Node dans son propre processus : node entry.js <config.json>
 *
 *  1. config.json → variables d'environnement (mêmes noms que dans le .env) ;
 *  2. logs : tout ce que le bot écrit va aussi dans logs/bot.log (5 Mo,
 *     puis archivé dans bot.log.1), que l'app affiche ;
 *  3. pont vers l'app : socket local (WebView Binance, code Telegram, arrêt) ;
 *  4. process.exit : l'app est prévenue et relance le bot dans un processus
 *     neuf (Node ne peut démarrer qu'une fois par processus) ;
 *  5. lance index.js, le même bot que sur le PC.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
for (const [key, value] of Object.entries(config.env ?? {})) {
  if (value !== null && value !== undefined && value !== "") process.env[key] = String(value);
}

// Android n'a pas de /tmp, et Node.js mobile ignore TMPDIR / HOME : les
// dossiers privés de l'app sont imposés directement (Playwright y crée ses
// fichiers temporaires)
const os = require("os");
if (process.env.TMPDIR) {
  const tmp = process.env.TMPDIR;
  fs.mkdirSync(tmp, { recursive: true });
  os.tmpdir = () => tmp;
}
if (process.env.HOME) {
  const home = process.env.HOME;
  os.homedir = () => home;
}

const DATA_DIR = process.env.BOT_DATA_DIR;
const RUN_DIR = path.join(DATA_DIR, ".run");
const LOG_DIR = path.join(DATA_DIR, "logs");
fs.mkdirSync(RUN_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

// ─── Logs : copie de la console dans logs/bot.log ───────────────────────────

const LOG_FILE = path.join(LOG_DIR, "bot.log");
const LOG_MAX_BYTES = 5 * 1024 * 1024;

/** Ouvre logs/bot.log en ajout ; -1 si impossible (jamais un descripteur périmé). */
function openLog() {
  try {
    return fs.openSync(LOG_FILE, "a");
  } catch (_) {
    return -1;
  }
}

let logFd = openLog();
let logSize = logFd >= 0 ? fs.fstatSync(logFd).size : 0;

function rotateLog() {
  try {
    if (logFd >= 0) fs.closeSync(logFd);
  } catch (_) {
    /* déjà fermé */
  }
  logFd = -1;
  try {
    fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch (_) {
    /* on repart dans le même fichier */
  }
  logFd = openLog();
  logSize = 0;
}

function writeLog(chunk, encoding) {
  try {
    if (logFd < 0) {
      // Réouverture ratée plus tôt : nouvel essai, sans jamais écrire ailleurs
      logFd = openLog();
      if (logFd < 0) return;
      logSize = fs.fstatSync(logFd).size;
    }
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(String(chunk), typeof encoding === "string" ? encoding : "utf-8");
    if (logSize + buf.length > LOG_MAX_BYTES) {
      // Logs effacés depuis l'app (fichier vidé) : on reprend la vraie taille
      logSize = fs.fstatSync(logFd).size;
      if (logSize + buf.length > LOG_MAX_BYTES) rotateLog();
      if (logFd < 0) return;
    }
    fs.writeSync(logFd, buf);
    logSize += buf.length;
  } catch (_) {
    /* un log perdu ne doit jamais arrêter le bot */
  }
}

for (const stream of [process.stdout, process.stderr]) {
  const original = stream.write.bind(stream);
  stream.write = (chunk, encoding, callback) => {
    writeLog(chunk, encoding);
    return original(chunk, encoding, callback);
  };
}

// ─── Pont vers l'app (socket local, une ligne JSON par message) ────────────

function connectBridge(socketPath) {
  // Socket fichier dans le stockage privé de l'app (Node 18 ne sait pas
  // joindre les sockets « abstraits » d'Android)
  const socket = net.connect({ path: socketPath });
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  let buffer = "";

  const send = (message) => {
    if (!socket.destroyed) socket.write(`${JSON.stringify(message)}\n`);
  };

  const dispatch = (message) => {
    if (message.re) {
      const waiting = pending.get(message.re);
      if (!waiting) return;
      pending.delete(message.re);
      clearTimeout(waiting.timer);
      if (message.error) waiting.reject(new Error(message.error));
      else waiting.resolve(message.data);
      return;
    }
    for (const handler of listeners.get(message.t) ?? []) {
      try {
        handler(message.data ?? {});
      } catch (err) {
        console.error(`💥 Pont app : ${err.message}`);
      }
    }
  };

  socket.setEncoding("utf-8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        dispatch(JSON.parse(line));
      } catch (_) {
        /* ligne illisible : ignorée */
      }
    }
  });

  return {
    ready: new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    }),
    send,
    request(type, data = {}, timeoutMs = 30_000, timeoutError) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer =
          timeoutMs > 0
            ? setTimeout(() => {
                pending.delete(id);
                reject(timeoutError ?? new Error(`L'app ne répond pas (${type})`));
              }, timeoutMs)
            : null;
        pending.set(id, { resolve, reject, timer });
        send({ id, t: type, data });
      });
    },
    on(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
  };
}

// ─── Sortie : l'app relance le bot dans un processus neuf ──────────────────

const realExit = process.exit.bind(process);
const EXIT_FILE = path.join(RUN_DIR, "node-exit.json");

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

process.exit = (code) => {
  const exitCode = Number(code ?? process.exitCode ?? 0) || 0;
  try {
    fs.writeFileSync(EXIT_FILE, JSON.stringify({ code: exitCode, at: Date.now() }));
  } catch (_) {
    /* l'app verra quand même le processus s'arrêter */
  }
  // L'app lit ce fichier toutes les 500 ms, planifie la relance et arrête
  // ce processus. Filet de sécurité : sortie réelle après 20 s.
  sleepSync(20_000);
  realExit(exitCode);
};

// ─── Démarrage ──────────────────────────────────────────────────────────────

async function main() {
  try {
    fs.rmSync(EXIT_FILE, { force: true });
  } catch (_) {
    /* absent */
  }

  const bridge = connectBridge(config.bridge);
  await bridge.ready;

  const loginTimeout = () => {
    const err = new Error("Connexion Telegram abandonnée (pas de code saisi dans l'app)");
    err.code = "TG_LOGIN_REQUIRED";
    return err;
  };

  globalThis.__rpbHost = {
    request: (type, data, timeoutMs) => bridge.request(type, data, timeoutMs),
    on: (type, handler) => bridge.on(type, handler),
    // Le nom de l'événement passe en dernier : une donnée « type » ne peut pas l'écraser
    event: (type, data = {}) => bridge.send({ t: "event", data: { ...data, type } }),
    /** Demande une saisie à l'utilisateur (code Telegram, mot de passe 2FA). */
    ask: (kind) => bridge.request("prompt", { kind }, 15 * 60_000, loginTimeout()),
  };

  // Bouton « Arrêter » de l'app : même arrêt propre que Ctrl+C sur le PC
  bridge.on("shutdown", () => process.emit("SIGTERM"));

  // Bouton « Alerte de test » de l'app
  bridge.on("test_alert", async () => {
    const notifier = require("./src/notifier");
    const ok = notifier.isEnabled()
      ? await notifier.send("🔔 Test : si tu lis ce message, les alertes du bot fonctionnent.")
      : false;
    bridge.send({
      t: "event",
      data: { type: "test_alert_result", ok, enabled: notifier.isEnabled() },
    });
  });

  bridge.send({ t: "event", data: { type: "node_started", pid: process.pid } });
  require("./index.js");
}

main().catch((err) => {
  console.error(`💀 Démarrage du bot impossible : ${err.stack || err.message}`);
  process.exit(1);
});
