#!/usr/bin/env node
/**
 * build-apk.mjs — Compile l'app Android du bot, en local, en une commande :
 *
 *   npm run apk              → dist/RedPacketBot.apk (téléphone, arm64)
 *   npm run apk -- --emulator   ajoute x86_64 (émulateur Android Studio)
 *   npm run apk -- --install    installe aussi l'APK par câble USB (adb)
 *   npm run apk -- --debug      variante de test (com.redpacketbot.app.debug,
 *                               débogable) → dist/RedPacketBot-debug.apk
 *
 * Étapes :
 *   1. Node.js mobile 18.20.4 (libnode.so) : téléchargé une fois ;
 *   2. code du bot (index.js, src/, dépendances utiles) → nodejs-project.zip ;
 *   3. clé de signature créée une fois dans ~/.red-packet-bot/ (à garder !) ;
 *   4. Gradle compile l'APK signée → dist/.
 *
 * Prérequis : Android Studio installé (SDK, NDK 27.1, CMake 3.22.1).
 */

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ANDROID_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(ANDROID_DIR, "..");
const APP_DIR = path.join(ANDROID_DIR, "app");
const CACHE_DIR = path.join(ANDROID_DIR, ".cache");
const ASSETS_DIR = path.join(APP_DIR, "src", "main", "assets");
const LIBNODE_DIR = path.join(APP_DIR, "libnode");
const DIST_DIR = path.join(REPO, "dist");
const IS_WINDOWS = process.platform === "win32";

const NODEJS_MOBILE_VERSION = "18.20.4";
const NODEJS_MOBILE_URL =
  `https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v${NODEJS_MOBILE_VERSION}/` +
  `nodejs-mobile-v${NODEJS_MOBILE_VERSION}-android.zip`;

// Dépendances dont le bot a besoin sur le téléphone (pas de Chromium, pas
// de playwright-extra : la page Binance tourne dans la WebView de l'app)
const RUNTIME_ROOTS = ["@mtcute/node", "@mtcute/dispatcher", "dotenv", "node-cron", "playwright-core"];

// Fichiers inutiles sur le téléphone
const SKIP_FILE = /\.(d\.ts|d\.cts|d\.mts|map|md|markdown)$/i;
const SKIP_DIRS = new Set([
  "node_modules/better-sqlite3/build",
  "node_modules/better-sqlite3/deps",
  "node_modules/better-sqlite3/src",
  "node_modules/playwright-core/lib/vite",
  "node_modules/playwright-core/types",
]);

const args = new Set(process.argv.slice(2));
const ABIS = args.has("--emulator") ? ["arm64-v8a", "x86_64"] : ["arm64-v8a"];
const DEBUG = args.has("--debug");

function step(message) {
  console.log(`\n▶ ${message}`);
}

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", ...options });
  if (result.error) fail(`${command} : ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${commandArgs.join(" ")} a échoué (code ${result.status})`);
}

// ─── Java et SDK Android ────────────────────────────────────────────────────

function findJavaHome() {
  const candidates = [
    process.env.RPB_JAVA_HOME,
    IS_WINDOWS ? "C:\\Program Files\\Android\\Android Studio\\jbr" : null,
    process.platform === "darwin" ? "/Applications/Android Studio.app/Contents/jbr/Contents/Home" : null,
    "/opt/android-studio/jbr",
    process.env.JAVA_HOME,
  ].filter(Boolean);
  for (const home of candidates) {
    const java = path.join(home, "bin", IS_WINDOWS ? "java.exe" : "java");
    if (fs.existsSync(java)) return home;
  }
  fail("Java introuvable : installe Android Studio (il contient Java), ou définis JAVA_HOME.");
}

function findSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    IS_WINDOWS ? path.join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk") : null,
    path.join(os.homedir(), "Android", "Sdk"),
    path.join(os.homedir(), "Library", "Android", "sdk"),
  ].filter(Boolean);
  for (const sdk of candidates) {
    if (fs.existsSync(path.join(sdk, "platforms"))) return sdk;
  }
  fail("SDK Android introuvable : ouvre Android Studio une fois (il l'installe), ou définis ANDROID_HOME.");
}

// ─── 1. Node.js mobile ──────────────────────────────────────────────────────

async function download(url, target) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) fail(`Téléchargement impossible (${res.status}) : ${url}`);
  const tmp = `${target}.part`;
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(tmp, target);
}

function unzip(zipFile, targetDir, entries) {
  fs.mkdirSync(targetDir, { recursive: true });
  if (IS_WINDOWS) {
    // tar de Windows (bsdtar) sait lire les .zip
    const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
    run(tar, ["-xf", zipFile, "-C", targetDir, ...entries]);
  } else {
    run("unzip", ["-q", "-o", zipFile, ...entries.map((e) => `${e}*`), "-d", targetDir]);
  }
}

async function ensureLibnode() {
  const missing = ABIS.filter((abi) => !fs.existsSync(path.join(LIBNODE_DIR, "bin", abi, "libnode.so")));
  if (missing.length === 0 && fs.existsSync(path.join(LIBNODE_DIR, "include", "node", "node.h"))) {
    console.log(`  Node.js mobile ${NODEJS_MOBILE_VERSION} déjà présent`);
    return;
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const zipFile = path.join(CACHE_DIR, `nodejs-mobile-v${NODEJS_MOBILE_VERSION}-android.zip`);
  if (!fs.existsSync(zipFile)) {
    console.log(`  Téléchargement de Node.js mobile ${NODEJS_MOBILE_VERSION} (≈ 57 Mo, une seule fois)…`);
    await download(NODEJS_MOBILE_URL, zipFile);
  }
  unzip(zipFile, LIBNODE_DIR, ["include", ...ABIS.map((abi) => `bin/${abi}`)]);
  console.log(`  Node.js mobile extrait dans android/app/libnode (${ABIS.join(", ")})`);
}

// ─── 2. Code du bot → nodejs-project.zip ───────────────────────────────────

function runtimePackages() {
  const lock = JSON.parse(fs.readFileSync(path.join(REPO, "package-lock.json"), "utf-8"));
  const packages = lock.packages ?? {};

  const resolve = (fromKey, name) => {
    let base = fromKey;
    for (;;) {
      const candidate = `${base ? `${base}/` : ""}node_modules/${name}`;
      if (packages[candidate]) return candidate;
      if (!base) return null;
      const cut = base.lastIndexOf("/node_modules/");
      base = cut === -1 ? "" : base.slice(0, cut);
    }
  };

  const wanted = new Set();
  const queue = RUNTIME_ROOTS.map((name) => {
    const key = resolve("", name);
    if (!key) fail(`Dépendance absente : ${name} — lance « npm install » d'abord.`);
    return key;
  });
  while (queue.length > 0) {
    const key = queue.shift();
    if (wanted.has(key)) continue;
    const info = packages[key];
    // Paquets réservés à d'autres systèmes (fsevents sur macOS…)
    if (info.os && !info.os.includes("linux") && !info.os.includes("android")) continue;
    wanted.add(key);
    const deps = { ...info.dependencies, ...info.optionalDependencies };
    for (const name of Object.keys(deps)) {
      const dep = resolve(key, name);
      if (dep) queue.push(dep);
    }
    // Dépendances « peer » : seulement si elles sont installées
    for (const name of Object.keys(info.peerDependencies ?? {})) {
      const dep = resolve(key, name);
      if (dep) queue.push(dep);
    }
  }
  return [...wanted].sort();
}

/** Liste [chemin dans le zip, chemin sur disque]. */
function collectFiles() {
  const files = [];
  const addFile = (zipPath, diskPath) => files.push([zipPath.replace(/\\/g, "/"), diskPath]);

  const walk = (dir, zipDir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const disk = path.join(dir, entry.name);
      const zipPath = `${zipDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue; // dépendances listées à part
        if (SKIP_DIRS.has(zipPath)) continue;
        walk(disk, zipPath);
      } else if (entry.isFile() && !SKIP_FILE.test(entry.name)) {
        addFile(zipPath, disk);
      }
    }
  };

  addFile("entry.js", path.join(ANDROID_DIR, "node", "entry.js"));
  addFile("index.js", path.join(REPO, "index.js"));
  addFile("package.json", path.join(REPO, "package.json"));
  for (const name of fs.readdirSync(path.join(REPO, "src"))) {
    if (name.endsWith(".js")) addFile(`src/${name}`, path.join(REPO, "src", name));
  }
  for (const key of runtimePackages()) walk(path.join(REPO, key), key);
  return files;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  if (typeof zlib.crc32 === "function") return zlib.crc32(buffer) >>> 0;
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Petit écrivain de .zip (deflate), sans dépendance. */
function writeZip(target, files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const hash = crypto.createHash("sha256");
  const DOS_TIME = 0;
  const DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;

  for (const [zipPath, diskPath] of files) {
    const data = fs.readFileSync(diskPath);
    hash.update(zipPath).update(data);
    const name = Buffer.from(zipPath, "utf-8");
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.concat([...chunks, ...central, end]));
  return hash.digest("hex").slice(0, 16);
}

function stageNodeProject() {
  const files = collectFiles();
  if (files.length > 65000) fail(`Trop de fichiers pour le zip (${files.length})`);
  const zipFile = path.join(ASSETS_DIR, "nodejs-project.zip");
  const version = writeZip(zipFile, files);
  fs.writeFileSync(path.join(ASSETS_DIR, "nodejs-project.version"), `${version}\n`);
  const sizeMb = (fs.statSync(zipFile).size / 1024 / 1024).toFixed(1);
  console.log(`  ${files.length} fichiers → nodejs-project.zip (${sizeMb} Mo, version ${version})`);
}

// ─── 3. Clé de signature ────────────────────────────────────────────────────

function ensureKeystore(javaHome) {
  const dir = path.join(os.homedir(), ".red-packet-bot");
  const props = path.join(dir, "keystore.properties");
  const store = path.join(dir, "release.jks");
  const hasProps = fs.existsSync(props);
  const hasStore = fs.existsSync(store);
  if (hasProps && hasStore) {
    console.log(`  Clé existante : ${store}`);
    return props;
  }
  if (hasProps !== hasStore) {
    fail(
      `Clé de signature incomplète dans ${dir} : il manque ${hasStore ? "keystore.properties" : "release.jks"}.\n` +
        "   Restaure le fichier manquant depuis ta sauvegarde. Sinon, supprime ce dossier pour créer une\n" +
        "   nouvelle clé : l'app devra alors être désinstallée puis réinstallée (connexions à refaire).",
    );
  }
  fs.mkdirSync(dir, { recursive: true });
  const password = crypto.randomBytes(18).toString("base64url");
  const keytool = path.join(javaHome, "bin", IS_WINDOWS ? "keytool.exe" : "keytool");
  run(keytool, [
    "-genkeypair", "-keystore", store, "-storetype", "PKCS12",
    "-alias", "redpacketbot", "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
    "-storepass", password, "-keypass", password,
    "-dname", "CN=Red Packet Bot, O=Personal",
  ], { stdio: ["ignore", "ignore", "inherit"] });
  fs.writeFileSync(props, [
    // Relatif au dossier : la sauvegarde reste valable sur un autre PC
    "storeFile=release.jks",
    `storePassword=${password}`,
    "keyAlias=redpacketbot",
    `keyPassword=${password}`,
    "",
  ].join("\n"));
  console.log(`  🔐 Nouvelle clé de signature : ${store}`);
  console.log("     ⚠️  Garde une copie de ce dossier (.red-packet-bot) : sans lui, une mise à jour");
  console.log("        de l'app sur le téléphone demandera de la désinstaller (sessions perdues).");
  return props;
}

// ─── 4. Gradle ──────────────────────────────────────────────────────────────

function writeLocalProperties(sdk) {
  const escaped = sdk.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
  fs.writeFileSync(path.join(ANDROID_DIR, "local.properties"), `sdk.dir=${escaped}\n`);
}

function buildApk(javaHome, sdk, keystoreProps) {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf-8"));
  const versionName = pkg.version ?? "1.0.0";
  // Numéro croissant à chaque compilation : l'APK s'installe par-dessus la précédente
  const versionCode = Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 60_000);
  // Lanceur Gradle (comme gradlew), appelé directement : pas de shell, donc
  // aucun souci de guillemets si un chemin contient des espaces
  const wrapperJar = path.join(ANDROID_DIR, "gradle", "wrapper", "gradle-wrapper.jar");
  if (!fs.existsSync(wrapperJar)) fail("android/gradle/wrapper/gradle-wrapper.jar introuvable");
  const java = path.join(javaHome, "bin", IS_WINDOWS ? "java.exe" : "java");

  run(java, [
    "-Xmx64m", "-Xms64m", "-Dorg.gradle.appname=gradlew",
    "-classpath", wrapperJar, "org.gradle.wrapper.GradleWrapperMain",
    DEBUG ? "assembleDebug" : "assembleRelease",
    `-Prpb.versionName=${versionName}`,
    `-Prpb.versionCode=${versionCode}`,
    `-Prpb.abis=${ABIS.join(",")}`,
    `-Prpb.keystore=${keystoreProps}`,
  ], {
    cwd: ANDROID_DIR,
    env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
  });

  const variant = DEBUG ? "debug" : "release";
  const built = path.join(APP_DIR, "build", "outputs", "apk", variant, `app-${variant}.apk`);
  if (!fs.existsSync(built)) fail("APK introuvable après la compilation");
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const suffix = DEBUG ? "-debug" : "";
  const named = path.join(DIST_DIR, `RedPacketBot-${versionName}-${versionCode}${suffix}.apk`);
  const latest = path.join(DIST_DIR, `RedPacketBot${suffix}.apk`);
  fs.copyFileSync(built, named);
  fs.copyFileSync(built, latest);
  return { latest, named, versionName, versionCode };
}

function installWithAdb(sdk, apk) {
  const adb = path.join(sdk, "platform-tools", IS_WINDOWS ? "adb.exe" : "adb");
  run(adb, ["install", "-r", apk]);
}

// ─── Programme ──────────────────────────────────────────────────────────────

const started = Date.now();
console.log("🧧 Compilation de l'app Android Red Packet Bot");

const javaHome = findJavaHome();
const sdk = findSdk();
console.log(`  Java : ${javaHome}\n  SDK  : ${sdk}`);
writeLocalProperties(sdk);

step("1/4 Node.js mobile");
await ensureLibnode();

step("2/4 Code du bot");
stageNodeProject();

step("3/4 Clé de signature");
const keystoreProps = ensureKeystore(javaHome);

step("4/4 Compilation Gradle (la première fois : quelques minutes)");
const result = buildApk(javaHome, sdk, keystoreProps);

const sizeMb = (fs.statSync(result.latest).size / 1024 / 1024).toFixed(1);
console.log(`\n✅ APK prête (${sizeMb} Mo, version ${result.versionName} / ${result.versionCode}) :`);
console.log(`   ${result.latest}`);
console.log(`   Durée : ${Math.round((Date.now() - started) / 1000)} s`);

if (args.has("--install")) {
  step("Installation sur le téléphone branché en USB (adb)");
  installWithAdb(sdk, result.latest);
  console.log("✅ Installée");
} else {
  console.log("\n📱 Copie ce fichier sur le téléphone (câble USB ou Telegram), puis ouvre-le pour l'installer.");
  console.log("   Guide complet : GUIDE-ANDROID.md");
}
