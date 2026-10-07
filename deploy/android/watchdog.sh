#!/data/data/com.termux/files/usr/bin/bash
# watchdog.sh — Lancé toutes les 15 min par Android (job Termux:API)
#
# Indépendant de Termux : si Android a tué Termux, si tu as appuyé sur
# « Exit » dans sa notification, ou si le bot est figé, il le relance.
# Silencieux quand tout va bien (rien n'est écrit dans les logs).

SELF=$(readlink -f "$0")
REPO=$(cd "$(dirname "$SELF")/../.." && pwd)

mkdir -p "$REPO/logs"
exec "$REPO/deploy/android/bot.sh" ensure >>"$REPO/logs/bot.log" 2>&1
