/**
 * history.js — Gestion de l'historique des codes traités
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const logger = require('./logger');

const HISTORY_FILE = path.resolve(__dirname, '..', 'history.json');

let processedCodes = new Map();

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw  = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        // Migration depuis l'ancien format Array
        const now = Date.now();
        processedCodes = new Map(data.map(code => [code, now]));
        logger.info(`📋 Historique : Migration de ${processedCodes.size} code(s)`);
      } else if (typeof data === 'object' && data !== null) {
        processedCodes = new Map(Object.entries(data));
        logger.info(`📋 Historique : ${processedCodes.size} code(s) en mémoire`);
      }
    } else {
      saveHistory();
    }
  } catch (err) {
    logger.error(`📋 Erreur historique : ${err.message}`);
    processedCodes = new Map();
  }
}

function saveHistory() {
  const tmpFile = `${HISTORY_FILE}.tmp`;
  try {
    const obj = Object.fromEntries(processedCodes);
    const data = JSON.stringify(obj, null, 2);
    
    try {
      // Écriture atomique (plus sûre)
      fs.writeFileSync(tmpFile, data, 'utf-8');
      fs.renameSync(tmpFile, HISTORY_FILE);
    } catch (renameErr) {
      // Fallback : Écriture directe (contourne l'erreur EPERM sous Windows si le fichier est ouvert dans un éditeur)
      fs.writeFileSync(HISTORY_FILE, data, 'utf-8');
      
      // Nettoyage du fichier temp
      if (fs.existsSync(tmpFile)) {
        try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
      }
    }
  } catch (err) {
    logger.error(`💾 Sauvegarde échouée : ${err.message}`);
  }
}

function hasCode(code) {
  return processedCodes.has(code.toUpperCase());
}

function addCode(code) {
  processedCodes.set(code.toUpperCase(), Date.now());
  saveHistory();
}

function cleanOldCodes(maxAgeMs = 48 * 60 * 60 * 1000) {
  const now = Date.now();
  let removed = 0;
  for (const [code, timestamp] of processedCodes.entries()) {
    if (now - timestamp > maxAgeMs) {
      processedCodes.delete(code);
      removed++;
    }
  }
  if (removed > 0) {
    saveHistory();
    logger.info(`🗑️ Historique : ${removed} ancien(s) code(s) supprimé(s)`);
  }
}

module.exports = { loadHistory, hasCode, addCode, cleanOldCodes };
