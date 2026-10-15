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
    check("« BP » de 8 caractères ignoré", extractCodes({ plain: "Code : BPVV80RZ", trusted: ["BPVV80RZ"] }), []);
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
      ["mot en texte libre", "#xcode ABCDEFGH src=texte from=@b at=1800000000000 inst=3f9a1c2e"],
    ]) {
      check(`#xcode refusé : ${name}`, x.parseXCode(text), null);
    }
    check("relais frais (10 s)", x.isFreshRelay(T0, T0 + 10_000), true);
    check("relais périmé (31 s)", x.isFreshRelay(T0, T0 + 31_000), false);
    check("relais daté du futur", x.isFreshRelay(T0 + 20_000, T0), false);

    check("solo : réclamé ici", x.routeFor({ role: "solo", canClaimNow: false }), "local");
    check("téléphone responsable : réclamé ici", x.routeFor({ role: "backup", canClaimNow: true }), "local");
    check("téléphone en veille : transmis au PC", x.routeFor({ role: "backup", canClaimNow: false }), "forward");
  }

  // ─── Journal d'activité de l'app : montants gagnés ────────────────────────
  section("Journal d'activité : montants gagnés");
  {
    const activity = require("../src/activity");
    check("« 0.0009 SPELL »", activity.parseGain("0.0009 SPELL"), { amount: 0.0009, coin: "SPELL" });
    check("« 0,5 USDT »", activity.parseGain("0,5 USDT"), { amount: 0.5, coin: "USDT" });
    check("montant illisible", activity.parseGain("montant à vérifier sur Binance"), null);
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
