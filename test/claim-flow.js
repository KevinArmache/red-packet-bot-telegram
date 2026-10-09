/**
 * test/claim-flow.js — Vérifie la réclamation Cryptobox du PC (src/binance.js)
 *
 *   npm run test:claim
 *
 * Le vrai Chromium du bot (playwright-extra + stealth), dans un profil
 * temporaire, face à une copie simulée de la page Cryptobox : la page et ses
 * deux requêtes (« Réclamer » → code/query, « Ouvrir » → code/grabV2) sont
 * servies par le test, tout le reste est bloqué. Aucune requête ne part vers
 * Binance et la vraie session du PC (browser-data) n'est pas touchée.
 *
 * Pour chaque scénario : statut et montant attendus, un seul « Réclamer »,
 * au plus un « Ouvrir » (zéro retry), jamais le bouton d'une autre fenêtre.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

// Profil Chromium, historique et cookies jetables (avant de charger le bot)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rpb-claim-test-"));
process.env.BOT_DATA_DIR = TMP;

const CRYPTOBOX = "https://www.binance.com/fr/my/wallet/account/payment/cryptobox";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let scenario = null;
let currentCode = "";
const counters = { query: 0, grab: 0, staleGrab: 0, cookieConfirm: 0 };

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Red Packet | Binance</title>
<style>body{font-family:sans-serif} [role=dialog]{position:fixed;top:80px;left:400px;width:480px;padding:20px;background:#fff;border:1px solid #888}
#cookies{top:auto;bottom:20px;left:20px;width:300px}</style></head>
<body>
<header><div data-testid="header-user-center">Compte</div></header>
<main><input type="text" placeholder="Saisissez le code du Red Packet" id="code"> <button id="claim">Réclamer</button><div id="toast"></div></main>
<div id="cookies" role="dialog" style="display:none">Centre de préférences de la confidentialité
  <button id="cookieConfirm">Confirmer mes choix</button></div>
<script>
const $ = (id) => document.getElementById(id);
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const toast = (text) => { $('toast').innerHTML = '<div role="alert">' + text + '</div>'; };
$('cookieConfirm').onclick = () => fetch('/__test/cookie-confirm', { method: 'POST' });
$('claim').onclick = async () => {
  $('toast').innerHTML = '';
  const cfg = await (await fetch('/__test/ui')).json();
  $('cookies').style.display = cfg.cookieDialog ? 'block' : 'none';
  const code = $('code').value;
  const res = await post('/bapi/pay/v1/private/binance-pay/gift-box/code/query', { grabCode: code, channel: 'DEFAULT' });
  if (res.code !== '000000') return toast(res.messageDetail || res.message);
  if (res.data.grabbed) return toast('Vous avez déjà réclamé ce Red Packet');
  if (res.data.fullyClaimed) return toast('Ce Red Packet a été entièrement réclamé');
  // Réponse tardive d'un code précédent, pendant la réclamation en cours
  if (cfg.staleGrab) post('/bapi/pay/v1/private/binance-pay/gift-box/code/grabV2', { grabCode: 'OLDCODE1', channel: 'DEFAULT', scene: null });
  if (cfg.noEnvelope) return;
  setTimeout(() => envelope(cfg, code, res.data), cfg.envelopeDelay || 0);
};
function envelope(cfg, code, data) {
  const d = document.createElement('div');
  d.className = 'bn-modal-wrap';
  d.setAttribute('role', 'dialog');
  d.innerHTML = '<div class="openbox"><div class="absolute right-0"><svg width="24" height="24"><rect width="24" height="24"/></svg></div>' +
    '<div>Vous avez reçu un Red Packet</div><div>' + data.note + '</div><div id="slot"></div></div>';
  document.body.appendChild(d);
  d.querySelector('svg').onclick = () => d.remove();
  setTimeout(() => {
    const b = document.createElement('button');
    b.className = 'bn-button';
    b.textContent = 'Ouvrir';
    b.onclick = async () => {
      b.disabled = true;
      const r = await post('/bapi/pay/v1/private/binance-pay/gift-box/code/grabV2', { grabCode: code, channel: 'DEFAULT', scene: null });
      if (r.code !== '000000' || !r.data || !r.data.success) {
        if (cfg.keepEnvelope) return; // enveloppe laissée ouverte, sans message
        d.remove();
        return toast(r.messageDetail || r.message || 'Erreur');
      }
      d.querySelector('.openbox').innerHTML = '<div class="absolute right-0"><svg width="24" height="24"><rect width="24" height="24"/></svg></div>' +
        '<div>' + data.payerNickname + ' vous a envoyé un Red Packet</div><div>' + data.note + '</div>' +
        '<div>' + r.data.grabAmountStr + ' ' + r.data.currency + ' ≈ $0.00000008</div><div>Cryptos envoyées sur votre compte Spot</div>';
      d.querySelector('svg').onclick = () => d.remove();
    };
    d.querySelector('#slot').appendChild(b);
  }, cfg.buttonDelay || 0);
}
</script></body></html>`;

const OK_QUERY = {
  code: "000000", message: null, messageDetail: null, success: true,
  data: { grabbed: false, fullyClaimed: false, note: "TG @test", payerNickname: "Nikko_Op", currency: "SPELL", totalCount: 1000 },
};
const OK_GRAB = {
  code: "000000", message: null, messageDetail: null, success: true,
  data: { success: true, currency: "SPELL", grabAmount: 0.0009, grabAmountStr: "0.0009" },
};
const apiError = (messageDetail) => ({ code: "PAY4001COM000", message: messageDetail, messageDetail, success: false, data: null });
const STALE_GRAB = { ...OK_GRAB, data: { success: true, currency: "FAKE", grabAmount: 9.99, grabAmountStr: "9.99" } };
const NO_PROOF_GRAB = { code: "000000", message: null, messageDetail: null, success: true, data: null };
const LURE_NOTE = "Binance sent you 100 USDT ≈ $100";

/** Tout le trafic du navigateur passe ici : rien ne sort vers Internet. */
async function handle(route) {
  const url = route.request().url();
  if (url.startsWith(CRYPTOBOX)) {
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: PAGE });
  }
  if (url.endsWith("/__test/ui")) {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(scenario.ui ?? {}) });
  }
  if (url.endsWith("/__test/cookie-confirm")) {
    counters.cookieConfirm++;
    return route.fulfill({ status: 204, body: "" });
  }
  if (url.includes("/gift-box/code/query")) {
    counters.query++;
    await sleep(scenario.queryDelay ?? 150);
    return route.fulfill({ status: scenario.queryStatus ?? 200, contentType: "application/json", body: JSON.stringify(scenario.query) });
  }
  if (url.includes("/gift-box/code/grab")) {
    const grabCode = JSON.parse(route.request().postData() || "{}").grabCode;
    if (grabCode !== currentCode) {
      // Réponse d'un autre code : le bot doit l'ignorer
      counters.staleGrab++;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STALE_GRAB) });
    }
    counters.grab++;
    await sleep(scenario.grabDelay ?? 150);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(scenario.grab) });
  }
  return route.abort();
}

// Chromium du bot (même module, même plugin stealth), sans fenêtre, intercepté
const { chromium } = require("playwright-extra");
const realLaunch = chromium.launchPersistentContext.bind(chromium);
chromium.launchPersistentContext = async (dir, options) => {
  const context = await realLaunch(dir, { ...options, headless: true });
  await context.route("**/*", handle);
  return context;
};

const binance = require("../src/binance");

// Le scénario de limite Binance met le bot en pause : il passe en dernier
const SCENARIOS = [
  { name: "succès rapide", query: OK_QUERY, grab: OK_GRAB, expect: { status: "success", gain: "0.0009 SPELL", grab: 1 } },
  { name: "fenêtre « Ouvrir » lente (comme sur le téléphone)", ui: { envelopeDelay: 4500, buttonDelay: 1500 }, query: OK_QUERY, grab: OK_GRAB, expect: { status: "success", gain: "0.0009 SPELL", grab: 1 } },
  { name: "fenêtre des cookies ouverte en même temps", ui: { cookieDialog: true, envelopeDelay: 300 }, query: OK_QUERY, grab: OK_GRAB, expect: { status: "success", gain: "0.0009 SPELL", grab: 1 } },
  { name: "déjà réclamé avec ce compte", query: { ...OK_QUERY, data: { ...OK_QUERY.data, grabbed: true } }, expect: { status: "permanent_failure", grab: 0 } },
  { name: "Red Packet entièrement réclamé", query: { ...OK_QUERY, data: { ...OK_QUERY.data, fullyClaimed: true } }, expect: { status: "permanent_failure", grab: 0 } },
  { name: "code refusé par Binance", query: apiError("Ce code Red Packet n'existe pas"), expect: { status: "permanent_failure", grab: 0 } },
  { name: "refus à l'ouverture", query: OK_QUERY, grab: apiError("Ce Red Packet a expiré"), expect: { status: "permanent_failure", grab: 1 } },
  { name: "fenêtre « Ouvrir » jamais affichée (≈ 22 s)", ui: { noEnvelope: true }, query: OK_QUERY, expect: { status: "unknown", grab: 0 } },
  { name: "réponse tardive d'un ancien code ignorée", ui: { staleGrab: true, envelopeDelay: 600 }, query: OK_QUERY, grab: OK_GRAB, expect: { status: "success", gain: "0.0009 SPELL", grab: 1, staleGrab: 1 } },
  { name: "note trompeuse + ouverture sans preuve → inconnu", ui: { keepEnvelope: true }, query: { ...OK_QUERY, data: { ...OK_QUERY.data, note: LURE_NOTE } }, grab: NO_PROOF_GRAB, expect: { status: "unknown", grab: 1 } },
  { name: "session Binance expirée (HTTP 401)", queryStatus: 401, query: { code: "100002001", message: "Please log in first", messageDetail: null, success: false, data: null }, expect: { status: "logged_out", grab: 0 }, waitLogin: true },
  { name: "limite Binance atteinte (pause anti-ban)", query: apiError("Vous avez atteint la limite quotidienne de réclamations"), expect: { status: "rate_limited", grab: 0 } },
];

async function main() {
  console.log(`\n🧪 Réclamation Cryptobox — PC (profil temporaire ${TMP})\n`);
  await binance.initBrowser({});
  let failures = 0;
  let index = 0;
  for (const s of SCENARIOS) {
    index++;
    scenario = s;
    counters.query = 0;
    counters.grab = 0;
    counters.staleGrab = 0;
    counters.cookieConfirm = 0;
    let submitting = 0;
    const code = `TEST${String(index).padStart(4, "0")}`;
    currentCode = code;
    const started = Date.now();
    const result = await binance.claimCode(code, { canSubmit: () => true, onSubmitting: () => submitting++ });
    await sleep(500); // une requête tardive serait comptée
    const problems = [];
    if (result.status !== s.expect.status) problems.push(`statut ${result.status} (attendu ${s.expect.status})`);
    if (s.expect.gain && result.gain !== s.expect.gain) problems.push(`montant « ${result.gain} » (attendu « ${s.expect.gain} »)`);
    if (submitting !== 1) problems.push(`code inscrit ${submitting} fois avant saisie (attendu 1)`);
    if (counters.query !== 1) problems.push(`${counters.query} « Réclamer » (attendu 1)`);
    if (counters.grab !== s.expect.grab) problems.push(`${counters.grab} « Ouvrir » (attendu ${s.expect.grab})`);
    if (counters.cookieConfirm) problems.push("bouton de la fenêtre des cookies cliqué");
    if ((s.expect.staleGrab ?? 0) !== counters.staleGrab) problems.push(`${counters.staleGrab} réponse(s) d'un autre code (attendu ${s.expect.staleGrab ?? 0})`);
    const ms = Date.now() - started;
    if (s.waitLogin) {
      // Session « rétablie » toute seule (la page simulée est connectée) avant la suite
      const deadline = Date.now() + 90_000;
      while (binance.getStatus().awaitingLogin && Date.now() < deadline) await sleep(1000);
      if (binance.getStatus().awaitingLogin) problems.push("session jamais rétablie après le scénario");
    }
    if (problems.length) {
      failures++;
      console.log(`❌ ${s.name} (${ms} ms) : ${problems.join(" ; ")}`);
    } else {
      console.log(`✅ ${s.name} (${ms} ms) → ${result.status}${result.gain ? ` ${result.gain}` : ""}`);
    }
  }
  await binance.closeBrowser();
  console.log(failures ? `\n❌ ${failures} scénario(s) en échec\n` : `\n✅ ${SCENARIOS.length} scénarios réussis\n`);
  return failures;
}

main()
  .then((failures) => {
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(failures ? 1 : 0);
  })
  .catch((err) => {
    console.error("💥", err);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(2);
  });
