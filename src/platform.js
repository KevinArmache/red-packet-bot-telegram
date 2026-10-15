/**
 * platform.js — Où tourne le bot : PC / serveur, ou l'app Android.
 *
 * Sert aux messages qui disent quoi faire (se reconnecter, arrêter…) : sur le
 * téléphone, tout se fait dans l'app ; ailleurs, en ligne de commande.
 */

"use strict";

/** Bot lancé par l'app Android (BOT_PLATFORM=android, posé par l'app). */
const ANDROID_APP = process.env.BOT_PLATFORM === "android";

const hints = {
  /** Session Telegram à refaire, sans personne devant l'écran. */
  telegramLogin: ANDROID_APP
    ? "ouvre l'app Red Packet Bot → 📡 Sources → ✈️ Telegram"
    : "refais la connexion avec « node index.js --setup »",

  /** Session Binance à refaire. */
  binanceLogin: ANDROID_APP
    ? "ouvre l'app Red Packet Bot → 📡 Sources → 🔐 Binance (ou touche la notification)"
    : "connecte-toi dans la fenêtre Chromium du bot",

  /** Comment arrêter le bot. */
  stop: ANDROID_APP
    ? "bouton « Arrêter » de l'app"
    : "Ctrl+C (ou ton superviseur : PM2, systemd…)",

  /** Réglages d'énergie à vérifier quand le processeur est endormi. */
  sleepSettings: ANDROID_APP
    ? "l'écran « Santé » de l'app (batterie, démarrage auto, Phone Master)"
    : "les réglages d'économie d'énergie de la machine",
};

module.exports = { ANDROID_APP, hints };
