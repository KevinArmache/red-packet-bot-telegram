# 🧧 Red Packet Bot — Cryptobox Telegram × Binance

> Bot personnel en Node.js. Il surveille des canaux Telegram en temps réel et réclame tout seul les codes **Cryptobox (Red Packets)** sur Binance, avec Playwright. Il tourne sur ton PC, et peut tourner 24 h/24 sur un téléphone Android qui prend le relais.

**Trois règles absolues**, gravées dans le code :

- ⛔ **Zéro retry** — un code n'est soumis **qu'une seule fois**. S'il échoue, on passe au suivant. Jamais de nouvelle tentative.
- ⏮️ **Zéro rattrapage** — aucun code publié **avant** le lancement du bot n'est réclamé. Le bot ne traite que le direct.
- 🎯 **Zéro raté** — texte, légendes, **boutons inline**, **liens masqués**, blocs `monospace`, aperçus de lien et **messages édités** : tout est analysé.

> [!IMPORTANT]
> 📱 **Le bot 24 h/24 sur ton téléphone Android ?** Installe l'app, avec le guide pas à pas : **[GUIDE-ANDROID.md](GUIDE-ANDROID.md)**.

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
- **🛡️ Protections anti-ban** — une seule soumission par code, un code à la fois, anti-doublons 48 h, **anti-blocage** (le bot compte les codes faux d'affilée et ne tape jamais le 10e, qui bloquerait les Red Packets 5 h), pause seulement sur un vrai blocage Binance, navigateur furtif, session Binance expirée détectée sans jamais taper un code au mauvais endroit.
- **🔔 Alertes qui sonnent vraiment** — via ton propre bot Telegram (@BotFather) : gains, reconnexions à faire, pauses, plantages, bilan quotidien.
- **🐦 Codes publiés sur X (Twitter)** — le téléphone lit les notifications de l'appli X (comptes suivis avec la cloche) : ni scraping, ni API, rien que X puisse bloquer. Mêmes règles et même anti-blocage que Telegram ; quand le PC réclame, le téléphone lui transmet les codes (`#xcode`).
- **🤝 Relais PC ⇄ téléphone** — le PC a la priorité, le téléphone prend le relais dès que le PC s'arrête. Un seul appareil réclame à la fois, pour ne pas soumettre deux fois le même code.
- **📱 App Android 24/7** — une APK fabriquée en une commande (`npm run apk`), thème sombre « rouge & or » (clair si le téléphone est en mode clair), assistant de démarrage, réglages et connexions dans l'app (Binance en plein écran), tableau de bord (gains, graphique 24 h, jauge anti-blocage, relais, stats par canal), service permanent, relance automatique (plantage, redémarrage du téléphone, mise à jour).
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
> 📖 **Le guide complet est ici : [GUIDE-ANDROID.md](GUIDE-ANDROID.md)** — fabriquer l'APK, l'installer, les connexions, les réglages du téléphone (Tecno / HiOS), le dépannage. Cette section n'en est qu'un résumé.

Le bot tourne aussi sur un téléphone Android, 24 h/24, sous forme d'**application** : **Red Packet Bot**. C'est **le même code que sur le PC** : l'APK embarque Node.js (Node.js mobile) et le dossier `src/`. La page Binance tourne dans une **WebView** de l'app, que Playwright pilote comme le Chromium du PC. Rien d'autre à installer, aucune commande à taper sur le téléphone.

### Fabriquer et installer l'APK

Sur le PC (Android Studio installé une fois, avec le NDK 27.1 et CMake 3.22.1) :

```bash
npm install
npm run apk
```

L'APK arrive dans `dist/RedPacketBot.apk`. Copie-la sur le téléphone (câble USB ou Telegram) et ouvre-la pour l'installer. Avec le débogage USB activé, `npm run apk:install` l'installe directement.

> [!IMPORTANT]
> La première compilation crée la **clé de signature** dans `~/.red-packet-bot/`. **Garde-en une copie** : chaque mise à jour de l'app doit être signée avec la même clé, sinon il faut désinstaller l'app (et refaire les connexions).

### Dans l'app, la première fois

L'**assistant 🧭** s'ouvre tout seul et te guide en 5 étapes (il se relance depuis **⚙️ Réglages**) :

1. **✈️ Telegram** → importe ton `.env` (partage du fichier `bot.env` depuis Telegram, fichier, ou copier-coller), puis **Se connecter** et tape le code reçu dans Telegram (et ton mot de passe 2FA). Le téléphone a sa propre session sur le même compte. Le rôle reste **secours du PC** (`backup`).
2. **🔐 Binance** → connecte-toi en plein écran, avec le clavier du téléphone. L'écran se ferme tout seul une fois connecté.
3. **🐦 X** (facultatif) → active la lecture des posts X et donne l'accès aux notifications ([détails](GUIDE-ANDROID.md#7-bis-les-codes-publiés-sur-x-twitter)).
4. **📱 Téléphone** → les réglages Android indispensables pour que le bot ne soit jamais coupé ; les réglages Tecno recommandés (Phone Master…) sont dans **🩺 Santé**.
5. **🔔 Alerte de test**, puis le bot tourne : le grand bouton rond de l'**🏠 Accueil** le démarre ou l'arrête.

### Une fois lancé

- **Service permanent** : une notification fixe affiche l'état (😴 veille, 🟢 actif, 🔑 reconnexion à faire, 🛑 pause anti-ban) et les codes détectés et gagnés. Fermer l'app ne l'arrête pas.
- **Relance automatique** :
  - après un plantage (10 s, puis l'attente double jusqu'à 10 min) ;
  - session Telegram expirée (code 78) : nouvel essai toutes les 30 min, avec la notification 🔑 ;
  - bot figé (aucun signe de vie depuis 5 min) ;
  - après un redémarrage du téléphone (après le premier déverrouillage) et après une mise à jour de l'app ;
  - filet de sécurité toutes les 15 min.
- **Seul le bouton rond de l'Accueil (ou « Arrêter » dans la notification) l'arrête durablement** : c'est un arrêt propre, le PC est prévenu tout de suite.
- **Veille** : quand le PC est actif, le téléphone laisse les codes au PC et ferme la page Binance après 2 min (mémoire libérée).
- **Logs** : onglet **📜 Activité** → **🖥️ Logs** de l'app (fichier `logs/bot.log` dans le stockage privé de l'app, archivé à 5 Mo). L'onglet **🎁 Codes** liste les 50 derniers codes et leur résultat (fichier `bot-data/.run/activity.json`, écrit par `src/activity.js`).

### Limites, en toute honnêteté

- Les sessions Binance **expirent de temps en temps** : tu reçois la notification et l'alerte 🔑, et tu te reconnectes dans l'app.
- Après un redémarrage, le bot ne repart **qu'après le premier déverrouillage** du téléphone.
- Node.js mobile est en version 18 et ne démarre pas sur les rares téléphones à mémoire en pages de 16 Ko (l'écran Santé le signale).
- **HiOS (Tecno) peut couper n'importe quelle app** si Phone Master n'est pas réglé : fais l'écran Santé en entier.

---

## 🤝 Relais PC ⇄ téléphone

Le PC et le téléphone utilisent **le même compte Binance**. S'ils réclamaient tous les deux, chaque code serait soumis deux fois, et la deuxième soumission brûlerait une tentative du compteur anti-fraude. Le relais fait en sorte qu'**un seul appareil réclame à la fois**. Il reste un court chevauchement possible : quand le PC démarre (ou retrouve Internet) alors que le téléphone a pris le relais, les deux peuvent réclamer pendant quelques secondes, le temps que le PC publie son état.

**Les rôles** (`BOT_ROLE`) :

- `primary` (défaut) — le **PC prioritaire** ;
- `backup` — le **téléphone de secours**. L'app Android le règle toute seule ;
- `solo` — un seul appareil, sans coordination. Par exemple un téléphone sans bot sur le PC : **Réglages** de l'app → **Appareil seul (solo)**.

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
- PC **arrêté, jamais vu, ou muet depuis 10 min** → mode « PC absent » : le téléphone ne lui laisse plus aucun code. Il garde la main pendant une coupure de son message de relais (réseau, FLOOD_WAIT), et réclame aussi les codes encore frais livrés à une reconnexion. Dès que le PC publie « actif », les règles normales reviennent.

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

**Codes X relayés.** Seul le téléphone voit les posts X. Quand il est en veille, il transmet chaque code X au PC par un message silencieux dans les Messages enregistrés, supprimé après 10 min :

```
#xcode A7K2M9QX src=label from=@binance at=1791400000000 inst=3f9a1c2e
🐦 Code X relayé par 📱 Téléphone — ne pas modifier
```

Les deux appareils jugent ce message sur sa **date serveur Telegram**, avec la même règle que pour un code de canal : un code n'est jamais soumis deux fois, et si le téléphone reprend le relais entre-temps, c'est lui qui le réclame. Un `#xcode` de plus de 30 s, modifié ou mal formé est ignoré. Le PC annonce qu'il accepte ces codes par le jeton ` x=1` de sa ligne `#botrelay` ; un PC pas à jour ne l'a pas, et le téléphone envoie alors l'alerte « ⚠️ Le PC ne prend pas les codes X ».

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

**Tester :** sur le téléphone, bouton **Alerte de test** sur l'écran d'accueil de l'app. Sur le PC, bot arrêté, `node index.js --setup` fait la connexion Telegram, puis Binance, puis envoie l'alerte de test.

- **Destinataire** : toi, par défaut. Ton identifiant est appris à la connexion Telegram et gardé dans `.alert-chat-id`. `ALERT_CHAT_ID` permet d'en choisir un autre.
- **Préfixe** : chaque alerte commence par `💻 PC ·` ou `📱 Téléphone ·` (à changer avec `BOT_NAME`). Exemple : `📱 Téléphone · 💰 Gagné ! Code 92J5LXPM → 0.00000005 BNB (@vgfboxes)`.
- **Niveaux** (`NOTIFY_LEVEL`) : `off` (défaut si la ligne manque ou si la valeur est inconnue), `problems` (les problèmes seulement), `all` (problèmes, gains et infos).
- **Pas de spam** : les alertes qui peuvent se répéter ont un délai minimum entre deux envois (indiqué ci-dessous ; les gains et le bilan n'en ont pas). Il est retenu dans `.run/alerts.json`, même si le bot redémarre en boucle.

### Toutes les alertes, et quoi faire

**Problèmes** — envoyées avec `problems` et `all` :

- **🔑 « Binance demande une reconnexion… »** — 1 toutes les 3 h au plus.\
  → PC : connecte-toi dans la fenêtre Chromium du bot. Téléphone : touche la notification 🔑 (ou **Connexion Binance** dans l'app). En attendant, les codes sont ignorés sans brûler de tentative. Si c'est le PC, le téléphone prend le relais.
- **✅ « Session Binance rétablie — les codes sont de nouveau réclamés. »** — 1 toutes les 10 min au plus.\
  → Rien à faire.
- **🔑 « Session Telegram expirée : ouvre l'app Red Packet Bot → 📡 Sources → ✈️ Telegram »** (téléphone) ou **« … refais la connexion avec « node index.js --setup » »** (serveur) — 1 toutes les 3 h au plus.\
  → Téléphone : **📡 Sources** → **✈️ Telegram** → **🔄 Se reconnecter**. Serveur : refais la connexion à la main. En attendant, le superviseur réessaie toutes les 30 min. Cette alerte n'existe qu'en mode sans surveillance (app Android, ou serveur avec `BOT_UNATTENDED=1`).
- **🛑 « Blocage Binance (Red Packets verrouillés) — pause jusqu'à HH:MM… »** — 1 par heure au plus.\
  → Rien : la pause dure ce que Binance annonce (5 h par défaut) et elle est partagée avec l'autre appareil. Ça ne devrait plus arriver en mode `stop` (voir [Anti-blocage](#anti-blocage-binance)).
- **🧩 « Binance demande un captcha — pause jusqu'à HH:MM… »** — 1 par heure au plus.\
  → Sur le PC, résous le captcha dans la fenêtre Binance du bot. Sinon, le bot réessaie après 1 h.
- **🟠 « N codes faux d'affilée… le bot ne tape plus que les codes clairs… »** — 1 par heure au plus.\
  → Rien : un code qui marche remet le compteur à zéro. Si ça revient souvent, retire les canaux qui publient des codes faux.
- **⛔ « N codes faux d'affilée : plus que 1 essai avant le blocage… »** — 1 par heure au plus.\
  → Réclame toi-même dans l'app Binance un code qui marche, puis envoie **`#reprendre`** dans tes « Messages enregistrés » Telegram (réponse ✅ « Reprise… »).
- **🌐 « Chromium s'est fermé — relance automatique du navigateur… »** (ou « l'onglet Binance a planté… ») — 1 toutes les 10 min au plus.\
  → Rien : le navigateur est relancé tout seul. Au-delà de 3 plantages en 10 min, le bot s'arrête (alerte 💥).
- **💥 « Chromium plante en boucle… », « navigateur impossible à (re)lancer… » ou « Erreur fatale : … »** — 1 toutes les 15 min au plus, pour l'ensemble.\
  → Téléphone (ou serveur supervisé) : le bot redémarre tout seul. PC : relance `npm start`. Si ça se répète, lis les logs.
- **♻️ « Bot relancé après un arrêt inattendu (code N). »** (téléphone) — 1 toutes les 15 min au plus.\
  → Rien. Si ça arrive souvent, regarde `bot logs`.
- **⚠️ « Page Cryptobox inaccessible : un code n'a pas pu être tenté… »** — 1 toutes les 3 h au plus.\
  → Si ça se répète, vérifie la fenêtre Binance du bot (session, page bloquée).
- **⚠️ « Deux appareils se déclarent « PC prioritaire »… »** — 1 toutes les 3 h au plus.\
  → Un seul `primary` : sur le téléphone, le rôle doit être **Secours du PC** (c'est le cas par défaut, vérifie les **Réglages** de l'app).

**Infos** — envoyées seulement avec `all` :

- **💰 « Gagné ! Code X → montant (canal) »** — à chaque gain.
- **🟢 « Bot en ligne. »** — au démarrage (1 toutes les 10 min au plus). Sur le téléphone, avec son mode : actif ou en veille.
- **📱 « Le téléphone prend le relais : … »** et **😴 « Téléphone en veille : … »** — à chaque changement, sauf au démarrage où l'alerte 🟢 suffit (1 toutes les 5 min au plus).
- **📊 « Bilan (en ligne depuis …) : N code(s) détecté(s), N gagné(s), N échec(s). 🛡️ N code(s) faux d'affilée. »** — chaque jour à minuit. C'est aussi un **signe de vie** : pas de bilan, c'est qu'il y a un problème.
- **🔄 « Compteur Binance revenu à zéro tout seul entre HH:MM et HH:MM… »** — 1 toutes les 6 h au plus. Le bot a vu le nombre d'essais restants remonter sans code gagné : c'est ainsi qu'on découvre la vraie règle de Binance, utile pour régler `ANTIBAN_STOP_RESUME_H`.

**Test** : **🔔 « Test : si tu lis ce message, les alertes du bot fonctionnent. »** — bouton **Alerte de test** de l'app (ou à la fin de `node index.js --setup`).

---

## 🔧 Configuration (.env)

Le modèle commenté est [`.env.example`](.env.example). **L'app Android importe ce même `.env`** : elle règle elle-même ce qui change sur le téléphone (voir la fin de cette section).

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
- **`BOT_NAME`** — défaut `💻 PC`, ou `📱 Téléphone` en `backup`. Préfixe des alertes et nom affiché dans le message de relais. Sur le téléphone, l'app met `📱 Téléphone` par défaut (option avancée dans ses Réglages).
- **`HEALTHCHECK_URL`** — vide par défaut. Adresse appelée au démarrage puis toutes les 5 min (par exemple un check healthchecks.io). Sur le téléphone, mets-la dans les options avancées des Réglages de l'app.

### Anti-blocage (réglages)

Binance verrouille les Red Packets **5 h après 10 codes faux d'affilée** (FAQ officielle). Le bot compte ces codes et agit avant ([fonctionnement](#anti-blocage-binance)). Sur le téléphone, ces réglages sont dans **Réglages → 🛡️ Anti-blocage Binance**.

- **`ANTIBAN_MODE`** — défaut `stop`.
  - `stop` : garde-fou + arrêt ⛔. Codes clairs seulement à partir de `ANTIBAN_SELECTIVE_AT`, puis plus aucun code à partir de `ANTIBAN_STOP_AT` : le bot ne tape jamais le 10e code faux.
  - `light` : garde-fou léger seul. Codes clairs seulement à partir de `ANTIBAN_SELECTIVE_AT`, sans arrêt : le blocage de 5 h reste possible.
- **`ANTIBAN_SELECTIVE_AT`** — défaut `8` (de `0` à `9`). À partir de ce nombre de codes faux d'affilée, seuls les codes **clairs** sont tapés : publiés en monospace, dans un lien Cryptobox ou après « Code : ». Un code qui marche remet le compteur à zéro. `0` = jamais.
- **`ANTIBAN_STOP_AT`** — défaut `9` (mode `stop`, entre `ANTIBAN_SELECTIVE_AT` et `9`). À partir de ce nombre, plus aucun code n'est tapé, sur le PC comme sur le téléphone. Pour reprendre : réclame toi-même un code qui marche dans l'app Binance, puis envoie `#reprendre` dans tes « Messages enregistrés ».
- **`ANTIBAN_STOP_RESUME_H`** — défaut `0` (manuelle). Reprise automatique après l'arrêt ⛔, en heures (jusqu'à 168). ⚠️ Elle suppose que le compteur de Binance est revenu à zéro tout seul : règle-la seulement après avoir vu l'alerte 🔄 dans tes logs.

### X (Twitter)

Voir le [guide Android](GUIDE-ANDROID.md#7-bis-les-codes-publiés-sur-x-twitter). Sur le téléphone, ces réglages sont dans **Réglages → 🐦 Codes publiés sur X**.

- **`X_ENABLED`** — défaut `false`. Téléphone : lire les notifications de l'appli X (il faut aussi l'accès aux notifications).
- **`X_ACCOUNTS`** — vide par défaut = tous les comptes suivis avec la cloche, suggestions de X comprises. Comptes séparés par des virgules, avec ou sans `@` (par exemple `@binance,@binance_fr`). Une liste est conseillée.
- **`X_DRY_RUN`** — défaut `false`. Essai à blanc : détection, relais et anti-blocage tournent, mais aucun code n'est tapé sur Binance (« 🧪 Essai à blanc » dans les logs). Les notifications de test envoyées par adb ne sont lues que dans ce mode. Le PC suit l'essai à blanc annoncé dans chaque `#xcode`.
- **`X_RELAY_ACCEPT`** — défaut `true`. PC : réclamer les codes X relayés par le téléphone (`#xcode`).

### Navigateur et Binance

- **`BINANCE_LOGIN_TIMEOUT`** — défaut `300000` (5 min), en millisecondes. Temps maximum pour te connecter à Binance à la main quand le navigateur démarre. Au-delà, le bot s'arrête (`⏰ Timeout — connexion Binance non détectée`). `0` = attendre sans limite (c'est le cas sur le téléphone). Une session qui expire en cours de route n'a pas de délai : le bot attend ta reconnexion.
- **`BROWSER_USER_AGENT`** — vide par défaut : le user-agent Chrome / Windows historique du bot. `native` = celui du vrai Chromium (c'est le cas sur le téléphone). Toute autre valeur est utilisée telle quelle.
- **`CHROMIUM_PATH`** — vide par défaut : le Chromium de Playwright. Chemin d'un autre Chromium.
- **`CHROMIUM_EXTRA_ARGS`** — vide par défaut. Options Chromium en plus, séparées par des espaces (par exemple `--disable-gpu`). ⚠️ Jamais `--disable-features` : ça écraserait la liste de Playwright.

### Posées automatiquement par l'app Android

Tu n'as pas à les écrire : l'app les donne au bot à chaque démarrage, en plus des valeurs de ses Réglages.

- **`BOT_UNATTENDED=1`** — mode sans surveillance : jamais de demande de code Telegram au clavier. Si la session n'est plus valide, le bot envoie l'alerte 🔑 et s'arrête avec le code 78 (l'app réessaie toutes les 30 min). Accepte `1` ou `true`. Utile aussi sous PM2 ou systemd (voir [VPS](#-déploiement-sur-un-vps)).
- **`BOT_HEARTBEAT_FILE`** — signe de vie réécrit toutes les 15 s (état du relais, du navigateur, de l'autre appareil, codes, anti-blocage, X), lu par l'app pour sa notification, son watchdog et son écran d'accueil. Le journal d'activité `activity.json` (derniers codes, gains, graphique 24 h, stats par source) est écrit dans le même dossier.
- **`BOT_LAST_EXIT_CODE`** — code de sortie du lancement précédent. S'il est supérieur à 0, l'alerte de démarrage est ♻️ « relancé » au lieu de 🟢 « en ligne ».
- **`BOT_PLATFORM=android`** — les messages renvoient vers l'app (connexion Telegram ou Binance, arrêt, réglages du téléphone) ; la page Binance est la WebView de l'app.
- **`BOT_DATA_DIR`** — dossier des données du bot (historique, session, alertes) dans le stockage privé de l'app. Sur le PC : la racine du projet.
- **`TG_SESSION_STORAGE=string`** — session Telegram gardée en texte (Node.js mobile n'a pas de SQLite natif). `BOT_TG_LOGIN=1` quand tu touches **Se connecter** : le code se tape dans l'app.
- Et aussi : `BOT_ROLE` (réglé dans l'app : `backup` ou `solo`), `BINANCE_LOGIN_TIMEOUT=0`, `LOG_WIDTH=48`, `NO_COLOR=1` et `TZ` (fuseau horaire du téléphone).

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

**Sur le téléphone**, l'onglet **Logs** de l'app affiche les mêmes lignes, en couleurs, avec **Copier** et **Partager**. Le fichier `logs/bot.log` (stockage privé de l'app) est archivé dans `logs/bot.log.1` à 5 Mo.

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
- **Posts X** (téléphone) — le texte de la notification de l'appli X et ses liens cachés. Les @mentions, #hashtags, $cashtags et liens `t.co` sont retirés avant l'analyse, ainsi que le dernier mot coupé par X (« … »). X n'a pas de `monospace` : ses codes sont « Code : », lien Cryptobox ou texte libre.

### Deux niveaux de confiance

Les Red Packets Binance font exactement **8 caractères alphanumériques**.

- **Strict**, pour le texte libre : le code doit mélanger lettres **et** chiffres. Sinon, n'importe quel mot de 8 lettres deviendrait un faux positif.
- **Souple**, seulement pour les sources fiables : blocs `monospace`, « Code : XXXXXXXX » (aussi en espagnol, italien, russe, arabe, chinois, japonais), adresses `cryptobox/…` et paramètres `?code=`. Il accepte aussi les codes **100 % alphabétiques**, environ 10 % des Red Packets. Une liste noire de mots courants et un test de voyelles écartent les vrais mots.
- **Code seul sur sa ligne**, en MAJUSCULES (« LJSSNXTT », « 1. PABVFEBL », « 🎁 PABVFEBL ») : niveau souple aussi, mais seulement si le message annonce des codes (« red packet », « code », 🎁, 🧧…), n'est qu'une liste de codes, ou contient déjà un autre code lettres + chiffres seul sur sa ligne. C'est la forme des listes publiées sur X et dans beaucoup de canaux. Ces codes restent classés « texte libre » pour l'anti-blocage.

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
- **Anti-blocage** — voir la section suivante.
- **Pauses partagées** — avec le relais, l'autre appareil respecte la même pause : c'est le même compte.
- **Navigateur furtif** — Chromium persistant + `puppeteer-extra-plugin-stealth`, fenêtre visible (`headless: false`), user-agent et langue réalistes.
- **Session expirée détectée** — si Binance renvoie vers sa page de connexion, les codes sont refusés tout de suite, sans toucher à la page ni la recharger : aucune tentative brûlée, et ta reconnexion n'est pas dérangée. L'adresse (hôte et chemin) est revérifiée juste avant la saisie et après la soumission : **un code n'est jamais tapé dans le formulaire de connexion**. Le retour de la session est détecté tout seul (vérification passive toutes les 20 s), avec les alertes 🔑 puis ✅.
- **Chromium surveillé** — fenêtre fermée ou onglet planté : relance automatique (3 fois au maximum en 10 min).

### Anti-blocage Binance

**La règle de Binance** (FAQ officielle, mise à jour le 04/06/2026) : « votre compte sera verrouillé pendant 5 heures après 10 tentatives de saisie de code de Red Packet erronées consécutives ». Il n'y a pas de limite de réclamations par jour. Un code qui marche casse la série. Aucune vérification d'un code n'est possible sans le soumettre : le clic « Réclamer » est la vérification.

**Ce que fait le bot :**

- **Il lit chaque refus de Binance** : code d'erreur, texte brut et nombre d'essais restants (« il vous reste 7 tentatives »). Chaque refus est loggé tel quel : `📭 Code X — [403803] <texte> · 7 essai(s) restant(s)`.
- **Il ne se met plus en pause sur un simple avertissement.** Avant, le mot « tentative » déclenchait 2 h de pause, alors que Binance disait justement qu'il restait des essais.
- **Il compte les codes faux d'affilée**, en se recalant sur le chiffre de Binance quand il est donné. Compte prudent : un résultat inconnu ou un refus inclassable compte comme un code faux. Un code gagné remet à zéro ; un Red Packet épuisé ou déjà pris ne change rien.
- **Il agit selon `ANTIBAN_MODE`** :

  | Codes faux d'affilée | Mode `stop` (défaut) | Mode `light` |
  |---|---|---|
  | 0 à 7 | tous les codes | tous les codes |
  | 8 (`ANTIBAN_SELECTIVE_AT`) | codes clairs seulement | codes clairs seulement |
  | 9 (`ANTIBAN_STOP_AT`) | ⛔ plus aucun code, alerte | codes clairs seulement |
  | 10 | jamais atteint par le bot | blocage Binance de 5 h |

- **Code clair** : publié en monospace, dans un lien Cryptobox, ou après « Code : ». Les codes trouvés en texte libre sont les plus souvent faux.
- **Pause seulement sur un vrai blocage** (`403067`, « réessayez dans… », « limite atteinte »), pour la durée annoncée par Binance (5 h par défaut), ou 1 h pour un captcha.
- **Partagé et gardé** : le compteur, l'arrêt ⛔ et un blocage en cours sont dans `.run/antiban.json` (ils survivent aux redémarrages) et dans le message `#botrelay` (même compte Binance, donc même compteur sur le PC et le téléphone).
- **`#reprendre`** : envoie ce message dans tes « Messages enregistrés » Telegram pour sortir de l'arrêt ⛔, après avoir réclamé toi-même un code qui marche dans l'app Binance. Les deux appareils le lisent.
- **Il mesure la vraie règle** : si Binance annonce plus d'essais restants que prévu sans code gagné entre-temps, le compteur est revenu à zéro tout seul. Le bot le signale (🔄), avec l'heure.
- **Codes `BP…` ignorés** : seuls les codes de 8 caractères sont réclamés.

Les codes d'erreur (`PAY4001COM000`, `403803`, `403804` invalides, `403802` épuisé, `403067` blocage, `100002001` session) viennent de bots open source, pas de Binance : le texte sert de secours, et `PAY4001COM000`, peut-être générique, n'est jamais pris pour un simple code faux quand son texte parle de blocage.

### Signaux d'alarme dans les logs

```
[09/10 14:02:41] ⚠️  WARN — 📭 Code AB12CD34 — [PAY4001COM000] Code incorrect. Il vous reste 2 tentatives. · 2 essai(s) restant(s)
[09/10 14:02:41] ⚠️  WARN — 🟠 Anti-blocage : 8 code(s) faux d'affilée — seuls les codes clairs (monospace, lien
                                Cryptobox, « Code : ») sont tapés jusqu'au prochain code qui marche
[09/10 14:05:12] ⚠️  WARN — 🛡️ Code XY98ZW76 sauté — 8 codes faux d'affilée — codes clairs seulement (celui-ci est en texte libre)
[09/10 14:09:30] ❌ ERROR — ⛔ ARRÊT ANTI-BLOCAGE : 9 code(s) faux d'affilée — plus que 1 essai(s) avant le blocage
```

> [!WARNING]
> Si 🟠 ou ⛔ reviennent **souvent**, retire de `TARGET_CHANNELS` les canaux qui publient des codes faux : ils te coûtent des essais. Regarde aussi le taux de réussite (`💰 Gains`) dans le bilan : un taux très bas veut dire que tu arrives trop tard.

---

## 🧭 Sélecteurs Playwright

> [!CAUTION]
> Les sélecteurs de la constante `SELECTORS` dans [`src/binance.js`](./src/binance.js) sont **fonctionnels et validés en production**. Ne les modifie que si Binance change vraiment son interface et que les réclamations échouent.

Ils couvrent : la détection de session (`loggedInIndicators` / `loggedOutIndicators`), le champ de saisie (`codeInput`), le bouton de soumission (`submitButton`) et le message d'erreur (`errorMessage`).

**Le résultat ne dépend pas de l'écran.** Réclamer un code se fait en deux temps :
1. « Réclamer » interroge Binance (`…/gift-box/code/query`) : le Red Packet est-il encore à prendre ?
2. « Ouvrir », dans la fenêtre du Red Packet (constante `OPEN_BUTTON`), l'encaisse (`…/gift-box/code/grabV2`).

Le bot lit les **réponses** de ces deux requêtes : le montant gagné (par exemple « 0.0009 SPELL ») ou le motif du refus. Sans réponse de Binance, le résultat est « inconnu » : jamais un faux « GAGNÉ ».

**Après toute modification de `src/binance.js`**, lance `npm test`.
- `npm run test:guard` vérifie l'anti-blocage sans navigateur : lecture des refus, compteur, modes `stop` et `light`, `#reprendre`, relais, sources des codes.
- `npm run test:claim` fait passer la réclamation par 17 scénarios (succès, refus, session expirée, avertissement « il vous reste N tentatives » sans pause, captcha, blocage, fenêtre lente ou absente, réponse d'un ancien code…), avec le vrai Chromium du bot, face à une page Cryptobox simulée : aucune requête ne part vers Binance.

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
│   ├── xsource.js         # Codes publiés sur X (notifications de l'appli X, relais #xcode)
│   ├── activity.js        # Journal d'activité de l'app (derniers codes, gains, stats par source)
│   ├── prices.js          # Valeur en dollars des gains (prix public Binance, sans clé)
│   ├── notifier.js        # Alertes via ton bot @BotFather
│   ├── queue.js           # File d'attente : un code à la fois
│   ├── history.js         # Anti-doublons 48 h (history.json)
│   ├── stats.js           # Compteurs du bilan d'activité
│   ├── logger.js          # Logs horodatés, alignés et colorés
│   ├── webview-browser.js # Page Binance de l'app Android (WebView pilotée par Playwright)
│   ├── paths.js           # Dossier des données (BOT_DATA_DIR)
│   └── platform.js        # Messages adaptés : PC/serveur ou app Android
├── android/               # App Android (APK)
│   ├── app/               # Projet Android Studio (Kotlin) : service, écouteur X, WebView,
│   │                      #   interface Compose (ui/ : écrans, ui/components, ui/theme)
│   ├── node/entry.js      # Démarrage du bot dans l'app (Node.js mobile)
│   └── scripts/build-apk.mjs  # « npm run apk » : compile l'APK
├── test/guard.js          # « npm run test:guard » : anti-blocage, relais, extraction, X
├── test/claim-flow.js     # « npm run test:claim » : vérifie la réclamation sur le PC
├── GUIDE-ANDROID.md       # Guide de l'app Android
├── GUIDE-DEBOGAGE.md      # Déboguer l'app avec Claude (adb) + problèmes résolus
├── README.md
├── .env.example           # Modèle de configuration
├── .gitattributes         # Fins de ligne
├── .gitignore
├── package.json
└── package-lock.json
```

Créés pendant le fonctionnement, **jamais versionnés** :

```
├── .env                   # Tes réglages ⚠️ secret
├── client.session*        # Session Telegram (SQLite) ⚠️ secret
├── browser-data/          # Profil Chromium + cookies Binance ⚠️ secret
├── history.json           # Codes déjà traités (purge à 48 h)
├── .alert-chat-id         # Destinataire des alertes
├── .run/                  # Délais des alertes
└── dist/                  # APK produite par « npm run apk »
```

Sur le téléphone, ces fichiers vivent dans le stockage privé de l'app (jamais dans `/sdcard`). La clé de signature de l'APK est dans `~/.red-packet-bot/` sur le PC : garde-en une copie.

---

## 🌐 Déploiement sur un VPS

Le bot ouvre une **vraie fenêtre** Chromium (`headless: false`). Sur un serveur sans écran, il lui faut un écran virtuel : `xvfb-run`. Et pour la **première connexion Binance**, il faut pouvoir voir cette fenêtre (bureau à distance, VNC…).

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

Sous un superviseur, active le **mode sans surveillance** (`BOT_UNATTENDED=1`) : le bot ne demande jamais de code Telegram. Si la session n'est plus valide, il t'envoie l'alerte 🔑 et s'arrête avec le code **78**, au lieu de rester bloqué sur une question. Fais donc la **première connexion à la main** avant de lui confier le bot. (L'alerte te dit alors de refaire la connexion avec `node index.js --setup`.) Astuce : `BOT_NAME="🖥️ VPS"` dans `.env` pour reconnaître ses alertes.

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
   - `.alert-chat-id` ;
   - `~/.red-packet-bot/` (la clé de signature de l'APK).
2. Ils sont tous dans le [`.gitignore`](./.gitignore). Extrait :
   ```gitignore
   .env
   *.session*
   browser-data/
   history.json*
   .run/
   .alert-chat-id
   logs/
   *.jks
   ```
3. **Session divulguée ?** Les fichiers de session Telegram (`client.session`, `my-session.session*`) étaient suivis par Git. Ils sont retirés du dépôt, mais restent dans l'historique de ce dépôt public : n'importe qui les ayant récupérés pourrait prendre le contrôle du compte Telegram. Il fallait donc, dans Telegram : **Paramètres → Appareils → « Mettre fin aux autres sessions »**. Refais-le chaque fois qu'un de ces fichiers a pu fuiter (le bot te redemandera le code une fois).
4. **Jeton du bot d'alertes divulgué ?** Révoque-le avec @BotFather (`/revoke`), puis mets le nouveau jeton dans `.env` sur le PC, **et** dans les Réglages de l'app sur le téléphone.
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
| `🚨 BLOCAGE BINANCE` | Vrai blocage (10 codes faux d'affilée, limite ou captcha) : pause automatique de la durée annoncée. Passe en `ANTIBAN_MODE=stop` pour ne plus l'atteindre. |
| `⛔ ARRÊT ANTI-BLOCAGE` | Réclame toi-même un code qui marche dans l'app Binance, puis envoie `#reprendre` dans tes Messages enregistrés. Retire les canaux qui publient des codes faux. |
| `🛡️ Code … sauté` | Normal en mode codes clairs (🟠) ou à l'arrêt (⛔) : le code n'est pas mémorisé, il sera réexaminé s'il est republié. |
| `⏭️ Code … abandonné — champ de saisie introuvable` | Page lente ou session expirée : regarde la fenêtre Binance (PC), ou ouvre **Connexion Binance** dans l'app (téléphone). |
| `🔑 Session Binance expirée — code … non soumis` | Reconnecte-toi : fenêtre Chromium (PC), ou notification 🔑 / **Connexion Binance** dans l'app (téléphone). |
| `⏰ Timeout — connexion Binance non détectée` | Connecte-toi plus vite, ou augmente `BINANCE_LOGIN_TIMEOUT` (`0` = sans limite). |
| Session Telegram invalide (PC) | Supprime les fichiers `client.session*` et relance `npm start`. |
| `🔑 Session Telegram à refaire` (téléphone) | App → **📡 Sources** → **✈️ Telegram** → **🔄 Se reconnecter**. |
| `🔕 Alerte non envoyée : … envoie /start …` | Envoie `/start` à ton bot d'alertes. |
| `🔕 Alerte non envoyée : … vérifie ALERT_BOT_TOKEN` | Jeton faux ou révoqué : recopie-le depuis @BotFather. |
| `🔕 Alertes : destinataire inconnu` | Normal avant la première connexion Telegram. Sinon, remplis `ALERT_CHAT_ID`. |
| `🤝 Relais : un AUTRE appareil se déclare aussi PC prioritaire` | Un seul `primary` : le téléphone doit être en **Secours du PC** (Réglages de l'app). |
| Le bot s'arrête tout seul sur le téléphone | Écran **Santé** de l'app : notification « Bot en marche » active (elle empêche le gel de HiOS), batterie sans restriction, démarrage auto et applis protégées dans Phone Master. Voir l'[étape 7 du guide](GUIDE-ANDROID.md#7-les-réglages-du-téléphone-écran-santé). Toujours endormi ? Le [guide de débogage](GUIDE-DEBOGAGE.md) explique comment laisser Claude examiner le téléphone par câble USB. |
| `💥 L'onglet Binance a planté (mémoire insuffisante ?)` | Ferme des applis. Le navigateur est relancé tout seul (l'app recrée sa page Binance). Sur PC ou VPS : `CHROMIUM_EXTRA_ARGS="--disable-gpu"`. |
| Le bot plante au démarrage sur un VPS | `npx playwright install-deps chromium`. |
| `npm run apk` échoue | Voir le [dépannage du guide Android](GUIDE-ANDROID.md#11-dépannage) (SDK, NDK 27.1, CMake 3.22.1). |

---

## 📄 Licence

MIT — usage personnel uniquement.
