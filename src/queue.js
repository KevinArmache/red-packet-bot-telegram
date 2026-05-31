/**
 * queue.js — File d'attente de promesses (traitement séquentiel)
 *
 * Garantit qu'un seul code Binance est traité à la fois,
 * même si plusieurs messages Telegram arrivent rapidement.
 */

'use strict';

const logger = require('./logger');

class PromiseQueue {
  constructor() {
    // La dernière promesse dans la chaîne — point d'ancrage de la file
    this._chain = Promise.resolve();
    this._pending = 0;
  }

  /**
   * Ajoute une tâche asynchrone à la file.
   * La tâche ne sera exécutée que lorsque toutes les précédentes seront terminées.
   * @param {() => Promise<void>} task — Fonction asynchrone à enqueue.
   * @returns {Promise<void>}
   */
  enqueue(task) {
    this._pending++;

    this._chain = this._chain
      .then(() => task())
      .catch((err) => {
        logger.error(`Erreur dans la file d'attente : ${err.message}`);
      })
      .finally(() => {
        this._pending--;
      });

    return this._chain;
  }

  /** Nombre de tâches en attente (hors celle en cours). */
  get size() {
    return this._pending;
  }
}

// Export d'une instance unique (singleton) pour tout le projet
const queue = new PromiseQueue();
module.exports = queue;
