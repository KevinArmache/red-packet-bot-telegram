/**
 * history.js — Gestion de l'historique des codes traités
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const logger = require('./logger');

const HISTORY_FILE = path.resolve(__dirname, '..', 'history.json');

let processedCodes = new Set();

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw  = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        processedCodes = new Set(data);
        logger.info(`📋 Historique : ${processedCodes.size} code(s) en mémoire`);
      }
    } else {
      saveHistory();
    }
  } catch (err) {
    logger.error(`📋 Erreur historique : ${err.message}`);
    processedCodes = new Set();
  }
}

function saveHistory() {
  const tmpFile = `${HISTORY_FILE}.tmp`;
  try {
    const data = JSON.stringify([...processedCodes], null, 2);
    fs.writeFileSync(tmpFile, data, 'utf-8');
    fs.renameSync(tmpFile, HISTORY_FILE);
  } catch (err) {
    logger.error(`💾 Sauvegarde échouée : ${err.message}`);
    if (fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
    }
  }
}

function hasCode(code) {
  return processedCodes.has(code.toUpperCase());
}

function addCode(code) {
  processedCodes.add(code.toUpperCase());
  saveHistory();
}

function resetHistory() {
  processedCodes = new Set();
  saveHistory();
  logger.info('🗑️ Historique réinitialisé');
}

module.exports = { loadHistory, hasCode, addCode, resetHistory };
