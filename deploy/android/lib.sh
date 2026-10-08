# shellcheck shell=bash
# lib.sh — Fonctions communes aux scripts Android (côté Termux ET côté Debian)
#
# Les messages ont le même style que ceux du bot :
#   [07/10 21:31:05] 📘 INFO  — message
# pour que « bot logs » reste homogène du début à la fin.

# ─── Couleurs (désactivées si NO_COLOR est défini) ──────────────────────────

if [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\e[0m'
  C_BOLD=$'\e[1m'
  C_RED=$'\e[31m'
  C_GREEN=$'\e[32m'
  C_YELLOW=$'\e[33m'
  C_CYAN=$'\e[36m'
  C_GRAY=$'\e[90m'
else
  C_RESET="" C_BOLD="" C_RED="" C_GREEN="" C_YELLOW="" C_CYAN="" C_GRAY=""
fi

# ─── Journalisation ─────────────────────────────────────────────────────────

_ts() { date '+%d/%m %H:%M:%S'; }

_log() {
  printf '%s %s %s %s\n' "${C_GRAY}[$(_ts)]${C_RESET}" "$1$2${C_RESET}" \
    "${C_GRAY}—${C_RESET}" "$3"
}

info() { _log "$C_CYAN" "📘 INFO " "$*"; }
ok() { _log "$C_GREEN" "✅ OK   " "$*"; }
warn() { _log "$C_YELLOW" "⚠️  WARN" "$*"; }
err() { _log "$C_RED" "❌ ERROR" "$*"; }
die() {
  err "$*"
  exit 1
}

RULE="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# banner COULEUR "ligne 1" "ligne 2"… — encadré léger, lisible en portrait
banner() {
  local color="$1" line
  shift
  printf '%s\n' "${color}${RULE}${C_RESET}"
  for line in "$@"; do printf '  %s\n' "${C_BOLD}${line}${C_RESET}"; done
  printf '%s\n' "${color}${RULE}${C_RESET}"
}

# step NUMÉRO "titre" — étapes de l'installation
step() { printf '\n%s\n' "${C_BOLD}${C_CYAN}━━ [$1] $2${C_RESET}"; }

# fmt_duration SECONDES → 45s · 12m05s · 3h07m
fmt_duration() {
  local s=${1:-0}
  if [ "$s" -ge 3600 ]; then
    printf '%dh%02dm' $((s / 3600)) $((s % 3600 / 60))
  elif [ "$s" -ge 60 ]; then
    printf '%dm%02ds' $((s / 60)) $((s % 60))
  else
    printf '%ds' "$s"
  fi
}

# set_env_var FICHIER NOM VALEUR — remplace (ou supprime si VALEUR est vide)
set_env_var() {
  local file="$1" key="$2" value="$3"
  touch "$file"
  sed -i "/^${key}=/d" "$file"
  if [ -n "$value" ]; then printf '%s=%s\n' "$key" "$value" >>"$file"; fi
}

# ─── Côté Debian : environnement du bot et écran virtuel ────────────────────

# Réglages propres au téléphone. Ils sont EXPORTÉS (et non écrits dans .env) :
# dotenv ne remplace jamais une variable déjà définie, donc le même .env que
# sur le PC fonctionne tel quel. android.env (facultatif) passe en dernier.
android_env() {
  export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  export HOME=/root
  export LANG=C.UTF-8
  export DISPLAY=:1
  export BOT_SCREEN=vnc
  export BOT_ROLE="${BOT_ROLE:-backup}"
  # Libellé des alertes et du relais : 📱 même si BOT_ROLE=solo
  export BOT_NAME="${BOT_NAME:-📱 Téléphone}"
  export BINANCE_LOGIN_TIMEOUT=0
  export LOG_WIDTH="${LOG_WIDTH:-48}"
  export BROWSER_USER_AGENT="${BROWSER_USER_AGENT:-native}"
  export FORCE_COLOR=1
  if [ -f /bot/android.env ]; then
    set -a
    # shellcheck disable=SC1091
    . /bot/android.env
    set +a
  fi
}

ensure_vnc_password() {
  if [ ! -s /bot/.vnc-password ]; then
    warn "Mot de passe VNC absent (.vnc-password) — relance install.sh"
    return 1
  fi
  if [ -s /root/.vnc/passwd ] && [ /root/.vnc/passwd -nt /bot/.vnc-password ]; then
    return 0
  fi
  mkdir -p /root/.vnc
  vncpasswd -f </bot/.vnc-password >/root/.vnc/passwd && chmod 600 /root/.vnc/passwd
}

# Écran virtuel :1 (1280x1024) pour la fenêtre Chromium du bot.
# VNC sur 127.0.0.1:5901 uniquement, protégé par mot de passe : sur Android,
# toutes les applis partagent « localhost ».
start_display() {
  if pgrep -x Xvnc >/dev/null 2>&1; then return 0; fi
  rm -f /tmp/.X1-lock /tmp/.X11-unix/X1
  mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
  ensure_vnc_password || return 1
  Xvnc :1 -geometry 1280x1024 -depth 24 -rfbport 5901 -localhost \
    -SecurityTypes VncAuth -PasswordFile /root/.vnc/passwd \
    -AlwaysShared -AcceptSetDesktopSize=0 >>/bot/logs/xvnc.log 2>&1 &
  local i
  for i in $(seq 1 40); do
    [ -S /tmp/.X11-unix/X1 ] && return 0
    sleep 0.25
  done
  warn "Écran virtuel lent à démarrer (voir logs/xvnc.log)"
  return 0
}

stop_display() { pkill -x Xvnc 2>/dev/null || true; }

# Chromium resté d'un arrêt brutal : il bloquerait le profil browser-data
cleanup_browser() {
  if pkill -f -- "--user-data-dir=/bot/browser-data" 2>/dev/null; then
    warn "🧹 Chromium orphelin arrêté"
    sleep 2
  fi
  rm -f /bot/browser-data/SingletonLock /bot/browser-data/SingletonSocket \
    /bot/browser-data/SingletonCookie
}
