#!/data/data/com.termux/files/usr/bin/bash
# bot — Commandes du bot Red Packet sur Android (Termux)
#
#   bot start          démarre le bot en arrière-plan (survit à la fermeture de Termux)
#   bot stop           arrêt propre — il ne redémarre plus tout seul
#   bot restart        redémarrage
#   bot status         tableau de bord
#   bot logs [--plain] logs en direct (Ctrl+C pour quitter, le bot continue)
#   bot login          connexion Telegram + Binance
#   bot vnc            adresse et mot de passe de l'écran du bot (app AVNC)
#   bot update         met à jour le bot (git pull + dépendances)
#   bot watchdog on|off  relance automatique toutes les 15 min (Termux:API)
#   bot ensure         relance si nécessaire (démarrage du téléphone, watchdog)

set -u

SELF=$(readlink -f "$0")
REPO=$(cd "$(dirname "$SELF")/../.." && pwd)
ANDROID_DIR="$REPO/deploy/android"
# shellcheck disable=SC1091
. "$ANDROID_DIR/lib.sh"

RUN_DIR="$REPO/.run"
LOG_FILE="$REPO/logs/bot.log"
STOP_FLAG="$REPO/.stop"
HEARTBEAT="$RUN_DIR/heartbeat"
WATCHDOG_JOB_ID=4242
CHROMIUM_PATTERN="--user-data-dir=/bot/browser-data"

mkdir -p "$RUN_DIR" "$REPO/logs"

# ─── Processus ──────────────────────────────────────────────────────────────

# pid_matches PID MOTIF : le processus existe et sa commande contient MOTIF
# (évite de confondre avec un autre processus après un redémarrage)
pid_matches() {
  local pid="$1" pattern="$2"
  [ -n "$pid" ] && [ -r "/proc/$pid/cmdline" ] &&
    tr '\0' ' ' <"/proc/$pid/cmdline" | grep -q -- "$pattern"
}

supervisor_pid() { cat "$RUN_DIR/run.pid" 2>/dev/null; }
node_pid() { cat "$RUN_DIR/node.pid" 2>/dev/null; }
is_running() { pid_matches "$(supervisor_pid)" "run.sh"; }
node_running() { pid_matches "$(node_pid)" "index.js"; }

file_age() { echo $(($(date +%s) - $(stat -c %Y "$1" 2>/dev/null || date +%s))); }

wait_until_running() {
  local i
  for i in $(seq 1 "$1"); do
    is_running && return 0
    sleep 1
  done
  return 1
}

# Exécute une commande dans Debian, dépôt monté sur /bot
proot_run() {
  local tz
  tz=$(getprop persist.sys.timezone 2>/dev/null)
  proot-distro login debian --bind "$REPO:/bot" -- /usr/bin/env TZ="${tz:-UTC}" "$@"
}

# Tâche de fond Termux (intent RUN_COMMAND) : rattachée au service Termux,
# elle survit à la fermeture de l'app.
launch_background() {
  am startservice --user 0 -n com.termux/com.termux.app.RunCommandService \
    -a com.termux.RUN_COMMAND \
    --es com.termux.RUN_COMMAND_PATH "$ANDROID_DIR/launch.sh" \
    --ez com.termux.RUN_COMMAND_BACKGROUND true >/dev/null 2>&1
}

# Secours : processus détaché du terminal
launch_detached() {
  if command -v setsid >/dev/null; then
    nohup setsid "$ANDROID_DIR/launch.sh" >/dev/null 2>&1 &
  else
    nohup "$ANDROID_DIR/launch.sh" >/dev/null 2>&1 &
  fi
  disown 2>/dev/null || true
}

# Restes d'un arrêt brutal (bot sans superviseur, Chromium, écran virtuel)
kill_leftovers() {
  if node_running && ! is_running; then
    warn "🧹 Bot orphelin (sans superviseur) arrêté"
    kill -TERM "$(node_pid)" 2>/dev/null
    sleep 10
    node_running && kill -KILL "$(node_pid)" 2>/dev/null
  fi
  pkill -f -- "$CHROMIUM_PATTERN" 2>/dev/null
  pkill -x Xvnc 2>/dev/null
  return 0
}

# ─── Commandes ──────────────────────────────────────────────────────────────

cmd_start() {
  rm -f "$STOP_FLAG"
  termux-wake-lock 2>/dev/null || true

  if is_running; then
    ok "Le bot tourne déjà 🟢 — suis-le avec : bot logs"
    return 0
  fi

  kill_leftovers
  info "🚀 Démarrage du bot en arrière-plan…"
  launch_background
  if ! wait_until_running 20; then
    warn "Tâche de fond Termux pas encore démarrée — lancement direct"
    launch_detached
    wait_until_running 20 || {
      err "Le bot n'a pas démarré — regarde les logs : bot logs"
      return 1
    }
  fi

  ok "Bot démarré 🟢 — il continue même si tu fermes Termux"
  info "📜 Logs en direct : bot logs   ·   📊 État : bot status"
}

cmd_stop() {
  touch "$STOP_FLAG"

  if ! is_running; then
    kill_leftovers
    termux-wake-unlock 2>/dev/null || true
    ok "Le bot est déjà arrêté ⏹️ — il ne redémarrera pas tout seul"
    return 0
  fi

  info "⏹️  Arrêt propre en cours (jusqu'à 30 s)…"
  node_running && kill -TERM "$(node_pid)" 2>/dev/null

  local i
  for i in $(seq 1 30); do
    is_running || break
    sleep 1
  done

  if is_running; then
    warn "Le superviseur ne répond pas — arrêt forcé"
    kill -TERM "$(supervisor_pid)" 2>/dev/null
    sleep 3
    is_running && kill -KILL "$(supervisor_pid)" 2>/dev/null
    node_running && kill -KILL "$(node_pid)" 2>/dev/null
  fi

  kill_leftovers
  termux-wake-unlock 2>/dev/null || true
  ok "Bot arrêté ⏹️ — il ne redémarrera plus tout seul (relance : bot start)"
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    warn "Pas encore de logs — lance d'abord : bot start"
    return 1
  fi
  info "📜 Logs en direct — Ctrl+C pour quitter (le bot continue de tourner)"
  if [ "${1:-}" = "--plain" ]; then
    tail -n 150 -F "$LOG_FILE" 2>/dev/null | sed -u 's/\x1b\[[0-9;]*m//g'
  else
    tail -n 150 -F "$LOG_FILE" 2>/dev/null
  fi
}

# ── Tableau de bord ──

read_heartbeat() {
  local key value
  HB_role="" HB_mode="" HB_browser="" HB_pause_until=0 HB_detected=0 HB_won=0
  [ -f "$HEARTBEAT" ] || return 1
  while IFS='=' read -r key value; do
    case "$key" in
    role | mode | browser | pause_until | detected | won) printf -v "HB_$key" '%s' "$value" ;;
    esac
  done <"$HEARTBEAT"
}

role_label() {
  case "$HB_role" in
  backup)
    case "$HB_mode" in
    active) echo "📱 relais — ACTIF (il réclame les codes)" ;;
    standby) echo "😴 relais — en veille (le PC réclame)" ;;
    *) echo "🔎 relais — vérification du PC" ;;
    esac
    ;;
  primary) echo "💻 prioritaire (ce téléphone ne laisse rien au PC)" ;;
  solo) echo "seul (pas de relais avec le PC)" ;;
  *) echo "?" ;;
  esac
}

browser_label() {
  case "$HB_browser" in
  ready) echo "🟢 prêt (connecté à Binance)" ;;
  login) echo "🔑 connexion Binance requise → bot vnc" ;;
  starting) echo "⏳ démarrage / attente de connexion" ;;
  closed) echo "😴 fermé (mémoire libérée)" ;;
  *) echo "?" ;;
  esac
}

# Mémoire réelle (PSS) en Mo des processus donnés
mem_mb() {
  local total=0 pid kb
  for pid in "$@"; do
    kb=$(awk '/^Pss:/ {print $2; exit}' "/proc/$pid/smaps_rollup" 2>/dev/null)
    [ -z "$kb" ] && kb=$(awk '/^VmRSS:/ {print $2}' "/proc/$pid/status" 2>/dev/null)
    total=$((total + ${kb:-0}))
  done
  echo $((total / 1024))
}

chromium_pids() { pgrep -f -- "$CHROMIUM_PATTERN" 2>/dev/null | tr '\n' ' '; }

cpu_percent() {
  local pids
  # shellcheck disable=SC2086,SC2116
  pids=$(echo $*) # espaces normalisés
  pids=${pids// /,}
  if [ -z "$pids" ]; then
    echo 0
    return
  fi
  ps -o pcpu= -p "$pids" 2>/dev/null | awk '{s += $1} END {printf "%.0f", s}'
}

row() { printf '  %s %s\n' "$1" "$2"; }

cmd_status() {
  banner "$C_CYAN" "🤖 Bot Red Packet — État"

  if is_running; then
    local since
    since=$(file_age "$RUN_DIR/started_at")
    row "⚙️  Bot         " "${C_GREEN}🟢 en marche${C_RESET} depuis $(fmt_duration "$since")"
  elif [ -f "$STOP_FLAG" ]; then
    row "⚙️  Bot         " "${C_YELLOW}⏹️  arrêté par toi${C_RESET} (relance : bot start)"
  else
    row "⚙️  Bot         " "${C_RED}🔴 arrêté anormalement${C_RESET} (relance : bot start)"
  fi

  if is_running && read_heartbeat; then
    row "🤝 Relais      " "$(role_label)"
    row "🌐 Navigateur  " "$(browser_label)"
    if [ "${HB_pause_until:-0}" -gt $(($(date +%s) * 1000)) ]; then
      row "🛑 Pause       " "anti-ban jusqu'à $(date -d "@$((HB_pause_until / 1000))" '+%H:%M')"
    fi
    row "🎁 Codes       " "${HB_detected} détecté(s) · ${HB_won} gagné(s)"
    row "💓 Signe de vie" "il y a $(fmt_duration "$(file_age "$HEARTBEAT")")"
  fi

  if node_running; then
    local chrome
    chrome=$(chromium_pids)
    # shellcheck disable=SC2086
    row "🧠 Mémoire     " "bot $(mem_mb "$(node_pid)") Mo · Chromium $(mem_mb $chrome) Mo"
    row "🔥 CPU         " "$(cpu_percent "$(node_pid)" "$chrome") % (moyenne depuis le lancement)"
  fi

  if [ -f "$RUN_DIR/watchdog-on" ]; then
    row "🛡️  Watchdog    " "activé (vérification toutes les 15 min)"
  else
    row "🛡️  Watchdog    " "${C_YELLOW}désactivé${C_RESET} (bot watchdog on)"
  fi

  echo
  info "📜 Dernières lignes du log (en direct : bot logs) :"
  tail -n 8 "$LOG_FILE" 2>/dev/null
}

show_vnc() {
  local pass
  pass=$(cat "$REPO/.vnc-password" 2>/dev/null || echo "?")
  banner "$C_CYAN" "🖥️  Écran du bot (connexion Binance)"
  row "📲 App     " "AVNC → ➕ nouveau serveur"
  row "🌍 Adresse " "${C_BOLD}127.0.0.1${C_RESET}   Port ${C_BOLD}5901${C_RESET}"
  row "🔒 Mot de passe" "${C_BOLD}${pass}${C_RESET}"
}

cmd_vnc() {
  show_vnc
  is_running || warn "L'écran n'existe que pendant que le bot tourne (bot start) ou pendant « bot login »"
}

cmd_login() {
  local was_running=0
  if is_running; then
    was_running=1
    info "⏸️  Pause du bot pendant la connexion…"
    cmd_stop >/dev/null
  fi
  # Le watchdog et le démarrage auto ne doivent pas relancer le bot (ni fermer
  # ce Chromium) pendant que tu te connectes : .stop les en empêche
  touch "$STOP_FLAG"
  kill_leftovers

  show_vnc
  info "🔑 1) Code Telegram ici si demandé · 2) Connexion Binance dans AVNC"
  proot_run /bin/bash /bot/deploy/android/login.sh
  local code=$?

  if [ "$code" -eq 0 ]; then
    ok "Connexions OK ✅ — démarrage du bot"
    cmd_start
  else
    err "Connexion interrompue (code $code) — relance : bot login"
    [ "$was_running" -eq 1 ] && cmd_start
    return "$code"
  fi
}

cmd_update() {
  local was_running=0
  is_running && was_running=1

  info "⬇️  Mise à jour du bot…"
  # core.fileMode=false : les droits d'exécution posés par install.sh ne
  # comptent pas comme des modifications locales
  if ! git -C "$REPO" -c core.fileMode=false pull --ff-only; then
    err "git pull impossible — fichiers modifiés à la main ? Vérifie avec :"
    err "   git -C ~/red-packet-bot-telegram status   (voir GUIDE-ANDROID.md, Dépannage)"
    return 1
  fi

  [ "$was_running" -eq 1 ] && cmd_stop >/dev/null
  if ! proot_run /bin/bash /bot/deploy/android/setup-debian.sh --update; then
    err "Mise à jour des dépendances impossible — relance : bot update"
    # Le bot repart quand même (avec les dépendances déjà installées)
    [ "$was_running" -eq 1 ] && cmd_start
    return 1
  fi
  bash "$ANDROID_DIR/install.sh" --refresh
  ok "Bot à jour ✅"
  [ "$was_running" -eq 1 ] && cmd_start
  return 0
}

cmd_watchdog() {
  case "${1:-on}" in
  on)
    if ! command -v termux-job-scheduler >/dev/null; then
      err "Paquet manquant : pkg install termux-api"
      return 1
    fi
    if timeout 20 termux-job-scheduler --job-id "$WATCHDOG_JOB_ID" \
      --script "$ANDROID_DIR/watchdog.sh" --period-ms 900000 \
      --network any --battery-not-low false --persisted true >/dev/null 2>&1; then
      touch "$RUN_DIR/watchdog-on"
      ok "🛡️  Watchdog activé : vérification toutes les 15 min (même après un redémarrage)"
    else
      rm -f "$RUN_DIR/watchdog-on"
      err "Watchdog non activé — installe l'app Termux:API (F-Droid), ouvre-la une fois, puis : bot watchdog on"
      return 1
    fi
    ;;
  off)
    timeout 20 termux-job-scheduler --cancel --job-id "$WATCHDOG_JOB_ID" >/dev/null 2>&1
    rm -f "$RUN_DIR/watchdog-on"
    ok "Watchdog désactivé"
    ;;
  *)
    err "Usage : bot watchdog on|off"
    return 1
    ;;
  esac
}

# Démarrage du téléphone et watchdog : relance si besoin, sinon silence
cmd_ensure() {
  if [ -f "$STOP_FLAG" ]; then
    return 0 # arrêté par toi : on respecte ton choix
  fi
  termux-wake-lock 2>/dev/null || true

  if ! is_running; then
    warn "🛡️  Bot arrêté anormalement — relance automatique"
    cmd_start
    return
  fi

  # Figé ? Aucun signe de vie depuis 5 min alors que le bot tourne depuis plus longtemps
  # (le signe de vie s'arrête aussi si Telegram ne répond plus : session
  # révoquée → la relance mène à « 🔑 Session Telegram à refaire »)
  if node_running && [ -f "$HEARTBEAT" ] &&
    [ "$(file_age "$RUN_DIR/node_started_at")" -gt 300 ] &&
    [ "$(file_age "$HEARTBEAT")" -gt 300 ]; then
    local pid i
    pid=$(node_pid)
    warn "💤 Aucun signe de vie depuis $(fmt_duration "$(file_age "$HEARTBEAT")") — bot figé, relance"
    kill -TERM "$pid" 2>/dev/null
    # On n'achève QUE ce processus-là (le superviseur en relance un nouveau)
    for i in $(seq 1 15); do
      pid_matches "$pid" "index.js" || break
      sleep 1
    done
    pid_matches "$pid" "index.js" && kill -KILL "$pid" 2>/dev/null
  fi
  return 0
}

usage() {
  banner "$C_CYAN" "🤖 Bot Red Packet — commandes"
  cat <<'EOF'
  bot start        ▶️  démarre (continue même Termux fermé)
  bot stop         ⏹️  arrêt propre (ne redémarre plus seul)
  bot restart      🔄 redémarre
  bot status       📊 tableau de bord
  bot logs         📜 logs en direct (--plain : sans couleurs)
  bot login        🔑 connexion Telegram + Binance
  bot vnc          🖥️  adresse et mot de passe de l'écran (AVNC)
  bot update       ⬇️  met à jour le bot
  bot watchdog on  🛡️  relance auto toutes les 15 min (off pour couper)
EOF
}

case "${1:-}" in
start) cmd_start ;;
stop) cmd_stop ;;
restart) cmd_restart ;;
status) cmd_status ;;
logs) cmd_logs "${2:-}" ;;
login) cmd_login ;;
vnc) cmd_vnc ;;
update) cmd_update ;;
watchdog) cmd_watchdog "${2:-on}" ;;
ensure) cmd_ensure ;;
*) usage ;;
esac
