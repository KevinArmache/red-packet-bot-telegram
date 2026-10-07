#!/data/data/com.termux/files/usr/bin/bash
# install.sh — Installation complète du bot Red Packet sur Android (Termux)
#
# Usage :
#   bash ~/red-packet-bot-telegram/deploy/android/install.sh
#   bash …/install.sh --refresh   (commande « bot », widgets et démarrage
#                                  auto seulement — utilisé par « bot update »)
#
# Étapes : téléphone → paquets Termux → Debian → logiciels du bot (Node.js,
# Chromium, écran VNC) → .env → commande « bot », widgets, démarrage auto,
# watchdog → connexion Telegram + Binance.

set -u

SELF=$(readlink -f "$0")
REPO=$(cd "$(dirname "$SELF")/../.." && pwd)
ANDROID_DIR="$REPO/deploy/android"
# shellcheck disable=SC1091
. "$ANDROID_DIR/lib.sh"

ENV_FILE="$REPO/.env"
ANDROID_ENV="$REPO/android.env"

# ─── Morceaux réutilisables ─────────────────────────────────────────────────

write_widget() {
  printf '#!/data/data/com.termux/files/usr/bin/bash\n%s\n' "$2" >"$1"
  chmod 700 "$1"
}

# Commande « bot », démarrage automatique (Termux:Boot) et widgets (Termux:Widget)
install_shortcuts() {
  chmod +x "$ANDROID_DIR"/*.sh

  ln -sf "$ANDROID_DIR/bot.sh" "$PREFIX/bin/bot"

  mkdir -p "$HOME/.termux/boot"
  cat >"$HOME/.termux/boot/red-packet-bot" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
# Démarrage automatique du bot Red Packet (Termux:Boot)
exec "$ANDROID_DIR/boot.sh"
EOF
  chmod 700 "$HOME/.termux/boot/red-packet-bot"

  # tasks/ : s'exécute en arrière-plan, sans ouvrir de terminal
  mkdir -p "$HOME/.shortcuts/tasks"
  write_widget "$HOME/.shortcuts/tasks/1 ▶️ Démarrer le bot" \
    'if bot start; then msg="🚀 Bot démarré — il tourne en arrière-plan"; else msg="❌ Démarrage raté — ouvre 📊 État du bot"; fi; timeout 10 termux-toast "$msg" 2>/dev/null'
  write_widget "$HOME/.shortcuts/tasks/2 ⏹️ Arrêter le bot" \
    'if bot stop; then msg="⏹️ Bot arrêté"; else msg="❌ Arrêt raté — ouvre 📊 État du bot"; fi; timeout 10 termux-toast "$msg" 2>/dev/null'
  write_widget "$HOME/.shortcuts/3 📊 État du bot" \
    'bot status; echo; read -r -p "Entrée pour fermer… " _'
  write_widget "$HOME/.shortcuts/4 📜 Logs du bot" 'bot logs'
  write_widget "$HOME/.shortcuts/5 🔑 Connexion du bot" \
    'bot login; echo; read -r -p "Entrée pour fermer… " _'

  ok "Commande « bot », démarrage automatique et widgets installés"
}

# RUN_COMMAND (tâche de fond Termux) exige allow-external-apps = true
enable_background_tasks() {
  local props="$HOME/.termux/termux.properties"
  mkdir -p "$HOME/.termux"
  touch "$props"
  if ! grep -qE '^[[:space:]]*allow-external-apps[[:space:]]*=[[:space:]]*true' "$props"; then
    sed -i -E '/^[[:space:]]*#?[[:space:]]*allow-external-apps/d' "$props"
    echo 'allow-external-apps = true' >>"$props"
    termux-reload-settings 2>/dev/null || true
  fi
  ok "Tâches de fond Termux autorisées"
}

setup_vnc_password() {
  if [ ! -s "$REPO/.vnc-password" ]; then
    tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c 8 >"$REPO/.vnc-password"
    chmod 600 "$REPO/.vnc-password"
  fi
  ok "Mot de passe de l'écran VNC : ${C_BOLD}$(cat "$REPO/.vnc-password")${C_RESET} (retrouve-le : bot vnc)"
}

write_android_env() {
  [ -f "$ANDROID_ENV" ] && return 0
  cat >"$ANDROID_ENV" <<'EOF'
# android.env — Réglages PROPRES AU TÉLÉPHONE (prioritaires sur .env)
#
# Le même .env que sur le PC fonctionne ici : ce fichier ne contient que ce
# qui change sur le téléphone. Une valeur par ligne : NOM=valeur
# Après une modification : bot restart

# Relais PC ⇄ téléphone :
#   backup = le téléphone réclame seulement quand le PC est absent (défaut)
#   solo   = pas de bot sur le PC : le téléphone réclame toujours
BOT_ROLE=backup

# Facultatif — healthchecks.io : te prévient si le téléphone s'éteint ou
# si le bot ne donne plus signe de vie (voir GUIDE-ANDROID.md)
# HEALTHCHECK_URL=https://hc-ping.com/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Facultatif — dépannage Chromium (voir GUIDE-ANDROID.md)
# CHROMIUM_EXTRA_ARGS="--disable-gpu"
EOF
}

# Importe bot.env depuis Téléchargements, sinon ouvre nano
configure_env() {
  if [ -f "$ENV_FILE" ]; then
    ok ".env déjà présent — conservé"
  else
    local candidates=(/sdcard/Download/bot.env /sdcard/Download/Telegram/bot.env)
    local src="" f

    if [ ! -r /sdcard/Download ]; then
      info "📂 Android va te demander l'accès aux fichiers (pour lire bot.env) — accepte"
      termux-setup-storage 2>/dev/null || true
      read -r -p "   Appuie sur Entrée une fois l'accès autorisé… " _
    fi
    for f in "${candidates[@]}"; do
      if [ -r "$f" ]; then
        src="$f"
        break
      fi
    done

    if [ -n "$src" ]; then
      cp "$src" "$ENV_FILE"
      rm -f "$src"
      ok "bot.env importé (et supprimé de Téléchargements par sécurité)"
    else
      cp "$REPO/.env.example" "$ENV_FILE"
      warn "Aucun bot.env trouvé dans Téléchargements : remplis tes réglages."
      info "   Dans nano : Ctrl+O puis Entrée pour enregistrer, Ctrl+X pour quitter"
      read -r -p "   Appuie sur Entrée pour ouvrir l'éditeur… " _
      nano "$ENV_FILE"
    fi
  fi
  chmod 600 "$ENV_FILE"

  local key missing=""
  for key in API_ID API_HASH PHONE_NUMBER TARGET_CHANNELS; do
    grep -qE "^${key}=.+" "$ENV_FILE" || missing="$missing $key"
  done
  if grep -qE '^API_HASH=abcdef1234567890abcdef1234567890' "$ENV_FILE"; then
    missing="$missing API_HASH(valeur d'exemple)"
  fi
  if [ -n "$missing" ]; then
    warn "À compléter dans .env :$missing → nano $ENV_FILE"
  else
    ok "Identifiants Telegram et canaux présents"
  fi
  if ! grep -qE '^ALERT_BOT_TOKEN=.+' "$ENV_FILE"; then
    warn "ALERT_BOT_TOKEN vide : pas d'alertes. Crée ton bot d'alertes (GUIDE-ANDROID.md, étape 4)"
  fi
}

# ─── Mode --refresh (bot update) ────────────────────────────────────────────

if [ "${1:-}" = "--refresh" ]; then
  install_shortcuts
  enable_background_tasks
  exit 0
fi

# ─── Installation complète ──────────────────────────────────────────────────

banner "$C_CYAN" "🤖 Bot Red Packet — Installation Android" \
  "Durée : 15 à 30 min · environ 1,5 Go à télécharger"

step 1 "Vérification du téléphone"
{ [ -n "${PREFIX:-}" ] && [ -d "$PREFIX" ]; } || die "Lance ce script dans l'app Termux"
arch=$(uname -m)
[ "$arch" = "aarch64" ] || die "Il faut un téléphone 64 bits (aarch64) — le tien : $arch"
ok "Téléphone 64 bits · Android $(getprop ro.build.version.release 2>/dev/null || echo '?')"
free_mb=$(df -m "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')
if [ "${free_mb:-0}" -lt 3000 ]; then
  warn "Seulement ${free_mb:-?} Mo libres — il en faut environ 3 Go"
else
  ok "Espace libre : ${free_mb} Mo"
fi

step 2 "Paquets Termux"
export DEBIAN_FRONTEND=noninteractive
pkg upgrade -y -o Dpkg::Options::=--force-confold ||
  warn "Mise à jour de Termux incomplète — on continue"
pkg install -y -o Dpkg::Options::=--force-confold \
  proot-distro termux-api procps util-linux coreutils curl git nano ||
  die "Installation des paquets Termux impossible (réseau ?)"
ok "Paquets Termux installés"

# Les droits d'exécution posés ici ne doivent pas bloquer « bot update »
git -C "$REPO" config core.fileMode false 2>/dev/null || true

# Réinstallation pendant que le bot tourne : on l'arrête d'abord (node_modules
# et Chromium vont être remplacés), puis on le relance à la fin
WAS_RUNNING=0
if [ -x "$ANDROID_DIR/bot.sh" ] && [ -f "$REPO/.run/run.pid" ] &&
  bash "$ANDROID_DIR/bot.sh" status 2>/dev/null | grep -q "en marche"; then
  WAS_RUNNING=1
  info "⏸️  Le bot tourne : arrêt le temps de la réinstallation"
  bash "$ANDROID_DIR/bot.sh" stop >/dev/null
fi

step 3 "Debian (Linux complet dans Termux)"
if proot-distro login debian -- true >/dev/null 2>&1; then
  ok "Debian déjà installé"
else
  proot-distro install debian || die "Installation de Debian impossible"
  ok "Debian installé"
fi
mkdir -p "$REPO/logs" "$REPO/.run"
write_android_env

step 4 "Logiciels du bot : Node.js, Chromium, écran VNC (10 à 20 min)"
proot-distro login debian --bind "$REPO:/bot" -- /bin/bash /bot/deploy/android/setup-debian.sh ||
  die "Installation dans Debian interrompue — relance la même commande (elle reprend où elle en était)"

step 5 "Tes réglages (.env)"
configure_env

step 6 "Commande « bot », démarrage automatique, widgets, watchdog"
install_shortcuts
enable_background_tasks
setup_vnc_password
bash "$ANDROID_DIR/bot.sh" watchdog on ||
  warn "Watchdog à activer plus tard : installe Termux:API (F-Droid) puis « bot watchdog on »"

step 7 "Terminé 🎉"
banner "$C_GREEN" "🎉 Installation terminée" \
  "1. Connexion : bot login (code Telegram, puis Binance via AVNC)" \
  "2. Ensuite le bot tourne tout seul, même Termux fermé" \
  "3. Réglages Android indispensables : GUIDE-ANDROID.md, étape 8" \
  "Commandes : bot status · bot logs · bot stop · bot start"

echo
if [ "$WAS_RUNNING" -eq 1 ]; then
  info "▶️  Relance du bot (il tournait avant la réinstallation)"
  bash "$ANDROID_DIR/bot.sh" start
  exit 0
fi

read -r -p "Te connecter maintenant à Telegram et Binance ? [O/n] " answer
case "${answer:-o}" in
[nN]*) info "Plus tard : bot login (ou le widget 🔑 Connexion du bot)" ;;
*) bash "$ANDROID_DIR/bot.sh" login ;;
esac
