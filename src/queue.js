/**
 * queue.js — File d'attente de promesses (traitement séquentiel)
 *
 * Garantit qu'un seul code Binance est traité à la fois,
 * même si plusieurs messages Telegram arrivent rapidement.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  📥 ORDRE STRICT « PREMIER ARRIVÉ, PREMIER SERVI »                       ║
 * ║                                                                          ║
 * ║  Un seul onglet Binance ⇒ un seul code à la fois. Le code le plus        ║
 * ║  ancien est aussi le plus « frais » côté Red Packet : le FIFO est donc   ║
 * ║  le bon ordre. La file mesure son propre engorgement pour prévenir dès   ║
 * ║  qu'elle devient le goulot d'étranglement.                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const logger = require('./logger');

// Au-delà de ce nombre de codes en attente, on alerte : la file devient le
// facteur limitant et les derniers codes risquent d'arriver trop tard.
const CONGESTION_THRESHOLD = 4;

class PromiseQueue {
  constructor() {
    // La dernière promesse dans la chaîne — point d'ancrage de la file
    this._chain = Promise.resolve();
    this._pending = 0;
    this._peak = 0;
    this._processed = 0;
    this._congestionWarned = false;
  }

  /**
   * Ajoute une tâche asynchrone à la file.
   * La tâche ne sera exécutée que lorsque toutes les précédentes seront terminées.
   * @param {() => Promise<void>} task — Fonction asynchrone à enqueue.
   * @param {string} [label] — Identifiant lisible (code) pour les logs.
   * @returns {Promise<void>}
   */
  enqueue(task, label = '') {
    this._pending++;
    if (this._pending > this._peak) this._peak = this._pending;

    if (this._pending >= CONGESTION_THRESHOLD && !this._congestionWarned) {
      this._congestionWarned = true;
      logger.warn(
        `🚦 File chargée : ${this._pending} codes en attente — les derniers` +
          ' risquent d\'arriver après épuisement du Red Packet.',
      );
    }

    this._chain = this._chain
      .then(() => task())
      .catch((err) => {
        logger.error(
          `💥 Erreur dans la file d'attente${label ? ` (${label})` : ''} : ${err.message}`,
        );
      })
      .finally(() => {
        this._pending--;
        this._processed++;
        if (this._pending === 0) this._congestionWarned = false;
      });

    return this._chain;
  }

  /** Nombre de tâches en attente (hors celle en cours). */
  get size() {
    return this._pending;
  }

  /** Plus grande profondeur observée depuis le démarrage. */
  get peak() {
    return this._peak;
  }

  /** Nombre total de tâches terminées. */
  get processed() {
    return this._processed;
  }

  /** Attend que la file soit entièrement vidée (utilisé à l'arrêt). */
  drain() {
    return this._chain.catch(() => {});
  }
}

// Export d'une instance unique (singleton) pour tout le projet
const queue = new PromiseQueue();
module.exports = queue;
