/**
 * logger.js — Module de journalisation horodaté
 * Fournit des fonctions de log avec niveau et timestamp ISO.
 *
 * Niveaux disponibles : info, warn, error, success, debug
 * Le niveau DEBUG n'est affiché que si DEBUG=true dans .env
 */

'use strict';

const IS_DEBUG = process.env.DEBUG === 'true';

const LEVELS = {
  info:    '📘 INFO',
  warn:    '⚠️  WARN',
  error:   '❌ ERROR',
  success: '✅ OK',
  debug:   '🔍 DEBUG',
};

/**
 * Formate un message de log avec la date/heure courante.
 * @param {string} level - Clé du niveau de log.
 * @param {string} message - Message à afficher.
 */
function log(level, message) {
  const timestamp = new Date().toISOString();
  const label = LEVELS[level] ?? `[${level.toUpperCase()}]`;
  console.log(`[${timestamp}] ${label} — ${message}`);
}

const logger = {
  info:    (msg) => log('info', msg),
  warn:    (msg) => log('warn', msg),
  error:   (msg) => log('error', msg),
  success: (msg) => log('success', msg),
  // Le niveau debug est silencieux par défaut (activez DEBUG=true dans .env pour le voir)
  debug:   (msg) => { if (IS_DEBUG) log('debug', msg); },
};

module.exports = logger;
