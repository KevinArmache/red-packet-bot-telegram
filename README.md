# 🧧 Red Packet Bot — Cryptobox Telegram × Binance

> Bot personnel en Node.js. Il surveille des canaux Telegram en temps réel et réclame tout seul les codes **Cryptobox (Red Packets)** sur Binance, avec Playwright. Il tourne sur ton PC, et peut tourner 24 h/24 sur un téléphone Android qui prend le relais.

**Trois règles absolues**, gravées dans le code :

- ⛔ **Zéro retry** — un code n'est soumis **qu'une seule fois**. S'il échoue, on passe au suivant. Jamais de nouvelle tentative.
- ⏮️ **Zéro rattrapage** — aucun code publié **avant** le lancement du bot n'est réclamé. Le bot ne traite que le direct.
- 🎯 **Zéro raté** — texte, légendes, **boutons inline**, **liens masqués**, blocs `monospace`, aperçus de lien et **messages édités** : tout est analysé.

> [!IMPORTANT]
> 📱 **Le bot 24 h/24 sur ton téléphone Android ?** Suis le guide pas à pas : **[GUIDE-ANDROID.md](GUIDE-ANDROID.md)**.

## Sommaire

- [✨ Fonctionnalités](#-fonctionnalités)
- [🚀 Démarrage rapide (PC)](#-démarrage-rapide-pc)
- [📱 Android 24/7](#-android-247)
- [🤝 Relais PC ⇄ téléphone](#-relais-pc--téléphone)
- [🔔 Alertes Telegram](#-alertes-telegram)
- [🔧 Configuration (.env)](#-configuration-env)
- [📊 Logs et bilan](#-logs-et-bilan)
- [🎯 Comment les codes sont détectés](#-comment-les-codes-sont-détectés)
- [📡 Tenir 100+ canaux](#-tenir-100-canaux)
- [🔐 Protections intégrées](#-protections-intégrées)
- [🧭 Sélecteurs Playwright](#-sélecteurs-playwright)
- [📁 Structure du projet](#-structure-du-projet)
- [🌐 Déploiement sur un VPS](#-déploiement-sur-un-vps)
- [🔒 Sécurité](#-sécurité)
- [🐛 Dépannage](#-dépannage)

---

## ✨ Fonctionnalités

- **⚡ Détection instantanée** — chaque message est analysé dès qu'il arrive, sans délai artificiel ni attente sur le chemin critique.
- **🎯 Toutes les surfaces d'un message** — texte, légendes, boutons inline, liens masqués, blocs `monospace`, aperçus de lien, messages édités.
- **📡 100+ canaux sans angle mort** — écoute active avant même la résolution des canaux, résolution groupée, canaux adoptés à la volée, groupes de discussion liés.
- **🛡️ Protections anti-ban** — une seule soumission par code, un code à la fois, anti-doublons 48 h, pauses automatiques de 5 h ou 2 h, navigateur furtif, session Binance expirée détectée sans jamais taper un code au mauvais endroit.
- **🔔 Alertes qui sonnent vraiment** — via ton propre bot Telegram (@BotFather) : gains, reconnexions à faire, pauses, plantages, bilan quotidien.
- **🤝 Relais PC ⇄ téléphone** — le PC a la priorité, le téléphone prend le relais dès que le PC s'arrête. Un seul appareil réclame à la fois, pour ne pas soumettre deux fois le même code.
- **📱 Android 24/7** — installation en 3 commandes dans Termux, widgets sur l'écran d'accueil, relance automatique (plantage, redémarrage du téléphone, watchdog), faible impact sur le téléphone.
- **♻️ Robuste** — Chromium relancé tout seul s'il plante, reconnexion Telegram automatique, arrêt propre avec `Ctrl+C`.
- **📊 Logs lisibles** — heure locale, niveaux alignés et colorés, bilan d'activité périodique.

---

## 🚀 Démarrage rapide (PC)

### 1. Prérequis

- **Node.js 24** recommandé (**20 minimum** : la base SQLite de la session Telegram l'exige). Vérifie avec `node --version`.
- **Git**.
- Un compte **Telegram** (idéalement un numéro secondaire, voir [Sécurité](#-sécurité)) et un compte **Binance**.

> [!NOTE]
> Le bot utilise **ton compte Telegram** (un « userbot »), pas un bot @BotFather. Il lui faut donc des identifiants API Telegram. Le bot @BotFather sert seulement aux [alertes](#-alertes-telegram).

### 2. Récupérer le projet

```bash
git clone https://github.com/KevinArmache/red-packet-bot-telegram
cd red-packet-bot-telegram
```

### 3. Identifiants API Telegram

1. Ouvre [my.telegram.org](https://my.telegram.org) et connecte-toi avec le numéro du compte qui servira au bot.
2. Clique sur **API development tools**.
3. Remplis le formulaire : **App title** `CryptoboxBot`, **Short name** `cryptoboxbot`, **Platform** `Other`.
4. Clique sur **Create application**.
5. Note **App api_id** (ce sera `API_ID`) et **App api_hash** (ce sera `API_HASH`).

### 4. Fichier `.env`

```bash
cp .env.example .env
```

(La même commande marche dans PowerShell sous Windows.)

Ouvre `.env` et remplis au minimum :

```env
API_ID=12345678
API_HASH=abcdef1234567890abcdef1234567890
PHONE_NUMBER=+33612345678
TARGET_CHANNELS=@canal1,@canal2,-1001234567890
```

- `PHONE_NUMBER` : format international (`+243…` pour la RDC, `+33…` pour la France).
- `TARGET_CHANNELS` : `@pseudo`, `https://t.me/pseudo` ou un ID `-100…`, séparés par des virgules. Tu peux en mettre 100 et plus. Le compte doit être **abonné** à chaque canal : Telegram ne lui envoie que les messages des canaux qu'il a rejoints.
- **ID d'un canal privé** : ouvre le canal dans Telegram Web (`web.telegram.org/a/`). L'adresse ressemble à `https://web.telegram.org/a/#-1001234567890` : l'ID est `-1001234567890`. Si elle affiche `#-1234567890` (sans le `100`, par exemple dans la version `/k/`), ajoute `100` juste après le signe moins : sans le `-100`, le canal ne serait pas écouté.
- Les alertes se règlent dans le même fichier : voir [Alertes Telegram](#-alertes-telegram). Toutes les variables : [Configuration](#-configuration-env).

### 5. Installer

```bash
npm install
npx playwright install chromium
```

Le téléchargement de Chromium ne se fait qu'une fois.

### 6. Lancer

```bash
npm start
```

**Premier lancement, dans cet ordre :**

1. **Binance.** Une fenêtre Chromium s'ouvre sur la page Cryptobox. Si tu n'es pas connecté, le bot affiche :

   ```
   [07/10 21:31:08] ⚠️  WARN — ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                                 🔑 Connectez-vous manuellement à Binance dans le navigateur
                                 💻 Dans la fenêtre Chromium ouverte par le bot
                                 ⏱️ Timeout : 5 minutes
                               ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

   Connecte-toi dans cette fenêtre (e-mail, mot de passe, 2FA Binance). Tu as 5 minutes (`BINANCE_LOGIN_TIMEOUT`). Le bot détecte la connexion et garde la session dans `browser-data/`. Déjà connecté ? Il passe directement à l'étape suivante.
2. **Telegram.** Le terminal demande `📱 Code Telegram :`. Tape le code reçu dans l'app Telegram (ou par SMS). Si tu as activé la 2FA Telegram, il demande aussi `🔐 Mot de passe 2FA :`. La session est gardée dans `client.session` : on ne te redemandera plus le code.

Ensuite, le bot affiche `🟢 Bot opérationnel — En attente des Red Packets`. Laisse la fenêtre Chromium ouverte : c'est elle qui réclame les codes. Si tu la fermes, le bot la relance.

### Lancements suivants

`npm start` démarre directement, sans rien redemander.

> ⏮️ **À chaque démarrage, le compteur repart de zéro.** Les codes publiés pendant que le bot était éteint ne sont **jamais** réclamés : ils sont déjà épuisés, et les soumettre brûlerait le compteur anti-fraude Binance.

**Arrêter :** `Ctrl+C`. C'est un arrêt propre : le bot prévient le téléphone (qui reprend aussitôt la main, si tu as le [relais](#-relais-pc--téléphone)), termine les codes déjà en file (15 s maximum), affiche le `📊 Bilan final` et ferme le navigateur.

---

## 📱 Android 24/7

> [!TIP]
> 📖 **Le guide complet est ici : [GUIDE-ANDROID.md](GUIDE-ANDROID.md)** — applis, bot d'alertes, installation, connexion, réglages Android, logs, dépannage. Cette section n'en est qu'un résumé.

Le bot tourne aussi sur un téléphone Android, 24 h/24. Playwright ne démarre pas directement sous Android : le kit `deploy/android/` installe donc un **Debian** (avec `proot-distro`) dans **Termux**, et un **écran virtuel** (Xvnc) pour Chromium. Le code et les sélecteurs sont les mêmes que sur le PC.

### Ce qu'il te faut

- Un téléphone **64 bits** (`uname -m` affiche `aarch64`), **Android 7 ou plus** (10 ou plus conseillé), **4 Go de RAM** conseillés, **environ 3 Go libres**, un **Wi-Fi stable**.
- Ces applis, **toutes depuis F-Droid** (les applis Termux doivent toutes venir de la même source) :
  - **Termux** ;
  - **Termux:Boot** — ouvre-la une fois après l'installation ;
  - **Termux:Widget** ;
  - **Termux:API** — pour le watchdog et les petits messages de confirmation ;
  - **AVNC** (F-Droid ou Play Store) — pour voir l'écran du bot.
- ⚠️ **N'utilise pas le Termux du Play Store.**

### Installation en 3 commandes

Dans Termux :

```bash
pkg update -y && pkg install -y git
git clone https://github.com/KevinArmache/red-packet-bot-telegram ~/red-packet-bot-telegram
bash ~/red-packet-bot-telegram/deploy/android/install.sh
```

Compte 15 à 30 min (environ 1,5 Go à télécharger). L'installation se fait en 7 étapes :

1. Vérification du téléphone (64 bits, environ 3 Go libres).
2. Paquets Termux.
3. Debian, avec `proot-distro`.
4. Logiciels du bot dans Debian : écran virtuel TigerVNC, Node.js 24, `npm ci`, Chromium de Playwright (ou celui de Debian en secours), puis un test de Chromium.
5. Tes réglages : import de `bot.env` (voir ci-dessous), sinon `nano` s'ouvre sur une copie de `.env.example`. Si Android demande l'accès aux fichiers, accepte. Un `.env` déjà présent sur le téléphone est gardé.
6. Commande `bot`, démarrage automatique (Termux:Boot), widgets, tâches de fond autorisées (`allow-external-apps`), mot de passe de l'écran VNC, watchdog.
7. Fin : l'installation te propose de lancer `bot login` tout de suite.

Installation interrompue (réseau, appel…) ? **Relance la même commande** : elle reprend où elle en était.

> [!TIP]
> **Le même `.env` que sur le PC.** Copie ton `.env` hors du dossier du projet (sur le Bureau, par exemple) et nomme la copie `bot.env`. Envoie-la dans tes **Messages enregistrés** Telegram. Sur le téléphone, touche-la pour la télécharger, puis son menu **⋮** → **« Enregistrer dans les téléchargements »** : elle arrive dans `Download/Telegram`. L'installation la cherche dans `Download/` puis `Download/Telegram/`, l'importe et **la supprime**. Ensuite, **supprime le message** dans tes Messages enregistrés et la copie sur le PC : ce fichier contient tes secrets. Les réglages propres au téléphone (`BOT_ROLE=backup`…) sont posés automatiquement : tu n'as rien à changer.

### Se connecter : `bot login`

S'il tournait, le bot est mis en pause pendant la connexion.

1. Le code Telegram se tape **dans Termux** (seulement s'il est demandé), puis ton mot de passe 2FA Telegram si tu en as un.
2. La connexion Binance se fait dans le Chromium du bot, affiché sur l'écran virtuel : ouvre **AVNC** → ➕ → adresse **`127.0.0.1`**, port **`5901`**, mot de passe affiché au début de `bot login`, et à tout moment avec **`bot vnc`** (8 caractères, gardé dans `.vnc-password`). L'écran fait 1280×1024.
3. Le bot attend ta connexion Binance **sans limite de temps**.
4. À la fin, une **alerte de test** 🔔 est envoyée (si les [alertes](#-alertes-telegram) sont réglées), puis le bot démarre.

Si la connexion échoue, le bot n'est relancé que s'il tournait avant : relance `bot login`.

### Au quotidien

Les commandes, dans Termux :

- `bot start` ▶️ — démarre le bot en arrière-plan (il continue même Termux fermé)
- `bot stop` ⏹️ — arrêt propre ; il ne redémarre plus tout seul
- `bot restart` 🔄 — redémarre
- `bot status` 📊 — tableau de bord
- `bot logs` 📜 — logs en direct, en couleurs (`bot logs --plain` : sans couleurs). `Ctrl+C` ferme l'affichage, pas le bot
- `bot login` 🔑 — connexion Telegram puis Binance
- `bot vnc` 🖥️ — adresse et mot de passe de l'écran du bot (AVNC)
- `bot update` ⬇️ — met à jour le bot (`git pull`, dépendances, raccourcis), puis le relance s'il tournait
- `bot watchdog on` / `bot watchdog off` 🛡️ — relance automatique toutes les 15 min

Les widgets (Termux:Widget), sur l'écran d'accueil :

- **1 ▶️ Démarrer le bot** et **2 ⏹️ Arrêter le bot** — s'exécutent en arrière-plan, avec un petit message de confirmation ;
- **3 📊 État du bot**, **4 📜 Logs du bot**, **5 🔑 Connexion du bot** — ouvrent un terminal.

Exemple de `bot status`, téléphone en veille pendant que le PC tourne :

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🤖 Bot Red Packet — État
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ⚙️  Bot          🟢 en marche depuis 3h07m
  🤝 Relais       😴 relais — en veille (le PC réclame)
  🌐 Navigateur   😴 fermé (mémoire libérée)
  🎁 Codes        12 détecté(s) · 0 gagné(s)
  💓 Signe de vie il y a 24s
  🧠 Mémoire      bot 96 Mo · Chromium 0 Mo
  🔥 CPU          1 % (moyenne depuis le lancement)
  🛡️  Watchdog     activé (vérification toutes les 15 min)
```

Suivent les 8 dernières lignes du log.

### Une fois lancé, il ne s'arrête jamais

- **Tâche de fond Termux + wake lock.** Le bot n'est lié à aucune fenêtre : fermer Termux, ou le retirer des applis récentes, ne l'arrête pas. La notification Termux indique une tâche (« task ») en cours.
- **Superviseur.** Si le bot s'arrête, il est relancé après 10 s, puis l'attente double à chaque nouvel arrêt, jusqu'à 10 min (retour à 10 s si le bot a tenu 5 min). Code de sortie 78 (connexion Telegram à refaire) : nouvel essai toutes les 30 min, et l'alerte 🔑 te prévient.
- **Termux:Boot.** Il relance le bot quand le téléphone redémarre.
- **Watchdog Termux:API**, toutes les 15 min, indépendant de Termux. Il relance le bot si Android a tué Termux, si tu as appuyé sur « Exit » dans la notification Termux, ou si le bot est figé (aucun signe de vie depuis 5 min).

**Seul `bot stop` (ou le widget ⏹️) l'arrête durablement.** Il crée un fichier `.stop`, que le démarrage automatique et le watchdog respectent jusqu'au prochain `bot start` (ou ▶️).

### Léger pour le téléphone

- Le bot tourne en **priorité basse** (`nice 10`) : le téléphone reste fluide.
- Quand le PC est actif, le téléphone est **en veille** : il laisse les codes au PC et **ferme Chromium après 2 min** (mémoire libérée). Il le rouvre quand il reprend le relais.
- Toute la sortie va dans `logs/bot.log` : Termux ne garde rien en mémoire, même après des semaines. Le fichier est archivé dans `logs/bot.log.1` quand il atteint 5 Mo.

### Réglages Android indispensables

Sans eux, Android finira par couper le bot. Le détail, marque par marque, est à l'**étape 8 du [guide](GUIDE-ANDROID.md)**.

- Batterie **« Sans restriction »** (ou « Non optimisée ») pour **Termux**, **Termux:API** et **Termux:Boot**.
- **Verrouille Termux** dans les applis récentes.
- Laisse le téléphone **en charge**, idéalement avec une limite de charge (par exemple « Protéger la batterie » chez Samsung).
- N'appuie **jamais** sur **« Exit »** dans la notification Termux.
- **Phantom process killer** (Android 12 et plus) :
  - Android 14 et plus : **Options pour les développeurs** → **« Désactiver les restrictions des processus enfants »** (en anglais : *Disable child process restrictions*) ;
  - Android 12 et 13 : avec ADB (voir ci-dessous).
- Réglages de la marque : **Tecno / Infinix / itel** (HiOS / XOS : liste blanche du nettoyage automatique de Phone Master, gestion du démarrage automatique, économie d'énergie), **Samsung** (Batterie → Limites d'utilisation en arrière-plan → Applications jamais en veille), **Xiaomi / Redmi / POCO** (démarrage automatique, économiseur de batterie sans restriction, verrouillage dans les récentes). Voir aussi [dontkillmyapp.com](https://dontkillmyapp.com).
- Facultatif : **[healthchecks.io](https://healthchecks.io)**, pour être prévenu si le téléphone lui-même s'éteint. Crée un check gratuit avec une période de 5 min, mets son adresse de ping dans `HEALTHCHECK_URL` (fichier `android.env`) et active son intégration Telegram.

<details>
<summary><b>Android 12 / 13 : couper le phantom process killer avec ADB</b></summary>

Depuis un PC qui a ADB, ou depuis le téléphone lui-même :

1. Dans Termux : `pkg install android-tools`.
2. **Options pour les développeurs** → **Débogage sans fil** : active-le, puis **Associer l'appareil avec un code d'association**. Mets les Paramètres et Termux en écran partagé.
3. Dans Termux : `adb pair 127.0.0.1:PORT CODE`, avec le port et le code de la fenêtre d'association.
4. Puis `adb connect 127.0.0.1:PORT`, avec le port affiché sur l'écran principal du Débogage sans fil (il est différent du précédent).
5. Enfin :

```bash
adb shell "/system/bin/device_config set_sync_disabled_for_tests persistent; /system/bin/device_config put activity_manager max_phantom_processes 2147483647"
```

Sur Android 12L et 13, ajoute :

```bash
adb shell settings put global settings_enable_monitor_phantom_procs false
```

</details>

### Limites, en toute honnêteté

- Sous `proot`, les réclamations sont **plus lentes que sur le PC**. C'est pour ça que le PC a la priorité.
- Les sessions Binance **expirent de temps en temps** : tu reçois l'alerte 🔑 et tu te reconnectes avec AVNC.
- Après un redémarrage, si le téléphone a un verrouillage d'écran, le bot ne repart **qu'après le premier déverrouillage**.

---

## 🤝 Relais PC ⇄ téléphone

Le PC et le téléphone utilisent **le même compte Binance**. S'ils réclamaient tous les deux, chaque code serait soumis deux fois, et la deuxième soumission brûlerait une tentative du compteur anti-fraude. Le relais fait en sorte qu'**un seul appareil réclame à la fois**. Il reste un court chevauchement possible : quand le PC démarre (ou retrouve Internet) alors que le téléphone a pris le relais, les deux peuvent réclamer pendant quelques secondes, le temps que le PC publie son état.

**Les rôles** (`BOT_ROLE`) :

- `primary` (défaut) — le **PC prioritaire** ;
- `backup` — le **téléphone de secours**. Le kit Android le règle tout seul ;
- `solo` — un seul appareil, sans coordination. Par exemple un téléphone sans bot sur le PC : `BOT_ROLE=solo` dans `android.env`.

**Comment ils se parlent.** Le PC garde **un seul message d'état**, silencieux, dans tes **Messages enregistrés** Telegram. Il le modifie toutes les 60 s, et tout de suite quand son état change :

```
🤖 Relais Red Packet — 💻 PC
🟢 actif · Le téléphone reste en veille.
Dernier signal : 21:31:16

#botrelay role=primary state=active pause=0 inst=3f9a1c2e
```

> [!WARNING]
> **Ne supprime pas et ne modifie pas ce message.** S'il disparaît, le PC en recrée un (il le remplace aussi par un neuf chaque jour).

**Qui réclame ?**

- PC **🟢 actif** → le téléphone reste **en veille**.
- PC **🛑 en pause anti-ban** → le téléphone reste aussi en veille : même compte Binance, personne ne réclame.
- PC **🟠 indisponible** (connexion Binance à refaire, navigateur en cours de lancement ou de relance) → le téléphone **prend le relais**.
- PC **⏹️ arrêté** (`Ctrl+C`) → le téléphone prend le relais **tout de suite** (il réclame dès que son Chromium est prêt).
- PC **muet depuis plus de 150 s** (éteint, planté, sans Internet) → le téléphone prend le relais, environ 2 min 30 après.

Dès que le PC redevient actif, le téléphone repasse en veille.

**En veille, le téléphone :**

- voit passer les codes mais les **laisse au PC**. Il les mémorise : il ne les tentera jamais plus tard ;
- **ferme Chromium après 2 min** de veille (mémoire libérée), et le rouvre quand il reprend le relais.

```
[07/10 21:40:02] 📘 INFO  — 😴 Relais : téléphone en veille — le PC est actif
[07/10 21:41:37] ✅ OK    — 🎁 Code trouvé : 7KD2PQ9X — depuis @binance_box_channel
[07/10 21:41:37] 📘 INFO  — 😴 Code 7KD2PQ9X laissé au PC (téléphone en veille)
[07/10 23:15:20] ✅ OK    — 📱 Relais : le téléphone prend la main — le PC s'est arrêté
```

**Pause anti-ban partagée.** La limite Binance concerne le compte, pas l'appareil. L'appareil qui déclenche une pause la publie, l'autre la respecte : `🛑 Pause anti-ban partagée par le PC — aucun code jusqu'à 19:02`.

**Deux appareils en `primary` ?** Chacun réclamerait chaque code. Le bot l'écrit en rouge dans les logs et t'envoie une alerte ⚠️. Un seul `primary` !

**Ordre de démarrage :**

- `primary` et `solo` : navigateur Binance, puis Telegram, puis relais ;
- `backup` : Telegram et relais d'abord ; le navigateur seulement quand le téléphone prend le relais.

> 💡 Pas de bot sur le téléphone ? Mets `BOT_ROLE=solo` sur le PC : il ne publie alors aucun message de relais.

---

## 🔔 Alertes Telegram

Un message que tu t'envoies dans tes Messages enregistrés **ne sonne jamais**. Les alertes passent donc par **ton propre bot**, créé avec @BotFather. Ce sont de vraies notifications, et elles partent même si la session Telegram du bot est cassée. Ton compte, lui, reste passif.

### Créer ton bot d'alertes (2 minutes)

1. Dans Telegram, ouvre **@BotFather** et envoie `/newbot`.
2. Donne-lui un nom, puis un identifiant qui finit par `bot`.
3. BotFather te donne un **jeton**. Colle-le dans `.env` : `ALERT_BOT_TOKEN=…`
4. Choisis le niveau : `NOTIFY_LEVEL=all` (ou `problems`).
5. Ouvre ton nouveau bot et envoie-lui **`/start`**, une seule fois. Sans ça, Telegram lui interdit de t'écrire.
6. Relance le bot. Au démarrage, cette ligne confirme : `🔔 Alertes : activées — problèmes + gains, via ton bot Telegram`.

**Tester :** sur le téléphone, `bot login` se termine par une alerte 🔔 de test. Sur le PC, bot arrêté, `node index.js --setup` fait pareil : connexion Telegram, puis Binance, puis l'alerte de test (le message final parle du widget ▶️ : sur le PC, relance simplement `npm start`).

- **Destinataire** : toi, par défaut. Ton identifiant est appris à la connexion Telegram et gardé dans `.alert-chat-id`. `ALERT_CHAT_ID` permet d'en choisir un autre.
- **Préfixe** : chaque alerte commence par `💻 PC ·` ou `📱 Téléphone ·` (à changer avec `BOT_NAME`). Exemple : `📱 Téléphone · 💰 Gagné ! Code 92J5LXPM → 0.00000005 BNB (@vgfboxes)`.
- **Niveaux** (`NOTIFY_LEVEL`) : `off` (défaut si la ligne manque ou si la valeur est inconnue), `problems` (les problèmes seulement), `all` (problèmes, gains et infos).
- **Pas de spam** : les alertes qui peuvent se répéter ont un délai minimum entre deux envois (indiqué ci-dessous ; les gains et le bilan n'en ont pas). Il est retenu dans `.run/alerts.json`, même si le bot redémarre en boucle.

### Toutes les alertes, et quoi faire

**Problèmes** — envoyées avec `problems` et `all` :

- **🔑 « Binance demande une reconnexion… »** — 1 toutes les 3 h au plus.\
  → PC : connecte-toi dans la fenêtre Chromium du bot. Téléphone : AVNC → `127.0.0.1:5901` (mot de passe : `bot vnc`). En attendant, les codes sont ignorés sans brûler de tentative. Si c'est le PC, le téléphone prend le relais.
- **✅ « Session Binance rétablie — les codes sont de nouveau réclamés. »** — 1 toutes les 10 min au plus.\
  → Rien à faire.
- **🔑 « Session Telegram expirée : ouvre Termux et lance « bot login »… »** — 1 toutes les 3 h au plus.\
  → `bot login`, ou le widget 🔑. En attendant, le superviseur réessaie toutes les 30 min. Cette alerte n'existe qu'en mode sans surveillance (téléphone, ou serveur avec `BOT_UNATTENDED=1`).
- **🛑 « Limite Binance atteinte — pause anti-ban jusqu'à HH:MM… »** — 1 par heure au plus.\
  → Rien : la pause (5 h ou 2 h) est automatique et partagée avec l'autre appareil. Si ça revient souvent, retire des canaux peu rentables.
- **🌐 « Chromium s'est fermé — relance automatique du navigateur… »** (ou « l'onglet Binance a planté… ») — 1 toutes les 10 min au plus.\
  → Rien : le navigateur est relancé tout seul. Au-delà de 3 plantages en 10 min, le bot s'arrête (alerte 💥).
- **💥 « Chromium plante en boucle… », « navigateur impossible à (re)lancer… » ou « Erreur fatale : … »** — 1 toutes les 15 min au plus, pour l'ensemble.\
  → Téléphone (ou serveur supervisé) : le bot redémarre tout seul. PC : relance `npm start`. Si ça se répète, lis les logs.
- **♻️ « Bot relancé après un arrêt inattendu (code N). »** (téléphone) — 1 toutes les 15 min au plus.\
  → Rien. Si ça arrive souvent, regarde `bot logs`.
- **⚠️ « Page Cryptobox inaccessible : un code n'a pas pu être tenté… »** — 1 toutes les 3 h au plus.\
  → Si ça se répète, vérifie la fenêtre Binance du bot (session, page bloquée).
- **⚠️ « Deux appareils se déclarent « PC prioritaire »… »** — 1 toutes les 3 h au plus.\
  → Un seul `primary` : sur le téléphone, `BOT_ROLE` doit valoir `backup` (c'est le cas par défaut, vérifie `android.env`).

**Infos** — envoyées seulement avec `all` :

- **💰 « Gagné ! Code X → montant (canal) »** — à chaque gain.
- **🟢 « Bot en ligne. »** — au démarrage (1 toutes les 10 min au plus). Sur le téléphone, avec son mode : actif ou en veille.
- **📱 « Le téléphone prend le relais : … »** et **😴 « Téléphone en veille : … »** — à chaque changement, sauf au démarrage où l'alerte 🟢 suffit (1 toutes les 5 min au plus).
- **📊 « Bilan (en ligne depuis …) : N code(s) détecté(s), N gagné(s), N échec(s). »** — chaque jour à minuit. C'est aussi un **signe de vie** : pas de bilan, c'est qu'il y a un problème.

**Test** : **🔔 « Test : si tu lis ce message, les alertes du bot fonctionnent. »** — à la fin de `bot login` (ou de `node index.js --setup`).

---

## 🔧 Configuration (.env)

Le modèle commenté est [`.env.example`](.env.example). **Le même `.env` marche sur le PC et sur le téléphone** : le kit Android pose lui-même ce qui change sur le téléphone (voir la fin de cette section).

### Obligatoires

- **`API_ID`** — numéro de ton application Telegram ([my.telegram.org](https://my.telegram.org)).
- **`API_HASH`** — clé de ton application Telegram.
- **`PHONE_NUMBER`** — numéro du compte Telegram, au format international (`+33612345678`).
- **`TARGET_CHANNELS`** — canaux à surveiller, séparés par des virgules : `@pseudo`, `https://t.me/pseudo` ou un ID `-1001234567890`.

S'il en manque une, le bot s'arrête tout de suite avec `🔑 Variables manquantes dans .env`.

### Détection et logs

- **`MAX_MESSAGE_AGE_S`** — défaut `180`. Un message **livré en retard** (après une coupure réseau) au-delà de ce délai, en secondes, est ignoré : son Red Packet est déjà vidé, et le soumettre brûlerait une tentative pour rien. `0` = désactivé. Ce réglage ne sert **pas** à récupérer d'anciens codes : la règle « zéro rattrapage » s'applique toujours d'abord.
- **`RESOLVE_LINKED_CHATS`** — défaut `true`. Explore aussi les groupes de commentaires liés aux canaux (certains y publient les codes). `false` = les ignorer.
- **`STATS_INTERVAL_MIN`** — défaut `30`. Fréquence du tableau `📊 Bilan d'activité`, en minutes. `0` = pas de bilan périodique (ceux de minuit et de l'arrêt restent).
- **`DEBUG`** — défaut `false`. `true` affiche le niveau `🔍 DEBUG` : messages reçus, messages ignorés et pourquoi (antérieurs au démarrage, périmés), alertes envoyées.
- **`NO_COLOR`** — absente par défaut. Toute valeur non vide (par exemple `1`) coupe les couleurs, même avec `FORCE_COLOR=1`. Elles sont déjà coupées toutes seules quand la sortie n'est pas un terminal.
- **`LOG_WIDTH`** — défaut `64` (`48` sur le téléphone). Largeur minimale des encadrés et des tableaux, de 32 à 120 colonnes.

### Relais et alertes

- **`BOT_ROLE`** — défaut `primary`. `primary` (PC prioritaire), `backup` (téléphone de secours), `solo` (un seul appareil, pas de relais). Une valeur inconnue vaut `primary`. Voir [Relais](#-relais-pc--téléphone).
- **`NOTIFY_LEVEL`** — défaut `off` (le modèle `.env.example` met `all`). `off`, `problems` ou `all`.
- **`ALERT_BOT_TOKEN`** — vide par défaut, et alors aucune alerte. Jeton de ton bot @BotFather.
- **`ALERT_CHAT_ID`** — vide par défaut : les alertes vont à ton propre compte. À remplir seulement pour un autre destinataire.
- **`BOT_NAME`** — défaut `💻 PC`, ou `📱 Téléphone` en `backup`. Préfixe des alertes et nom affiché dans le message de relais. Téléphone en `solo` ? Mets `BOT_NAME="📱 Téléphone"` dans `android.env`, sinon ses alertes commencent par `💻 PC`.
- **`HEALTHCHECK_URL`** — vide par défaut. Adresse appelée au démarrage puis toutes les 5 min (par exemple un check healthchecks.io). Sur le téléphone, mets-la dans `android.env`.

### Navigateur et Binance

- **`BINANCE_LOGIN_TIMEOUT`** — défaut `300000` (5 min), en millisecondes. Temps maximum pour te connecter à Binance à la main quand le navigateur démarre. Au-delà, le bot s'arrête (`⏰ Timeout — connexion Binance non détectée`). `0` = attendre sans limite (c'est le cas sur le téléphone). Une session qui expire en cours de route n'a pas de délai : le bot attend ta reconnexion.
- **`BROWSER_USER_AGENT`** — vide par défaut : le user-agent Chrome / Windows historique du bot. `native` = celui du vrai Chromium (c'est le cas sur le téléphone). Toute autre valeur est utilisée telle quelle.
- **`CHROMIUM_PATH`** — vide par défaut : le Chromium de Playwright. Chemin d'un autre Chromium.
- **`CHROMIUM_EXTRA_ARGS`** — vide par défaut. Options Chromium en plus, séparées par des espaces (par exemple `--disable-gpu`). ⚠️ Jamais `--disable-features` : ça écraserait la liste de Playwright.

### Posées automatiquement par le kit Android

Tu n'as pas à les écrire. Sur le téléphone, le kit (surtout le superviseur `deploy/android/run.sh` et la fonction `android_env` de `lib.sh`) les exporte **avant** de lancer le bot. Elles passent donc avant ton `.env`, car dotenv ne remplace jamais une variable déjà définie.

- **`BOT_UNATTENDED=1`** — mode sans surveillance : jamais de demande de code Telegram. Si la session n'est plus valide, le bot envoie l'alerte 🔑 et s'arrête avec le code 78 (le superviseur réessaie toutes les 30 min). Accepte `1` ou `true`. Utile aussi sous PM2 ou systemd (voir [VPS](#-déploiement-sur-un-vps)).
- **`BOT_HEARTBEAT_FILE`** — `.run/heartbeat` : signe de vie réécrit chaque minute, lu par `bot status` et par le watchdog.
- **`BOT_LAST_EXIT_CODE`** — code de sortie du lancement précédent. S'il est supérieur à 0, l'alerte de démarrage est ♻️ « relancé » au lieu de 🟢 « en ligne ».
- **`BOT_SCREEN=vnc`** — les messages de connexion Binance renvoient vers AVNC.
- **`FORCE_COLOR=1`** — garde les couleurs dans `logs/bot.log`, pour que `bot logs` ressemble à la console.
- Et aussi : `BOT_ROLE=backup`, `BINANCE_LOGIN_TIMEOUT=0`, `LOG_WIDTH=48`, `BROWSER_USER_AGENT=native`, `DISPLAY=:1` (écran virtuel) et `TZ` (fuseau horaire du téléphone, pour l'heure des logs).

**Pour changer un réglage sur le téléphone seulement**, utilise `android.env`, à la racine du projet. Il est lu après les réglages automatiques ci-dessus : il passe donc avant eux et avant ton `.env` (sauf `BOT_UNATTENDED`, `BOT_HEARTBEAT_FILE` et `BOT_LAST_EXIT_CODE`, toujours posés par le superviseur). Il est créé à l'installation avec `BOT_ROLE=backup`, et des exemples commentés pour `HEALTHCHECK_URL` et `CHROMIUM_EXTRA_ARGS`. Si le Chromium de Playwright ne s'installe pas, l'installation y ajoute `CHROMIUM_PATH=/usr/bin/chromium` (et retire cette ligne dès que celui de Playwright s'installe, par exemple lors d'un `bot update`). Ce fichier est lu par bash : mets des guillemets autour d'une valeur qui contient des espaces. Après une modification : `bot restart`.

---

## 📊 Logs et bilan

Format : `[jour/mois heure] EMOJI NIVEAU — message`, en **heure locale**. Les niveaux sont alignés et colorés :

- `📘 INFO` — information ;
- `✅ OK` — réussite (connexion, code trouvé, gain…) ;
- `⚠️ WARN` — à surveiller (code non tenté, relance, reconnexion…) ;
- `❌ ERROR` — problème (session expirée, plantage…) ;
- `🔍 DEBUG` — détails, seulement avec `DEBUG=true`.

Un démarrage typique sur le PC :

```
╔══════════════════════════════════════════════════════════════╗
║  🤖 Bot Red Packet — Telegram × Binance                      ║
║  ⚡ Détection instantanée · Zéro retry · Zéro rattrapage     ║
╚══════════════════════════════════════════════════════════════╝

══════════════════════ 🧩 Initialisation ═══════════════════════
[07/10 21:31:05] 📘 INFO  — 🤝 Rôle : 💻 PC prioritaire (BOT_ROLE=primary)
[07/10 21:31:05] 📘 INFO  — 🔔 Alertes : activées — problèmes + gains, via ton bot Telegram
[07/10 21:31:05] 📘 INFO  — 📋 Historique : 42 code(s) en mémoire
[07/10 21:31:05] 📘 INFO  — 🌐 Lancement du navigateur Chromium...
[07/10 21:31:06] 📘 INFO  — 🍪 Cookies de session restaurés
[07/10 21:31:11] ✅ OK    — 🔓 Session Binance active — champ Cryptobox visible
[07/10 21:31:11] 📘 INFO  — 🍪 Cookies de session sauvegardés localement
[07/10 21:31:11] ✅ OK    — 🟢 Navigateur Binance prêt
[07/10 21:31:11] 📘 INFO  — 🎯 6 canal(aux) demandé(s) dans TARGET_CHANNELS

═════════════════════════ 📡 Telegram ══════════════════════════
[07/10 21:31:11] 📘 INFO  — 🔌 Connexion à Telegram avec mtcute...
[07/10 21:31:12] ✅ OK    — 📡 Connexion Telegram rétablie — écoute active
[07/10 21:31:13] ✅ OK    — 👤 Connecté : Kevin (@kev)
[07/10 21:31:13] 📘 INFO  — 🗂️  Indexation des dialogues pour résoudre 6 canal(aux)...
[07/10 21:31:15] ✅ OK    — 🗂️  238 dialogue(s) indexé(s)

═════════════════════ 📡 Canaux surveillés ═════════════════════
   • @binance_box_channel   @cryptogws
   • @makzero               @red_packeta
   • @rsbox                 @vgfboxes

[07/10 21:31:15] ✅ OK    — 🚀 Écoute active sur 6 chat(s) — 6 résolu(s) sur 6 cible(s)
[07/10 21:31:15] 📘 INFO  — ⏮️ Aucun rattrapage : seuls les codes publiés après 21:31:11 sont pris
[07/10 21:31:15] 📘 INFO  — ⌨️  Ctrl+C pour arrêter

═══════════════════ 🤝 Relais PC ⇄ téléphone ═══════════════════
[07/10 21:31:15] 📘 INFO  — 🤝 Relais : 💻 PC prioritaire — état publié toutes les 60 s
                                dans tes « Messages enregistrés » (message #botrelay, silencieux)
[07/10 21:31:16] 📘 INFO  — 🤝 Relais : état publié → 🟢 actif

╔══════════════════════════════════════════════════════════════╗
║  🟢 Bot opérationnel — En attente des Red Packets            ║
║  ⏱️ Bilan automatique toutes les 30 min                      ║
╚══════════════════════════════════════════════════════════════╝

[07/10 21:34:12] ✅ OK    — 🎁 Code trouvé : 92J5LXPM — depuis @vgfboxes
[07/10 21:34:12] 📘 INFO  — 🚀 Réclamation en cours : 92J5LXPM
[07/10 21:34:18] ✅ OK    — 💰 GAGNÉ ! Code 92J5LXPM → 0.00000005 BNB
[07/10 21:34:18] ✅ OK    — 🏁 Code 92J5LXPM traité en 6324 ms
```

**Sur le téléphone**, tout va dans `logs/bot.log`. `bot logs` l'affiche en couleurs, comme la console ; il est archivé dans `logs/bot.log.1` à 5 Mo. Le superviseur, le démarrage du téléphone et le watchdog (seulement quand il agit) y écrivent dans le même style. L'écran virtuel écrit dans `logs/xvnc.log`.

### Bilan d'activité

Il s'affiche toutes les `STATS_INTERVAL_MIN` minutes (30 par défaut), à minuit (`📊 Bilan de la journée`) et à l'arrêt propre (`📊 Bilan final`) :

```
┌─ 📊 Bilan d'activité ─────────────────────────────────────────
│  ⏱️ Uptime              02h 36m 52s
│  📨 Messages analysés   1843 (dont 97 éditions)
│  🎁 Codes détectés      64
│  🚀 Réclamations        61
│  💰 Gains               48 (79 %)
│  📭 Échecs              13
│  ⏭️ Ignorés             3 (pause/navigateur/session)
│  🔁 Doublons filtrés    209
│  ⏮️ Avant démarrage     31 (jamais traités)
│  🕰️ Messages périmés    12
│  ⚡ Détection → clic    430 ms (pire : 5210 ms)
│  ⌛ Durée réclamation   6200 ms en moyenne
│  📥 Pic de file         5
│  📡 Déconnexions        0
│  🧠 Mémoire du bot      182 Mo
│  💾 RAM libre           6.2 Go / 15.8 Go
│  🤝 Relais              💻 PC prioritaire — 🟢 actif
└───────────────────────────────────────────────────────────────
```

**Comment le lire :**

- `⚡ Détection → clic` élevé (plus d'1 s) → la file est saturée : les Red Packets partent avant ton tour.
- `📥 Pic de file` à 4 ou plus → trop de canaux publient en même temps pour un seul onglet Binance (le bot affiche alors `🚦 File chargée`).
- `⏮️ Avant démarrage` qui grimpe alors que `🎁 Codes détectés` reste à 0 → **l'horloge de la machine avance**. Le bot te prévient avec un message `⏰`.
- `📡 Déconnexions` fréquentes → réseau instable : des codes passent pendant les coupures.
- `💰 Gains` très bas → tu arrives trop tard : retire les canaux les moins rentables.
- `🧠 Mémoire du bot` et `💾 RAM libre` → surtout utiles sur le téléphone.
- Sur le téléphone, le bilan ajoute `😴 Laissés au PC` (s'il y en a), l'état du `🤝 Relais`, et `⏳ Actif / veille` (temps passé actif et en veille).

---

## 🎯 Comment les codes sont détectés

Le bot analyse **toutes** les surfaces d'un message :

- **Texte et légende** d'un média — `🎁 Code: 92J5LXPM` ;
- **Boutons inline** (texte et adresse) — un bouton « 🎁 Réclamer » qui pointe vers `…/cryptobox/QW3RT5YU` ;
- **Liens masqués** — un texte « clique ici » dont le lien cache `?code=8HJ2K4L9` ;
- **Blocs `monospace` / `pre`** — un code posté entre backticks ;
- **Aperçus de lien** — adresse, titre et description de l'aperçu ;
- **Messages édités** — un canal qui publie un message, puis y **ajoute le code**. C'est l'heure de la modification qui compte.

### Deux niveaux de confiance

Les Red Packets Binance font exactement **8 caractères alphanumériques**.

- **Strict**, pour le texte libre : le code doit mélanger lettres **et** chiffres. Sinon, n'importe quel mot de 8 lettres deviendrait un faux positif.
- **Souple**, seulement pour les sources fiables : blocs `monospace`, « Code : XXXXXXXX » (aussi en espagnol, italien, russe, arabe, chinois, japonais), adresses `cryptobox/…` et paramètres `?code=`. Il accepte aussi les codes **100 % alphabétiques**, environ 10 % des Red Packets. Une liste noire de mots courants et un test de voyelles écartent les vrais mots.

**Toujours rejetés :**

- les suites de 8 chiffres (dates, identifiants) ;
- les codes qui commencent par `BP` ;
- les messages qui parlent d'un autre exchange (Bybit, OKX, Bitget, KuCoin, MEXC, Gate.io, Huobi / HTX, BingX) sans mentionner Binance ni Cryptobox ;
- tes Messages enregistrés : ils servent au relais, jamais de source de codes.

Un code en cours de traitement, ou déjà mémorisé dans `history.json` (gagné, refusé par Binance, ou laissé au PC par le téléphone en veille), est ignoré : il n'est jamais soumis une deuxième fois. Les autres (code non tenté, limite anti-ban, erreur technique) ne sont pas mémorisés : si le même code est republié, il est traité comme un nouveau code.

> 💡 Chaque faux positif coûte une tentative sur le compteur anti-fraude Binance. C'est pour ça que le niveau souple reste limité aux sources où un code est clairement annoncé.

---

## 📡 Tenir 100+ canaux

- **Écoute active avant la résolution** — les handlers sont enregistrés **avant** la résolution des canaux : aucun angle mort au démarrage.
- **Résolution groupée** — un seul balayage des dialogues (archivés compris) résout presque toutes les cibles : environ 3 appels API au lieu de 200.
- **Repli limité** — les cibles absentes des dialogues passent par `getChat`, 4 en parallèle, avec gestion du `FLOOD_WAIT`.
- **Adoption à la volée** — un canal non résolu est adopté dès son premier message, grâce à son `@username`.
- **Groupes liés en arrière-plan** — les groupes de commentaires sont explorés après le démarrage, un toutes les 250 ms, sans jamais retarder la détection.
- **Handler non bloquant** — aucune attente sur le chemin critique : un message ne peut pas en retarder un autre, quel que soit le nombre de canaux.
- **File séquentielle** — un seul onglet Binance, donc un code à la fois, dans l'ordre d'arrivée. Le bot prévient dès que la file devient le goulot (`🚦 File chargée`).
- **Filet de sécurité** — si aucun canal n'a pu être résolu, le bot écoute par prudence tous les chats connus.

---

## 🔐 Protections intégrées

### Côté Telegram

- **Écoute passive** — le bot **reçoit** les messages par push. Il n'écrit dans aucun canal ni groupe, ne réagit à rien, ne marque rien comme lu.
- **Une seule exception : tes Messages enregistrés**, pour le relais. Le PC (`primary`) y garde un message d'état silencieux, modifié toutes les 60 s. Le téléphone (`backup`) le lit, et n'y écrit que s'il déclenche lui-même une pause anti-ban. En `solo` : rien du tout.
- **Alertes par ton bot** — elles passent par l'API Bot de ton bot @BotFather, pas par ton compte.
- **Pas d'historique** — pas de `getHistory`, pas de polling, et `catchUp: false` : le bot ne demande jamais d'anciens messages. Sa seule recherche : `#botrelay` dans tes Messages enregistrés, une fois au démarrage (sauf en `solo`).
- **Très peu de requêtes** — la résolution groupée remplace environ 200 appels par 3. C'est ce qui évite le plus de `FLOOD_WAIT`.
- **`FLOOD_WAIT` géré** — si Telegram impose une pause, le bot attend le délai demandé + 1 s (60 s au maximum), puis réessaie une fois.
- **Appels espacés** — l'exploration des groupes liés est étalée (250 ms par canal), en arrière-plan.

### Côté Binance

- **⛔ Une seule soumission par code** — aucun code n'est jamais rejoué, quel que soit le résultat. C'est la protection la plus importante du compteur anti-fraude.
- **Traitement séquentiel** — un code à la fois, jamais de réclamations en parallèle.
- **Anti-doublons 48 h** — `history.json` empêche de resoumettre un code déjà gagné ou refusé par Binance, même après un redémarrage (détail dans [Comment les codes sont détectés](#-comment-les-codes-sont-détectés)). Les codes de plus de 48 h sont purgés chaque nuit à minuit.
- **Pause automatique de 5 h** — si Binance répond « limite / limit / dépassé ».
- **Pause automatique de 2 h** — si Binance parle de « tentative / attempt » (le compteur se remplit).
- **Pauses partagées** — avec le relais, l'autre appareil respecte la même pause : c'est le même compte.
- **Navigateur furtif** — Chromium persistant + `puppeteer-extra-plugin-stealth`, fenêtre visible (`headless: false`), user-agent et langue réalistes.
- **Session expirée détectée** — si Binance renvoie vers sa page de connexion, les codes sont refusés tout de suite, sans toucher à la page ni la recharger : aucune tentative brûlée, et ta reconnexion n'est pas dérangée. L'adresse (hôte et chemin) est revérifiée juste avant la saisie et après la soumission : **un code n'est jamais tapé dans le formulaire de connexion**. Le retour de la session est détecté tout seul (vérification passive toutes les 20 s), avec les alertes 🔑 puis ✅.
- **Chromium surveillé** — fenêtre fermée ou onglet planté : relance automatique (3 fois au maximum en 10 min).

### Signaux d'alarme dans les logs

```
[07/10 14:02:41] ❌ ERROR — 🚨 ALERTE ANTI-BAN : La limite de Binance a été atteinte.
[07/10 14:02:41] ⚠️  WARN — 🛑 Le bot se met en pause automatique pour 5 heures.
```

Et pour la pause de 2 h :

```
[07/10 14:02:41] ❌ ERROR — 🚨 AVERTISSEMENT ANTI-BAN : Binance signale des tentatives restantes.
[07/10 14:02:41] ⚠️  WARN — 🛑 Pause de sécurité de 2 heures déclenchée pour réinitialiser le compteur.
```

> [!WARNING]
> Si ces messages reviennent **plusieurs fois par jour**, réduis le nombre de canaux dans `TARGET_CHANNELS` : tu soumets trop de codes morts. Regarde aussi le taux de réussite (`💰 Gains`) dans le bilan : un taux très bas veut dire que tu arrives trop tard.

---

## 🧭 Sélecteurs Playwright

> [!CAUTION]
> Les sélecteurs de la constante `SELECTORS` dans [`src/binance.js`](./src/binance.js) sont **fonctionnels et validés en production**. Ne les modifie que si Binance change vraiment son interface et que les réclamations échouent.

Ils couvrent : la détection de session (`loggedInIndicators` / `loggedOutIndicators`), le champ de saisie (`codeInput`), le bouton de soumission (`submitButton`), la modale de confirmation (`confirmButton`), la lecture du gain (`successModal`) et le message d'erreur (`errorMessage`).

**Pour mettre à jour un sélecteur :**

1. Ouvre la page Cryptobox dans Chrome.
2. **F12** → onglet **Elements**.
3. Trouve l'élément et copie son sélecteur CSS ou son `data-testid`.
4. Ajoute-le **en tête** du tableau correspondant : les tableaux sont testés dans l'ordre, et le premier élément visible gagne. `codeInput` et `errorMessage` sont des listes CSS séparées par des virgules : ajoute-le à la liste. Là, l'ordre de la liste ne compte pas : c'est le premier élément de la page qui correspond qui est pris.

---

## 📁 Structure du projet

```
red-packet-bot-telegram/
├── index.js               # Orchestrateur : démarrage, file, alertes, bilans, arrêt
├── src/
│   ├── telegram.js        # Userbot Telegram (mtcute) + détection des codes
│   ├── binance.js         # Automatisation Binance (Playwright)
│   ├── relay.js           # Relais PC ⇄ téléphone (message #botrelay)
│   ├── notifier.js        # Alertes via ton bot @BotFather
│   ├── queue.js           # File d'attente : un code à la fois
│   ├── history.js         # Anti-doublons 48 h (history.json)
│   ├── stats.js           # Compteurs du bilan d'activité
│   └── logger.js          # Logs horodatés, alignés et colorés
├── deploy/android/        # Kit Android (Termux)
│   ├── install.sh         # Installation complète (dans Termux)
│   ├── setup-debian.sh    # Node.js, npm ci, Chromium, VNC (dans Debian)
│   ├── chromium-test.js   # Test de démarrage de Chromium
│   ├── bot.sh             # Commande « bot » (start, stop, status…)
│   ├── launch.sh          # Tâche de fond Termux → superviseur
│   ├── run.sh             # Superviseur : relance, écran virtuel, logs
│   ├── login.sh           # « bot login » : node index.js --setup
│   ├── boot.sh            # Démarrage du téléphone (Termux:Boot)
│   ├── watchdog.sh        # Vérification toutes les 15 min (Termux:API)
│   └── lib.sh             # Fonctions communes (logs, écran VNC, réglages)
├── GUIDE-ANDROID.md       # Guide pas à pas pour le téléphone
├── README.md
├── .env.example           # Modèle de configuration
├── .gitattributes         # Fins de ligne LF (scripts Android)
├── .gitignore
├── package.json
└── package-lock.json
```

Créés pendant le fonctionnement, **jamais versionnés** :

```
├── .env                   # Tes réglages ⚠️ secret
├── android.env            # Réglages propres au téléphone
├── client.session*        # Session Telegram (SQLite) ⚠️ secret
├── browser-data/          # Profil Chromium + cookies Binance ⚠️ secret
├── history.json           # Codes déjà traités (purge à 48 h)
├── .alert-chat-id         # Destinataire des alertes
├── .run/                  # PID, signe de vie, délais des alertes
├── .stop                  # Présent = bot arrêté par toi (téléphone)
├── .vnc-password          # Mot de passe de l'écran VNC (téléphone)
└── logs/                  # bot.log, bot.log.1, xvnc.log (téléphone)
```

Sur le téléphone, le dépôt est cloné dans `~/red-packet-bot-telegram` côté Termux, et monté sur `/bot` dans Debian.

---

## 🌐 Déploiement sur un VPS

Le bot ouvre une **vraie fenêtre** Chromium (`headless: false`). Sur un serveur sans écran, il lui faut un écran virtuel : `xvfb-run`. Et pour la **première connexion Binance**, il faut pouvoir voir cette fenêtre (bureau à distance, VNC…). C'est ce que fait le kit Android avec Xvnc et AVNC.

Préparation :

```bash
npm install
npx playwright install chromium
npx playwright install-deps chromium   # dépendances système de Chromium
sudo apt install -y xvfb               # écran virtuel (xvfb-run)
sudo timedatectl set-ntp true          # horloge à l'heure : indispensable
```

> [!IMPORTANT]
> **Synchronise l'horloge.** Une horloge qui avance ferait rejeter tous les messages comme « antérieurs au démarrage ».

Sous un superviseur, active le **mode sans surveillance** (`BOT_UNATTENDED=1`) : le bot ne demande jamais de code Telegram. Si la session n'est plus valide, il t'envoie l'alerte 🔑 et s'arrête avec le code **78**, au lieu de rester bloqué sur une question. Fais donc la **première connexion à la main** avant de lui confier le bot. (L'alerte parle de `bot login` : sur un serveur, ça veut dire refaire la connexion à la main.) Astuce : `BOT_NAME="🖥️ VPS"` dans `.env` pour reconnaître ses alertes.

### Option 1 : PM2

```bash
npm install -g pm2
BOT_UNATTENDED=1 pm2 start "xvfb-run -a node index.js" --name cryptobox-bot --stop-exit-codes 78
pm2 save
pm2 startup
pm2 logs cryptobox-bot
```

`--stop-exit-codes 78` : pas de relance en boucle quand la connexion Telegram est à refaire.

### Option 2 : systemd

```bash
sudo nano /etc/systemd/system/cryptobox-bot.service
```

```ini
[Unit]
Description=Bot Red Packet (Telegram × Binance)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/red-packet-bot-telegram
Environment=BOT_UNATTENDED=1
ExecStart=/usr/bin/xvfb-run -a /usr/bin/node index.js
Restart=on-failure
RestartSec=10
# Code 78 = connexion Telegram à refaire : pas de relance en boucle
RestartPreventExitStatus=78

[Install]
WantedBy=multi-user.target
```

Adapte `User`, `WorkingDirectory` et le chemin de `node` (`which node`).

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cryptobox-bot
sudo journalctl -u cryptobox-bot -f
```

> **Notes :**
> - Les couleurs sont coupées toutes seules quand la sortie n'est pas un terminal (PM2, systemd). `FORCE_COLOR=1` les garde.
> - N'exécute pas le bot en `root` : crée un utilisateur dédié.

---

## 🔒 Sécurité

1. **Ne partage jamais** ces fichiers : ils donnent accès à tes comptes.
   - `.env` (identifiants API, jeton du bot d'alertes) ;
   - `client.session*` (ta session Telegram) ;
   - `browser-data/` (ta session Binance) ;
   - `android.env`, `.vnc-password`, `.alert-chat-id`.
2. Ils sont tous dans le [`.gitignore`](./.gitignore). Extrait :
   ```gitignore
   .env
   android.env
   *.session*
   browser-data/
   history.json*
   .run/
   .stop
   .alert-chat-id
   .vnc-password
   logs/
   ```
3. **Session divulguée ?** Les fichiers de session Telegram (`client.session`, `my-session.session*`) étaient suivis par Git. Ils sont retirés du dépôt, mais restent dans l'historique de ce dépôt public : n'importe qui les ayant récupérés pourrait prendre le contrôle du compte Telegram. Il fallait donc, dans Telegram : **Paramètres → Appareils → « Mettre fin aux autres sessions »**. Refais-le chaque fois qu'un de ces fichiers a pu fuiter (le bot te redemandera le code une fois).
4. **Jeton du bot d'alertes divulgué ?** Révoque-le avec @BotFather (`/revoke`), puis mets le nouveau jeton dans `.env`, sur le PC **et** sur le téléphone (puis `bot restart`).
5. **Numéro secondaire** : l'idéal est un numéro dédié au compte du bot. S'il est banni, ton vrai compte reste intact.
6. **Risque Binance** : l'automatisation peut être détectée. La fenêtre visible et les pauses anti-ban réduisent ce risque, sans l'éliminer.
7. **Sur un VPS** : pas de `root`, un utilisateur dédié.
8. **Surveille les logs les premiers jours** : le bilan d'activité est fait pour ça.

---

## 🐛 Dépannage

| Problème | Solution |
|----------|----------|
| `🔑 Variables manquantes dans .env` | Complète `.env` (modèle : `.env.example`). |
| `🎯 Aucun canal défini dans TARGET_CHANNELS` | Mets au moins un canal, séparés par des virgules. |
| `🚧 N canal(aux) non résolu(s)` | Vérifie le `@pseudo` (faute de frappe, canal renommé). Si le compte est abonné au canal, il est capté dès son premier message ; sinon, abonne-toi. |
| Aucun code détecté alors que le canal publie | Vérifie l'heure (`⏰` dans les logs), puis relance avec `DEBUG=true` pour voir chaque message reçu ou ignoré. |
| `⏰ 25 messages d'affilée…`, ou `⏮️ Avant démarrage` qui grimpe | Horloge en avance : `w32tm /resync` (Windows), `sudo timedatectl set-ntp true` (Linux), date et heure automatiques dans les Paramètres (téléphone). |
| `🕰️ Beaucoup de messages jugés périmés` | Vérifie l'horloge, ou augmente `MAX_MESSAGE_AGE_S`. |
| `🐢 Limite Telegram atteinte` | Le bot gère seul. Fréquent au démarrage ? Réduis le nombre de canaux. |
| `🚨 ALERTE ANTI-BAN` ou `🚨 AVERTISSEMENT ANTI-BAN` | Pause automatique (5 h ou 2 h). Trop de codes morts : retire les canaux les moins rentables. |
| `⏭️ Code … abandonné — champ de saisie introuvable` | Page lente ou session expirée : regarde la fenêtre Binance (PC) ou AVNC (téléphone). |
| `🔑 Session Binance expirée — code … non soumis` | Reconnecte-toi : fenêtre Chromium (PC) ou AVNC (téléphone). |
| `⏰ Timeout — connexion Binance non détectée` | Connecte-toi plus vite, ou augmente `BINANCE_LOGIN_TIMEOUT` (`0` = sans limite). |
| Session Telegram invalide (PC) | Supprime les fichiers `client.session*` et relance `npm start`. |
| `🔑 Session Telegram à refaire` (téléphone) | `bot login`, ou le widget 🔑. |
| `🔕 Alerte non envoyée : … envoie /start …` | Envoie `/start` à ton bot d'alertes. |
| `🔕 Alerte non envoyée : … vérifie ALERT_BOT_TOKEN` | Jeton faux ou révoqué : recopie-le depuis @BotFather. |
| `🔕 Alertes : destinataire inconnu` | Normal avant la première connexion Telegram. Sinon, remplis `ALERT_CHAT_ID`. |
| `🤝 Relais : un AUTRE appareil se déclare aussi PC prioritaire` | Un seul `primary` : le téléphone doit être en `backup` (`android.env`). |
| Le bot s'arrête tout seul sur le téléphone | Réglages Android (batterie, phantom process killer) et `bot watchdog on`. Voir l'étape 8 du guide. |
| `Mise à jour des dépendances impossible` (`bot update`) | Le bot reste arrêté. Vérifie ta connexion Internet, puis relance `bot update`. |
| `💥 L'onglet Binance a planté (mémoire insuffisante ?)` | Ferme des applis. Essaie `CHROMIUM_EXTRA_ARGS="--disable-gpu"` dans `android.env`. |
| AVNC ne se connecte pas | L'écran n'existe que si le bot tourne, ou pendant `bot login`. Adresse `127.0.0.1`, port `5901`, mot de passe : `bot vnc`. |
| `Watchdog non activé` | Installe Termux:API (F-Droid), ouvre-la une fois, puis `bot watchdog on`. |
| Le bot plante au démarrage sur un VPS | `npx playwright install-deps chromium`. |

---

## 📄 Licence

MIT — usage personnel uniquement.
