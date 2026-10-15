/**
 * prices.js — Valeur en dollars d'une crypto gagnée
 *
 * Prix public de Binance (aucune clé, aucun compte) : paire CRYPTO/USDT, puis
 * USDC, FDUSD, et en dernier recours CRYPTO/BTC × BTC/USDT. Les stablecoins
 * valent 1 $. Jamais bloquant pour la réclamation : appelé après coup, pour
 * l'écran Activité de l'app.
 */

"use strict";

const STABLES = new Set(["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "USDP", "DAI", "USD1", "USDE"]);
// api.binance.com, puis le miroir public des données de marché
const HOSTS = ["https://api.binance.com", "https://data-api.binance.vision"];
const QUOTES = ["USDT", "USDC", "FDUSD"];
const CACHE_MS = 60_000;
const TIMEOUT_MS = 5000;

/** coin → { price, at } */
const cache = new Map();

/**
 * Prix d'une paire, ou null si elle n'existe pas sur Binance.
 * @param {string} symbol - Ex. « SPELLUSDT ».
 * @param {typeof fetch} fetchImpl
 */
async function ticker(symbol, fetchImpl) {
  for (const host of HOSTS) {
    try {
      const res = await fetchImpl(`${host}/api/v3/ticker/price?symbol=${symbol}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // 400 = paire inconnue (« Invalid symbol ») : inutile d'essayer le miroir
      if (res.status === 400) return null;
      if (!res.ok) continue;
      const price = Number((await res.json())?.price);
      return Number.isFinite(price) && price > 0 ? price : null;
    } catch (_) {
      /* réseau, délai : hôte suivant */
    }
  }
  return null;
}

/**
 * Valeur d'une unité de `coin` en dollars, ou null si introuvable.
 * @param {string} coin - Ex. « SPELL ».
 * @param {{ fetchImpl?: typeof fetch, now?: number }} [options]
 */
async function priceUsd(coin, options = {}) {
  const symbol = String(coin ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) return null;
  if (STABLES.has(symbol)) return 1;

  const now = options.now ?? Date.now();
  const hit = cache.get(symbol);
  if (hit && now - hit.at < CACHE_MS) return hit.price;

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return null;

  let price = null;
  for (const quote of QUOTES) {
    price = await ticker(`${symbol}${quote}`, fetchImpl);
    if (price) break;
  }
  if (!price) {
    const inBtc = await ticker(`${symbol}BTC`, fetchImpl);
    const btc = inBtc ? await ticker("BTCUSDT", fetchImpl) : null;
    if (inBtc && btc) price = inBtc * btc;
  }
  if (price) cache.set(symbol, { price, at: now });
  return price;
}

module.exports = { priceUsd, STABLES };
