#!/bin/bash
# login.sh — Connexion Telegram puis Binance (« bot login »), DANS Debian/proot
#
# Lance `node index.js --setup` dans le terminal : le code Telegram est tapé
# au clavier, la connexion Binance se fait dans la fenêtre Chromium affichée
# sur l'écran virtuel (app AVNC → 127.0.0.1:5901).

set -u
# shellcheck disable=SC1091
. /bot/deploy/android/lib.sh
android_env
mkdir -p /bot/logs /bot/.run

start_display || die "Écran virtuel indisponible (voir logs/xvnc.log)"
cleanup_browser

cd /bot || die "Dépôt introuvable dans /bot"
/usr/bin/node /bot/index.js --setup
code=$?

stop_display
exit "$code"
