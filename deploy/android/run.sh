#!/bin/bash
# run.sh — Superviseur du bot sur Android (exécuté DANS Debian/proot)
#
# Lancé par « bot start » comme TÂCHE DE FOND Termux (voir launch.sh) :
#   • une seule instance (flock), PID dans .run/ ;
#   • écran virtuel Xvnc :1 (VNC local, mot de passe) pour Chromium ;
#   • bot en priorité basse (nice 10) : le téléphone reste fluide ;
#   • relance automatique : 10 s, puis attente doublée jusqu'à 10 min ;
#     code 78 (session Telegram à refaire) = nouvel essai dans 30 min ;
#   • s'arrête UNIQUEMENT si le fichier .stop existe (« bot stop »).

set -u

BOT_DIR=/bot
RUN_DIR=$BOT_DIR/.run
LOG_DIR=$BOT_DIR/logs
LOG_FILE=$LOG_DIR/bot.log
STOP_FLAG=$BOT_DIR/.stop
MAX_LOG_BYTES=5242880
mkdir -p "$RUN_DIR" "$LOG_DIR"

# shellcheck disable=SC1091
. "$BOT_DIR/deploy/android/lib.sh"
android_env
export BOT_UNATTENDED=1
export BOT_HEARTBEAT_FILE=$RUN_DIR/heartbeat

# Toute la sortie va dans le fichier de log, couleurs comprises : Termux ne
# garde rien en mémoire, et « bot logs » montre exactement la console.
exec >>"$LOG_FILE" 2>&1

# Une seule instance, même si « bot start » est lancé deux fois
exec 9>"$RUN_DIR/run.lock"
if ! flock -n 9; then
  info "Superviseur déjà en marche — rien à faire"
  exit 0
fi
echo $$ >"$RUN_DIR/run.pid"
date +%s >"$RUN_DIR/started_at"

node_pid=""
on_term() {
  touch "$STOP_FLAG"
  [ -n "$node_pid" ] && kill -TERM "$node_pid" 2>/dev/null
}
trap on_term TERM INT HUP

# Archive le log à 5 Mo sans couper le bot (copie puis remise à zéro)
rotate_log_if_big() {
  local size
  size=$(stat -c %s "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$size" -gt "$MAX_LOG_BYTES" ]; then
    cp -f "$LOG_FILE" "$LOG_FILE.1" && : >"$LOG_FILE"
    info "🗂️  Log archivé dans logs/bot.log.1 (5 Mo atteints)"
  fi
}

# Attente interruptible par « bot stop »
sleep_unless_stopped() {
  local remaining=$1
  while [ "$remaining" -gt 0 ] && [ ! -f "$STOP_FLAG" ]; do
    sleep 5 &
    wait $!
    remaining=$((remaining - 5))
  done
}

banner "$C_CYAN" "🛡️  Superviseur Android démarré" \
  "Rôle : $BOT_ROLE · arrêt : widget ⏹️ ou « bot stop »"

# Archivage du log en arrière-plan, sans jamais couper le bot
# (exec 9>&- : ce processus ne garde pas le verrou d'instance unique)
(
  exec 9>&-
  while sleep 60; do rotate_log_if_big; done
) &
ROTATOR_PID=$!

delay=10
last_exit=0

# Le bot lit .env et écrit son historique dans son propre dossier
cd "$BOT_DIR" || exit 1

while [ ! -f "$STOP_FLAG" ]; do
  start_display || warn "Écran virtuel indisponible — Chromium risque de ne pas démarrer"
  cleanup_browser
  rotate_log_if_big

  started=$(date +%s)
  BOT_LAST_EXIT_CODE=$last_exit nice -n 10 /usr/bin/node "$BOT_DIR/index.js" &
  node_pid=$!
  echo "$node_pid" >"$RUN_DIR/node.pid"
  date +%s >"$RUN_DIR/node_started_at"

  # « wait » est interrompu par un signal (bot stop) : on attend la vraie fin
  while :; do
    wait "$node_pid"
    code=$?
    kill -0 "$node_pid" 2>/dev/null || break
  done
  node_pid=""
  rm -f "$RUN_DIR/node.pid"

  [ -f "$STOP_FLAG" ] && break

  ran=$(($(date +%s) - started))

  if [ "$code" -eq 78 ]; then
    warn "🔑 Session Telegram à refaire : lance « bot login » (widget 🔑). Nouvel essai dans 30 min."
    last_exit=78
    sleep_unless_stopped 1800
    continue
  fi

  [ "$ran" -ge 300 ] && delay=10
  warn "♻️  Le bot s'est arrêté (code $code, après $(fmt_duration "$ran")) — relance dans ${delay} s"
  last_exit=$code
  sleep_unless_stopped "$delay"
  delay=$((delay * 2))
  [ "$delay" -gt 600 ] && delay=600
done

info "⏹️  Arrêt demandé — superviseur terminé"
kill "$ROTATOR_PID" 2>/dev/null
stop_display
rm -f "$RUN_DIR/run.pid" "$RUN_DIR/started_at"
