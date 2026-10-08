# 📱 Guide Android — le bot Red Packet 24 h/24

Ce guide t'explique, pas à pas, comment faire tourner le bot sur un téléphone Android, jour et nuit, en relais de ton PC.

Pas besoin de connaître Linux : tu copies des commandes, tu appuies sur Entrée et tu lis ce qui s'affiche.

- ⏱️ Compte **environ 1 h** la première fois, dont 15 à 30 min d'installation automatique.
- 📲 Ouvre ce guide **sur ton téléphone**, dans GitHub : tu pourras copier les commandes directement.

## ⚡ En bref

1. Installe depuis **F-Droid** : Termux, Termux:Boot, Termux:Widget, Termux:API, puis AVNC.
2. Crée ton **bot d'alertes** avec @BotFather.
3. Envoie une copie de ton `.env` (nommée `bot.env`) dans tes Messages enregistrés, puis enregistre-la dans les Téléchargements du téléphone.
4. Dans Termux : les **3 commandes** d'installation.
5. `bot login` : code Telegram, puis connexion Binance avec AVNC.
6. **Réglages Android** : batterie, applis récentes, charge, « phantom process killer ».
7. Ajoute le **widget**, appuie sur ▶️, puis fais les **8 tests** de la fin.

## 📑 Sommaire

1. [Ce que tu vas obtenir](#-1-ce-que-tu-vas-obtenir)
2. [Avant de commencer](#-2-avant-de-commencer)
3. [Installer les applications](#-3-installer-les-applications)
4. [Créer ton bot d'alertes](#-4-créer-ton-bot-dalertes)
5. [Préparer ton fichier de réglages (bot.env)](#-5-préparer-ton-fichier-de-réglages-botenv)
6. [Installer le bot](#-6-installer-le-bot)
7. [Se connecter](#-7-se-connecter)
8. [Réglages Android pour le 24 h/24 — même si Termux se ferme](#-8-réglages-android-pour-le-24-h24--même-si-termux-se-ferme)
9. [Les widgets](#-9-les-widgets)
10. [Utilisation au quotidien](#-10-utilisation-au-quotidien)
11. [Le relais PC ⇄ téléphone](#-11-le-relais-pc--téléphone)
12. [Comprendre les logs](#-12-comprendre-les-logs)
13. [Les alertes Telegram](#-13-les-alertes-telegram)
14. [Mettre à jour](#-14-mettre-à-jour)
15. [Dépannage](#-15-dépannage)
16. [Désinstaller](#-16-désinstaller)

👉 Et pour finir : [✅ Tout est prêt ?](#-tout-est-prêt-) (les 8 tests).

---

## 🎯 1. Ce que tu vas obtenir

- 🤖 Le bot tourne sur ton téléphone **24 h/24**, en arrière-plan.
- ▶️ Il démarre d'un appui sur un **widget**. Ensuite, il ne s'arrête plus, **même si tu fermes Termux**, jusqu'à ce que tu appuies sur ⏹️.
- ♻️ Il se relance tout seul : après un plantage, au redémarrage du téléphone, et dans les 15 min si Android l'a tué (le watchdog vérifie toutes les 15 min).
- 💻 **Ton PC reste prioritaire.** Quand le bot tourne sur le PC, le téléphone se met en veille. Dès que le PC s'arrête, le téléphone prend le relais. Un seul appareil réclame à la fois : un code n'est pas soumis deux fois.
- 🔔 Des **alertes Telegram** qui sonnent vraiment : gains, problèmes, reconnexions.
- 📜 Des **logs clairs et colorés** (`bot logs`) et un **tableau de bord** (`bot status`).

### Le relais PC ⇄ téléphone

```text
💻 PC — prioritaire (npm start)
  │  publie son état toutes les 60 s
  ▼
💬 Telegram · « Messages enregistrés »
     un seul message, silencieux :
     « 🤖 Relais Red Packet … #botrelay »
  │  lu en direct
  ▼
📱 Téléphone — relais (widget ▶️)
     PC actif ou en pause    → 😴 veille
     PC arrêté, pas prêt,
     ou muet > 2 min 30      → 📱 il réclame
```

Le PC et le téléphone utilisent le même compte Binance : un seul réclame à la fois. Tous les détails à l'[étape 11](#-11-le-relais-pc--téléphone).

### Ce qui tourne sur le téléphone

```text
📱 Android
└─ Termux — tâche de fond + wake lock
   └─ Debian (proot-distro)
      ├─ superviseur — relance automatique
      │  └─ bot Node.js — priorité basse
      │     ├─ Telegram : écoute les canaux
      │     └─ Chromium : réclame sur Binance
      └─ écran virtuel (1280x1024)
            ▲
            └─ AVNC → 127.0.0.1:5901
               (pour te connecter à Binance)
```

- Playwright (l'outil qui pilote Chromium) ne marche pas directement dans Termux. Le bot tourne donc dans **Debian**, un Linux complet installé à l'intérieur de Termux. Tu n'as jamais besoin d'y entrer : la commande `bot` s'en charge.
- Chromium s'affiche sur un **écran virtuel**. Tu le regardes avec l'appli **AVNC**, seulement quand tu dois te connecter à Binance.
- Deux gardiens veillent : **Termux:Boot** relance le bot au démarrage du téléphone, et le **watchdog** (Termux:API) vérifie toutes les 15 min qu'il tourne.

### Ton téléphone reste fluide

- Le bot tourne en **priorité basse** : le téléphone reste réactif.
- Quand le PC travaille, le téléphone est **en veille** : il écoute seulement Telegram et **ferme Chromium au bout de 2 min** (mémoire libérée).

### Les limites, en toute franchise

- Sur le téléphone, une réclamation est **plus lente** que sur le PC (Debian dans Termux ajoute une couche). C'est pour ça que le PC passe en premier.
- Quand le téléphone prend le relais, il doit d'abord lancer Chromium. Les codes qui arrivent pendant ce temps ne sont pas tentés.
- Binance déconnecte la session **de temps en temps**. Tu reçois une alerte 🔑 et tu te reconnectes avec AVNC.
- Après un redémarrage, le bot ne repart qu'**après le premier déverrouillage** du téléphone (si tu as un code, un schéma ou une empreinte).
- Le téléphone a besoin d'**Internet** en continu (un Wi-Fi stable) et, idéalement, d'être **branché**.

---

## 📋 2. Avant de commencer

### Ce qu'il te faut

- 📱 Un téléphone Android **64 bits**, avec Android **7 minimum** (Android **10 ou plus** conseillé).
- 🧠 **4 Go de RAM** conseillés.
- 💾 Environ **3 Go d'espace libre**.
- 📶 Un **Wi-Fi stable** et un **chargeur** : le téléphone restera branché.
- 💻 Le **bot qui marche déjà sur ton PC**, avec son fichier `.env`. Sinon, commence par le [README](README.md) (identifiants API Telegram, canaux…).
- 🔐 Ton compte **Binance** (mot de passe et 2FA) et l'appli **Telegram** sur le téléphone (pour recevoir le code de connexion et les alertes).

### Comment vérifier

1. **Version d'Android** : Paramètres → À propos du téléphone → Version d'Android (parfois dans « Informations sur le logiciel »).
2. **RAM** : Paramètres → À propos du téléphone.
3. **Espace libre** : Paramètres → Stockage.
4. **64 bits** : tu le vérifieras dans Termux (étape 3) avec la commande `uname -m`. Le résultat doit être `aarch64`.

> [!NOTE]
> Le script d'installation vérifie lui aussi : il s'arrête si le téléphone n'est pas en 64 bits, et il t'avertit s'il reste moins de 3 Go libres.

### 🔒 Sécurité : à faire une seule fois, avant tout

Les anciennes versions de ce dépôt GitHub contenaient les fichiers de session Telegram (`client.session`, `my-session.session…`). Ils ont été retirés, mais ils restent dans l'historique du dépôt. Une personne qui les a récupérés pourrait prendre le contrôle du compte Telegram.

Si c'est ton dépôt (ou si tu as déjà publié tes propres fichiers `.session`) :

1. Dans Telegram : **Paramètres → Appareils → « Mettre fin aux autres sessions »**.
2. Fais-le **maintenant**, avant d'installer le téléphone. Sinon, tu déconnecterais aussi le bot du téléphone.
3. Ton PC te redemandera le code Telegram une fois, au prochain `npm start`.

> [!CAUTION]
> Ne partage **jamais** ces fichiers : `.env`, `client.session*`, `browser-data/`, `.vnc-password`, `android.env`, `.alert-chat-id`. Ils contiennent tes accès ou des informations privées.

---

## 📲 3. Installer les applications

Tu vas installer 5 applis. Les 4 applis Termux viennent **toutes de F-Droid**.

> [!WARNING]
> N'installe **pas** Termux depuis le Play Store : cette version ne convient pas pour ce guide. Et les applis Termux doivent toutes venir de la **même source**, sinon elles ne fonctionnent pas ensemble.

### Étapes

1. **F-Droid** : sur ton téléphone, ouvre **https://f-droid.org** → « Télécharger F-Droid » → ouvre le fichier téléchargé. Android te demande d'autoriser l'installation depuis ton navigateur : accepte.
2. Ouvre **F-Droid** et laisse-le se mettre à jour (quelques minutes la première fois).
3. Dans F-Droid, cherche et installe :
   - **Termux** — le terminal ;
   - **Termux:Boot** — relance le bot au démarrage du téléphone ;
   - **Termux:Widget** — les boutons sur l'écran d'accueil ;
   - **Termux:API** — le watchdog et les petits messages de confirmation ;
   - **AVNC** — pour voir l'écran du bot. Il est aussi sur le Play Store : ce n'est pas une appli Termux, la source n'a pas d'importance.
4. Ouvre **Termux** une première fois. Il prépare son environnement (« Installing… ») : attends l'invite `$`.
5. Ouvre **Termux:Boot** une fois, puis ferme-le. Sans ça, Android ne le lancera jamais au démarrage.
6. Ouvre **Termux:API** une fois, puis ferme-le.
7. Dans Termux, tape `uname -m` puis Entrée. Tu dois voir `aarch64`. Si tu vois autre chose (`armv7l`, `armv8l`…), ton téléphone n'est pas compatible.

### Les pièges à éviter 

- ❌ **Termux du Play Store** déjà installé ? Désinstalle-le d'abord : les deux ne peuvent pas cohabiter. Attention, ça efface tout ce qu'il contenait.
- ❌ **Mélanger les sources**, par exemple Termux de F-Droid avec Termux:API du Play Store. Tout depuis F-Droid.
- ⚠️ **Play Protect** peut afficher un avertissement sur Termux (appli conçue pour une ancienne version d'Android). Choisis « Installer quand même ».
- ⚠️ Fais aussi les **mises à jour** des applis Termux depuis F-Droid.
- ⚠️ **« Package non valide »** à l'installation de F-Droid ? Le fichier est incomplet : voir [Dépannage](#-lapplication-na-pas-été-installée-car-le-package-semble-ne-pas-être-valide-).

### Les gestes de base dans Termux

- **Coller** une commande : appui long dans Termux → **Paste**.
- **Ctrl+C** (arrêter ce qui s'affiche) : touche **CTRL** de la rangée de touches du bas, puis **C**. Ou : bouton **Volume bas** + **C**.
- **Copier** depuis ce guide : sur GitHub, chaque bloc de code a un bouton « Copier » en haut à droite.

---

## 🤖 4. Créer ton bot d'alertes

**Pourquoi ?** Un message que le bot s'enverrait dans tes « Messages enregistrés » **ne sonne pas**. Les alertes passent donc par **ton propre bot Telegram** :

- ce sont de vraies notifications sur ton téléphone ;
- elles partent même si la session Telegram du bot Red Packet est cassée.

Ça prend 2 minutes :

1. Dans Telegram, cherche **@BotFather** (avec le badge bleu de certification). Ouvre-le et appuie sur **Démarrer**.
2. Envoie `/newbot`.
3. Il te demande un **nom** : par exemple `Alertes Red Packet`.
4. Il te demande un **identifiant** qui finit par `bot` : par exemple `kevin_redpacket_alertes_bot`. S'il est déjà pris, essaie-en un autre.
5. BotFather te répond avec un **jeton** (*token*) qui ressemble à `123456789:AAH…`. Copie-le. **C'est un secret** : il permet de contrôler ton bot.
6. Dans le message de BotFather, touche le lien `t.me/…` de ton bot, puis appuie sur **Démarrer** (`/start`).

> [!IMPORTANT]
> Le point 6 est obligatoire. Sans ton `/start`, Telegram interdit à ton bot de t'écrire en premier.

Tu mettras le jeton dans ton `.env` à l'étape 5. Voici les réglages des alertes :

- `ALERT_BOT_TOKEN` — le jeton donné par BotFather. Vide = pas d'alertes.
- `NOTIFY_LEVEL` — quelles alertes tu reçois :
  - `off` : aucune (**c'est la valeur par défaut**) ;
  - `problems` : seulement les problèmes ;
  - `all` : les problèmes, plus les gains, la mise en ligne, le relais et le bilan quotidien.
- `ALERT_CHAT_ID` — facultatif. Par défaut, les alertes arrivent sur ton propre compte Telegram : le bot retient ton identifiant quand il se connecte. Remplis-le seulement pour les envoyer ailleurs.
- `BOT_NAME` — facultatif. Remplace le préfixe « 💻 PC » ou « 📱 Téléphone » des alertes (et le nom affiché dans le message de relais).

> [!TIP]
> Commence avec `NOTIFY_LEVEL=all` pour tout voir. Passe à `problems` si ça fait trop.

- Jeton perdu ? @BotFather → `/mybots` → ton bot → **API Token**.
- Jeton partagé par erreur ? Même chemin → **Revoke current token**, puis mets le nouveau jeton dans tes deux `.env` (PC et téléphone).

---

## 📝 5. Préparer ton fichier de réglages (bot.env)

**Le principe** : le téléphone utilise **le même `.env` que le PC**. Tu n'as rien à adapter : les réglages propres au téléphone sont ajoutés tout seuls au démarrage du bot (voir 5.3).

### 5.1 Complète le `.env` du PC

Sur ton PC, ouvre le fichier `.env` du dossier du bot (avec le Bloc-notes) et vérifie ces lignes :

```ini
# Obligatoires (déjà là si le bot marche sur ton PC)
API_ID=12345678
API_HASH=abcdef1234567890abcdef1234567890
PHONE_NUMBER=+243XXXXXXXXX
TARGET_CHANNELS=@canal1,@canal2

# Alertes (étape 4) — ajoute-les si elles manquent
ALERT_BOT_TOKEN=123456789:AAH...
NOTIFY_LEVEL=all
```

- `PHONE_NUMBER` est au format international (`+243` pour la RDC).
- Ne change pas `BOT_ROLE` : le PC est `primary` (prioritaire) par défaut, et la ligne `BOT_ROLE=primary` du modèle convient aussi. Le téléphone, lui, se met tout seul en relais, quoi que dise le `.env`.
- Relance le bot du PC (Ctrl+C, puis `npm start`) pour que les alertes marchent aussi sur le PC.

### 5.2 Envoie-le sur le téléphone, avec Telegram

1. Sur le PC, **copie** le fichier `.env` sur le **Bureau**, puis renomme la copie en **`bot.env`**. Garde l'original : le PC en a besoin.
   - Tu ne vois pas `.env` en entier ? Dans l'Explorateur : **Affichage → Afficher → Extensions de noms de fichiers** (Windows 10 : onglet Affichage, case « Extensions de noms de fichiers »).
   - Ne crée pas `bot.env` dans le dossier du bot : il n'est pas protégé par le `.gitignore` et pourrait finir sur GitHub.
2. Dans **Telegram Desktop** (ou Telegram Web), ouvre tes **Messages enregistrés** et glisses-y `bot.env`. Envoie-le.
3. **Supprime** `bot.env` du Bureau.
4. Sur le téléphone, dans Telegram → **Messages enregistrés** : touche le fichier pour le télécharger, puis son menu **⋮** → **« Enregistrer dans les téléchargements »** (*Save to Downloads*). Il arrive dans le dossier `Download/Telegram`, où l'installation le trouvera toute seule.
5. Le nom doit être exactement `bot.env`. Si Telegram l'a renommé (`bot (1).env`…), supprime les anciens fichiers et recommence.

> [!IMPORTANT]
> Après l'installation (étape 6), **supprime le message `bot.env`** de tes Messages enregistrés : il contient tes secrets. L'installation, elle, efface `bot.env` des Téléchargements dès qu'elle l'a importé.

**Autres façons de faire :**

- Par câble USB : copie `bot.env` dans le dossier **Download** (Téléchargements) du téléphone.
- Sans `bot.env` : l'installation ouvre l'éditeur **nano** sur un modèle (`.env.example`) à remplir à la main (voir étape 6). Il contient déjà `NOTIFY_LEVEL=all` et une ligne `ALERT_BOT_TOKEN=` où coller ton jeton.

### 5.3 Ce que le téléphone règle tout seul

Au démarrage du bot, le téléphone ajoute ses propres réglages, sans modifier ton `.env`. Ils passent **avant** ceux du `.env` :

- `BOT_ROLE=backup` — il est le relais du PC (réglé dans `android.env`) ;
- `BINANCE_LOGIN_TIMEOUT=0` — il attend ta connexion Binance sans limite de temps ;
- `BOT_UNATTENDED=1` — il ne pose jamais de question bloquante : si Telegram redemande un code, tu reçois une alerte 🔑 ;
- `LOG_WIDTH=48` — des encadrés à la largeur de l'écran ;
- `FORCE_COLOR=1` — les couleurs sont gardées dans le fichier de log ;
- `BOT_SCREEN=vnc` — les messages de connexion Binance t'indiquent AVNC ;
- `BROWSER_USER_AGENT=native` — Chromium se présente tel qu'il est (Linux) ;
- le **fuseau horaire** du téléphone — les logs sont à ton heure.

Si ton `.env` contient aussi l'un de ces réglages (par exemple `BOT_ROLE=primary`), le téléphone l'ignore.

Pour changer un réglage **seulement sur le téléphone**, mets-le dans `android.env` (voir étape 10).

---

## 🚀 6. Installer le bot

### Les 3 commandes

Dans Termux, colle ces commandes **une par une**, avec Entrée après chacune.

1. Mettre Termux à jour et installer git :

   ```bash
   pkg update -y && pkg install -y git
   ```

   Si une question apparaît sur un fichier de configuration (`[default=N]`), appuie simplement sur Entrée.

2. Télécharger le bot :

   ```bash
   git clone https://github.com/KevinArmache/red-packet-bot-telegram ~/red-packet-bot-telegram
   ```

3. Lancer l'installation :

   ```bash
   bash ~/red-packet-bot-telegram/deploy/android/install.sh
   ```

> [!TIP]
> Pendant l'installation, garde Termux ouvert à l'écran, le téléphone **branché** et en **Wi-Fi**. Tu peux aussi appuyer sur « Acquire wakelock » dans la notification de Termux, pour qu'Android ne l'endorme pas.

### Combien de temps ?

**15 à 30 min**, et environ **1,5 Go** à télécharger. L'étape [4] de l'installation (Node.js, Chromium…) est la plus longue.

### Ce que tu vas voir

L'installation affiche 7 étapes, dans le même style que les logs du bot :

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🤖 Bot Red Packet — Installation Android
  Durée : 15 à 30 min · environ 1,5 Go à télécharger
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━ [1] Vérification du téléphone
[07/10 20:12:31] ✅ OK    — Téléphone 64 bits · Android 13
[07/10 20:12:31] ✅ OK    — Espace libre : 21480 Mo
```

1. **Vérification du téléphone** — 64 bits, version d'Android, espace libre (il faut environ 3 Go).
2. **Paquets Termux** — les outils de base (proot-distro, termux-api, git, nano…).
3. **Debian** — un Linux complet, installé dans Termux.
4. **Logiciels du bot** (10 à 20 min) — Node.js 24, les dépendances du bot, Chromium et l'écran virtuel. Puis un **test de Chromium** : « Chromium fonctionne ».
5. **Tes réglages (.env)** — si Android te demande l'accès aux fichiers : **autorise**, puis appuie sur Entrée dans Termux. Tu dois voir « bot.env importé (et supprimé de Téléchargements par sécurité) ». Sans `bot.env`, l'éditeur nano s'ouvre (voir plus bas).
6. **Commande « bot », démarrage automatique, widgets, watchdog** — et le mot de passe de l'écran du bot : « Mot de passe de l'écran VNC : xxxxxxxx (retrouve-le : bot vnc) ».
7. **Terminé 🎉** — un récapitulatif, puis une question :

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🎉 Installation terminée
  1. Connexion : bot login (code Telegram, puis Binance via AVNC)
  2. Ensuite le bot tourne tout seul, même Termux fermé
  3. Réglages Android indispensables : GUIDE-ANDROID.md, étape 8
  Commandes : bot status · bot logs · bot stop · bot start
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Te connecter maintenant à Telegram et Binance ? [O/n]
```

Appuie sur **Entrée** (= oui) et passe à l'[étape 7](#-7-se-connecter).

Tu as répondu `n` ? Lance `bot login` dès que possible. Le watchdog, déjà actif, démarrera le bot entre-temps : sans connexion Telegram, il attendra (« 🔑 Session Telegram à refaire… » dans les logs).

### Si l'éditeur nano s'ouvre

- Le modèle contient des valeurs d'exemple : remplace `API_ID`, `API_HASH` et `PHONE_NUMBER` par les tiennes. `TARGET_CHANNELS` contient déjà une liste de canaux : garde-la ou adapte-la.
- Colle ton jeton après `ALERT_BOT_TOKEN=`. La ligne `NOTIFY_LEVEL=all` y est déjà.
- Enregistre : **Ctrl+O**, puis Entrée. Quitte : **Ctrl+X**.
- Si une de ces 4 valeurs est vide (ou si `API_HASH` est encore celui d'exemple), l'installation l'affiche : « À compléter dans .env : … ». Elle continue quand même. Corrige ensuite avec :

  ```bash
  nano ~/red-packet-bot-telegram/.env
  ```

### Si c'est interrompu

Coupure d'Internet, Termux fermé, téléphone éteint… Relance **exactement la même commande** :

```bash
bash ~/red-packet-bot-telegram/deploy/android/install.sh
```

Elle reprend où elle en était : un Debian déjà installé n'est pas réinstallé, et ton `.env`, ton `android.env` et ton mot de passe d'écran sont conservés. Tu peux la relancer autant de fois que nécessaire.

### Les avertissements possibles

- À l'étape [5] : « ALERT_BOT_TOKEN vide : pas d'alertes… » → crée ton bot (étape 4) et ajoute le jeton avec `nano ~/red-packet-bot-telegram/.env`.
- À l'étape [6] : « Watchdog à activer plus tard… » → installe l'appli Termux:API depuis F-Droid, ouvre-la une fois, puis tape `bot watchdog on`.

---

## 🔑 7. Se connecter

Le bot a besoin de deux connexions : **Telegram** (pour lire les canaux) et **Binance** (pour réclamer). Tu les fais une fois, avec :

```bash
bot login
```

Tu peux aussi répondre « O » à la fin de l'installation, ou utiliser le widget **5 🔑 Connexion du bot**.

`bot login` met le bot en pause s'il tournait, te connecte à Telegram puis à Binance, envoie une alerte de test, puis **démarre le bot**.

Termux affiche d'abord les infos de l'écran du bot :

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🖥️  Écran du bot (connexion Binance)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📲 App      AVNC → ➕ nouveau serveur
  🌍 Adresse  127.0.0.1   Port 5901
  🔒 Mot de passe k7Qm2xPa
```

Note ce mot de passe (8 caractères). Tu le retrouves à tout moment avec `bot vnc`.

### 7.1 Telegram

1. Termux affiche `📱 Code Telegram :`.
2. Telegram t'envoie un code dans l'appli Telegram (message du compte officiel « Telegram »), ou par SMS. Ouvre Telegram, lis le code, reviens dans Termux.
3. Tape le code, puis Entrée.
4. Ton compte a un mot de passe (validation en deux étapes) ? Termux affiche `🔐 Mot de passe 2FA :` : tape-le.
5. Tu vois « 👤 Connecté : Ton Nom (@ton_pseudo) ».

Ce téléphone est déjà connecté ? Aucune question : le bot passe directement à Binance.

### 7.2 Binance, avec AVNC

> [!TIP]
> AVNC est pénible sur un petit écran ? Utilise plutôt la méthode **[7.2 bis : connexion depuis le PC](#72-bis-plus-facile--connexion-binance-depuis-le-pc-sans-avnc)**, plus simple.

1. Termux affiche :

   ```text
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     🔑 Connectez-vous manuellement à Binance dans le navigateur
     📱 Écran du bot : app AVNC → 127.0.0.1:5901 (mot de passe : « bot vnc »)
     ⏱️ Le bot attend ta connexion, sans limite de temps
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

   Ta session Binance est encore valide ? Tu vois directement « 🔓 Session Binance active » : rien à faire.

2. Ouvre **AVNC** → bouton **➕** (nouveau serveur) :
   - Nom : `Bot Red Packet` (au choix) ;
   - Hôte (*Host* ou *Adresse*) : `127.0.0.1` ;
   - Port : `5901` ;
   - **Nom d'utilisateur : laisse VIDE** (cette connexion n'a pas de nom d'utilisateur) ;
   - Mot de passe : celui affiché par Termux. Tu l'as oublié ? Tape `bot vnc` dans Termux (majuscules et minuscules comptent).

   Laisse le reste par défaut. Enregistre, puis touche ce serveur pour te connecter. La prochaine fois, il sera déjà dans la liste.

   « Connexion refusée » ? L'écran n'existe que pendant que le bot tourne (ou pendant `bot login`) : vérifie avec `bot status`, et lance `bot start` si besoin.
3. Tu vois l'**écran du bot** (1280×1024), avec Chromium ouvert sur Binance. Tourne le téléphone **en paysage** et **zoome** avec deux doigts.
4. Connecte-toi comme d'habitude : e-mail (ou téléphone), mot de passe, puis la vérification (2FA, puzzle…). Le clavier n'apparaît pas quand tu touches un champ ? Ouvre la barre d'outils d'AVNC (sur le bord de l'écran) et touche l'icône **clavier**. Pour lire le code 2FA, passe dans ton appli SMS, e-mail ou d'authentification, puis reviens dans AVNC. Si Binance te propose un QR code, choisis plutôt la connexion par mot de passe.
5. Prends ton temps : le bot attend **sans limite**. Il vérifie toutes les 5 s et affiche « ⏳ En attente de ta connexion Binance... » chaque minute.
6. Dès que c'est bon, Termux affiche « 🔓 Connexion Binance détectée », « 🍪 Cookies de session sauvegardés localement », puis « 🟢 Navigateur Binance prêt ».
7. Reviens dans Termux. AVNC se déconnecte ensuite : c'est normal, l'écran se ferme à la fin de la connexion.

### 7.2 bis Plus facile : connexion Binance depuis le PC (sans AVNC)

Te connecter à Binance avec AVNC sur un petit écran est pénible ? Connecte-toi **sur le PC** (souris, clavier), puis copie la session sur le téléphone.

**Sur le PC**

1. Ouvre un terminal dans le dossier du bot (`C:\Users\…\red-packet-bot-telegram`) et tape :

   ```bash
   node index.js --setup
   ```

2. Tape le code Telegram s'il est demandé. Une fenêtre Chromium s'ouvre : **connecte-toi à Binance** (e-mail, mot de passe, 2FA). Le bot sauvegarde la session puis s'arrête tout seul (« ✅ Connexions OK »).
3. La session est dans le fichier **`browser-data\cookies.json`** du dossier du bot.
4. Envoie ce fichier dans tes **« Messages enregistrés »** Telegram (glisse-le dans Telegram Desktop).

**Sur le téléphone**

5. Dans Telegram → **Messages enregistrés** → touche le fichier pour le télécharger → **⋮ → « Enregistrer dans les téléchargements »**. Il arrive dans `Download/Telegram`.
6. Dans Termux, vérifie qu'il est là :

   ```bash
   ls /sdcard/Download/Telegram/
   ```

   « Permission denied » ? Tape `termux-setup-storage`, autorise l'accès aux fichiers, puis recommence.
7. Mets-le en place, une ligne à la fois (si le fichier s'appelle `cookies (1).json`, adapte le nom en gardant les guillemets) :

   ```bash
   mkdir -p ~/red-packet-bot-telegram/browser-data
   cp "/sdcard/Download/Telegram/cookies.json" ~/red-packet-bot-telegram/browser-data/cookies.json
   bot restart
   ```

   Pas encore fait `bot login` sur ce téléphone ? Lance plutôt `bot login` à la place de `bot restart` : après le code Telegram, l'étape Binance passe toute seule.
8. Vérifie avec `bot logs` : tu dois voir `🍪 Cookies de session restaurés`, puis `🔓 Session Binance active` et `🟢 Navigateur Binance prêt` (Ctrl+C pour quitter les logs, le bot continue).

   ⚠️ Si le bot du **PC** tourne (`npm start`), le téléphone reste en veille et n'ouvre pas Binance : c'est normal. Pour tester le téléphone, arrête le bot du PC.

9. **Fais le ménage** (ce fichier donne accès à ton compte Binance) :

   ```bash
   rm "/sdcard/Download/Telegram/cookies.json"
   ```

   Puis **supprime le message** qui contient le fichier dans tes « Messages enregistrés ».

**Si Binance redemande une connexion (alerte 🔑)** — il a peut-être remarqué que la session a changé d'appareil. Fais en sorte que le téléphone se présente comme le PC :

```bash
echo 'BROWSER_USER_AGENT=' >> ~/red-packet-bot-telegram/android.env
```

puis refais les étapes 1 à 8.

**Plus tard** : une session Binance dure quelques jours. Quand l'alerte « 🔑 Binance demande une reconnexion » revient, refais simplement cette section.

### 7.3 Alerte de test et démarrage

- Dans la partie « 🔔 Alertes », Termux affiche « 🔔 Alerte de test envoyée — vérifie ton Telegram ». Ton bot d'alertes t'écrit :

  > 📱 Téléphone · 🔔 Test : si tu lis ce message, les alertes du bot fonctionnent.

- Pas d'alerte ? Termux affiche la raison, par exemple « 🔕 Alertes désactivées (ALERT_BOT_TOKEN vide) ». Voir le [Dépannage](#-15-dépannage).
- Enfin :

  ```text
  ╔══════════════════════════════════════════════╗
  ║  ✅ Connexions OK                            ║
  ║  Lance le bot : widget ▶️ ou « bot start »    ║
  ╚══════════════════════════════════════════════╝
  ```

  Puis « Connexions OK ✅ — démarrage du bot » et « Bot démarré 🟢 — il continue même si tu fermes Termux ». **Le bot tourne.** 🎉

Connexion interrompue ? Termux affiche « Connexion interrompue (code …) — relance : bot login ». Relance simplement `bot login`.

---

## 🔋 8. Réglages Android pour le 24 h/24 — même si Termux se ferme

Android aime fermer les applis qui tournent en arrière-plan. Le bot se défend tout seul, mais ces réglages sont **indispensables** pour qu'il tienne jour et nuit.

### Comment le bot reste en vie

1. **Tâche de fond Termux** : le bot n'est pas attaché à une fenêtre. Tu peux fermer Termux ou le retirer des applis récentes : il continue. La notification de Termux affiche une tâche (« 1 task »). Un *wake lock* empêche le téléphone de l'endormir.
2. **Superviseur** : si le bot s'arrête, il le relance. D'abord après 10 s, puis 20 s, 40 s… jusqu'à 10 min entre deux essais. Il revient à 10 s dès que le bot a tenu 5 min. Si la session Telegram est à refaire : un essai toutes les 30 min, et une alerte 🔑.
3. **Termux:Boot** : relance le bot quand le téléphone redémarre.
4. **Watchdog** (Termux:API) : toutes les 15 min, Android lui-même fait vérifier le bot. Il le relance si Android a tué Termux, si tu as appuyé sur « Exit » dans la notification, ou si le bot est figé (aucun signe de vie depuis 5 min).

👉 **Seul ⏹️ (ou `bot stop`) l'arrête pour de bon.** Le démarrage automatique et le watchdog respectent ton choix jusqu'au prochain ▶️.

### 8.1 Batterie « Sans restriction »

À faire pour **Termux**, **Termux:API** et **Termux:Boot** :

- Android 12 et plus : Paramètres → Applications → Termux → **Batterie** (ou « Utilisation de la batterie par l'appli ») → **Sans restriction**.
- Versions plus anciennes : Paramètres → Applications → Accès spéciaux → **Optimisation de la batterie** → Toutes les applis → Termux → **Ne pas optimiser** (« Non optimisée »).

Les noms changent selon la marque : voir 8.6.

### 8.1 bis Internet en arrière-plan (sinon Telegram coupe à l'écran verrouillé)

Symptôme : dans `bot logs`, « 📡 Connexion Telegram perdue — reconnexion automatique » revient dès que **l'écran se verrouille** ou que **tu quittes Termux**. Le bot tourne toujours, mais **Android lui coupe Internet** en arrière-plan : pendant ces coupures, aucun code n'arrive. Ces réglages sont **indispensables** :

1. **Wake lock actif** : tire le volet des notifications. La notification de Termux doit indiquer **« wake lock held »** (et « 1 task »). Si tu vois un bouton **« Acquire wakelock »**, appuie dessus (ou tape `termux-wake-lock` dans Termux). N'appuie jamais sur « Release wakelock ».
2. **Batterie « Sans restriction »** pour Termux (8.1). C'est ce qui autorise Termux à garder Internet quand le téléphone dort. Si Android te demande « Autoriser Termux à toujours s'exécuter en arrière-plan ? », réponds **Autoriser**.
3. **Données en arrière-plan** : Paramètres → Applications → **Termux** → **Données mobiles et Wi-Fi** (ou « Utilisation des données ») :
   - **Données en arrière-plan** : **activé** ;
   - **Utilisation des données sans restriction** (ou « illimitée ») : **activé**.
4. **Économiseur de données** désactivé : Paramètres → Réseau et Internet (ou Connexions) → **Économiseur de données** → désactivé. Ou laisse-le, mais ajoute Termux aux applis autorisées.
5. **Wi-Fi pendant la veille** : si ton téléphone a l'option, Paramètres Wi-Fi → ⋮ / Avancé → **Garder le Wi-Fi activé pendant la veille : Toujours**. Désactive aussi « Basculer automatiquement vers les données mobiles » si le Wi-Fi est bon.
6. **Téléphone en charge** (8.3) : branché, Android ne passe pas en veille profonde et coupe beaucoup moins.
7. Les réglages de **ta marque** (8.6) : démarrage automatique, applis « jamais en veille », etc.

**Test** : verrouille l'écran **5 minutes**, puis dans Termux :

```bash
bot logs
```

Pendant ces 5 minutes, il ne doit plus y avoir de ligne « 📡 Connexion Telegram perdue ». S'il en reste, refais les points 1 à 7 (le 3 et le 7 sont les plus souvent oubliés).

Le bot t'aide à trouver la cause :

- « 💤 **Android a endormi le bot pendant …** » (dans les logs, et une alerte Telegram) : le processeur du téléphone s'endort, donc le **wake lock ne marche pas**. Vérifie le point 1 (« wake lock held ») et le point 2, puis les réglages de ta marque (8.6), en particulier le **nettoyage à l'écran verrouillé**.
- Seulement des « 📡 Connexion Telegram perdue », **sans** 💤 : c'est le **réseau** (box, opérateur, Wi-Fi en veille) qui coupe. Le bot envoie un signal à Telegram toutes les 15 s pour garder la connexion ouverte, et se reconnecte tout seul en moins de 30 s. Si c'est très fréquent, essaie l'autre réseau (Wi-Fi ↔ données mobiles) et le point 5.

### 8.2 Verrouille Termux dans les applis récentes

Ouvre les applis récentes. Appui long sur Termux (ou sur son icône, en haut de la vignette) → **Verrouiller** (cadenas 🔒). Ainsi, « Tout fermer » ne le touche pas.

### 8.3 Laisse le téléphone en charge

- Branché, le téléphone n'entre pas en veille profonde : le watchdog passe à l'heure.
- En cas de coupure de courant, il continue sur sa batterie.
- Pour protéger la batterie, active une limite de charge (8.7).

### 8.4 N'appuie jamais sur « Exit »

Le bouton « Exit » de la notification Termux arrête **tout**, bot compris. Le watchdog le relancera, mais tu perds jusqu'à 15 min.

- Pour arrêter le bot : ⏹️ (ou `bot stop`).
- Pour quitter Termux : bouton Accueil, tout simplement.

### 8.5 Le « phantom process killer » (Android 12 et plus)

Depuis Android 12, Android tue les processus lancés par une appli (Debian, Chromium…) quand il y en a trop, ou quand ils travaillent trop. Symptômes : le bot est tué régulièrement (code 137 dans les logs, alertes ♻️, « 🔴 arrêté anormalement » dans `bot status`).

**Android 11 ou moins : rien à faire.**

**Active d'abord les options pour les développeurs** (une seule fois) : Paramètres → À propos du téléphone → appuie **7 fois** sur « Numéro de build ». (Samsung : « Informations sur le logiciel » → « Numéro de version ». Xiaomi : « Version de MIUI » ou « Version de l'OS ».) Les options apparaissent ensuite dans Paramètres → Système, ou tout en bas des Paramètres.

#### Android 14 et plus — le plus simple

1. Ouvre les **Options pour les développeurs**.
2. Active **« Désactiver les restrictions des processus enfants »** (*Disable child process restrictions*).

C'est tout. Si cette option n'existe pas sur ton téléphone, utilise la méthode ADB ci-dessous.

#### Android 12 et 13 — avec ADB, une seule fois

Le réglage reste actif après un redémarrage.

**Méthode A — depuis le téléphone lui-même, sans PC :**

1. Le téléphone doit être connecté au **Wi-Fi**.
2. Dans Termux :

   ```bash
   pkg install -y android-tools
   ```

3. Options pour les développeurs → active **Débogage sans fil**, puis touche « Débogage sans fil » pour ouvrir son écran.
4. Mets **Paramètres et Termux en écran partagé**. Sinon, la fenêtre du code se ferme dès que tu changes d'appli.
5. Touche **« Associer l'appareil avec un code d'association »**. Une fenêtre affiche un **code à 6 chiffres** et une adresse qui finit par `:PORT`.
6. Dans Termux, remplace `PORT` et `CODE` par ce que tu vois :

   ```bash
   adb pair 127.0.0.1:PORT CODE
   ```

   Tu dois voir « Successfully paired ».
7. Sur l'écran principal « Débogage sans fil », lis **« Adresse IP et port »**. Ce port est **différent** de celui du point 5. Puis :

   ```bash
   adb connect 127.0.0.1:PORT
   ```

8. Lance :

   ```bash
   adb shell "/system/bin/device_config set_sync_disabled_for_tests persistent; /system/bin/device_config put activity_manager max_phantom_processes 2147483647"
   ```

9. **Android 12L et 13 seulement**, ajoute :

   ```bash
   adb shell settings put global settings_enable_monitor_phantom_procs false
   ```

10. Vérifie : `adb shell "/system/bin/device_config get activity_manager max_phantom_processes"` doit afficher `2147483647`.
11. Désactive ensuite le Débogage sans fil.

**Méthode B — depuis un PC avec ADB :** active le **Débogage USB** dans les options pour les développeurs, branche le téléphone, accepte la demande qui s'affiche, puis lance les mêmes commandes `adb shell` (points 8 et 9) sur le PC.

### 8.6 Réglages selon la marque

Certaines marques ajoutent leur propre « nettoyeur ». Cherche ces réglages (les noms changent selon la version) et autorise **Termux, Termux:API et Termux:Boot** :

**Tecno, Infinix, itel** (HiOS, XOS, itel OS) :

- **Phone Master** → nettoyage automatique / accélération : ajoute les 3 applis à la **liste blanche** (exceptions).
- **Gestion du démarrage automatique** (*Auto-start management*) : autorise les 3 applis.
- **Économie d'énergie** (*Power saving*) : désactive-la, ou exclus les 3 applis.
- Verrouille Termux dans les applis récentes (8.2).

Exemple détaillé : **Tecno Camon 40 (HiOS 15, Android 15)**. Les noms peuvent varier un peu selon la mise à jour : si tu ne trouves pas, utilise la **loupe 🔍 des Paramètres** avec le mot entre parenthèses.

1. **Batterie** : Paramètres → Applications → Termux → **Utilisation de la batterie par l'appli** → active **« Autoriser l'utilisation en arrière-plan »** → **Sans restriction**. Pareil pour Termux:API et Termux:Boot. (« batterie »)
2. **Internet en arrière-plan** : Paramètres → Applications → Termux → **Utilisation des données** → **Données en arrière-plan** activé et **Utilisation des données sans restriction** activé. (« données »)
3. **Économiseur de données** : Paramètres → Réseau mobile → **Économiseur de données** → désactivé. (« économiseur »)
4. **Démarrage automatique** : Paramètres → Applications → **Démarrage automatique** (ou Phone Master → Démarrage auto) → Termux, Termux:Boot, Termux:API activés. (« démarrage »)
5. **Nettoyage à l'écran verrouillé** : dans **Phone Master** (ou Paramètres → Batterie), désactive « Nettoyage à l'écran verrouillé » / « Fermer les applis à l'écran verrouillé », ou mets Termux en liste blanche. C'est souvent lui qui coupe le bot quand l'écran se verrouille. (« verrouillé »)
6. **Économie d'énergie** : Paramètres → Batterie → désactive **Mode économie d'énergie** et **Power Marathon** / économie d'énergie intelligente.
7. **Applis récentes** : tire la vignette Termux vers le bas (ou appui long) → **cadenas 🔒**.
8. **Phantom process killer** : Paramètres → À propos du téléphone → touche 7 fois « Numéro de build », puis Paramètres → Système → **Options pour les développeurs** → **« Désactiver les restrictions des processus enfants »**. (« processus enfants »)

**Samsung** (One UI) :

- Paramètres → **Batterie** (ou Entretien de l'appareil → Batterie) → **Limites d'utilisation en arrière-plan** → **Applications jamais en veille** (*Never sleeping apps*) → ajoute les 3 applis.
- Au même endroit, désactive « Mettre en veille les applications inutilisées ».

**Xiaomi, Redmi, POCO** (MIUI, HyperOS) :

- Paramètres → Applications → Termux → **Démarrage automatique** (*Autostart*) : activé.
- Même écran → **Économiseur de batterie** → **Aucune restriction** (*No restrictions*).
- Applis récentes : appui long sur Termux → **cadenas**.

**Autre marque ?** Cherche ton modèle sur **https://dontkillmyapp.com** : la marche à suivre y est détaillée.

### 8.7 Limite de charge

Un téléphone toujours branché à 100 % use sa batterie. Si ton téléphone le propose, limite la charge. Par exemple, chez Samsung : Paramètres → Batterie → « **Protéger la batterie** » (la charge s'arrête vers 80-85 %). Ailleurs, cherche « charge optimisée » ou « protection de la batterie ».

### 8.8 Après un redémarrage : déverrouille une fois

Si ton téléphone a un code, un schéma ou une empreinte, Android ne lance Termux:Boot **qu'après le premier déverrouillage**. Après un redémarrage (ou une batterie vide), déverrouille donc le téléphone une fois. Le bot est en ligne 1 à 2 min plus tard : il attend d'abord le réseau.

### 8.9 Facultatif : être prévenu si le téléphone meurt (healthchecks.io)

Les alertes du bot ne peuvent pas te prévenir si le téléphone lui-même est éteint. **healthchecks.io** (gratuit) le peut : le bot lui envoie un signe de vie toutes les 5 min, et le site te prévient quand les signes s'arrêtent.

1. Crée un compte gratuit sur **https://healthchecks.io**.
2. Crée un *check* : période (*Period*) **5 minutes**, délai de grâce (*Grace Time*) de 5 à 10 minutes.
3. Copie son **URL de ping** (`https://hc-ping.com/…`).
4. Dans Termux :

   ```bash
   nano ~/red-packet-bot-telegram/android.env
   ```

   Retire le `#` devant la ligne `HEALTHCHECK_URL=` et mets ton URL :

   ```ini
   HEALTHCHECK_URL=https://hc-ping.com/ton-identifiant
   ```

   Enregistre (Ctrl+O, Entrée) et quitte (Ctrl+X).
5. Tape `bot restart`. Les logs affichent « 💓 Healthcheck : ping toutes les 5 min ».
6. Sur healthchecks.io → **Integrations** → **Telegram** : suis les instructions pour recevoir ses alertes sur Telegram.

> [!TIP]
> Mets cette URL dans `android.env`, **pas** dans le `.env` partagé : sinon le PC enverrait lui aussi des signes de vie, et cacherait un téléphone en panne.
> Si tu arrêtes le bot exprès (⏹️), healthchecks.io te préviendra aussi : mets le *check* en pause sur le site.

---

## 🧩 9. Les widgets

### Ajouter le widget

1. Vérifie que **Termux:Widget** est installé (depuis F-Droid).
2. Sur l'écran d'accueil, appui long sur un espace vide → **Widgets**.
3. Cherche **Termux:Widget**. Appui long dessus, puis dépose-le sur l'écran d'accueil.
4. Il affiche la liste des boutons du bot.

> [!NOTE]
> ▶️ et ⏹️ peuvent apparaître précédés de `tasks/` : c'est normal. Ils s'exécutent en arrière-plan, sans ouvrir de terminal.
> Liste vide ou incomplète ? Retire le widget et ajoute-le de nouveau.

### Les 5 boutons

1. **1 ▶️ Démarrer le bot** — démarre le bot en arrière-plan (`bot start`). Un petit message s'affiche : « 🚀 Bot démarré — il tourne en arrière-plan ». Annule un arrêt ⏹️.
2. **2 ⏹️ Arrêter le bot** — arrêt propre, jusqu'à 30 s (`bot stop`). Message : « ⏹️ Bot arrêté ». Le bot ne redémarre plus tout seul, ni au démarrage du téléphone ni par le watchdog, jusqu'au prochain ▶️.
3. **3 📊 État du bot** — ouvre Termux sur le tableau de bord (`bot status`). Appuie sur Entrée pour fermer.
4. **4 📜 Logs du bot** — ouvre Termux sur les logs en direct (`bot logs`). Ctrl+C pour quitter : le bot continue.
5. **5 🔑 Connexion du bot** — reconnexion Telegram + Binance (`bot login`). Appuie sur Entrée à la fin pour fermer.

Les petits messages de ▶️ et ⏹️ viennent de l'appli Termux:API. L'installation (et `bot update`) crée et met à jour ces boutons.

---

## 📆 10. Utilisation au quotidien

Au quotidien, il n'y a **rien à faire** : le bot tourne seul. De temps en temps, vérifie que le bilan 📊 de minuit arrive (avec `NOTIFY_LEVEL=all`) et que `bot status` est au vert.

### Les commandes

Tape-les dans Termux :

- `bot start` — ▶️ démarre en arrière-plan (continue même Termux fermé)
- `bot stop` — ⏹️ arrêt propre ; ne redémarre plus tout seul
- `bot restart` — 🔄 redémarre (après un changement de réglage)
- `bot status` — 📊 tableau de bord (détails à l'étape 12)
- `bot logs` — 📜 logs en direct (Ctrl+C pour quitter, le bot continue)
- `bot logs --plain` — les mêmes logs, sans couleurs (pratique à copier)
- `bot login` — 🔑 connexion Telegram + Binance
- `bot vnc` — 🖥️ adresse et mot de passe de l'écran du bot (AVNC)
- `bot update` — ⬇️ met à jour le bot (étape 14)
- `bot watchdog on` / `bot watchdog off` — 🛡️ active ou coupe la vérification toutes les 15 min
- `bot` tout seul — affiche cette liste

Il existe aussi `bot ensure` : c'est le démarrage automatique et le watchdog qui l'utilisent. Tu n'as pas besoin de le taper.

### Démarrer, arrêter

- **Démarrer** : widget ▶️ ou `bot start`. Ensuite, quitte Termux : le bot continue. S'il tourne déjà, `bot start` répond « Le bot tourne déjà 🟢 ».
- **Arrêter** : widget ⏹️ ou `bot stop`. C'est un arrêt durable : ni le démarrage automatique ni le watchdog ne le relancent.
- **Redémarrer** : `bot restart`.

### Quand le téléphone redémarre

1. Tu déverrouilles le téléphone (s'il a un code ou un schéma).
2. Termux:Boot se lance, attend le réseau (jusqu'à 2 min environ) et relance le bot. Avec `NOTIFY_LEVEL=all`, tu reçois « 🟢 Bot en ligne ». Dans les logs, la ligne « 🛡️ Bot arrêté anormalement — relance automatique » est alors normale.
3. Si tu l'avais arrêté avec ⏹️, il reste arrêté. Les logs l'indiquent : « 📱 Téléphone démarré — bot laissé à l'arrêt ».

Le watchdog reste actif après un redémarrage.

### Changer un réglage

- **Réglages communs** (canaux, alertes…) : `nano ~/red-packet-bot-telegram/.env`, puis `bot restart`. Fais la même modification dans le `.env` du PC.
- **Réglages du téléphone seulement** : `nano ~/red-packet-bot-telegram/android.env`, puis `bot restart`. Ils passent avant le `.env`.
- Dans nano : **Ctrl+O** puis Entrée pour enregistrer, **Ctrl+X** pour quitter.

Dans `android.env`, une valeur par ligne (`NOM=valeur`), entre guillemets s'il y a des espaces. Tu peux y mettre :

- `BOT_ROLE=backup` (par défaut) ou `solo` (voir étape 11) ;
- `HEALTHCHECK_URL=…` (voir 8.9) ;
- `CHROMIUM_EXTRA_ARGS="--disable-gpu"` (dépannage de Chromium) ;
- `BOT_NAME="📱 Téléphone"` (préfixe des alertes) ;
- `DEBUG=true` (logs détaillés 🔍) ;
- `LOG_WIDTH=48` (largeur des encadrés dans les logs).

Ne touche pas à une éventuelle ligne `CHROMIUM_PATH=` : c'est l'installation qui la gère.

### Ajouter ou retirer des canaux

Les canaux surveillés sont sur la ligne `TARGET_CHANNELS` du fichier **`.env`**.

1. Dans Termux, ouvre le fichier :

   ```bash
   nano ~/red-packet-bot-telegram/.env
   ```

   (Si `nano` est introuvable : `pkg install -y nano`.)
2. Descends jusqu'à la ligne `TARGET_CHANNELS` avec les flèches de la rangée de touches du bas.
3. Ajoute (ou retire) des canaux, **séparés par des virgules, sans espaces** :

   ```
   TARGET_CHANNELS=@vgfboxes,@binance_box_channel,@nouveaucanal,@autrecanal
   ```

   Chaque canal peut s'écrire `@nomducanal`, `https://t.me/nomducanal`, ou avec son identifiant numérique pour un canal privé (`-1001234567890`).
4. Enregistre : **Ctrl+O** puis **Entrée**. Quitte : **Ctrl+X**.
5. Redémarre le bot pour qu'il prenne la nouvelle liste :

   ```bash
   bot restart
   ```

6. Vérifie avec `bot logs` : au démarrage, la ligne `🎯 N canal(aux) demandé(s) dans TARGET_CHANNELS` doit afficher le nouveau nombre, et les canaux trouvés sont listés sous « 📡 Canaux surveillés ». Un canal introuvable apparaît avec 🚧.

💡 **Rejoins les canaux** avec ton compte Telegram : le bot les trouve bien plus vite, et il ne peut pas lire un canal privé dont tu n'es pas membre.

💡 Le `.env` du **PC** est un fichier séparé : pour avoir les mêmes canaux sur le PC, fais la même modification, puis relance `npm start`.

### Où sont les fichiers

Tout est dans `~/red-packet-bot-telegram/` (dans Debian, ce même dossier s'appelle `/bot`) :

- `.env` — tes réglages 🔒
- `android.env` — les réglages du téléphone 🔒
- `logs/bot.log` — le journal du bot (archivé dans `logs/bot.log.1` à 5 Mo)
- `logs/xvnc.log` — le journal de l'écran virtuel
- `client.session*` — la session Telegram du téléphone 🔒
- `browser-data/` — la session Binance 🔒
- `.vnc-password` — le mot de passe de l'écran 🔒
- `.alert-chat-id` — ton identifiant Telegram, pour les alertes 🔒
- `history.json` — les codes déjà traités (gardés 48 h)
- `.stop` — présent = bot arrêté par toi
- `.run/` — l'état interne (processus, signe de vie, dernières alertes)

🔒 = à ne jamais partager.

---

## 🤝 11. Le relais PC ⇄ téléphone

### Pourquoi un relais ?

Le PC et le téléphone utilisent **le même compte Binance**. Si les deux réclamaient, chaque code serait soumis deux fois : la 2e soumission échoue et brûle une tentative sur le compteur anti-fraude de Binance. Donc **un seul appareil réclame à la fois**, et c'est le PC en priorité.

### Comment ça marche

- Le **PC** (`BOT_ROLE=primary`, par défaut) publie son état **toutes les 60 s** (et aussitôt quand cet état change) dans **un seul message silencieux** de tes **Messages enregistrés**, marqué `#botrelay`.
- Le **téléphone** (`BOT_ROLE=backup`) lit ce message en direct :
  - PC **actif** → 😴 le téléphone reste en veille ;
  - PC en **pause anti-ban** → 😴 veille aussi (même compte Binance : personne ne réclame) ;
  - PC **arrêté** (Ctrl+C) → 📱 le téléphone prend le relais **tout de suite** ;
  - PC **indisponible** (connexion Binance à refaire, navigateur pas prêt) → 📱 relais ;
  - PC **muet depuis plus de 2 min 30** (éteint, planté, sans Internet, en veille) → 📱 relais.
- Le téléphone mesure les durées avec sa propre horloge : les horloges du PC et du téléphone n'ont pas besoin d'être identiques.
- **En veille**, le téléphone écoute toujours Telegram, mais il laisse les codes au PC (« 😴 Code … laissé au PC ») et ne les tentera jamais. Au bout de 2 min de veille, il **ferme Chromium**. Il le rouvre quand il redevient actif.
- **La pause anti-ban est partagée** : l'appareil qui atteint la limite Binance la publie, l'autre la respecte.

### Côté PC : quoi faire ?

- **Presque rien** : `npm start`, comme d'habitude. Le PC est `primary` par défaut.
- Le PC doit avoir **la même version du bot**. Un ancien bot ne publie pas son état : le téléphone se croirait seul, et les deux réclameraient. Mets-le à jour (étape 14).
- Les deux appareils doivent utiliser le **même compte Telegram** (même `PHONE_NUMBER`) : c'est le cas avec le même `.env`.
- Ne mets **jamais** `BOT_ROLE=backup` dans le `.env` du PC.
- Pour passer la main au téléphone, arrête le PC avec **Ctrl+C** : il publie « arrêté » et le téléphone reprend aussitôt. Si tu éteins le PC sans arrêter le bot, le téléphone reprend au bout de 2 min 30.

Au démarrage du PC, tu vois :

```text
[07/10 21:30:12] 📘 INFO  — 🤝 Rôle : 💻 PC prioritaire (BOT_ROLE=primary)
[07/10 21:30:20] 📘 INFO  — 🤝 Relais : 💻 PC prioritaire — état publié toutes les 60 s
                                dans tes « Messages enregistrés » (message #botrelay, silencieux)
[07/10 21:30:21] 📘 INFO  — 🤝 Relais : état publié → 🟢 actif
```

### Ce que tu vois dans Telegram

Dans tes Messages enregistrés, un message mis à jour chaque minute :

```text
🤖 Relais Red Packet — 💻 PC
🟢 actif · Le téléphone reste en veille.
Dernier signal : 21:31:05

#botrelay role=primary state=active pause=0 inst=3f9a1c2e
```

Les états possibles :

- 🟢 actif · Le téléphone reste en veille.
- 🟠 indisponible (navigateur pas prêt) · Le téléphone prend le relais.
- 🛑 pause anti-ban jusqu'à 03:12 · Même compte Binance : aucun appareil ne réclame.
- ⏹️ arrêté · Le téléphone prend le relais.

> [!WARNING]
> **Ne supprime pas et ne modifie pas ce message.** S'il est supprimé, le PC en recrée un à sa publication suivante. Il est aussi remplacé par un nouveau une fois par jour (l'ancien est effacé).

Si c'est le téléphone qui déclenche une pause anti-ban, il poste aussi un message silencieux :

```text
🛑 Pause anti-ban Binance jusqu'à 03:12
Déclenchée par 📱 Téléphone — aucun appareil ne réclame d'ici là.

#botrelay role=backup state=pause pause=1791425520000 inst=8c41d07b
```

Laisse-le aussi : le PC le lit en direct, ou à son prochain démarrage.

Sur le téléphone :

- **logs** : « 😴 Relais : téléphone en veille — le PC est actif » ou « 📱 Relais : le téléphone prend la main — le PC s'est arrêté » ;
- **`bot status`** : « 🤝 Relais 😴 relais — en veille (le PC réclame) » ou « 📱 relais — ACTIF (il réclame les codes) » ;
- **alertes** (avec `NOTIFY_LEVEL=all`) : « 😴 Téléphone en veille : … » et « 📱 Le téléphone prend le relais : … », au plus une de chaque toutes les 5 min, et jamais au démarrage du bot ;
- **bilan d'activité** : les lignes « 🤝 Relais » et « ⏳ Actif / veille ».

### Les 3 rôles (BOT_ROLE)

- `primary` — le PC (par défaut). Il réclame toujours et publie son état.
- `backup` — le téléphone (réglé dans `android.env`). Il réclame seulement quand le PC est absent. Sans aucun PC, il réclame tout seul (« aucun PC actif détecté »).
- `solo` — un seul appareil, sans relais ni message d'état. Sur le téléphone : **seulement s'il n'y a pas de bot sur le PC**. Ajoute alors `BOT_NAME="📱 Téléphone"` dans `android.env` : en `solo`, les alertes sont sinon préfixées « 💻 PC ».

> [!CAUTION]
> Jamais `solo` sur le téléphone pendant que le bot tourne sur le PC : les deux réclameraient chaque code, sans aucun avertissement.

### Deux appareils « prioritaires »

Si deux appareils sont en `primary` (par exemple `BOT_ROLE=primary` dans `android.env`), le bot le détecte :

```text
[07/10 21:40:02] ❌ ERROR — 🤝 Relais : un AUTRE appareil se déclare aussi PC prioritaire !
                                Les deux réclameraient chaque code. Sur le téléphone, BOT_ROLE doit
                                valoir « backup » (le superviseur Android le règle tout seul).
```

Il envoie aussi une alerte ⚠️. Pour corriger : `BOT_ROLE=backup` dans `android.env`, puis `bot restart`.

---

## 📜 12. Comprendre les logs

### Où les voir

- `bot logs` (ou le widget 📜) : les logs en direct et en couleurs. Il montre les 150 dernières lignes, puis la suite au fur et à mesure. Ctrl+C pour quitter : le bot continue.
- `bot logs --plain` : la même chose, sans couleurs (pratique pour copier).
- `bot status` : les 8 dernières lignes, sous le tableau de bord.
- Les fichiers :
  - `~/red-packet-bot-telegram/logs/bot.log` — le journal ; à 5 Mo, il est archivé dans `logs/bot.log.1` (qui remplace l'archive précédente) ;
  - `~/red-packet-bot-telegram/logs/xvnc.log` — le journal de l'écran virtuel.

### Le format

```text
[07/10 21:31:05] 📘 INFO  — 🎯 17 canal(aux) demandé(s) dans TARGET_CHANNELS
```

- `[07/10 21:31:05]` : le jour/mois et l'heure, à l'heure du téléphone ;
- `📘 INFO` : le niveau (voir ci-dessous) ;
- après le `—` : le message.

Les **niveaux** :

- 📘 **INFO** (cyan) — une information ;
- ✅ **OK** (vert) — quelque chose a réussi ;
- ⚠️ **WARN** (jaune) — à surveiller, le bot gère ;
- ❌ **ERROR** (rouge) — un problème. Souvent, le bot le règle tout seul : lis les lignes suivantes ;
- 🔍 **DEBUG** (gris) — les détails, seulement avec `DEBUG=true`.

À savoir aussi :

- Le superviseur, le démarrage automatique et le watchdog écrivent dans le même fichier, avec le même style.
- Les **encadrés** `╔═╗` marquent les grandes étapes, les **séparateurs** `═══ 📡 Telegram ═══` les parties, et les **tableaux** `┌─` les bilans.
- Sur le téléphone, les encadrés font au moins 48 colonnes (`LOG_WIDTH=48`), pour tenir sur l'écran. Un texte plus long les élargit.

### Les emojis à connaître

**Codes**

- 🎁 code trouvé · 🚀 réclamation en cours · 💰 gagné · 🏁 code traité (avec la durée)
- 📭 code refusé par Binance (invalide, expiré, déjà pris) · ⏭️ code passé : non tenté, ou clos — jamais rejoué
- 😴 code laissé au PC · 📥 file d'attente · 🚦 file chargée · ⏱️ attente avant traitement
- 🗑️ nettoyage de minuit (les codes de plus de 48 h sont oubliés)

**Binance**

- 🌐 navigateur · 🔓 session Binance active · 🔑 connexion à refaire · 🍪 cookies de session
- 🛑 pause anti-ban · 🚨 limite Binance atteinte · 🔄 page rechargée (code pas encore soumis)
- 🚫 navigateur pas prêt · ⛔ échec technique, code abandonné sans nouvel essai · 🐌 chargement lent

**Telegram**

- 📡 connexion Telegram · 👤 compte connecté · 🗂️ dialogues indexés
- 🔗 groupes de discussion liés ajoutés · 🚧 canal introuvable (vérifie `TARGET_CHANNELS`)
- ⏮️ aucun rattrapage des anciens messages · 🕰️ message arrivé trop tard · ⏰ horloge décalée · 🐢 limite Telegram

**Surveillance**

- 🤝 relais · 📱 le téléphone prend la main · 😴 veille
- 🛡️ superviseur et watchdog · ♻️ relance · 💤 bot figé · 🧹 nettoyage après un arrêt brutal
- 💓 signe de vie (healthcheck) · 🔔 alerte · 🔕 alerte non envoyée · 💥 erreur · 💀 arrêt sur erreur grave

### Exemple commenté

**① Le superviseur démarre le bot**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🛡️  Superviseur Android démarré
  Rôle : backup · arrêt : widget ⏹️ ou « bot stop »
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

╔═══════════════════════════════════════════════════════════╗
║  🤖 Bot Red Packet — Telegram × Binance                   ║
║  ⚡ Détection instantanée · Zéro retry · Zéro rattrapage  ║
╚═══════════════════════════════════════════════════════════╝

══════════════ 🧩 Initialisation ═══════════════
[07/10 21:31:05] 📘 INFO  — 🤝 Rôle : 📱 téléphone en relais (BOT_ROLE=backup)
[07/10 21:31:05] 📘 INFO  — 🔔 Alertes : activées — problèmes + gains, via ton bot Telegram
[07/10 21:31:05] 📘 INFO  — 📋 Historique : 42 code(s) en mémoire
[07/10 21:31:05] 📘 INFO  — 🎯 17 canal(aux) demandé(s) dans TARGET_CHANNELS
```

Le téléphone est en rôle `backup` (relais) et les alertes sont actives. Chromium n'est pas encore lancé : le bot regarde d'abord si le PC travaille.

**② Connexion à Telegram**

```text
═════════════════ 📡 Telegram ══════════════════
[07/10 21:31:06] 📘 INFO  — 🔌 Connexion à Telegram avec mtcute...
[07/10 21:31:07] ✅ OK    — 📡 Connexion Telegram rétablie — écoute active
[07/10 21:31:08] ✅ OK    — 👤 Connecté : Kevin (@kev)
[07/10 21:31:08] 📘 INFO  — 🗂️  Indexation des dialogues pour résoudre 17 canal(aux)...
[07/10 21:31:09] ✅ OK    — 🗂️  238 dialogue(s) indexé(s)

═════════════ 📡 Canaux surveillés ═════════════
   • @binance_box_channel
   • @cryptogws
   • @vgfboxes

[07/10 21:31:09] ✅ OK    — 🚀 Écoute active sur 17 chat(s) — 17 résolu(s) sur 17 cible(s)
[07/10 21:31:09] 📘 INFO  — ⏮️ Aucun rattrapage : seuls les codes publiés après 21:31:06 sont pris
[07/10 21:31:09] 📘 INFO  — ⏹️  Arrêt : widget ⏹️ ou commande « bot stop »
```

Les 17 canaux de `TARGET_CHANNELS` sont trouvés (la liste, classée par ordre alphabétique, est raccourcie ici). Seuls les codes publiés **après** l'heure indiquée (le début de l'écoute, juste avant la connexion) seront pris.

Quelques secondes plus tard, le bot ajoute en arrière-plan les groupes de discussion liés à ces canaux, par exemple : « 🔗 4 groupe(s) de discussion lié(s) ajouté(s) — 21 chats surveillés au total ».

**③ Le PC travaille : le téléphone se met en veille**

```text
═══════════ 🤝 Relais PC ⇄ téléphone ═══════════
[07/10 21:31:10] 📘 INFO  — 🤝 Relais : 📱 téléphone en secours — il réclame seulement
                                quand le PC est arrêté, pas prêt, ou muet depuis 2 min 30
[07/10 21:31:10] 📘 INFO  — 😴 Relais : téléphone en veille — le PC est actif

╔══════════════════════════════════════════════════════╗
║  🟢 Bot opérationnel — 😴 en veille (le PC réclame)  ║
║  ⏱️ Bilan automatique toutes les 30 min              ║
╚══════════════════════════════════════════════════════╝
```

Le bot est prêt. Il écoute les canaux, mais c'est le PC qui réclame.

**④ Tu arrêtes le PC : le téléphone prend le relais et gagne un code**

```text
[07/10 22:05:41] ✅ OK    — 📱 Relais : le téléphone prend la main — le PC s'est arrêté
[07/10 22:05:41] 📘 INFO  — 🌐 Lancement du navigateur Chromium...
[07/10 22:05:52] 📘 INFO  — 🍪 Cookies de session restaurés
[07/10 22:06:09] ✅ OK    — 🔓 Session Binance active — champ Cryptobox visible
[07/10 22:06:09] 📘 INFO  — 🍪 Cookies de session sauvegardés localement
[07/10 22:06:09] ✅ OK    — 🟢 Navigateur Binance prêt
[07/10 22:14:37] ✅ OK    — 🎁 Code trouvé : 92J5LXPM — depuis @vgfboxes
[07/10 22:14:37] 📘 INFO  — 🚀 Réclamation en cours : 92J5LXPM
[07/10 22:14:45] ✅ OK    — 💰 GAGNÉ ! Code 92J5LXPM → 0.00000005 BNB
[07/10 22:14:45] ✅ OK    — 🏁 Code 92J5LXPM traité en 8112 ms
```

Le PC a publié « arrêté » : le téléphone lance Chromium, retrouve sa session Binance, puis réclame.

**⑤ Le PC revient : le téléphone se rendort**

```text
[07/10 22:31:02] 📘 INFO  — 😴 Relais : téléphone en veille — le PC est actif
[07/10 22:31:40] ✅ OK    — 🎁 Code trouvé : QW3RT5YU — depuis @rsbox
[07/10 22:31:40] 📘 INFO  — 😴 Code QW3RT5YU laissé au PC (téléphone en veille)
[07/10 22:33:02] 📘 INFO  — 🌐 Navigateur fermé
[07/10 22:33:02] 📘 INFO  — 😴 Chromium fermé pendant la veille (mémoire libérée)
```

Le code est laissé au PC. Deux minutes après le passage en veille, Chromium est fermé.

### D'autres lignes que tu croiseras

**Un code refusé ou raté**

- « ⚠️ WARN — 📭 Code … — *message de Binance* », puis « ⏭️ Code … clos définitivement — on passe au suivant (aucun retry) » : code invalide, expiré ou déjà vidé. Normal.
- « ⏭️ Code … — échec technique, abandonné sans nouvelle tentative » : un raté ponctuel. Le code n'est jamais rejoué.
- « 🚫 Navigateur non prêt — code … non tenté », puis « ⏭️ Code … non tenté (browser_unavailable) » : Chromium démarrait encore (juste après une prise de relais, par exemple).
- « ⏭️ Code … abandonné — champ de saisie introuvable (aucun retry) », puis « ⏭️ Code … non tenté (page Cryptobox inaccessible) » : la page Binance ne s'est pas affichée à temps. Tu reçois l'alerte ⚠️ « Page Cryptobox inaccessible ».

**La pause anti-ban**

- « 🚨 ALERTE ANTI-BAN : La limite de Binance a été atteinte. » puis « 🛑 Le bot se met en pause automatique pour 5 heures. »
- « 🚨 AVERTISSEMENT ANTI-BAN : Binance signale des tentatives restantes. » puis « 🛑 Pause de sécurité de 2 heures déclenchée pour réinitialiser le compteur. »
- Pendant la pause : « ⏳ Bot en pause de sécurité Anti-Ban. Code … ignoré. Reprise dans … min. »
- Sur l'autre appareil : « 🛑 Pause anti-ban partagée par le PC — aucun code jusqu'à 03:12 ».

**La session Binance expire en cours de route**

```text
[08/10 09:12:30] ❌ ERROR — 🔑 Session Binance expirée — code 7K2M9QXA non soumis
[08/10 09:12:30] ⚠️  WARN — 🔑 Reconnecte-toi à Binance — 📱 Écran du bot : app AVNC → 127.0.0.1:5901 (mot de passe : « bot vnc »)
                                Les codes sont ignorés en attendant (aucune tentative brûlée).
[08/10 09:12:30] ⚠️  WARN — ⏭️ Code 7K2M9QXA non tenté (session Binance à reconnecter)
[08/10 09:20:50] ✅ OK    — 🔓 Session Binance rétablie — les codes sont de nouveau réclamés
```

**Telegram**

- « 📡 Telegram hors ligne — reconnexion automatique... » puis « 📡 Connexion Telegram rétablie — écoute active » : une coupure d'Internet, gérée toute seule.
- « ⏰ 25 messages d'affilée jugés antérieurs au démarrage… » ou « 🕰️ Beaucoup de messages jugés périmés… » : l'horloge du téléphone est décalée (voir Dépannage).

**Superviseur, démarrage automatique et watchdog**

```text
[08/10 03:12:44] ❌ ERROR — 💀 Chromium plante en boucle (plus de 3 fois en 10 min) — arrêt du bot (le superviseur va le relancer)
[08/10 03:12:49] ⚠️  WARN — ♻️  Le bot s'est arrêté (code 1, après 5h41m) — relance dans 10 s
```

Le superviseur relance le bot : après 10 s, puis 20 s, 40 s… jusqu'à 10 min.

```text
[08/10 04:00:12] ⚠️  WARN — 🛡️  Bot arrêté anormalement — relance automatique
[08/10 04:00:12] 📘 INFO  — 🚀 Démarrage du bot en arrière-plan…
[08/10 04:00:15] ✅ OK    — Bot démarré 🟢 — il continue même si tu fermes Termux
```

Le watchdog a trouvé le bot arrêté (Termux tué, « Exit »…) et l'a relancé. Quand tout va bien, il n'écrit rien. Juste après un redémarrage du téléphone, ces mêmes lignes viennent de Termux:Boot : c'est normal.

- « 💤 Aucun signe de vie depuis 6m12s — bot figé, relance » : le bot ne répondait plus, le watchdog l'a relancé.
- « 📱 Téléphone démarré (Termux:Boot) — attente du réseau… » : le téléphone vient de redémarrer.
- « 📱 Téléphone démarré — bot laissé à l'arrêt (arrêté par toi : bot start pour le relancer) » : tu l'avais arrêté avec ⏹️ (ou un `bot login` ou un `bot update` avait échoué).
- « 🔑 Session Telegram à refaire : lance « bot login » (widget 🔑). Nouvel essai dans 30 min. » : voir l'étape 7.
- « 🗂️  Log archivé dans logs/bot.log.1 (5 Mo atteints) » : rotation normale du journal.
- « 🧹 Chromium orphelin arrêté » ou « 🧹 Bot orphelin (sans superviseur) arrêté » : nettoyage après un arrêt brutal.
- « 🛑 Signal SIGTERM — arrêt propre... », le « 📊 Bilan final », « 👋 Bot arrêté proprement — à bientôt ! », puis « ⏹️  Arrêt demandé — superviseur terminé » : c'est un `bot stop`.

### Le bilan d'activité

Il s'affiche toutes les 30 min, à minuit (« 📊 Bilan de la journée ») et à l'arrêt propre (« 📊 Bilan final »). La fréquence se règle avec `STATS_INTERVAL_MIN` dans le `.env` : `0` coupe le bilan périodique, mais garde ceux de minuit et de l'arrêt.

Exemple sur le téléphone :

```text
┌─ 📊 Bilan d'activité ─────────────────────────────────
│  ⏱️ Uptime              05h 12m 40s
│  📨 Messages analysés   1843 (dont 97 éditions)
│  🎁 Codes détectés      64
│  🚀 Réclamations        21
│  💰 Gains               15 (71 %)
│  📭 Échecs              6
│  ⏭️ Ignorés             1 (pause/navigateur/session)
│  😴 Laissés au PC       42
│  🔁 Doublons filtrés    209
│  ⏮️ Avant démarrage     31 (jamais traités)
│  🕰️ Messages périmés    2
│  ⚡ Détection → clic    640 ms (pire : 5210 ms)
│  ⌛ Durée réclamation   8100 ms en moyenne
│  📥 Pic de file         3
│  📡 Déconnexions        1
│  🧠 Mémoire du bot      138 Mo
│  💾 RAM libre           1.2 Go / 3.7 Go
│  🤝 Relais              😴 en veille (le PC réclame)
│  ⏳ Actif / veille      01h 02m 10s / 04h 10m 30s
└───────────────────────────────────────────────────────
```

Ligne par ligne :

- **⏱️ Uptime** — depuis combien de temps le bot tourne.
- **📨 Messages analysés** — messages reçus des canaux surveillés (dont les messages modifiés).
- **🎁 Codes détectés** — codes trouvés dans ces messages.
- **🚀 Réclamations** — codes réellement soumis à Binance.
- **💰 Gains** — Red Packets gagnés (et le taux de réussite).
- **📭 Échecs** — codes refusés par Binance (invalides, expirés, déjà pris).
- **⏭️ Ignorés** — codes non tentés : pause anti-ban, navigateur pas prêt, session Binance à refaire ou page Cryptobox inaccessible.
- **😴 Laissés au PC** — codes laissés au PC pendant la veille (cette ligne n'apparaît que s'il y en a).
- **🔁 Doublons filtrés** — codes déjà vus, écartés.
- **⏮️ Avant démarrage** — messages publiés avant le lancement du bot, jamais traités.
- **🕰️ Messages périmés** — messages arrivés trop tard (après une coupure), ignorés.
- **⚡ Détection → clic** — délai moyen entre la détection d'un code et le début de sa réclamation.
- **⌛ Durée réclamation** — durée moyenne d'une réclamation sur Binance.
- **📥 Pic de file** — le plus grand nombre de codes en attente en même temps.
- **📡 Déconnexions** — coupures de la connexion Telegram.
- **🧠 Mémoire du bot** et **💾 RAM libre** — la santé du téléphone.
- **🤝 Relais** et **⏳ Actif / veille** — le mode du téléphone, et le temps passé à réclamer ou en veille. Sur le PC : « 🤝 Relais 💻 PC prioritaire — 🟢 actif ».

Comment le lire :

- Beaucoup de **😴 Laissés au PC** et peu de 🚀 Réclamations sur le téléphone : normal, le PC travaillait.
- **⚡ Détection → clic** au-dessus de 1 s : la file déborde, les derniers codes arrivent trop tard.
- **⏮️ Avant démarrage** qui grimpe alors que **🎁 Codes détectés** reste à 0 : l'horloge du téléphone est décalée.
- **📡 Déconnexions** fréquentes : la connexion Internet est instable.

### Le tableau de bord (`bot status`)

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🤖 Bot Red Packet — État
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ⚙️  Bot          🟢 en marche depuis 3h07m
  🤝 Relais       😴 relais — en veille (le PC réclame)
  🌐 Navigateur   😴 fermé (mémoire libérée)
  🎁 Codes        12 détecté(s) · 0 gagné(s)
  💓 Signe de vie il y a 41s
  🧠 Mémoire      bot 131 Mo · Chromium 0 Mo
  🔥 CPU          3 % (moyenne depuis le lancement)
  🛡️  Watchdog     activé (vérification toutes les 15 min)

[07/10 22:14:03] 📘 INFO  — 📜 Dernières lignes du log (en direct : bot logs) :
```

Suivent les 8 dernières lignes du journal. Ligne par ligne :

- **⚙️ Bot** :
  - « 🟢 en marche depuis … » ;
  - « ⏹️ arrêté par toi » — avec ⏹️ ou `bot stop` (ou après un `bot login` ou un `bot update` qui a échoué) ;
  - « 🔴 arrêté anormalement » — Android l'a tué, ou « Exit » a été pressé (ou le bot n'a encore jamais été lancé). Le watchdog le relancera, ou tape `bot start`.
- **🤝 Relais** :
  - « 📱 relais — ACTIF (il réclame les codes) » ;
  - « 😴 relais — en veille (le PC réclame) » ;
  - « 🔎 relais — vérification du PC » — juste après le démarrage ;
  - « seul (pas de relais avec le PC) » — `BOT_ROLE=solo` ;
  - « 💻 prioritaire (ce téléphone ne laisse rien au PC) » — `BOT_ROLE=primary` : à corriger (étape 11).
- **🌐 Navigateur** :
  - « 🟢 prêt (connecté à Binance) » ;
  - « 🔑 connexion Binance requise → bot vnc » — reconnecte-toi avec AVNC ;
  - « ⏳ démarrage / attente de connexion » ;
  - « 😴 fermé (mémoire libérée) » — normal en veille.
- **🛑 Pause** — n'apparaît que pendant une pause anti-ban, avec son heure de fin.
- **🎁 Codes** — codes détectés et gagnés depuis le dernier démarrage du bot.
- **💓 Signe de vie** — le bot l'écrit chaque minute. Au-delà de 5 min, il est considéré figé et le watchdog le relance.
- **🧠 Mémoire** et **🔥 CPU** — ce que consomment le bot et Chromium.
- **🛡️ Watchdog** — « activé » ou « désactivé (bot watchdog on) ».

---

## 🔔 13. Les alertes Telegram

Les alertes viennent de **ton bot** (étape 4). Elles commencent par « 📱 Téléphone · » ou « 💻 PC · » (ou par ton `BOT_NAME`).

- Avec `NOTIFY_LEVEL=problems`, tu reçois les **problèmes**.
- Avec `NOTIFY_LEVEL=all`, tu reçois aussi les **infos** : gains, mise en ligne, relais, bilan.
- La plupart des alertes ont un délai minimum entre deux envois (indiqué pour chacune ci-dessous) : pas d'avalanche, même si le bot redémarre en boucle. Ce délai est gardé en mémoire d'un démarrage à l'autre. Seules les alertes 💰 Gagné, 📊 Bilan et 🔔 Test partent à chaque fois.
- Les alertes ne ralentissent jamais le traitement des codes.

### Les infos (seulement avec `NOTIFY_LEVEL=all`)

**🟢 Bot en ligne**

> 📱 Téléphone · 🟢 Bot en ligne — 😴 en veille (le PC réclame).

À chaque démarrage normal (sur le PC : « 💻 PC · 🟢 Bot en ligne. »). Au plus 1 toutes les 10 min.

👉 Rien à faire.

**💰 Gagné**

> 📱 Téléphone · 💰 Gagné ! Code 92J5LXPM → 0.00000005 BNB (@vgfboxes)

À chaque Red Packet gagné. « montant à vérifier sur Binance » si le montant n'a pas pu être lu.

👉 Rien à faire. 🎉

**📱 Le téléphone prend le relais**

> 📱 Téléphone · 📱 Le téléphone prend le relais : le PC s'est arrêté.

Autres raisons : « le PC n'est pas prêt (connexion Binance ou navigateur) » ou « le PC ne répond plus depuis 02m 31s ». Au plus 1 toutes les 5 min, et jamais au démarrage du bot : l'alerte 🟢 Bot en ligne donne déjà l'état du téléphone.

👉 Rien à faire. Si tu n'as pas arrêté le PC, vérifie pourquoi : PC éteint, Internet coupé, alerte 🔑 du PC…

**😴 Téléphone en veille**

> 📱 Téléphone · 😴 Téléphone en veille : le PC est actif.

Autre raison : « le PC est en pause anti-ban (même compte Binance) ». Au plus 1 toutes les 5 min, et jamais au démarrage du bot.

👉 Rien à faire.

**📊 Bilan quotidien**

> 📱 Téléphone · 📊 Bilan (en ligne depuis 1j 02h 03m 04s) : 64 code(s) détecté(s), 15 gagné(s), 6 échec(s) — 😴 en veille (le PC réclame).

Chaque jour à minuit, sur chaque appareil.

👉 Rien à faire. Il sert aussi de **signe de vie** : pas de bilan à minuit = l'appareil ne tournait pas.

### Les problèmes (avec `problems` et `all`)

**🔑 Binance à reconnecter**

> 📱 Téléphone · 🔑 Binance demande une reconnexion. Ouvre AVNC → 127.0.0.1:5901 (mot de passe : « bot vnc » dans Termux) et connecte-toi. Les codes sont ignorés en attendant.

Sur le PC : « 💻 PC · 🔑 Binance demande une reconnexion : connecte-toi dans la fenêtre Chromium du bot. Les codes sont ignorés en attendant. » Au plus 1 toutes les 3 h.

👉 Ouvre AVNC (ou lance `bot login`) et connecte-toi. Aucun code n'est tenté en attendant, donc aucune tentative n'est brûlée. Si c'est le PC qui est déconnecté, le téléphone prend le relais pendant ce temps.

**✅ Binance reconnecté**

> 📱 Téléphone · ✅ Session Binance rétablie — les codes sont de nouveau réclamés.

Au plus 1 toutes les 10 min.

👉 Rien à faire.

**🔑 Telegram à reconnecter** (téléphone)

> 📱 Téléphone · 🔑 Session Telegram expirée : ouvre Termux et lance « bot login » (ou le widget 🔑 Connexion).

La session Telegram du téléphone n'est plus valide (par exemple après « Mettre fin aux autres sessions »). Le bot ne peut pas demander le code tout seul : il réessaie toutes les 30 min. Au plus 1 alerte toutes les 3 h.

👉 `bot login` (ou le widget 🔑).

**🛑 Pause anti-ban**

> 📱 Téléphone · 🛑 Limite Binance atteinte — pause anti-ban jusqu'à 03:12. Aucun code ne sera tenté d'ici là.

Binance signale une limite (pause de 5 h) ou des tentatives restantes (pause de 2 h). La pause s'applique aussi à l'autre appareil. Au plus 1 par heure.

👉 Rien à faire, le bot reprend seul. Si ça arrive souvent, retire de `TARGET_CHANNELS` les canaux les moins rentables.

**🌐 Chromium fermé ou planté**

> 📱 Téléphone · 🌐 Chromium s'est fermé — relance automatique du navigateur…

Variante : « 🌐 l'onglet Binance a planté — relance automatique du navigateur… ». Au plus 1 toutes les 10 min.

👉 Rien à faire, le bot relance Chromium. Si ça revient souvent : voir le [Dépannage](#-15-dépannage) (mémoire).

**💥 Erreur grave**

> 📱 Téléphone · 💥 Chromium plante en boucle (plus de 3 fois en 10 min). Redémarrage automatique du bot…

Variantes : « 💥 navigateur impossible à relancer : … », « 💥 navigateur impossible à lancer : … », « 💥 Erreur fatale : … — relance automatique. » Sur le PC, « Redémarrage automatique du bot… » devient « Relance le bot (npm start). », et « Erreur fatale » n'a pas la fin « — relance automatique ». Au plus 1 toutes les 15 min.

👉 Sur le téléphone, le superviseur relance le bot tout seul. Si ça se répète : `bot logs` et le Dépannage. Sur le PC : relance `npm start`.

**♻️ Bot relancé** (téléphone)

> 📱 Téléphone · ♻️ Bot relancé après un arrêt inattendu (code 1) — 📱 actif (réclame les codes).

Le superviseur a relancé le bot après un arrêt anormal. Au plus 1 toutes les 15 min.

👉 Rien à faire si c'est rare. En boucle : `bot logs`. Le code 137 veut dire « tué par Android » (voir 8.5).

**⚠️ Page Cryptobox inaccessible**

> 📱 Téléphone · ⚠️ Page Cryptobox inaccessible : un code n'a pas pu être tenté. Si ça se répète, vérifie la fenêtre Binance du bot (session, page bloquée).

Au plus 1 toutes les 3 h.

👉 Si ça se répète, regarde l'écran du bot dans AVNC : session expirée, page bloquée, vérification Binance…

**⚠️ Deux appareils prioritaires**

> 💻 PC · ⚠️ Deux appareils se déclarent « PC prioritaire » (BOT_ROLE=primary) : chaque code risque d'être soumis deux fois. Sur le téléphone, BOT_ROLE doit valoir « backup ».

Au plus 1 toutes les 3 h.

👉 Sur le téléphone : `BOT_ROLE=backup` dans `android.env`, puis `bot restart`. Vérifie aussi qu'un seul PC fait tourner le bot.

**🔔 Test**

> 📱 Téléphone · 🔔 Test : si tu lis ce message, les alertes du bot fonctionnent.

Envoyée à la fin de `bot login`.

👉 Rien à faire : tout marche.

### En plus, avec healthchecks.io

Si tu l'as configuré (8.9), healthchecks.io te prévient quand le téléphone ne donne plus signe de vie : téléphone éteint, batterie vide, plus d'Internet, ou bot arrêté.

---

## 🔄 14. Mettre à jour

Sur le téléphone, une seule commande :

```bash
bot update
```

Ce qu'elle fait :

1. elle télécharge la nouvelle version (`git pull`) ;
2. elle arrête le bot s'il tournait ;
3. elle met à jour les dépendances et Chromium dans Debian ;
4. elle réinstalle la commande `bot`, les widgets et le démarrage automatique ;
5. elle redémarre le bot s'il tournait. Tu vois « Bot à jour ✅ ».

Tes réglages (`.env`, `android.env`), tes sessions Telegram et Binance et tes logs sont conservés.

**Mets aussi le PC à jour**, pour que les deux parlent le même langage de relais : dans le dossier du bot, `git pull`, puis `npm install`, puis relance `npm start`.

En cas d'erreur :

- « git pull impossible (fichiers modifiés à la main ?) » → voir le [Dépannage](#-15-dépannage).
- « Mise à jour des dépendances impossible » → souvent le réseau. Le bot reste alors arrêté (même le watchdog ne le relance pas) : vérifie Internet, puis relance `bot update`.

---

## 🆘 15. Dépannage

### Avant tout : regarde ce que dit le bot

1. `bot status` : est-ce qu'il tourne ? Dans quel état ?
2. `bot logs` : lis les dernières lignes ❌ ERROR et ⚠️ WARN.
3. Pour demander de l'aide, copie les dernières lignes de `bot logs --plain`. **Jamais ton `.env`.**

### « Il faut un téléphone 64 bits (aarch64) »

Ton téléphone (ou sa version d'Android) est en 32 bits. Le bot ne peut pas y tourner.

### « Seulement … Mo libres — il en faut environ 3 Go »

C'est un avertissement : l'installation continue, mais elle risque d'échouer faute de place. Libère de la place (photos, vidéos, applis inutilisées), puis relance l'installation.

### L'installation s'est arrêtée en cours de route

Relance la même commande, elle reprend où elle en était :

```bash
bash ~/red-packet-bot-telegram/deploy/android/install.sh
```

### « L'application n'a pas été installée car le package semble ne pas être valide »

Le fichier APK téléchargé est **incomplet ou abîmé** (téléchargement coupé, réseau instable).

1. Supprime le fichier déjà téléchargé (app **Fichiers → Téléchargements**).
2. Passe sur un **Wi-Fi stable**, puis ouvre dans Chrome le lien direct **https://f-droid.org/F-Droid.apk**.
3. Attends « Téléchargement terminé » et vérifie dans **Fichiers → Téléchargements** que le fichier fait **une dizaine de Mo** (quelques Ko = raté, recommence).
4. Touche le fichier → **Installer** (autorise la source si Android le demande).

**Plan B, sans l'appli F-Droid** : télécharge directement chaque APK sur le site F-Droid. Sur chaque page, prends la version marquée **« Recommandé »** (pas « beta ») → **« Télécharger APK »** :

- Termux : https://f-droid.org/fr/packages/com.termux/ (≈ 108 Mo : en Wi-Fi)
- Termux:Boot : https://f-droid.org/fr/packages/com.termux.boot/
- Termux:Widget : https://f-droid.org/fr/packages/com.termux.widget/
- Termux:API : https://f-droid.org/fr/packages/com.termux.api/

⚠️ Les 4 au même endroit (f-droid.org), jamais mélangés avec le Play Store ou GitHub.

Autre message de blocage : sur **Samsung**, désactive le temps de l'installation Paramètres → Sécurité et confidentialité → **Blocage automatique**. Sur **Tecno / Infinix / itel**, autorise « Installer des applis inconnues » pour Chrome ou Fichiers, et choisis « Installer quand même » si Phone Master bloque.

### « killed by signal » pendant l'installation (paquets Termux)

Exemple : `dpkg-deb: error: <decompress> subprocess was killed by signal (Killed)`, puis `Installation des paquets Termux impossible`.

Android a **coupé l'installation** : Termux est passé en arrière-plan, l'écran s'est éteint, ou la mémoire manquait. Ce n'est pas un problème de réseau.

1. Répare puis relance, une ligne à la fois :

   ```bash
   termux-wake-lock
   dpkg --configure -a
   apt --fix-broken install -y
   git -C ~/red-packet-bot-telegram pull
   bash ~/red-packet-bot-telegram/deploy/android/install.sh
   ```

2. Jusqu'à la fin de l'installation (15 à 30 min) : garde **Termux ouvert au premier plan**, l'**écran allumé** (mets la mise en veille de l'écran au maximum), le téléphone **en charge**, et ferme les autres applis.
3. L'installateur répare et réessaie maintenant tout seul (3 essais). Si ça recommence quand même, fais d'abord l'étape [8.5 (phantom process killer)](#85-le--phantom-process-killer--android-12-et-plus), puis relance.

### « Installation des paquets Termux impossible » ou autres erreurs de `pkg`

1. Vérifie ta connexion Internet.
2. Change de miroir avec `termux-change-repo`, choisis-en un autre, puis relance l'installation.
3. Ton Termux vient du Play Store ? Désinstalle-le et installe celui de F-Droid (étape 3).

### « Chromium ne démarre pas — voir GUIDE-ANDROID.md (Dépannage) »

Le test de Chromium a échoué à la fin de l'étape [4] de l'installation.

1. Vérifie l'espace libre (environ 3 Go) et ferme les autres applis.
2. Android 12 ou plus : désactive le « phantom process killer » (8.5).
3. Redémarre le téléphone, puis relance l'installation.

### « Aucun bot.env trouvé dans Téléchargements »

- Le fichier doit s'appeler exactement `bot.env` et se trouver dans `Download` ou `Download/Telegram`.
- Termux doit avoir accès aux fichiers : tape `termux-setup-storage` et autorise.
- L'éditeur nano s'est ouvert ? Quitte-le (Ctrl+X), laisse l'installation finir et réponds `n` à la question de connexion. Puis supprime le `.env` créé à partir du modèle et relance l'installation, qui importera `bot.env` (tant qu'un `.env` existe, elle le garde) :

  ```bash
  rm ~/red-packet-bot-telegram/.env
  bash ~/red-packet-bot-telegram/deploy/android/install.sh
  ```

### « À compléter dans .env : … »

Il manque une valeur obligatoire (`API_ID`, `API_HASH`, `PHONE_NUMBER` ou `TARGET_CHANNELS`), ou `API_HASH` a encore sa valeur d'exemple. Corrige avec `nano ~/red-packet-bot-telegram/.env` : enregistre (Ctrl+O, Entrée), quitte (Ctrl+X). Puis `bot login` si ce n'est pas encore fait, sinon `bot restart`.

### Je ne reçois aucune alerte

1. Au démarrage, `bot logs` affiche « 🔔 Alertes : … ».
   - « désactivées (ALERT_BOT_TOKEN vide) » → ajoute le jeton dans `.env`.
   - « désactivées (NOTIFY_LEVEL=off) » → mets `NOTIFY_LEVEL=all` (ou `problems`).

   Puis `bot restart`.
2. « 🔕 Alerte non envoyée : … — envoie /start à ton bot d'alertes » → ouvre ton bot dans Telegram et appuie sur **Démarrer**.
3. « 🔕 Alerte non envoyée : … — vérifie ALERT_BOT_TOKEN » → le jeton est faux. Recopie-le : @BotFather → `/mybots` → ton bot → **API Token**.
4. « 🔕 Alertes : destinataire inconnu » → fais `bot login` une fois (le bot apprend ton identifiant), ou remplis `ALERT_CHAT_ID`.
5. Tu reçois les problèmes mais pas les gains ? Tu es en `NOTIFY_LEVEL=problems` : passe à `all`.

### « 🔑 Session Telegram expirée » ou « Session Telegram à refaire »

La session Telegram du téléphone n'est plus valide. Lance `bot login` (ou le widget 🔑) et tape le nouveau code. En attendant, le superviseur réessaie toutes les 30 min.

### « 🔑 Binance demande une reconnexion »

Le bot tourne, mais sa session Binance a expiré : il faut te reconnecter **dans son écran**, avec AVNC.

1. Dans Termux : `bot vnc` → note le mot de passe.
2. AVNC → ton serveur « Bot Red Packet » (pas encore créé ? ➕ → Hôte `127.0.0.1`, Port `5901`, **Nom d'utilisateur vide**, le mot de passe ; voir [7.2](#72-binance-avec-avnc)).
3. Dans la fenêtre Chromium du bot, connecte-toi à Binance (e-mail, mot de passe, 2FA).
4. Le bot s'en rend compte tout seul, en 20 s au plus : « 🔓 Session Binance rétablie » dans les logs et l'alerte « ✅ Session Binance rétablie ». Tu peux quitter AVNC : le bot continue.

**Plus simple** : connecte-toi sur le PC et copie la session sur le téléphone, voir [7.2 bis](#72-bis-plus-facile--connexion-binance-depuis-le-pc-sans-avnc).

Tu peux aussi faire `bot login` (connexion complète Telegram + Binance, puis redémarrage du bot).

### Après un `bot login` raté, le bot reste arrêté

Pendant `bot login`, le bot est mis à l'arrêt. Si `bot login` échoue alors que le bot tournait avant, il est relancé tout seul. Sinon, il reste arrêté (`bot status` : « ⏹️ arrêté par toi ») et le watchdog ne le relance pas. Relance `bot login`, ou tape `bot start` pour repartir avec l'ancienne connexion.

### AVNC n'arrive pas à se connecter

- L'écran du bot n'existe que pendant que le bot tourne (`bot start`) ou pendant `bot login`.
- Vérifie : hôte `127.0.0.1`, port `5901`, mot de passe donné par `bot vnc`.
- Regarde le journal de l'écran : `tail ~/red-packet-bot-telegram/logs/xvnc.log`.
- « Mot de passe VNC absent (.vnc-password) — relance install.sh » → relance l'installation.

### AVNC affiche un écran noir

C'est normal si le téléphone est **en veille** : Chromium est fermé quand le PC travaille. Vérifie avec `bot status` (ligne 🌐 Navigateur). Chromium revient quand le téléphone prend le relais.

### Les widgets n'apparaissent pas, ou la liste est vide

1. Termux:Widget doit venir de F-Droid, comme Termux.
2. Retire le widget de l'écran d'accueil et ajoute-le de nouveau.
3. Recrée les raccourcis (sans tout réinstaller) :

   ```bash
   bash ~/red-packet-bot-telegram/deploy/android/install.sh --refresh
   ```

4. Un bouton qui ouvre Termux (📊, 📜, 🔑) ne fait rien ? Sur certains téléphones, Termux a besoin de l'autorisation « Afficher par-dessus les autres applis » (Paramètres → Applications → Termux).

### Le bouton ▶️ n'affiche aucun message

Le petit message vient de l'appli Termux:API. Sans elle, le bot démarre quand même : vérifie avec `bot status`.

### `bot` : commande introuvable

Recrée la commande :

```bash
bash ~/red-packet-bot-telegram/deploy/android/install.sh --refresh
```

### « Le bot n'a pas démarré — regarde les logs : bot logs »

Lis `bot logs`. Puis lance `bash ~/red-packet-bot-telegram/deploy/android/install.sh --refresh` (il réautorise les tâches de fond de Termux) et refais `bot start`.

### « Tâche de fond Termux pas encore démarrée — lancement direct »

Le bot démarre quand même, mais en dehors de la tâche de fond Termux : il risque de s'arrêter quand tu fermes Termux. Lance `bash ~/red-packet-bot-telegram/deploy/android/install.sh --refresh`, puis `bot restart`.

### `bot status` affiche « 🔴 arrêté anormalement »

Android a tué Termux, ou « Exit » a été pressé. Le watchdog le relancera dans les 15 min ; ou tape `bot start` tout de suite. Si ça se reproduit, reprends l'étape 8.

### Le bot s'arrête la nuit, ou quand je ferme Termux

1. Refais les réglages de l'étape 8 : batterie « Sans restriction », Termux verrouillé dans les applis récentes, réglages de ta marque, phantom process killer.
2. Vérifie le watchdog : `bot status` → « 🛡️ Watchdog activé ». Sinon : `bot watchdog on`.
3. Laisse le téléphone branché.
4. N'appuie pas sur « Exit » dans la notification de Termux.

### La connexion Telegram coupe quand l'écran se verrouille ou quand je quitte Termux

Dans `bot logs`, « 📡 Connexion Telegram perdue — reconnexion automatique » (ou des erreurs `ECONNABORTED`) reviennent toutes les 1 à 2 minutes dès que Termux n'est plus à l'écran. Le bot tourne, mais **Android lui coupe Internet en arrière-plan** : fais l'étape [8.1 bis](#81-bis-internet-en-arrière-plan-sinon-telegram-coupe-à-lécran-verrouillé) (wake lock, batterie « Sans restriction », données en arrière-plan, économiseur de données, Wi-Fi en veille), puis le test de 5 minutes écran verrouillé.

### « Watchdog non activé »

Installe l'appli **Termux:API** depuis F-Droid (même source que Termux), ouvre-la une fois, puis tape `bot watchdog on`.

### Le bot ne repart pas après un redémarrage du téléphone

1. As-tu ouvert **Termux:Boot** une fois après l'avoir installé ? Fais-le, puis redémarre.
2. **Déverrouille** le téléphone : avec un code ou un schéma, rien ne démarre avant.
3. Mets aussi Termux:Boot en batterie « Sans restriction ».
4. Regarde `bot logs` : « 📱 Téléphone démarré — bot laissé à l'arrêt » veut dire que le bot était arrêté (avec ⏹️, ou par un `bot login` ou un `bot update` qui a échoué). Relance-le avec ▶️.
5. Aucune ligne « 📱 Téléphone démarré » ? Termux:Boot ne s'est pas lancé : reprends les points 1 à 3.

### Le bot redémarre en boucle (alertes ♻️)

Dans `bot logs`, lis les lignes ❌ juste avant « ♻️ Le bot s'est arrêté (code …) ».

- **Code 137** : le bot a été tué (par Android, ou par manque de mémoire). Voir 8.5, et ferme les applis lourdes.
- « Chromium plante en boucle » ou « 💥 L'onglet Binance a planté (mémoire insuffisante ?) » : ferme d'autres applis, puis essaie l'option ci-dessous.

### Chromium plante souvent (option de dépannage)

Dans `android.env` (`nano ~/red-packet-bot-telegram/android.env`), retire le `#` devant cette ligne :

```ini
CHROMIUM_EXTRA_ARGS="--disable-gpu"
```

Puis `bot restart`. N'ajoute jamais `--disable-features` à cette ligne.

### Le téléphone reste en veille alors que le PC est éteint

- Après un arrêt brutal du PC (coupure, plantage), le téléphone attend **2 min 30** de silence avant de prendre le relais.
- Ouvre le message « 🤖 Relais Red Packet » de tes Messages enregistrés : si « Dernier signal » avance encore, un bot tourne toujours quelque part (une autre fenêtre, un autre PC).

### Le PC et le téléphone réclament tous les deux

- Alerte « ⚠️ Deux appareils se déclarent « PC prioritaire » » → `BOT_ROLE=backup` dans `android.env`, puis `bot restart`.
- `BOT_ROLE=solo` sur le téléphone alors que le PC tourne → remets `backup`.
- `BOT_ROLE=backup` dans le `.env` du PC → retire cette ligne : le PC doit rester `primary`.
- Le bot du PC n'est pas à jour → une ancienne version ne publie pas son état (étape 14).

### J'ai supprimé le message « 🤖 Relais Red Packet »

Pas grave : le PC le recrée à sa publication suivante (moins d'une minute). Évite simplement de le modifier ou de le supprimer.

### L'heure des logs est fausse, ou « ⏰ 25 messages d'affilée jugés antérieurs au démarrage »

L'horloge du téléphone est décalée. Paramètres → Date et heure → active « Date et heure automatiques » et « Fuseau horaire automatique ». Puis `bot restart`. Le message parle de `w32tm /resync` : c'est la commande pour Windows ; sur le téléphone, c'est le réglage automatique qui compte. Même remède pour « 🕰️ Beaucoup de messages jugés périmés ».

### « git pull impossible (fichiers modifiés à la main ?) »

`bot update` refuse d'écraser des fichiers modifiés sur le téléphone. Lance, une ligne à la fois :

```bash
git -C ~/red-packet-bot-telegram status --short
git -C ~/red-packet-bot-telegram config core.fileMode false
git -C ~/red-packet-bot-telegram checkout -- .
bash ~/red-packet-bot-telegram/deploy/android/bot.sh update
```

- La 1re ligne montre les fichiers modifiés.
- La 2e demande à git d'ignorer les droits d'exécution des scripts (l'installation peut les changer).
- La 3e remet les fichiers du bot dans leur version d'origine. Tes modifications de ces fichiers sont perdues, mais ton `.env`, `android.env`, tes sessions et tes logs ne sont pas touchés : git les ignore.
- La 4e relance la mise à jour (c'est l'équivalent de `bot update`).

### Coupure de courant ou d'Internet

- Branché, le téléphone continue sur sa batterie pendant une coupure de courant.
- Sans Internet, le bot attend, puis se reconnecte tout seul (« 📡 Connexion Telegram rétablie — écoute active »).
- Batterie vide ? Au rallumage, déverrouille le téléphone : le bot repart seul.
- Pour être prévenu quand le téléphone ne répond plus : healthchecks.io (8.9).

### Le téléphone chauffe, ou la batterie s'use

- Le bot tourne en priorité basse, et ferme Chromium quand le PC travaille.
- Active une limite de charge (8.7).
- L'installation (étape 6) est la partie la plus lourde : il est normal que le téléphone chauffe à ce moment-là.

---

## 🧹 16. Désinstaller

Dans Termux :

1. Arrête le bot et le watchdog :

   ```bash
   bot stop
   bot watchdog off
   ```

2. Retire le démarrage automatique, les widgets et la commande `bot` :

   ```bash
   rm -f ~/.termux/boot/red-packet-bot
   rm -f ~/.shortcuts/*" du bot" ~/.shortcuts/tasks/*" le bot"
   rm -f "$PREFIX/bin/bot"
   ```

3. Supprime le bot (réglages, sessions, logs) :

   ```bash
   rm -rf ~/red-packet-bot-telegram
   ```

4. Supprime Debian (c'est lui qui prend le plus de place) :

   ```bash
   proot-distro remove debian
   ```

5. Dans Telegram : **Paramètres → Appareils** → touche la session du bot du téléphone → **Mettre fin à la session**.

Facultatif :

- Désinstalle les applis (Termux, Termux:Boot, Termux:Widget, Termux:API, AVNC). Désinstaller Termux efface tout ce qu'il contient.
- Supprime ton bot d'alertes : @BotFather → `/deletebot`. Attention, le PC ne pourra plus envoyer d'alertes.
- Tu n'utilises plus du tout le téléphone ? Mets `BOT_ROLE=solo` dans le `.env` du PC : il ne publiera plus de message d'état. Supprime ensuite l'ancien message « 🤖 Relais Red Packet ».

---

## ✅ Tout est prêt ?

Fais ces 8 tests une fois. Si tout est conforme, ton bot tient le 24 h/24.

> [!NOTE]
> Une même alerte n'est pas renvoyée tout de suite (5 min au moins pour le relais, 10 min pour « en ligne » et pour 🌐 Chromium). Si tu refais un test, regarde plutôt `bot logs`. Les alertes « infos » demandent `NOTIFY_LEVEL=all`.

- [ ] **1. ▶️ Le widget démarre le bot**
  - **Fais** : le bot tourne déjà depuis `bot login` ? Arrête-le d'abord avec ⏹️. Puis appuie sur « 1 ▶️ Démarrer le bot ».
  - **Attendu** : le message « 🚀 Bot démarré — il tourne en arrière-plan ». `bot status` affiche « 🟢 en marche ». Tu reçois « 📱 Téléphone · 🟢 Bot en ligne — … ».
- [ ] **2. Le PC démarre → le téléphone se met en veille**
  - **Fais** : sur le PC, lance `npm start`.
  - **Attendu** : dès que le PC affiche « 🟢 Bot opérationnel », le téléphone passe en veille en quelques secondes : « 😴 Relais : téléphone en veille — le PC est actif » dans `bot logs`, et l'alerte « 😴 Téléphone en veille : le PC est actif. ». Si Chromium était ouvert, il se ferme 2 min plus tard (« 😴 Chromium fermé pendant la veille »). `bot status` affiche « 😴 relais — en veille (le PC réclame) ».
- [ ] **3. Ctrl+C sur le PC → le téléphone reprend**
  - **Fais** : Ctrl+C dans la fenêtre du bot sur le PC.
  - **Attendu** : tout de suite, « 📱 Relais : le téléphone prend la main — le PC s'est arrêté », l'alerte « 📱 Le téléphone prend le relais : le PC s'est arrêté. », puis, si Chromium s'était fermé pendant la veille, « 🟢 Navigateur Binance prêt ». (Si le PC est coupé brutalement, le relais vient au bout de 2 min 30 de silence.)
- [ ] **4. Chromium tué → relancé**
  - **Fais** : le téléphone étant actif (PC arrêté) et Chromium prêt, tape dans Termux (ça tue le Chromium du bot) :

    ```bash
    pkill -f browser-data
    ```

  - **Attendu** : « ❌ ERROR — 🌐 Chromium s'est fermé — relance automatique du navigateur » (ou « l'onglet Binance a planté »), l'alerte 🌐, puis quelques secondes plus tard « ✅ OK — 🌐 Navigateur relancé ». Si cette relance échouait, le superviseur relancerait tout le bot (alerte ♻️).
- [ ] **5. Termux fermé → le bot continue**
  - **Fais** : retire Termux des applis récentes (s'il est verrouillé, déverrouille-le d'abord ; reverrouille-le après le test). Attends 5 min, puis rouvre Termux.
  - **Attendu** : `bot status` affiche toujours « 🟢 en marche depuis … », sans remise à zéro. `bot logs` ne montre aucune coupure.
- [ ] **6. « Exit » → le watchdog relance**
  - **Fais** : dans la notification de Termux, appuie sur « Exit ».
  - **Attendu** : tout s'arrête (`bot status` : « 🔴 arrêté anormalement »). Dans les 15 min qui suivent (un peu plus si le téléphone n'est pas branché), le watchdog relance le bot : « 🛡️ Bot arrêté anormalement — relance automatique » puis « Bot démarré 🟢 » dans `bot logs`, et l'alerte « 🟢 Bot en ligne ».
- [ ] **7. Redémarrage + déverrouillage → en ligne**
  - **Fais** : redémarre le téléphone, puis déverrouille-le.
  - **Attendu** : 1 à 2 min plus tard, l'alerte « 🟢 Bot en ligne ». Dans `bot logs` : « 📱 Téléphone démarré (Termux:Boot) — attente du réseau… », puis « 🛡️ Bot arrêté anormalement — relance automatique » (normal ici) et « Bot démarré 🟢 ».
- [ ] **8. ⏹️ → le bot reste arrêté**
  - **Fais** : appuie sur « 2 ⏹️ Arrêter le bot ».
  - **Attendu** : le message « ⏹️ Bot arrêté ». `bot status` affiche « ⏹️ arrêté par toi ». Il reste arrêté : le watchdog ne le relance pas, et après un redémarrage les logs disent « 📱 Téléphone démarré — bot laissé à l'arrêt ».
  - **Ensuite** : appuie sur ▶️ pour le relancer !

Un test ne se passe pas comme prévu ? Va voir le [Dépannage](#-15-dépannage).

Tout est bon ? 🎉 Ton bot tourne 24 h/24. Laisse le téléphone branché, en Wi-Fi, et laisse-le travailler.

← Retour au [README](README.md)
