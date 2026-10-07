#!/data/data/com.termux/files/usr/bin/bash
# launch.sh — Point d'entrée de la tâche de fond Termux (lancé par « bot start »)
#
# Démarre le superviseur run.sh DANS Debian. La tâche est rattachée au service
# Termux (notification « 1 task ») et non à une fenêtre : fermer Termux ne
# l'arrête pas. Toute la sortie va dans le log — Termux ne garde rien en
# mémoire, même après des semaines.

SELF=$(readlink -f "$0")
REPO=$(cd "$(dirname "$SELF")/../.." && pwd)
mkdir -p "$REPO/logs"

TZ_ANDROID=$(getprop persist.sys.timezone 2>/dev/null)

exec proot-distro login debian --bind "$REPO:/bot" -- \
  /usr/bin/env TZ="${TZ_ANDROID:-UTC}" /bin/bash /bot/deploy/android/run.sh \
  >>"$REPO/logs/bot.log" 2>&1
