#!/data/data/com.termux/files/usr/bin/bash
# boot.sh — Lancé par Termux:Boot à chaque démarrage du téléphone
#
# ⚠️ Android ne lance Termux:Boot qu'après le PREMIER DÉVERROUILLAGE qui suit
#    l'allumage (sauf si le téléphone n'a pas de verrouillage d'écran).

SELF=$(readlink -f "$0")
REPO=$(cd "$(dirname "$SELF")/../.." && pwd)
# shellcheck disable=SC1091
. "$REPO/deploy/android/lib.sh"

mkdir -p "$REPO/logs"
exec >>"$REPO/logs/bot.log" 2>&1

if [ -f "$REPO/.stop" ]; then
  info "📱 Téléphone démarré — bot laissé à l'arrêt (arrêté par toi : bot start pour le relancer)"
  exit 0
fi

# Empêche la mise en veille profonde du processeur tant que le bot tourne
termux-wake-lock 2>/dev/null || true

info "📱 Téléphone démarré (Termux:Boot) — attente du réseau…"

# Le réseau met parfois une minute à revenir après l'allumage (2 min max)
for _ in $(seq 1 24); do
  curl -fsS -m 5 -o /dev/null https://api.telegram.org 2>/dev/null && break
  sleep 5
done

exec "$REPO/deploy/android/bot.sh" ensure
