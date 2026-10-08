#!/bin/bash
# setup-debian.sh — Installe les logiciels du bot DANS Debian (proot)
#
# Appelé par install.sh (installation complète) et par « bot update »
# (option --update : seulement les dépendances npm et Chromium).
#
# Le dépôt est monté sur /bot (voir « proot-distro login … --bind »).

set -u
# shellcheck disable=SC1091
. /bot/deploy/android/lib.sh

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export HOME=/root
export LANG=C.UTF-8
export DEBIAN_FRONTEND=noninteractive

UPDATE_ONLY=0
[ "${1:-}" = "--update" ] && UPDATE_ONLY=1

APT=(apt-get -y -o Dpkg::Options::=--force-confold --no-install-recommends)
ANDROID_ENV=/bot/android.env

cd /bot || die "Dépôt introuvable dans /bot"
mkdir -p /bot/logs /bot/.run

node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

# Répare une installation interrompue (processus tué par Android)
repair_packages() {
  dpkg --configure -a 2>/dev/null || true
  "${APT[@]}" --fix-broken install 2>/dev/null || true
}

# retry COMMANDE… : 3 essais ; entre deux essais, réparation des paquets.
# Android (phantom process killer, mémoire) peut tuer une étape longue.
retry() {
  local attempt
  for attempt in 1 2 3; do
    "$@" && return 0
    warn "Étape interrompue (essai $attempt/3) — réparation puis nouvel essai…"
    sleep 3
    repair_packages
  done
  return 1
}

KILLED_HINT="Si tu vois « Killed » : Android coupe l'installation. Fais d'abord
    l'étape 8.5 du guide (phantom process killer), garde Termux au premier
    plan, écran allumé, ferme les autres applis, puis relance l'installation."

# ─── Paquets Debian ─────────────────────────────────────────────────────────

if [ "$UPDATE_ONLY" -eq 0 ]; then
  repair_packages
  info "📦 Mise à jour de Debian…"
  retry apt-get update || die "apt-get update a échoué (réseau ?)"
  retry "${APT[@]}" upgrade || warn "Mise à jour partielle de Debian — on continue"

  info "📦 Outils de base et écran virtuel (VNC)…"
  retry "${APT[@]}" install ca-certificates curl gnupg git procps psmisc util-linux \
    tzdata xfonts-base tigervnc-standalone-server ||
    die "Installation des outils de base impossible. $KILLED_HINT"
  # vncpasswd est dans un paquet séparé selon les versions de Debian
  "${APT[@]}" install tigervnc-tools >/dev/null 2>&1 || true
  command -v vncpasswd >/dev/null || die "vncpasswd introuvable (paquet tigervnc-tools)"
  command -v Xvnc >/dev/null || die "Xvnc introuvable (paquet tigervnc-standalone-server)"
  ok "Écran virtuel prêt (TigerVNC)"

  # ─── Node.js ──────────────────────────────────────────────────────────────
  if [ "$(node_major)" -lt 20 ]; then
    info "🟩 Installation de Node.js 24 (NodeSource)…"
    if curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh &&
      bash /tmp/nodesource_setup.sh; then
      retry "${APT[@]}" install nodejs || die "Installation de Node.js impossible. $KILLED_HINT"
    else
      warn "NodeSource indisponible — Node.js de Debian à la place"
      retry "${APT[@]}" install nodejs npm || die "Installation de Node.js impossible. $KILLED_HINT"
    fi
  fi
fi

[ "$(node_major)" -ge 20 ] || die "Node.js 20 ou plus requis (trouvé : $(node -v 2>/dev/null || echo aucun))"
ok "Node.js $(node -v)"

# ─── Dépendances du bot ─────────────────────────────────────────────────────

info "📦 Dépendances du bot (npm ci)…"
if ! retry npm ci --no-audit --no-fund; then
  warn "Compilation nécessaire — installation des outils de compilation"
  retry "${APT[@]}" install build-essential python3 ||
    die "Outils de compilation impossibles à installer. $KILLED_HINT"
  retry npm ci --no-audit --no-fund || die "npm ci a échoué. $KILLED_HINT"
fi
ok "Dépendances installées"

# ─── Chromium ───────────────────────────────────────────────────────────────

info "🌐 Chromium pour Playwright…"
PW_FLAGS=(--no-shell chromium)
[ "$UPDATE_ONLY" -eq 0 ] && PW_FLAGS=(--with-deps "${PW_FLAGS[@]}")

if retry ./node_modules/.bin/playwright install "${PW_FLAGS[@]}"; then
  set_env_var "$ANDROID_ENV" CHROMIUM_PATH ""
  ok "Chromium de Playwright installé"
else
  warn "Chromium de Playwright indisponible — Chromium de Debian à la place"
  retry "${APT[@]}" install chromium || die "Installation de Chromium impossible. $KILLED_HINT"
  set_env_var "$ANDROID_ENV" CHROMIUM_PATH /usr/bin/chromium
  ok "Chromium de Debian installé (CHROMIUM_PATH=/usr/bin/chromium)"
fi

info "🧪 Test de Chromium…"
CHROMIUM_PATH=$(sed -n 's/^CHROMIUM_PATH=//p' "$ANDROID_ENV" 2>/dev/null | tail -n 1) \
  node /bot/deploy/android/chromium-test.js ||
  die "Chromium ne démarre pas — voir GUIDE-ANDROID.md (Dépannage)"
ok "Chromium fonctionne"
