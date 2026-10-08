/**
 * paths.js — Où le bot garde ses fichiers (historique, sessions, alertes).
 *
 * Par défaut : à la racine du projet, comme avant. L'app Android pose
 * BOT_DATA_DIR vers son stockage privé, qui survit aux mises à jour de l'APK.
 */

"use strict";

const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve((process.env.BOT_DATA_DIR ?? "").trim() || ROOT_DIR);

/** Chemin d'un fichier de données du bot. */
function dataPath(...parts) {
  return path.join(DATA_DIR, ...parts);
}

module.exports = { ROOT_DIR, DATA_DIR, dataPath };
