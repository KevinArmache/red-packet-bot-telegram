/**
 * chromium-test.js — Vérifie que Chromium démarre dans Debian/proot.
 * Lancé par setup-debian.sh à la fin de l'installation.
 */

"use strict";

const { chromium } = require("playwright");

(async () => {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({
    headless: true,
    // Sans « headless shell » (installé avec --no-shell) : mode headless du
    // Chromium complet
    channel: executablePath ? undefined : "chromium",
    executablePath,
    args: ["--no-sandbox"],
  });
  const version = browser.version();
  const page = await browser.newPage();
  await page.setContent("<p>ok</p>");
  const text = await page.textContent("p");
  await browser.close();
  if (text !== "ok") throw new Error(`rendu inattendu : ${text}`);
  console.log(`Chromium ${version} OK`);
})().catch((err) => {
  console.error(`Chromium KO : ${err.message}`);
  process.exit(1);
});
