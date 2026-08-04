/**
 * logger.js — Module de journalisation horodaté
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  📝 CONSOLE PROPRE, ALIGNÉE ET COLORÉE                                   ║
 * ║                                                                          ║
 * ║  Format conservé :  [timestamp] EMOJI NIVEAU — message                   ║
 * ║  Améliorations     : alignement des niveaux, couleurs ANSI,              ║
 * ║                      bannières/encadrés/tableaux sans préfixe parasite.  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Niveaux disponibles : info, warn, error, success, debug
 * Le niveau DEBUG n'est affiché que si DEBUG=true dans .env
 * Les couleurs sont désactivées automatiquement si NO_COLOR est défini
 * ou si la sortie n'est pas un terminal (redirection vers un fichier).
 */

"use strict";

const IS_DEBUG = process.env.DEBUG === "true";

// ─── Couleurs ANSI ──────────────────────────────────────────────────────────
// Actives uniquement sur un vrai terminal, sauf FORCE_COLOR=1 / NO_COLOR.

const COLOR_ENABLED = process.env.NO_COLOR
  ? false
  : process.env.FORCE_COLOR === "1" || Boolean(process.stdout.isTTY);

const RAW_COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const C = COLOR_ENABLED
  ? RAW_COLORS
  : Object.fromEntries(Object.keys(RAW_COLORS).map((k) => [k, ""]));

/** Enrobe un texte d'une couleur (no-op si les couleurs sont désactivées). */
function paint(color, text) {
  return color ? `${color}${text}${C.reset}` : text;
}

// ─── Largeur d'affichage (les emojis occupent 2 colonnes) ───────────────────

function isWideCodePoint(cp) {
  return (
    (cp >= 0x1f300 && cp <= 0x1faff) || // Emojis & pictogrammes
    (cp >= 0x1f000 && cp <= 0x1f2ff) || // Tuiles / symboles enfermés
    (cp >= 0x2600 && cp <= 0x27bf) || // Symboles divers & dingbats
    (cp >= 0x231a && cp <= 0x231b) || // ⌚ ⌛
    (cp >= 0x23e9 && cp <= 0x23fa) || // ⏩ ⏰ ⏱ ⏭ ⏳ ⏸ ⏺
    (cp >= 0x25fd && cp <= 0x25fe) || // ◽ ◾
    (cp >= 0x2b00 && cp <= 0x2bff) || // Flèches & formes
    (cp >= 0x1100 && cp <= 0x115f) || // Jamo Hangul
    (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibilité
    (cp >= 0xfe30 && cp <= 0xfe6f) || // Formes CJK
    (cp >= 0xff00 && cp <= 0xff60) // Latin pleine chasse
  );
}

/** Largeur réelle d'une chaîne en colonnes de terminal. */
function displayWidth(str) {
  let width = 0;
  for (const char of String(str)) {
    const cp = char.codePointAt(0);
    // Sélecteur de variation, ZWJ et diacritiques : largeur nulle
    if (cp === 0xfe0f || cp === 0xfe0e || cp === 0x200d) continue;
    if (cp >= 0x0300 && cp <= 0x036f) continue;
    width += isWideCodePoint(cp) ? 2 : 1;
  }
  return width;
}

/** Complète une chaîne à droite pour atteindre `target` colonnes. */
function padTo(str, target) {
  const missing = target - displayWidth(str);
  return missing > 0 ? str + " ".repeat(missing) : str;
}

// ─── Niveaux ────────────────────────────────────────────────────────────────

const LEVELS = {
  info: { label: "📘 INFO", color: C.cyan },
  warn: { label: "⚠️  WARN", color: C.yellow },
  error: { label: "❌ ERROR", color: C.red },
  success: { label: "✅ OK", color: C.green },
  debug: { label: "🔍 DEBUG", color: C.gray },
};

// Toutes les étiquettes sont alignées sur la plus large (« ❌ ERROR » = 8 col.)
const LABEL_WIDTH = Math.max(
  ...Object.values(LEVELS).map((l) => displayWidth(l.label)),
);

// Largeur totale des blocs décoratifs (bordures comprises)
const LINE_WIDTH = 64;

/**
 * Formate un message de log avec la date/heure courante.
 * @param {string} level - Clé du niveau de log.
 * @param {string} message - Message à afficher.
 */
function log(level, message) {
  const timestamp = new Date().toISOString();
  const meta = LEVELS[level];
  const label = meta ? meta.label : `[${level.toUpperCase()}]`;
  const color = meta ? meta.color : "";

  // Les messages multi-lignes gardent l'alignement sous le préfixe
  const text = String(message).split("\n");
  const prefix = `${paint(C.gray, `[${timestamp}]`)} ${paint(color, padTo(label, LABEL_WIDTH))} ${paint(C.gray, "—")} `;
  const indent = " ".repeat(displayWidth(`[${timestamp}] `) + LABEL_WIDTH + 3);

  console.log(prefix + text[0]);
  for (let i = 1; i < text.length; i++) {
    console.log(indent + text[i]);
  }
}

// ─── Blocs décoratifs (affichés sans préfixe pour rester lisibles) ──────────

/**
 * Encadré double trait — pour les grandes étapes (démarrage, arrêt).
 * @param {string[]} lines - Lignes à encadrer.
 * @param {string} [color] - Couleur ANSI à appliquer.
 */
function banner(lines, color = C.cyan) {
  const rows = Array.isArray(lines) ? lines : [lines];
  const inner = Math.max(LINE_WIDTH - 2, ...rows.map((l) => displayWidth(l) + 4));

  console.log(paint(color, `╔${"═".repeat(inner)}╗`));
  for (const row of rows) {
    console.log(
      paint(color, "║") +
        `  ${padTo(row, inner - 4)}  ` +
        paint(color, "║"),
    );
  }
  console.log(paint(color, `╚${"═".repeat(inner)}╝`));
}

/**
 * Séparateur horizontal avec titre centré.
 * @param {string} title - Titre à centrer (peut être vide).
 * @param {string} [color] - Couleur ANSI.
 */
function rule(title = "", color = C.gray) {
  if (!title) {
    console.log(paint(color, "═".repeat(LINE_WIDTH)));
    return;
  }
  const label = ` ${title} `;
  const remaining = Math.max(0, LINE_WIDTH - displayWidth(label));
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  console.log(
    paint(color, "═".repeat(left)) + label + paint(color, "═".repeat(right)),
  );
}

/**
 * Tableau clé/valeur encadré — pour les récapitulatifs et statistiques.
 * @param {string} title - Titre du bloc.
 * @param {Array<[string, string|number]>} rows - Paires libellé/valeur.
 * @param {string} [color] - Couleur ANSI.
 */
function table(title, rows, color = C.cyan) {
  const keyWidth = Math.max(0, ...rows.map(([k]) => displayWidth(k)));
  const headWidth = displayWidth(`┌─ ${title} `);
  const width = Math.max(
    LINE_WIDTH,
    headWidth + 1,
    ...rows.map(([, v]) => keyWidth + displayWidth(String(v)) + 8),
  );

  console.log(
    paint(color, "┌─ ") +
      paint(C.bold, title) +
      " " +
      paint(color, "─".repeat(Math.max(0, width - headWidth))),
  );
  for (const [key, value] of rows) {
    console.log(
      paint(color, "│  ") +
        padTo(key, keyWidth + 3) +
        paint(C.bold, String(value)),
    );
  }
  console.log(paint(color, `└${"─".repeat(width - 1)}`));
}

/**
 * Liste compacte multi-colonnes — pour afficher beaucoup d'éléments (canaux).
 * @param {string[]} items - Éléments à lister.
 * @param {number} [perLine=3] - Nombre d'éléments par ligne.
 * @param {string} [color] - Couleur ANSI.
 */
function list(items, perLine = 3, color = C.gray) {
  if (!items.length) return;
  const cellWidth = Math.max(...items.map(displayWidth)) + 3;

  for (let i = 0; i < items.length; i += perLine) {
    const cells = items
      .slice(i, i + perLine)
      .map((item) => padTo(item, cellWidth));
    console.log(paint(color, "   • ") + cells.join("").trimEnd());
  }
}

/** Ligne vide (respiration visuelle entre les blocs). */
function blank() {
  console.log("");
}

const logger = {
  info: (msg) => log("info", msg),
  warn: (msg) => log("warn", msg),
  error: (msg) => log("error", msg),
  success: (msg) => log("success", msg),
  // Le niveau debug est silencieux par défaut (activez DEBUG=true dans .env pour le voir)
  debug: (msg) => {
    if (IS_DEBUG) log("debug", msg);
  },

  // Helpers de mise en page
  banner,
  rule,
  table,
  list,
  blank,

  // Utilitaires exposés (couleurs / largeur) pour les autres modules
  colors: C,
  paint,
  displayWidth,
};

module.exports = logger;
