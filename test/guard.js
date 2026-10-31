/**
 * test/guard.js — Vérifie l'anti-blocage Binance
 *
 *   npm run test:guard
 *
 * Lecture des refus de Binance (src/binance.js), compteur et modes de
 * src/antiban.js, jetons du relais (src/relay.js) et sources des codes
 * (src/telegram.js). Aucun navigateur, aucune requête réseau : des fonctions
 * pures et des dossiers de données jetables.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "rpb-guard-test-"));
process.env.BOT_DATA_DIR = path.join(TMP_ROOT, "base");
fs.mkdirSync(process.env.BOT_DATA_DIR, { recursive: true });

// Logs du bot coupés : seul le résultat des vérifications s'affiche
const logger = require("../src/logger");
for (const level of ["info", "warn", "error", "success", "debug"]) logger[level] = () => {};

const HOUR = 3600_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
let checks = 0;

function check(name, actual, expected) {
  checks++;
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;
  failures++;
  console.log(`   ❌ ${name} : ${JSON.stringify(actual)} (attendu ${JSON.stringify(expected)})`);
}

function section(title) {
  console.log(`🧪 ${title}`);
}

// ─── Anti-blocage : instance neuve (réglages + dossier de données) ──────────

const ANTIBAN_KEYS = ["ANTIBAN_MODE", "ANTIBAN_SELECTIVE_AT", "ANTIBAN_STOP_AT", "ANTIBAN_STOP_RESUME_H"];
let dirCount = 0;

function freshAntiban(env = {}, dir = null) {
  for (const key of ANTIBAN_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  const dataDir = dir ?? path.join(TMP_ROOT, `antiban-${++dirCount}`);
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.BOT_DATA_DIR = dataDir;
  delete require.cache[require.resolve("../src/paths")];
  delete require.cache[require.resolve("../src/antiban")];
  const antiban = require("../src/antiban");
  const events = [];
  antiban.setHooks({ onChange: (e) => events.push(e) });
  antiban.init();
  const fails = () => antiban.heartbeatFields().fails;
  const invalid = (remaining = null) =>
    antiban.record({ status: "permanent_failure", reason: "invalid", remaining, submitted: true });
  return { antiban, events, dataDir, fails, invalid };
}

async function main() {
  console.log(`\n🛡️ Anti-blocage Binance (dossier jetable ${TMP_ROOT})\n`);

  // ─── Lecture des refus de Binance ─────────────────────────────────────────
  section("Refus de Binance : essais restants, durée du blocage, nature");
  const binance = require("../src/binance");
  const { parseRemaining, parseLockMs, classifyRefusal } = binance;

  check("« il vous reste 7 tentatives »", parseRemaining("Code incorrect. Il vous reste 7 tentatives."), 7);
  check("« Tentatives restantes : 3 »", parseRemaining("Tentatives restantes : 3"), 3);
  check("« 2 attempts left »", parseRemaining("Wrong code. You have 2 attempts left"), 2);
  check("« Remaining attempts: 4 »", parseRemaining("Remaining attempts: 4"), 4);
  check("« il vous reste 0 tentative »", parseRemaining("Il vous reste 0 tentative"), 0);
  check(
    "la règle « après 10 tentatives… 5 heures » n'est pas un nombre d'essais",
    parseRemaining("Votre compte sera verrouillé pendant 5 heures après 10 tentatives incorrectes consécutives."),
    null,
  );
  check("message sans nombre", parseRemaining("Ce code Red Packet n'existe pas"), null);

  const minutes = (ms) => Math.round(ms / 60_000);
  check("« réessayez dans 4 h 59 min » (+1 min)", minutes(parseLockMs("Réessayez dans 4 h 59 min")), 300);
  check("« try again in 30 minutes » (+1 min)", minutes(parseLockMs("Too many attempts, try again in 30 minutes")), 31);
  check("« verrouillé pendant 5 heures »", minutes(parseLockMs("Compte verrouillé pendant 5 heures")), 301);
  check("sans durée : 5 h (FAQ)", minutes(parseLockMs("Vous avez atteint la limite")), 301);

  check("403803 → invalide", classifyRefusal({ apiCode: "403803", text: "x" }), "invalid");
  check("403804 → invalide", classifyRefusal({ apiCode: "403804", text: "x" }), "invalid");
  check("403802 → épuisé", classifyRefusal({ apiCode: "403802", text: "x" }), "exhausted");
  check("403067 → blocage", classifyRefusal({ apiCode: "403067", text: "x" }), "locked");
  check("100002001 → session", classifyRefusal({ apiCode: "100002001", text: "x" }), "session");
  check("validateId → captcha", classifyRefusal({ apiCode: "400100", text: "x", captcha: true }), "captcha");
  check(
    "PAY4001COM000 + « n'existe pas » → invalide",
    classifyRefusal({ apiCode: "PAY4001COM000", text: "Ce code Red Packet n'existe pas" }),
    "invalid",
  );
  check(
    "PAY4001COM000 + « réessayez dans 5 h » → blocage (code générique : texte d'abord)",
    classifyRefusal({ apiCode: "PAY4001COM000", text: "Trop de tentatives. Réessayez dans 5 h" }),
    "locked",
  );
  check("PAY4001COM000 seul → invalide", classifyRefusal({ apiCode: "PAY4001COM000", text: "Erreur" }), "invalid");
  check(
    "avertissement avec rappel de la règle → invalide, pas blocage",
    classifyRefusal({
      text: "Code incorrect. Il vous reste 7 tentatives. Après 10 tentatives incorrectes consécutives, votre compte sera verrouillé 5 heures.",
    }),
    "invalid",
  );
  check("« il vous reste 0 tentative » → blocage", classifyRefusal({ text: "Il vous reste 0 tentative" }), "locked");
  check("« limite quotidienne » → blocage", classifyRefusal({ text: "Vous avez atteint la limite quotidienne de réclamations" }), "locked");
  check("« a expiré » → épuisé", classifyRefusal({ text: "Ce Red Packet a expiré" }), "exhausted");
  check("« déjà réclamé » → déjà pris", classifyRefusal({ text: "Vous avez déjà réclamé ce Red Packet" }), "grabbed");
  check("« tentative » seul ne bloque pas", classifyRefusal({ text: "Une tentative a échoué" }), "other");
  check("inconnu → other", classifyRefusal({ text: "Quelque chose d'inattendu" }), "other");

  // ─── Mode stop ────────────────────────────────────────────────────────────
  // Réponses d'octobre 2026 : messageDetail est un objet (« [object Object] »)
  {
    const { giftRefusal } = binance;
    const exhausted = giftRefusal({ code: "403802", message: "Red packet has been fully claimed", messageDetail: { foo: 1 } });
    check("détail objet : le message texte est gardé", exhausted.text, "Red packet has been fully claimed");
    check("403802 + détail objet : épuisé", classifyRefusal(exhausted), "exhausted");
    const lockInDetail = giftRefusal({ code: "PAY4001COM000", messageDetail: { message: "Il vous reste 0 tentative" } });
    check("blocage écrit dans un détail objet : lu", lockInDetail.text, "Il vous reste 0 tentative");
    check("code générique + 0 essai dans le détail objet : blocage", classifyRefusal(lockInDetail), "locked");
    const noText = giftRefusal({ code: "403803", messageDetail: { remainingTimes: 7 } });
    check("détail objet sans texte : jamais « [object Object] »", noText.text.includes("[object Object]"), false);
    check("403803 : code faux", classifyRefusal(noText), "invalid");
  }

  section("Mode stop (codes clairs à 8, arrêt à 9)");
  {
    const { antiban, events, dataDir, fails, invalid } = freshAntiban();
    check("départ : normal", antiban.level(), "normal");
    check("départ : texte libre accepté", antiban.decide({ source: "texte" }).ok, true);
    for (let i = 0; i < 7; i++) invalid();
    check("7 faux : normal", antiban.level(), "normal");
    invalid();
    check("8 faux : codes clairs seulement", antiban.level(), "selective");
    check("8 faux : texte libre sauté", antiban.decide({ source: "texte" }).ok, false);
    check("8 faux : monospace accepté", antiban.decide({ source: "monospace" }).ok, true);
    check("8 faux : lien Cryptobox accepté", antiban.decide({ source: "lien" }).ok, true);
    check("8 faux : « Code : » accepté", antiban.decide({ source: "label" }).ok, true);
    check("alerte au passage en codes clairs", events.at(-1)?.level, "selective");
    antiban.record({ status: "permanent_failure", reason: "exhausted", submitted: true });
    antiban.record({ status: "permanent_failure", reason: "grabbed", submitted: true });
    check("épuisé / déjà pris : neutres", fails(), 8);
    antiban.record({ status: "success" });
    check("code gagné : compteur à 0", fails(), 0);
    check("code gagné : normal", antiban.level(), "normal");
    invalid(3);
    check("Binance annonce 3 essais : recalé à 7", fails(), 7);
    invalid(1);
    check("1 essai restant : arrêt ⛔", antiban.level(), "halt");
    check("arrêt : même un code clair est sauté", antiban.decide({ source: "monospace" }).ok, false);
    check("alerte d'arrêt", events.at(-1)?.level, "halt");
    check("alerte d'arrêt : essais restants", events.at(-1)?.remaining, 1);

    const again = freshAntiban({}, dataDir).antiban;
    check("arrêt conservé après redémarrage", again.level(), "halt");
    check("#reprendre récent reconnu", again.isResumeCommand({ text: "#reprendre", date: new Date() }), true);
    check("#Reprendre (majuscule) reconnu", again.isResumeCommand({ text: "  #Reprendre svp", date: new Date() }), true);
    check(
      "#reprendre d'il y a 20 min ignoré",
      again.isResumeCommand({ text: "#reprendre", date: new Date(Date.now() - 20 * 60_000) }),
      false,
    );
    check(
      "message du relais ignoré",
      again.isResumeCommand({ text: "🤖 Relais Red Packet\n#botrelay role=primary", date: new Date() }),
      false,
    );
    check("#reprendre : aucune attente", again.resume().lockedUntil, 0);
    check("#reprendre : normal", again.level(), "normal");
    check("#reprendre : compteur à 0", again.heartbeatFields().fails, 0);
  }

  section("Comptage prudent");
  {
    const { antiban, fails } = freshAntiban();
    antiban.record({ status: "unknown", submitted: true });
    check("résultat inconnu après soumission : +1", fails(), 1);
    antiban.record({ status: "permanent_failure", reason: "other", submitted: true });
    check("refus inclassable : +1", fails(), 2);
    antiban.record({ status: "temporary_failure", submitted: false });
    check("échec avant la soumission : rien", fails(), 2);
    antiban.record({ status: "temporary_failure", submitted: true });
    check("échec après la soumission : +1", fails(), 3);
    antiban.record({ status: "logged_out" });
    check("session expirée : rien", fails(), 3);
    antiban.record({ status: "page_unavailable", submitted: false });
    check("clic « Réclamer » sans effet (Binance n'a rien reçu) : rien", fails(), 3);
    antiban.record({ status: "rate_limited", reason: "captcha", submitted: true });
    check("captcha : rien", fails(), 3);
    antiban.record({ status: "paused" });
    check("code non tenté (pause) : rien", fails(), 3);
  }

  section("Blocage Binance");
  {
    const { antiban, dataDir, fails } = freshAntiban();
    antiban.noteLock(Date.now() + 150, "locked");
    check("blocage : niveau lock", antiban.level(), "lock");
    check("blocage : compteur plein", fails(), 10);
    check("blocage gardé sur le disque", freshAntiban({}, dataDir).antiban.level(), "lock");
    const after = freshAntiban({}, dataDir);
    await sleep(200);
    check("fin du blocage : normal", after.antiban.level(), "normal");
    check("fin du blocage : compteur à 0", after.fails(), 0);

    const captcha = freshAntiban();
    captcha.antiban.noteLock(Date.now() + 60_000, "captcha");
    check("captcha : pause sans toucher au compteur", [captcha.antiban.level(), captcha.fails()], ["lock", 0]);
    check("#reprendre pendant un blocage : attente", captcha.antiban.resume().lockedUntil > Date.now(), true);
  }

  section("Remise à zéro observée (mesure de la vraie règle)");
  {
    const { antiban, events, invalid } = freshAntiban();
    const resets = () => events.filter((e) => e.type === "reset");
    invalid(7);
    invalid(9);
    check("compteur Binance remonté sans gain : remise à zéro « avec le temps »", resets().at(-1)?.cause, "time");
    invalid(8);
    check("baisse normale : pas de remise à zéro", resets().length, 1);
    antiban.record({ status: "permanent_failure", reason: "exhausted", submitted: true });
    invalid(9);
    check("après un code épuisé : cause « neutral »", resets().at(-1)?.cause, "neutral");
    invalid(8);
    antiban.record({ status: "success" });
    invalid(9);
    check("après un gain : rien à signaler", resets().length, 2);
  }

  section("Relais : l'état le plus récent gagne");
  {
    const { antiban, invalid } = freshAntiban();
    invalid();
    const mine = antiban.exportState();
    check("état exporté", [mine.fails, mine.halted], [1, false]);
    check("état plus ancien ignoré", antiban.mergePeer({ fails: 6, failsAt: mine.failsAt - 1000, halted: false }), false);
    check("état plus récent adopté", antiban.mergePeer({ fails: 9, failsAt: mine.failsAt + 1000, halted: true }), true);
    check("arrêt de l'autre appareil respecté", antiban.level(), "halt");
    antiban.mergePeer({ fails: 0, failsAt: mine.failsAt + 2000, halted: false });
    check("#reprendre fait sur l'autre appareil", antiban.level(), "normal");
    antiban.mergePeer({ fails: 9, failsAt: mine.failsAt + 3000, halted: false });
    check("9 faux annoncés sans arrêt : nos seuils s'appliquent (⛔)", antiban.level(), "halt");
  }

  section("Mode léger et seuils");
  {
    const light = freshAntiban({ ANTIBAN_MODE: "light" });
    for (let i = 0; i < 9; i++) light.invalid();
    check("léger, 9 faux : codes clairs seulement, pas d'arrêt", light.antiban.level(), "selective");
    check("léger, 9 faux : monospace accepté", light.antiban.decide({ source: "monospace" }).ok, true);

    const noSelective = freshAntiban({ ANTIBAN_SELECTIVE_AT: "0" });
    for (let i = 0; i < 8; i++) noSelective.invalid();
    check("codes clairs désactivés (0) : normal à 8", noSelective.antiban.level(), "normal");
    noSelective.invalid();
    check("codes clairs désactivés : arrêt à 9 quand même", noSelective.antiban.level(), "halt");

    check("arrêt à 12 ramené à 9", freshAntiban({ ANTIBAN_STOP_AT: "12" }).antiban.STOP_AT, 9);
    check("arrêt sous le seuil des codes clairs ramené à 8", freshAntiban({ ANTIBAN_STOP_AT: "3" }).antiban.STOP_AT, 8);
    check("mode inconnu → stop", freshAntiban({ ANTIBAN_MODE: "n'importe quoi" }).antiban.MODE, "stop");
    check("seuil illisible → 8", freshAntiban({ ANTIBAN_SELECTIVE_AT: "abc" }).antiban.SELECTIVE_AT, 8);
  }

  section("Reprise automatique après l'arrêt");
  {
    const dataDir = path.join(TMP_ROOT, "auto-resume");
    fs.mkdirSync(path.join(dataDir, ".run"), { recursive: true });
    const twoHoursAgo = Date.now() - 2 * HOUR;
    fs.writeFileSync(
      path.join(dataDir, ".run", "antiban.json"),
      JSON.stringify({ fails: 9, failsAt: twoHoursAgo, halted: true, haltedAt: twoHoursAgo }),
    );
    check("reprise manuelle (0) : toujours arrêté", freshAntiban({}, dataDir).antiban.level(), "halt");
    const auto = freshAntiban({ ANTIBAN_STOP_RESUME_H: "1" }, dataDir);
    check("reprise auto après 1 h : codes clairs seulement", auto.antiban.level(), "selective");
    check("reprise auto : 8 faux (un de plus = nouvel arrêt)", auto.fails(), 8);
    auto.invalid();
    check("code faux après la reprise auto : arrêt", auto.antiban.level(), "halt");
  }

  // ─── Relais : jetons du message #botrelay ─────────────────────────────────
  section("Relais : jetons anti-blocage du message #botrelay");
  {
    const relay = require("../src/relay");
    const text =
      "🤖 Relais Red Packet — 💻 PC\n🟢 actif · le téléphone reste en veille\nDernier signal : 10:00:00\n\n" +
      "#botrelay role=primary state=active pause=0 inst=3f9a1c2e since=1791400000000 " +
      "fails=3 failsAt=1791400100000 halt=1\ncodes=ABCD1234,EFGH5678";
    const info = relay.parseStatus(text);
    check("jetons lus", info.antiban, { fails: 3, failsAt: 1791400100000, halted: true });
    check("état et registre intacts", [info.role, info.state, info.since, info.codes], [
      "primary", "active", 1791400000000, ["ABCD1234", "EFGH5678"],
    ]);
    check(
      "ancien format : pas de jetons",
      relay.parseStatus("#botrelay role=backup state=standby pause=0 inst=aa11bb22 since=0").antiban,
      null,
    );
    check("PC sans jeton x=1 : codes X non annoncés", info.acceptsX, false);
    const withX = relay.parseStatus(text.replace("halt=1", "halt=1 x=1"));
    check("jeton x=1 lu", withX.acceptsX, true);
    check("jetons anti-blocage toujours lus avec x=1", withX.antiban, { fails: 3, failsAt: 1791400100000, halted: true });
    check("registre intact avec x=1", withX.codes, ["ABCD1234", "EFGH5678"]);
  }

  // ─── Extraction : source de chaque code ───────────────────────────────────
  // Le Node.js mobile du téléphone n'a pas les tables Unicode : une seule
  // classe `\p{…}` l'empêche de charger le module, et le bot ne démarre plus
  // (24/10/2026). Le Node.js du PC, lui, l'accepte : ce test le rattrape.
  section("Code chargeable par le Node.js mobile du téléphone");
  {
    const dirs = [path.join(__dirname, "../src"), path.join(__dirname, "../android/node"), path.join(__dirname, "..")];
    const files = dirs.flatMap((dir) =>
      fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => path.join(dir, f)));
    const offenders = files.filter((file) =>
      fs.readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
        .some((line) => /\\{1,2}[pP]\{/.test(line)));
    check("aucune classe Unicode \\p{…} hors commentaires", offenders.map((f) => path.relative(path.join(__dirname, ".."), f)), []);
  }

  section("Extraction : source des codes, codes BP ignorés");
  {
    const { extractCodes } = require("../src/telegram");
    check(
      "monospace, « Code : », texte libre",
      extractCodes({ plain: "🎁 Code : AB12CD34\nAutre : XY98ZW76", trusted: ["QQ11RR22"] }),
      [
        { code: "QQ11RR22", source: "monospace" },
        { code: "AB12CD34", source: "label" },
        { code: "XY98ZW76", source: "texte" },
      ],
    );
    check(
      "lien Cryptobox",
      extractCodes({ plain: "https://www.binance.com/fr/my/wallet/account/payment/cryptobox/LM34NP56", trusted: [] }),
      [{ code: "LM34NP56", source: "lien" }],
    );
    check(
      "même code en monospace et en texte : monospace",
      extractCodes({ plain: "vite ZZ11YY22 !", trusted: ["ZZ11YY22"] }),
      [{ code: "ZZ11YY22", source: "monospace" }],
    );
    check("code BP de 10 caractères ignoré", extractCodes({ plain: "Red packet BPUB4ALVZP", trusted: ["BPJ09HYNNK"] }), []);
    // Telegram : liste de codes sans aucun mot autour (@rsbox, 15/10/2026)
    check("liste nue : le code 100 % lettres est pris", extractCodes({ plain: "L24IZFQZ\nPABVFEBL", trusted: [] }), [
      { code: "L24IZFQZ", source: "texte" },
      { code: "PABVFEBL", source: "texte" },
    ]);
    check("message réduit à un code 100 % lettres", extractCodes({ plain: "🎁 PABVFEBL 🎁", trusted: [] }), [
      { code: "PABVFEBL", source: "texte" },
    ]);
    check("mot courant seul en message : ignoré", extractCodes({ plain: "TELEGRAM", trusted: [] }), []);
    check("« BP » de 8 caractères ignoré", extractCodes({ plain: "Code : BPVV80RZ", trusted: ["BPVV80RZ"] }), []);

    // Formats variés (24/10/2026)
    const plain = (text) => extractCodes({ plain: text, trusted: [] });
    check("« Code 👉 » puis un code 100 % lettres", plain("Red packet ! Code 👉 LJSSNXTT"), [{ code: "LJSSNXTT", source: "label" }]);
    check("« Code 2 : » numéroté", plain("Code 2 : PABVFEBL"), [{ code: "PABVFEBL", source: "label" }]);
    check("« Code ➡️ « … » » entre guillemets", plain("Code ➡️ « QWRTPLKM »"), [{ code: "QWRTPLKM", source: "label" }]);
    check("« Kode: » (indonésien)", plain("Kode: PABVFEBL"), [{ code: "PABVFEBL", source: "label" }]);
    check("« 口令： » (chinois)", plain("红包口令：AB12CD34"), [{ code: "AB12CD34", source: "label" }]);
    check("« Code: » en minuscules avec chiffres", plain("code: ab12cd34"), [{ code: "AB12CD34", source: "label" }]);
    check("« code tomorrow » : mot en minuscules ignoré", plain("Red packet code tomorrow"), []);
    check("« Codes 🎁 » annonce une liste : pas un libellé", plain("Codes 🎁\nPABVFEBL"), [{ code: "PABVFEBL", source: "texte" }]);
    check("« Kod: » (turc)", plain("🎁 Kod: QWRTPLKM"), [{ code: "QWRTPLKM", source: "label" }]);
    check("liste numérotée en émojis « 1️⃣ »", plain("Red packet codes\n1️⃣ LJSSNXTT\n2️⃣QWRTPLKM"), [
      { code: "LJSSNXTT", source: "texte" },
      { code: "QWRTPLKM", source: "texte" },
    ]);
    check("plusieurs codes sur une ligne", plain("Red packet 🧧\nOWUVALT5 | LJSSNXTT, PABVFEBL"), [
      { code: "OWUVALT5", source: "texte" },
      { code: "LJSSNXTT", source: "texte" },
      { code: "PABVFEBL", source: "texte" },
    ]);
    check("ligne de mots en majuscules : ignorée", plain("Red packet 🧧\nBREAKING TRENDING\nTOMORROW"), []);
    check("Telegram : code 100 % lettres dans une phrase toujours ignoré", plain("Red packet LJSSNXTT pour vous"), []);
  }

  // Vrais messages de @Packet_Red et @BoxxSquare (31/10/2026) : sans ce filtre,
  // chaque lien aurait fait taper un faux code sur Binance
  section("Liens Binance Square : ni parrainage ni réponse de quiz pris pour un code");
  {
    const { extractCodes, buildMessageSources } = require("../src/telegram");
    const fromMessage = (text, monospace = [], links = []) =>
      extractCodes(
        buildMessageSources({
          text,
          entities: [
            ...monospace.map((value) => ({ kind: "code", text: value })),
            ...links.map((url) => ({ params: { kind: "text_link", url } })),
          ],
        }),
      );
    const SHARE = "l=en&uco=RuKwa52qfzj0kySZaeGdVQ&uc=app_square_share_link&us=copylink";
    const packetRed = (coin, answer, link) =>
      `🎁 ${coin} 🎁\n🎰 ${coin} ~ | Random 🎲\n🎯Answer » ${answer}\n💎Ans » ✨${answer}✨\n🧧@Packet_Red #Square #Crypto\n${link}`;

    const samples = [
      ["PEPE", "CLAIM BOX", `https://app.binance.com/uni-qr/cart/383187948524759?r=K1H0AFHZ&l=zh-CN&uco=yLHmM-0IgS12JdgmQk7McA&uc=app_square_share_link&us=copylink`],
      ["USDT", "HAPPY BIRTHDAY", `https://app.binance.com/uni-qr/cpos/383084365843426?r=UZJQUBIZ&l=en&uco=nznHbWNWgMzj4lsWdS7CWg&uc=app_square_share_link&us=copylink`],
      ["CLAIM", "BONK", `https://app.binance.com/uni-qr/cpos/382745767318880?r=KNO8CAYD&${SHARE}`],
      ["USDT", "omenx", `https://app.binance.com/uni-qr/cpos/383180021216501?r=CDKD39G1&${SHARE}`],
      ["USDT", "SOL", `https://app.binance.com/uni-qr/cpos/382836155944678?r=AY05GU4H&${SHARE}`],
      ["SHIB", "BTC", `https://app.binance.com/uni-qr/cpos/383128620584011?r=F0PRJ6ZZ&${SHARE}`],
      ["USDT", "16", `https://app.binance.com/uni-qr/cpos/383114805315577?r=OZ0M85S8&${SHARE}`],
      ["BNB", "BNB", "https://app.binance.com/uni-qr/cpos/383152611116458?uc=app_square_share_link&us=copylink"],
    ];
    for (const [coin, answer, link] of samples) {
      check(`@Packet_Red « ${answer} » : aucun code`, fromMessage(packetRed(coin, answer, link), [answer]), []);
      check(`@Packet_Red « ${answer} », lien masqué : aucun code`, fromMessage(packetRed(coin, answer, ""), [answer], [link]), []);
    }
    check(
      "réponse de 8 caractères qui ressemble à un code",
      fromMessage(packetRed("USDT", "BINANCE1", samples[7][2]), ["BINANCE1"]),
      [],
    );
    check(
      "format @BoxxSquare : titre avec lien, réponse seule sur sa ligne",
      fromMessage("💓 BTC 💓\nBNB12345", ["BNB12345"], [`https://app.binance.com/uni-qr/cpos/383184190000000?r=K1TVI5ID&${SHARE}`]),
      [],
    );
    for (const link of [
      "https://www.binance.com/fr/square/post/383107779195016",
      "https://www.binance.com/fr-AF/square/post/626529",
      "https://www.binance.com/ar/feed/post/859765",
      "https://www.binance.com/ar/square/post/06-04-2025-binance-issues-warning-25156807837810",
    ]) {
      check(`adresse du site reconnue : ${link}`, fromMessage(`Réponse : AB12CD34\n${link}`, ["AB12CD34"]), []);
    }

    // Un vrai code à côté d'un lien Square n'est pas perdu
    check(
      "« Code : » à côté d'un lien Square : pris",
      fromMessage(`Code : AB12CD34\nhttps://app.binance.com/uni-qr/cpos/383107779195016?r=K1H0AFHZ&${SHARE}`),
      [{ code: "AB12CD34", source: "label" }],
    );
    check(
      "lien Cryptobox à côté d'un lien Square : pris",
      fromMessage(
        "https://www.binance.com/fr/my/wallet/account/payment/cryptobox/LM34NP56\nhttps://www.binance.com/fr/square/post/383107779195016",
      ),
      [{ code: "LM34NP56", source: "lien" }],
    );

    // Tous les canaux : un parrainage n'est jamais un code, le reste ne change pas
    check("parrainage dans un lien : ignoré", fromMessage("Inscris-toi https://accounts.binance.com/register?ref=AB12CD34"), []);
    check(
      "vrai code à côté d'un parrainage",
      fromMessage("XY98ZW76 https://accounts.binance.com/register?a=1&ref=AB12CD34"),
      [{ code: "XY98ZW76", source: "texte" }],
    );
    check(
      "lien sans Square : le monospace reste un code",
      fromMessage("Vite https://t.me/moncanal", ["AB12CD34"]),
      [{ code: "AB12CD34", source: "monospace" }],
    );
    check(
      "profil Square, pas un post : le monospace reste un code",
      fromMessage("Suis-moi https://www.binance.com/fr/square/profile/omenx-official", ["AB12CD34"]),
      [{ code: "AB12CD34", source: "monospace" }],
    );
    check(
      "lien Cryptobox « ?code= » toujours lu",
      fromMessage("https://www.binance.com/fr/my/wallet/account/payment/cryptobox?code=LM34NP56&ref=AB12CD34"),
      [{ code: "LM34NP56", source: "lien" }],
    );

    // Détection X : inchangée, même avec un lien Square dans le post
    const x = require("../src/xsource");
    const post = x.parsePost({
      pkg: "com.twitter.android",
      postedAt: 1_800_000_000_000,
      text: "AB12CD34 https://app.binance.com/uni-qr/cpos/383107779195016",
    });
    check("post X avec lien Square : détection inchangée", x.extractFromPost(post), [{ code: "AB12CD34", source: "texte" }]);
  }

  section("Binance Square : ce que disent les canaux de liens");
  {
    const square = require("../src/square");
    const { buildMessageSources } = require("../src/telegram");
    const sources = (text, monospace = [], links = []) =>
      buildMessageSources({
        text,
        entities: [
          ...monospace.map((value) => ({ kind: "code", text: value })),
          ...links.map((url) => ({ params: { kind: "text_link", url } })),
        ],
      });
    const SHARE = "?r=UZJQUBIZ&l=en&uco=nznHbWNWgMzj4lsWdS7CWg&uc=app_square_share_link&us=copylink";
    const ID = "383084365843426";
    const CLEAN = `https://app.binance.com/uni-qr/cpos/${ID}?uc=app_square_share_link&us=copylink`;
    const packetRed = (coin, prize, answer) =>
      `🎁 ${coin} 🎁\n🎰 ${prize} | Random 🎲\n🎯Answer » ${answer}\n💎Ans » ✨${answer}✨\n🧧@Packet_Red #Square #Crypto`;

    check(
      "liens : partage, article, site, doublon",
      square.parseLinks(
        `https://app.binance.com/uni-qr/cpos/${ID}${SHARE}\n` +
          `https://app.binance.com/uni-qr/cart/383187948524759?uc=x\n` +
          `https://www.binance.com/fr/square/post/${ID}\n` +
          "https://www.binance.com/ar/square/post/06-04-2025-binance-issues-warning-25156807837810",
      ),
      [
        { id: ID, segment: "cpos" },
        { id: "383187948524759", segment: "cart" },
        { id: "25156807837810", segment: "cpos" },
      ],
    );
    check("lien sans parrainage", square.cleanLink({ id: ID, segment: "cpos" }), CLEAN);

    check(
      "@Packet_Red : crypto, montant, réponse",
      square.parseMessage(sources(packetRed("USDT", "USDT ~ 0.00098655", "HAPPY BIRTHDAY"), ["HAPPY BIRTHDAY"], [`https://app.binance.com/uni-qr/cpos/${ID}${SHARE}`])),
      [{ id: ID, segment: "cpos", coin: "USDT", amount: "0.00098655", split: "random", type: "quiz", answer: "HAPPY BIRTHDAY" }],
    );
    const direct = square.parseMessage(sources(packetRed("PEPE", "PEPE ~ 891.19", "CLAIM BOX"), ["CLAIM BOX"], [`https://app.binance.com/uni-qr/cart/383187948524759${SHARE}`]))[0];
    check("« CLAIM BOX » : réclamation directe, sans question", [direct.type, direct.answer, direct.segment], ["direct", "", "cart"]);
    check(
      "lot « CLAIM ~ » : pas une crypto",
      square.parseMessage(sources(packetRed("CLAIM", "CLAIM ~", "BONK"), ["BONK"], [`https://app.binance.com/uni-qr/cpos/${ID}`])).map((m) => [m.coin, m.answer]),
      [["", "BONK"]],
    );
    check(
      "réponse en chinois",
      square.parseMessage(sources(packetRed("BTTC", "BTTC ~ 19283.21", "周末愉快"), ["周末愉快"], [`https://app.binance.com/uni-qr/cpos/${ID}`]))[0].answer,
      "周末愉快",
    );
    check(
      "ligne « Answer » sans monospace, décoration retirée",
      square.parseAnswer({ plain: "💎Ans » ✨SOL✨\nhttps://app.binance.com/uni-qr/cpos/1", trusted: [] }),
      "SOL",
    );
    const boxx = square.parseMessage(sources("💓 BTC 💓\nHAPPY BIRTHDAY! ❤️🎉", ["HAPPY BIRTHDAY! ❤️🎉"], [`https://app.binance.com/uni-qr/cpos/${ID}${SHARE}`]))[0];
    check("@BoxxSquare : titre et monospace, texte exact", [boxx.coin, boxx.answer, boxx.type], ["BTC", "HAPPY BIRTHDAY! ❤️🎉", "quiz"]);
    check("message sans lien Square : rien", square.parseMessage(sources("Answer » SOL")), []);
    check(
      "lien sans réponse : type inconnu",
      square.parseMessage(sources(`https://app.binance.com/uni-qr/cpos/${ID}`)).map((m) => [m.type, m.answer]),
      [["", ""]],
    );

    // Même post vu par plusieurs canaux : une seule carte
    const NOW = 1_800_000_000_000;
    const see = (item, answer, channel, at = NOW) =>
      square.mergeSighting(item, { id: ID, segment: "cpos", coin: "USDT", amount: "", split: "", type: answer ? "quiz" : "direct", answer }, channel, at);
    const once = see(undefined, "SOL", "@Packet_Red");
    const twice = see(once, "sol", "@BoxxSquare", NOW + 1000);
    check("même réponse (casse ignorée) : confirmée par 2 canaux", [twice.answers.length, twice.answers[0].from], [1, ["@Packet_Red", "@BoxxSquare"]]);
    check("2 canaux, 1 carte : première vue gardée", [twice.firstAt, twice.lastAt, twice.sources.length], [NOW, NOW + 1000, 2]);
    const third = see(see(see(undefined, "BNB", "@a"), "SOL", "@b"), "SOL", "@c");
    check("réponses différentes : la plus citée d'abord", third.answers.map((a) => a.text), ["SOL", "BNB"]);
    check("« CLAIM BOX » puis vraie réponse : quiz", see(see(undefined, "", "@a"), "SOL", "@b").type, "quiz");
    check("même canal deux fois : compté une fois", see(see(undefined, "SOL", "@a"), "SOL", "@a").answers[0].from, ["@a"]);

    const HOUR_MS = 3_600_000;
    const items = [
      { id: "1", firstAt: NOW - HOUR_MS, publishedAt: 0 },
      { id: "2", firstAt: NOW - 25 * HOUR_MS, publishedAt: 0 },
      { id: "3", firstAt: NOW - HOUR_MS, publishedAt: 0 },
      { id: "4", firstAt: NOW - HOUR_MS, publishedAt: NOW - 1 },
    ];
    const marks = { 3: { mark: "won", at: NOW - HOUR_MS }, 4: { mark: "won", at: NOW - HOUR_MS } };
    check("à prendre : récent et sans marque", square.takeList(items, marks, NOW).map((i) => i.id), ["1"]);
    check("à publier : pris, pas encore publié", square.winsToPublish(items, marks, NOW).map((i) => i.id), ["3"]);
    check(
      "marque de plus de 24 h : pas publiée",
      square.winsToPublish(items, { 1: { mark: "won", at: NOW - 25 * HOUR_MS } }, NOW),
      [],
    );
    check("« Raté » : jamais publié", square.winsToPublish(items, { 1: { mark: "missed", at: NOW } }, NOW), []);
    check("résumé d'un quiz", square.describeItem({ coin: "USDT", type: "quiz", answers: [{ text: "SOL", from: [] }] }), "USDT · réponse : SOL");
    check("résumé sans question", square.describeItem({ coin: "PEPE", type: "direct", answers: [] }), "PEPE · sans question");
  }

  // ─── X (Twitter) : posts lus dans les notifications, relais #xcode ────────
  section("X (Twitter) : posts et relais #xcode");
  {
    const x = require("../src/xsource");
    const T0 = 1_800_000_000_000;
    const post = (fields) => x.parsePost({ pkg: "com.twitter.android", postedAt: T0, ...fields });
    const codes = (fields) => x.extractFromPost(post(fields));

    check("liste de comptes", x.parseAccounts("@Binance, cz_binance\n@foo;;@foo nope!"), ["binance", "cz_binance", "foo"]);
    check(
      "« Code : » dans un post",
      codes({ title: "Binance", text: "🧧 Code : AB12CD34 #Binance @binance https://t.co/xyz" }),
      [{ code: "AB12CD34", source: "label" }],
    );
    check("mentions, hashtags et cashtags ignorés", codes({ text: "@crypto12 #BNB2025X $ABCD1234" }), []);
    check("code coupé par X (« … ») ignoré", codes({ text: "Red packet pour vous AB12CD3…" }), []);
    check(
      "code complet puis texte coupé",
      codes({ text: "AB12CD34 vite, premier arrivé premier serv…" }),
      [{ code: "AB12CD34", source: "texte" }],
    );
    check("codes BP et 8 chiffres ignorés", codes({ text: "BPVV80RZ 12345678" }), []);
    check(
      "lien Cryptobox caché derrière t.co",
      codes({
        text: "Red Packet 🎁 https://t.co/abc",
        urls: ["https://www.binance.com/fr/my/wallet/account/payment/cryptobox/LM34NP56"],
      }),
      [{ code: "LM34NP56", source: "lien" }],
    );
    check("autre exchange ignoré", codes({ text: "Bybit gift code: QW12ER34" }), []);
    // Post réel (Sloomo, 15/10/2026) : 3 codes, chacun seul sur sa ligne
    check(
      "liste de codes : le code 100 % lettres seul sur sa ligne est pris",
      codes({
        title: "Sloomo",
        text:
          "Binance Red Packet Codes 🎁 \n\nOWUVALT5\n4RGO2XUM\nLJSSNXTT\n\n" +
          "Join our Telegram for more codes 👇\nt.me/sloomobot/app pic.",
      }),
      [
        { code: "OWUVALT5", source: "texte" },
        { code: "4RGO2XUM", source: "texte" },
        { code: "LJSSNXTT", source: "texte" },
      ],
    );
    check("liste numérotée « 1. LJSSNXTT »", codes({ text: "Red packet codes\n1. LJSSNXTT\n2) QWRTPLKM" }), [
      { code: "LJSSNXTT", source: "texte" },
      { code: "QWRTPLKM", source: "texte" },
    ]);
    check("code 100 % lettres seul, sans annonce de codes : ignoré", codes({ text: "Bonjour\nLJSSNXTT\nà demain" }), []);
    check("en minuscules sur sa ligne : ignoré", codes({ text: "Red packet\nljssnxtt" }), []);
    // X : les comptes sont suivis pour leurs codes (24/10/2026)
    check("dans une phrase : pris s'il a l'air tiré au hasard", codes({ text: "Red packet LJSSNXTT pour vous 🧧" }), [
      { code: "LJSSNXTT", source: "texte" },
    ]);
    check(
      "dans une phrase : vrais mots et paires de trading ignorés",
      codes({ text: "🧧 Red packet STRENGTH, SNAPSHOT et LINKUSDT ce soir, BREAKING" }),
      [],
    );
    check("dans une phrase, sans annonce de codes : ignoré", codes({ text: "Bonjour LJSSNXTT à demain" }), []);
    check("dans une phrase, en minuscules : ignoré", codes({ text: "Red packet ljssnxtt pour vous" }), []);
    check("image seule : gardée, sans texte", post({ picture: true }).picture && post({ picture: true }).text, "");
    check("ni texte ni image : ignorée", post({ picture: false }), null);
    check("raison d'un post trop ancien", x.staleReason({ postedAt: T0, when: 0 }, T0 + 200_000, 180_000, 0), "publié il y a 200 s");
    check("raison d'un post antérieur au démarrage", x.staleReason({ postedAt: T0, when: 0 }, T0, 180_000, T0 + 1), "publié avant le démarrage du bot");
    check("extrait sur une ligne", x.excerpt("Red packet 🧧\n\n  AB12CD34  \nvite"), "Red packet 🧧 ⏎ AB12CD34 ⏎ vite");
    check("mot courant seul sur sa ligne : ignoré", codes({ text: "Red packet 🧧\nGOODLUCK\nTELEGRAM\nGIVEAWAY" }), []);
    check("titre d'actualité en majuscules : ignoré", codes({ text: "BREAKING\nBitcoin dépasse les 100k" }), []);
    // Post réel (KorosYT, 15/10/2026) : 14 codes déjà gagnés sur Telegram, comptés à part
    const korosyt = post({
      title: "KorosYT",
      text:
        "Binance Red Packet GW 🎁🎁\n#binance #redpacket #redbox #freeearns #redpacketcode #crypto\n" +
        "P9CDX6AB\nINVAQ4B2\n99P7M38Z\nJ2Y0OYKD\nPC8WD7DN\n6N8WCJ48\nWIOM3RHK\n73TVCR8R\nLB4J3G53\nTAPFGP77\n" +
        "Q9TLJQU7\nGN9VZRUB\n28BNIF86\nQAWKI36W\n#crypto #binance #redpackets",
    });
    check("post KorosYT : 14 codes", x.extractFromPost(korosyt, { includeKnown: true }).length, 14);
    check("titre (nom du compte) jamais lu comme un code", codes({ title: "AB12CD34", text: "bonjour" }), []);

    check(
      "bigText prioritaire, text inclus non répété",
      post({ text: "Code : AB12", bigText: "Code : AB12CD34 complet" }).text,
      "Code : AB12CD34 complet",
    );
    check("lignes réunies", post({ lines: ["un", "deux"] }).text, "un\ndeux");
    check("notification vide ignorée", post({ text: "  " }), null);
    check("sans heure : ignorée", x.parsePost({ pkg: "com.twitter.android", text: "x" }), null);
    check(
      "autre appli ignorée",
      x.parsePost({ pkg: "org.telegram.messenger", text: "Code : AB12CD34", postedAt: T0 }),
      null,
    );
    check("notification adb refusée hors essai à blanc", x.parsePost({ pkg: "com.android.shell", text: "x", postedAt: T0 }), null);
    check(
      "notification adb acceptée en essai à blanc",
      Boolean(x.parsePost({ pkg: "com.android.shell", text: "x", postedAt: T0 }, { allowTest: true })),
      true,
    );

    const binancePost = post({ title: "Binance", subText: "@kevin", text: "hello" });
    check("liste vide : tous les comptes", x.matchAccount(binancePost, []), true);
    check("nom affiché « Binance » = @binance", x.matchAccount(binancePost, ["binance"]), true);
    check("sous-texte (ton compte) jamais pris pour l'auteur", x.matchAccount(binancePost, ["kevin"]), false);
    check(
      "@pseudo dans le titre",
      x.matchAccount(post({ title: "Binance France (@binance_fr)", text: "x" }), ["binance_fr"]),
      true,
    );
    check("autre compte refusé", x.matchAccount(post({ title: "Crypto Free", text: "x" }), ["binance"]), false);
    check("libellé du compte", x.accountLabel(post({ title: "Binance France (@Binance_FR)", text: "x" })), "@binance_fr");

    const now = T0 + 100_000;
    check("post récent", x.isFresh({ postedAt: now - 5000, when: 0 }, now, 180_000, now - 60_000), true);
    check("post trop ancien", x.isFresh({ postedAt: now - 200_000, when: 0 }, now, 180_000, 0), false);
    check("post antérieur au démarrage", x.isFresh({ postedAt: now - 5000, when: 0 }, now, 180_000, now - 1000), false);
    check(
      "heure du post (when) plus ancienne retenue",
      x.isFresh({ postedAt: now - 1000, when: now - 300_000 }, now, 180_000, 0),
      false,
    );

    const relayed = x.formatXCode({ code: "AB12CD34", source: "label", from: "@binance", at: T0, inst: "3f9a1c2e", dry: true });
    check("aller-retour #xcode", x.parseXCode(relayed), {
      code: "AB12CD34", source: "label", from: "@binance", at: T0, inst: "3f9a1c2e", dry: true,
    });
    check(
      "#xcode sans compte connu",
      x.parseXCode(x.formatXCode({ code: "AB12CD34", source: "texte", from: null, at: T0, inst: "3f9a1c2e" })),
      { code: "AB12CD34", source: "texte", from: null, at: T0, inst: "3f9a1c2e", dry: false },
    );
    for (const [name, text] of [
      ["minuscules", "#xcode ab12cd34 src=label from=@b at=1800000000000 inst=3f9a1c2e"],
      ["7 caractères", "#xcode AB12CD3 src=label from=@b at=1800000000000 inst=3f9a1c2e"],
      ["code BP", "#xcode BPVV80RZ src=label from=@b at=1800000000000 inst=3f9a1c2e"],
      ["8 chiffres", "#xcode 12345678 src=label from=@b at=1800000000000 inst=3f9a1c2e"],
      ["source inconnue", "#xcode AB12CD34 src=image from=@b at=1800000000000 inst=3f9a1c2e"],
      ["sans inst", "#xcode AB12CD34 src=label from=@b at=1800000000000"],
      ["pas en tête", "note #xcode AB12CD34 src=label from=@b at=1800000000000 inst=3f9a1c2e"],
      ["texte en trop", "#xcode AB12CD34 src=label from=@b at=1800000000000 inst=3f9a1c2e !"],
      ["mot courant", "#xcode TELEGRAM src=texte from=@b at=1800000000000 inst=3f9a1c2e"],
    ]) {
      check(`#xcode refusé : ${name}`, x.parseXCode(text), null);
    }
    // Code 100 % lettres trouvé seul sur sa ligne par le téléphone : le PC le prend aussi
    check(
      "#xcode : code 100 % lettres en texte libre accepté",
      x.parseXCode("#xcode LJSSNXTT src=texte from=@b at=1800000000000 inst=3f9a1c2e")?.code,
      "LJSSNXTT",
    );
    check("relais frais (10 s)", x.isFreshRelay(T0, T0 + 10_000), true);
    check("relais périmé (31 s)", x.isFreshRelay(T0, T0 + 31_000), false);
    check("relais daté du futur", x.isFreshRelay(T0 + 20_000, T0), false);

    check("solo : réclamé ici", x.routeFor({ role: "solo", canClaimNow: false }), "local");
    check("téléphone responsable : réclamé ici", x.routeFor({ role: "backup", canClaimNow: true }), "local");
    check("téléphone en veille : transmis au PC", x.routeFor({ role: "backup", canClaimNow: false }), "forward");
  }

  // ─── Relais : téléphone seul quand le PC est absent ───────────────────────
  section("Relais : PC absent, le téléphone ne lui laisse plus rien");
  {
    const savedRole = process.env.BOT_ROLE;
    process.env.BOT_ROLE = "backup";
    delete require.cache[require.resolve("../src/relay")];
    const relay = require("../src/relay");
    let nextId = 1;
    const sent = (text) => ({ id: nextId++, date: new Date(), editDate: null, text });
    const fakeTelegram = {
      searchMessages: async () => [], // aucun message #botrelay du PC
      sendText: async (_chat, text) => sent(text),
      editMessage: async ({ text }) => sent(text),
      deleteMessagesById: async () => {},
    };
    await relay.start(fakeTelegram, { getLocalState: () => ({ ready: true, awaitingLogin: false, pauseUntil: 0 }) });
    await sleep(100); // prise de relais (relecture puis « actif »)
    check("PC jamais vu : code livré à la reconnexion (publié avant la reprise) réclamé", relay.canClaim(Date.now() - 60_000), true);
    check("mode affiché", relay.describeMode(), "📱 actif (PC absent : réclame tout)");
    relay.handleSelfMessage(sent("#botrelay role=primary state=active pause=0 inst=aaaaaaaa since=0"));
    await sleep(50);
    check("PC de retour et actif : le téléphone lui laisse la main", relay.canClaim(Date.now()), false);
    relay.handleSelfMessage(sent("#botrelay role=primary state=stopped pause=0 inst=aaaaaaaa since=0"));
    await sleep(100);
    check("PC arrêté (Ctrl+C) : le téléphone reprend tout", relay.canClaim(Date.now() - 60_000), true);
    await relay.shutdown();
    delete require.cache[require.resolve("../src/relay")];
    if (savedRole === undefined) delete process.env.BOT_ROLE;
    else process.env.BOT_ROLE = savedRole;
  }

  // ─── Journal d'activité de l'app : montants gagnés ────────────────────────
  section("Journal d'activité : montants gagnés");
  {
    const activity = require("../src/activity");
    check("« 0.0009 SPELL »", activity.parseGain("0.0009 SPELL"), { amount: 0.0009, coin: "SPELL" });
    check("« 0,5 USDT »", activity.parseGain("0,5 USDT"), { amount: 0.5, coin: "USDT" });
    check("montant illisible", activity.parseGain("montant à vérifier sur Binance"), null);
  }

  // ─── Valeur en dollars des gains (prix public Binance, réseau simulé) ─────
  section("Valeur en dollars : prix public Binance");
  {
    const { priceUsd } = require("../src/prices");
    const calls = [];
    /** Faux réseau : prix par paire, 400 pour une paire inconnue, panne du 1er hôte si demandé. */
    const fakeFetch = (prices, { firstHostDown = false } = {}) => async (url) => {
      calls.push(url);
      if (firstHostDown && url.startsWith("https://api.binance.com")) throw new Error("ECONNRESET");
      const symbol = new URL(url).searchParams.get("symbol");
      if (!(symbol in prices)) return { ok: false, status: 400, json: async () => ({ code: -1121 }) };
      return { ok: true, status: 200, json: async () => ({ symbol, price: String(prices[symbol]) }) };
    };
    let t = 1_000_000;
    const at = () => (t += 120_000); // cache d'1 min : chaque cas repart de zéro

    check("stablecoin = 1 $", await priceUsd("USDT", { fetchImpl: fakeFetch({}), now: at() }), 1);
    check("paire /USDT", await priceUsd("SPELL", { fetchImpl: fakeFetch({ SPELLUSDT: 0.0005 }), now: at() }), 0.0005);
    check("repli sur /USDC", await priceUsd("ABC", { fetchImpl: fakeFetch({ ABCUSDC: 2 }), now: at() }), 2);
    check(
      "repli /BTC × BTC/USDT",
      await priceUsd("XYZ", { fetchImpl: fakeFetch({ XYZBTC: 0.00001, BTCUSDT: 60000 }), now: at() }),
      0.6000000000000001,
    );
    check("crypto inconnue : null", await priceUsd("NOPE", { fetchImpl: fakeFetch({}), now: at() }), null);
    calls.length = 0;
    check(
      "premier hôte en panne : miroir data-api",
      await priceUsd("DOGE", { fetchImpl: fakeFetch({ DOGEUSDT: 0.2 }, { firstHostDown: true }), now: at() }),
      0.2,
    );
    check("le miroir a bien été appelé", calls.some((u) => u.startsWith("https://data-api.binance.vision")), true);
    check("nom de crypto invalide : null", await priceUsd("../x", { fetchImpl: fakeFetch({}), now: at() }), null);
  }

  // ─── Publication des gains sur ton canal ──────────────────────────────────
  section("Publication des gains : format des posts");
  {
    const { formatPost, formatUsd, normalizeChannel } = require("../src/publisher");
    check(
      "un gain : code copiable, montant à la française",
      formatPost([{ code: "ABCD1234", gain: "0.52 USDT", usd: 0.52 }]),
      "🧧 Red Packet réclamé !\n\n🎁 Code : <code>ABCD1234</code>\n💰 Gain : 0,52 USDT (≈ 0,52 $)",
    );
    check(
      "montant inconnu : pas de ligne 💰",
      formatPost([{ code: "ABCD1234", gain: "", usd: null }]),
      "🧧 Red Packet réclamé !\n\n🎁 Code : <code>ABCD1234</code>",
    );
    check(
      "moins d'un centime : montant sans dollars, aucun chiffre perdu",
      formatPost([{ code: "ABCD1234", gain: "0.00000005 BNB", usd: 0.00003 }]),
      "🧧 Red Packet réclamé !\n\n🎁 Code : <code>ABCD1234</code>\n💰 Gain : 0,00000005 BNB",
    );
    check(
      "plusieurs gains : une ligne par code",
      formatPost([
        { code: "ABCD1234", gain: "0.52 USDT", usd: 0.52 },
        { code: "EFGH5678", gain: "12 SPELL", usd: 0.006 },
        { code: "IJKL9012", gain: "", usd: null },
      ]),
      "🧧 3 Red Packets réclamés !\n\n🎁 <code>ABCD1234</code> · 0,52 USDT (≈ 0,52 $)\n" +
        "🎁 <code>EFGH5678</code> · 12 SPELL\n🎁 <code>IJKL9012</code>",
    );
    check(
      "HTML échappé",
      formatPost([{ code: "ABCD1234", gain: "1 USDT <b>", usd: 1 }]).split("\n")[3],
      "💰 Gain : 1 USDT &lt;b&gt; (≈ 1,00 $)",
    );
    check("dollars : grands montants", [formatUsd(12.4), formatUsd(1250.4)], ["12,40 $", "1 250 $"]);
    check(
      "canal : formes acceptées",
      ["https://t.me/MonCanal/", "t.me/MonCanal", "@MonCanal", "-1001234567890", "", "t.me/+AbCdEf"].map(normalizeChannel),
      ["@MonCanal", "@MonCanal", "@MonCanal", "-1001234567890", "", null],
    );
  }

  section("Publication des gains : envoi (réseau simulé)");
  {
    const { createPublisher } = require("../src/publisher");
    /** Faux Telegram : réponses jouées dans l'ordre, puis « ok ». */
    const fakeTelegram = (answers = []) => {
      const calls = [];
      const fetchImpl = async (url, init) => {
        const method = url.split("/").pop();
        calls.push({ method, body: JSON.parse(init.body) });
        await sleep(5); // requête en vol : les gains suivants s'accumulent
        const answer = answers.shift() ?? { status: 200, body: { ok: true, result: {} } };
        if (answer.throws) throw new Error(answer.throws);
        return { ok: answer.status === 200, status: answer.status, json: async () => answer.body };
      };
      return { calls, fetchImpl };
    };
    const make = (tg, extra = {}) => {
      const alerts = [];
      const slept = [];
      const publisher = createPublisher({
        token: "123456:ABC",
        channel: "t.me/MonCanal",
        fetchImpl: tg.fetchImpl,
        notify: (text, opts) => alerts.push({ text, key: opts?.key }),
        sleep: (ms) => {
          slept.push(ms);
          return sleep(1);
        },
        ...extra,
      });
      return { publisher, alerts, slept };
    };

    {
      const tg = fakeTelegram();
      const { publisher, alerts } = make(tg);
      publisher.publish({ code: "AAAA1111", gain: "1 USDT", gainUsd: 1 });
      publisher.publish({ code: "BBBB2222", gain: "2 USDT", gainUsd: 2 });
      publisher.publish({ code: "CCCC3333", gain: "", gainUsd: null });
      await publisher.flush();
      check("rafale : le 1er seul, puis les 2 suivants groupés", tg.calls.length, 2);
      check("rafale : 1er post", tg.calls[0]?.body.text.includes("AAAA1111"), true);
      check(
        "rafale : 2e post groupé",
        tg.calls[1]?.body.text.startsWith("🧧 2 Red Packets réclamés !") && tg.calls[1].body.text.includes("CCCC3333"),
        true,
      );
      check("canal et format", [tg.calls[0]?.body.chat_id, tg.calls[0]?.body.parse_mode], ["@MonCanal", "HTML"]);
      check("rafale : aucune alerte", alerts.length, 0);
      check("bilan", publisher.statsRows(), [["📣 Gains publiés", "3"]]);
    }

    // Red Packet de Binance Square pris à la main : un post à lui
    {
      const { formatSquarePost } = require("../src/publisher");
      const link = "https://app.binance.com/uni-qr/cpos/383107779195016?uc=app_square_share_link&us=copylink";
      const href = link.replace("&", "&amp;");
      check(
        "post Square : réponse copiable et lien",
        formatSquarePost({ type: "quiz", coin: "SOL", answer: "a<b", link }),
        `🧧 Red Packet Quiz réclamé !\n\n🎯 Réponse : <code>a&lt;b</code>\n💰 Crypto : SOL\n👉 <a href="${href}">Ouvrir le post sur Binance Square</a>`,
      );
      check(
        "post Square sans question ni crypto",
        formatSquarePost({ type: "direct", answer: "", link }),
        `🧧 Red Packet Binance Square réclamé !\n\n👉 <a href="${href}">Ouvrir le post sur Binance Square</a>`,
      );

      const tg = fakeTelegram();
      const { publisher } = make(tg);
      publisher.publish({ code: "AAAA1111", gain: "1 USDT", gainUsd: 1 });
      const sent = publisher.publishSquare({ id: "383107779195016", type: "quiz", coin: "SOL", answer: "SOL", link });
      publisher.publish({ code: "BBBB2222", gain: "2 USDT", gainUsd: 2 });
      await publisher.flush();
      check("post Square accepté", sent, true);
      check("post Square : à part, entre deux gains", tg.calls.length, 3);
      check(
        "post Square : jamais mélangé aux codes",
        [tg.calls[1]?.body.text.includes("Red Packet Quiz"), tg.calls[1]?.body.text.includes("BBBB2222")],
        [true, false],
      );
      check("post Square : aucun parrainage", /[?&]r=/.test(tg.calls[1]?.body.text ?? ""), false);
      check("statistiques : 3 gains publiés", publisher.statsRows(), [["📣 Gains publiés", "3"]]);
      check("sans canal : rien à publier", createPublisher({ token: "", channel: "" }).publishSquare({ id: "1", link }), false);
    }

    {
      const tg = fakeTelegram([
        { status: 429, body: { ok: false, description: "Too Many Requests: retry after 7", parameters: { retry_after: 7 } } },
      ]);
      const { publisher, slept } = make(tg);
      publisher.publish({ code: "AAAA1111", gain: "1 USDT", gainUsd: 1 });
      await publisher.flush();
      check("429 : nouvel essai après le délai demandé + 1 s", [tg.calls.length, slept.includes(8000)], [2, true]);
    }

    {
      const tg = fakeTelegram([
        { status: 403, body: { ok: false, description: "Forbidden: bot is not a member of the channel chat" } },
        { status: 403, body: { ok: false, description: "Forbidden: bot is not a member of the channel chat" } },
      ]);
      const { publisher, alerts } = make(tg);
      publisher.publish({ code: "AAAA1111", gain: "1 USDT", gainUsd: 1 });
      await publisher.flush();
      check("bot pas admin : abandon sans nouvel essai", tg.calls.length, 1);
      check("bot pas admin : alerte qui dit quoi faire", alerts[0]?.text.includes("administrateur du canal"), true);
      check("bot pas admin : alerte limitée (clé commune)", alerts[0]?.key, "publish-failed");
      check("bilan : non publié", publisher.statsRows(), [["📣 Gains publiés", "0 (1 non publié(s))"]]);
    }

    {
      const tg = fakeTelegram([{ throws: "ECONNRESET" }, { throws: "ECONNRESET" }]);
      const { publisher, slept } = make(tg);
      publisher.publish({ code: "AAAA1111", gain: "1 USDT", gainUsd: 1 });
      await publisher.flush();
      check("réseau coupé : 2 nouveaux essais (5 s puis 15 s)", [tg.calls.length, slept.slice(0, 2)], [3, [5000, 15000]]);
    }

    {
      const tg = fakeTelegram();
      const { publisher } = make(tg, { priceUsd: async (coin) => (coin === "ABC" ? 2 : null) });
      publisher.publish({ code: "AAAA1111", gain: "0.5 ABC", gainUsd: null });
      await publisher.flush();
      check("dollars absents de Binance : prix public", tg.calls[0]?.body.text.endsWith("0,5 ABC (≈ 1,00 $)"), true);
    }

    {
      const tg = fakeTelegram([
        { status: 200, body: { ok: true, result: { id: 42, username: "mon_alert_bot" } } },
        { status: 200, body: { ok: true, result: { status: "administrator", can_post_messages: true } } },
        { status: 200, body: { ok: true, result: { id: 42, username: "mon_alert_bot" } } },
        { status: 200, body: { ok: true, result: { status: "left" } } },
      ]);
      const { publisher, alerts } = make(tg);
      check("vérification : bot admin", (await publisher.check()).ok, true);
      check("vérification : rien n'est publié", tg.calls.map((c) => c.method), ["getMe", "getChatMember"]);
      const refused = await publisher.check();
      check("vérification : bot absent du canal", refused.ok, false);
      check("vérification : texte pour l'app", refused.text.startsWith("@mon_alert_bot n'est pas administrateur du canal — ajoute"), true);
      check("vérification : alerte", alerts[0]?.text.includes("@mon_alert_bot n'est pas administrateur"), true);
      const offline = make(fakeTelegram([{ throws: "ENOTFOUND" }]));
      check("vérification : réseau absent, remise à plus tard", (await offline.publisher.check()).ok, null);
      check("vérification : réseau absent, aucune alerte", offline.alerts.length, 0);
    }

    {
      /** Faux compte Telegram (userbot) : crée le canal, refuse les pseudos déjà pris. */
      const fakeAccount = (taken = []) => {
        const steps = [];
        return {
          steps,
          createChannel: async ({ title }) => {
            steps.push(["create", title]);
            return { id: -1009876543210, title };
          },
          setChatUsername: async (_id, name) => {
            steps.push(["username", name]);
            if (taken.includes(name)) throw new Error("USERNAME_OCCUPIED");
          },
          editAdminRights: async ({ userId, rights }) => steps.push(["admin", userId, rights.postMessages]),
        };
      };
      const botAnswers = () => [
        { status: 200, body: { ok: true, result: { id: 42, username: "mon_alert_bot" } } },
        { status: 200, body: { ok: true, result: { id: 42, username: "mon_alert_bot" } } },
        { status: 200, body: { ok: true, result: { status: "administrator", can_post_messages: true } } },
      ];

      const account = fakeAccount(["redpacketrdc"]);
      const setup = createPublisher({ token: "123456:ABC", channel: "", fetchImpl: fakeTelegram(botAnswers()).fetchImpl });
      const created = await setup.setupChannel(account, { title: "🧧 Red Packet RDC", username: "@redpacketrdc" });
      check("création : pseudo pris, variante « _codes »", created.channel, "@redpacketrdc_codes");
      check(
        "création : canal, pseudo, bot admin avec le droit de publier",
        account.steps,
        [
          ["create", "🧧 Red Packet RDC"],
          ["username", "redpacketrdc"],
          ["username", "redpacketrdc_codes"],
          ["admin", "mon_alert_bot", true],
        ],
      );
      check("création : vérifiée", created.ok, true);

      const privateAccount = fakeAccount();
      const privateSetup = createPublisher({ token: "1:A", channel: "", fetchImpl: fakeTelegram(botAnswers()).fetchImpl });
      const privateChannel = await privateSetup.setupChannel(privateAccount, { title: "" });
      check("création sans pseudo : canal privé (ID), titre par défaut", [privateChannel.channel, privateChannel.title], ["-1009876543210", "🧧 Red Packet Codes"]);

      const noBot = await createPublisher({ token: "", channel: "" }).setupChannel(fakeAccount(), {});
      check("création sans jeton : refusée avant de créer quoi que ce soit", [noBot.ok, noBot.channel], [false, ""]);
    }

    {
      const botAnswers = (rights) => [
        { status: 200, body: { ok: true, result: { id: 42, username: "mon_alert_bot" } } },
        { status: 200, body: { ok: true, result: rights } },
      ];
      const promoted = [];
      const owner = { editAdminRights: async ({ userId, rights }) => promoted.push([userId, rights.changeInfo]) };
      const partial = createPublisher({
        token: "1:A",
        channel: "@MonCanal",
        fetchImpl: fakeTelegram(botAnswers({ status: "administrator", can_post_messages: true, can_edit_messages: true })).fetchImpl,
      });
      check("droits du bot incomplets : complétés par le propriétaire", [await partial.ensureBotRights(owner), promoted], [true, [["mon_alert_bot", true]]]);
      const full = createPublisher({
        token: "1:A",
        channel: "@MonCanal",
        fetchImpl: fakeTelegram(
          botAnswers({ status: "administrator", can_post_messages: true, can_edit_messages: true, can_change_info: true }),
        ).fetchImpl,
      });
      check("droits du bot complets : rien à faire", [await full.ensureBotRights(owner), promoted.length], [false, 1]);
      const notOwner = { editAdminRights: async () => { throw new Error("CHAT_ADMIN_REQUIRED"); } };
      const other = createPublisher({
        token: "1:A",
        channel: "@MonCanal",
        fetchImpl: fakeTelegram(botAnswers({ status: "administrator", can_post_messages: true })).fetchImpl,
      });
      check("autre compte (pas propriétaire) : ignoré sans erreur", await other.ensureBotRights(notOwner), false);
    }

    {
      const { usernameCandidates } = require("../src/publisher");
      const names = usernameCandidates("@Red Packet-RDC!");
      check("pseudos : nettoyés", names.slice(0, 2), ["RedPacketRDC", "RedPacketRDC_codes"]);
      check("pseudos : trop court = canal privé", usernameCandidates("ab"), []);
    }

    {
      const tg = fakeTelegram();
      const off = createPublisher({ token: "123456:ABC", channel: "", fetchImpl: tg.fetchImpl });
      off.publish({ code: "AAAA1111", gain: "1 USDT", gainUsd: 1 });
      await off.flush();
      check("canal vide : rien n'est publié", [off.describe(), tg.calls.length], ["désactivée (PUBLISH_CHANNEL vide)", 0]);
      const noToken = createPublisher({ token: "", channel: "@MonCanal" });
      check("jeton vide : expliqué", noToken.describe().startsWith("impossible : ALERT_BOT_TOKEN vide"), true);
      const watched = createPublisher({ token: "1:A", channel: "@MonCanal", targets: "@autre, https://t.me/moncanal" });
      check("canal aussi surveillé : signalé", watched.describe().includes("aussi surveillé"), true);
    }
  }

  console.log(
    failures
      ? `\n❌ ${failures} vérification(s) en échec sur ${checks}\n`
      : `\n✅ ${checks} vérifications réussies\n`,
  );
  return failures;
}

main()
  .then((failures) => {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    process.exit(failures ? 1 : 0);
  })
  .catch((err) => {
    console.error("💥", err);
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    process.exit(2);
  });
