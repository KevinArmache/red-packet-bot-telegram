# Red Packet Bot — Cryptobox Telegram/Binance

> Bot personnel Node.js qui surveille des canaux Telegram en temps réel et réclame automatiquement les codes **Cryptobox (Red Packets)** sur Binance via Playwright.

---

## 📋 Prérequis

| Outil | Version minimale | Vérification |
|-------|-----------------|--------------|
| Node.js | **>= 18.0.0** | `node --version` |
| npm | >= 9.0.0 | `npm --version` |
| Git | Toute version récente | `git --version` |

> **Important :** Ce bot utilise un compte Telegram personnel (Userbot). Il ne s'agit pas d'un bot traditionnel (@BotFather). Vous aurez besoin d'identifiants API Telegram.

---

## 🗂️ Structure du projet

```
red-packet-bot-telegram/
├── index.js              # Orchestrateur principal
├── src/
│   ├── logger.js         # Système de logs horodatés
│   ├── history.js        # Gestion anti-doublons (history.json)
│   ├── queue.js          # File d'attente promise (traitement séquentiel)
│   ├── telegram.js       # Client Telegram Userbot (mtcute)
│   └── binance.js        # Automatisation Binance (Playwright)
├── browser-data/         # Données de session Chromium (auto-créé)
├── history.json          # Codes déjà réclamés (auto-créé)
├── client.session*       # Session Telegram persistante mtcute (SQLite, auto-créé)
├── package.json
├── .env                  # ⚠️ NE PAS VERSIONNER
└── .env.example          # Modèle de configuration
```

---

## 🔑 Étape 1 — Obtenir vos identifiants API Telegram

1. Ouvrez [https://my.telegram.org](https://my.telegram.org) dans votre navigateur.
2. Connectez-vous avec **le numéro de téléphone** que vous utiliserez pour l'Userbot.
   > ⚠️ **Recommandation de sécurité :** Utilisez un numéro secondaire dédié (SIM secondaire, numéro virtuel), jamais votre numéro principal.
3. Cliquez sur **"API development tools"**.
4. Remplissez le formulaire :
   - **App title** : `CryptoboxBot` (ou ce que vous voulez)
   - **Short name** : `cryptoboxbot`
   - **Platform** : `Other`
5. Cliquez sur **"Create application"**.
6. Notez les valeurs affichées :
   - `App api_id` → votre `API_ID`
   - `App api_hash` → votre `API_HASH`

---

## ⚙️ Étape 2 — Configurer le fichier `.env`

```bash
# Copiez le modèle
cp .env.example .env
```

Ouvrez `.env` dans votre éditeur et remplissez toutes les valeurs :

```env
API_ID=12345678                          # Votre API ID Telegram
API_HASH=abcdef1234567890abcdef1234567890 # Votre API Hash Telegram
PHONE_NUMBER=+33612345678                # Votre numéro avec indicatif
TARGET_CHANNELS=@canal1,@canal2          # Canaux à surveiller
BINANCE_LOGIN_TIMEOUT=300000             # 5 min pour la connexion manuelle
```

### Comment trouver l'ID d'un canal privé ?

1. Dans l'application Telegram (web ou desktop), ouvrez le canal.
2. L'URL ressemble à `https://web.telegram.org/k/#-1001234567890`.
3. L'ID est la partie numérique précédée de `-100` : `-1001234567890`.

---

## 📦 Étape 3 — Installer les dépendances

```bash
# Installer les packages Node.js
npm install

# Installer les navigateurs Playwright (Chromium uniquement)
npx playwright install chromium
```

> Cette commande télécharge Chromium (~120 Mo). Elle n'est nécessaire qu'une seule fois.

---

## 🚀 Étape 4 — Premier lancement

```bash
node index.js
```

### Ce qui se passe lors du premier lancement :

#### 1. Authentification Telegram
```
[INFO] Connexion au serveur Telegram en cours...
⚡ Un code de vérification Telegram a été envoyé à votre numéro/application.
Entrez le code de vérification Telegram :
```
→ Entrez le code reçu par SMS ou dans votre application Telegram.

Si vous avez activé la **2FA Telegram** :
```
🔐 Authentification à deux facteurs (2FA) détectée.
Entrez votre mot de passe 2FA Telegram :
```
→ Entrez votre mot de passe 2FA.

La session sera sauvegardée dans `client.session` (base SQLite) — vous ne serez **plus redemandé** aux prochains lancements.

#### 2. Connexion Binance
Une fenêtre Chromium s'ouvre sur `https://www.binance.com/fr`.

Si vous n'êtes pas connecté, le message suivant apparaît dans la console :
```
⚠️  Veuillez vous connecter manuellement à Binance dans la fenêtre du navigateur.
    Le script attendra que vous soyez connecté (timeout : 5 minutes).
```
→ **Connectez-vous manuellement** dans la fenêtre (email/mot de passe + 2FA Binance).

Une fois connecté, le bot continue automatiquement et sauvegarde votre session dans `./browser-data/`. Vous ne devrez plus vous reconnecter manuellement.

---

## 🔄 Lancements suivants

```bash
node index.js
```

Le bot démarrera directement sans redemander d'identifiants.

---

## 🛠️ Adapter les sélecteurs Playwright

> ⚠️ **Attention :** Si Binance modifie son interface, certains sélecteurs peuvent cesser de fonctionner.

Les sélecteurs sont regroupés dans la constante `SELECTORS` dans [`src/binance.js`](./src/binance.js) :

```javascript
const SELECTORS = {
  loggedInIndicator: '[data-testid="header-user-center"]',
  codeInput: 'input[placeholder*="code"], input[name="code"]',
  submitButton: 'button:has-text("Ouvrir"), button:has-text("Claim")',
  // ...
};
```

**Pour mettre à jour un sélecteur :**
1. Ouvrez la page concernée dans Chrome.
2. Faites **F12** → onglet **Elements**.
3. Localisez l'élément et copiez son sélecteur CSS ou attribut `data-testid`.
4. Mettez à jour la constante correspondante dans `binance.js`.

---

## 📊 Logs de fonctionnement

Exemple de logs en fonctionnement normal :

```
[2025-01-01T12:00:00.000Z] 📘 INFO — Historique chargé : 42 code(s) en mémoire.
[2025-01-01T12:00:01.000Z] ✅ OK   — Connecté en tant que : Jean Dupont (@jeandupont)
[2025-01-01T12:00:02.000Z] 📘 INFO — Surveillance des canaux : @canal_alertes
[2025-01-01T12:00:05.000Z] ✅ OK   — Bot entièrement opérationnel.
[2025-01-01T12:05:32.000Z] 📘 INFO — 📨 Nouveau message reçu depuis @canal_alertes
[2025-01-01T12:05:32.000Z] 📘 INFO — 🎯 Code Cryptobox détecté : ABCD1234
[2025-01-01T12:05:33.000Z] 📘 INFO — 🚀 Tentative de réclamation du code : ABCD1234
[2025-01-01T12:05:38.000Z] ✅ OK   — Code ABCD1234 — Réclamation soumise avec succès !
```

---

## 🖥️ Déploiement sur VPS (Ubuntu)

### Option 1 : PM2 (recommandé)

```bash
# Installer PM2 globalement
npm install -g pm2

# Lancer le bot avec PM2
pm2 start index.js --name "cryptobox-bot"

# Sauvegarder la configuration PM2 (redémarrage automatique)
pm2 save
pm2 startup

# Voir les logs en temps réel
pm2 logs cryptobox-bot
```

### Option 2 : systemd

```bash
sudo nano /etc/systemd/system/cryptobox-bot.service
```

```ini
[Unit]
Description=Cryptobox Telegram Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/red-packet-bot-telegram
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable cryptobox-bot
sudo systemctl start cryptobox-bot
sudo journalctl -u cryptobox-bot -f
```

> **Note :** Sur un VPS sans affichage graphique, Playwright a besoin de dépendances système. Exécutez :
> ```bash
> npx playwright install-deps chromium
> ```

---

## 🛡️ Protections anti-ban Telegram (LIRE SI NUMÉRO PRINCIPAL)

> [!CAUTION]
> Si votre compte Telegram est banni, **toutes vos conversations, photos partagées, contacts et accès aux groupes sont perdus définitivement**. Ces protections sont activées par défaut dans le code.

### Ce que fait le code pour vous protéger

| Protection | Détail |
|------------|--------|
| **FloodWaitError** | Si Telegram dit « ralentis », le bot attend exactement le temps demandé + 5s de marge |
| **Rate limiter** | Max **5 codes acceptés par minute** (configurable dans `src/telegram.js`) |
| **Délai humain** | Pause aléatoire de 0,5–1,5 secondes avant chaque traitement de message |
| **Anti-doublons** | Double vérification pour contrer les requêtes concurrentes sur le même code |
| **Aucun historique** | Le bot n'accède **jamais** aux anciens messages (`getHistory` banni) |
| **Écoute passive** | Le bot reçoit les messages par push (WebSocket), sans jamais poller |
| **Backoff exponentiel** | En cas de déconnexion : 3s, 6s, 12s... avant de retenter |

### Régler le rate limit

Ouvrez [`src/telegram.js`](./src/telegram.js) et modifiez cette constante selon votre besoin :

```javascript
// Nombre maximum de codes traités par minute
// Réduire si vous voyez des FLOOD_WAIT dans les logs
const MAX_CODES_PER_MINUTE = 10;
```

### Signaux d'alarme dans les logs

Si vous voyez ces messages, **agissez immédiatement** (réduisez `MAX_CODES_PER_MINUTE` ou arrêtez le bot) :

```
⚠️  WARN — 🛑 FLOOD_WAIT reçu de Telegram — attente Xs...
⚠️  WARN — 🛡️ Rate limit atteint : 5/5 codes en moins d'une minute.
```

> [!WARNING]
> Si `FLOOD_WAIT` apparaît **plus de 3 fois par heure**, c'est un signal fort que le bot est trop actif. Réduisez immédiatement `MAX_CODES_PER_MINUTE` à 2 ou 3.

---

## 🔒 Recommandations de sécurité

1. **Ne partagez jamais** votre fichier `.env`, `session.txt` ou le dossier `browser-data/`.
2. Ajoutez ces éléments à votre `.gitignore` (déjà configuré) :
   ```gitignore
   .env
   session.txt
   client.session*
   browser-data/
   history.json*
   *.tmp
   *.png
   ```
3. **Numéro secondaire (idéal) :** Un numéro virtuel (Google Voice, Twilio, Skype) est l'option la plus sûre — si vous êtes banni, votre vrai compte est intact.
4. **Risque Binance :** L'automatisation peut être détectée. Le mode `headless: false` et les délais aléatoires réduisent ce risque, mais ne l'éliminent pas.
5. **Permissions VPS :** Si vous déployez sur un VPS, n'exécutez pas le bot en `root`. Créez un utilisateur dédié.
6. **Ne laissez pas le bot sans surveillance** les premiers jours — vérifiez les logs régulièrement.

---

## 🐛 Dépannage courant

| Problème | Solution |
|----------|----------|
| `Variables d'environnement manquantes` | Vérifiez votre `.env` (copiez depuis `.env.example`) |
| `Session Telegram invalide` | Supprimez les fichiers `client.session*` et relancez |
| `FLOOD_WAIT` fréquents | Réduire `MAX_CODES_PER_MINUTE` dans `src/telegram.js` |
| `Sélecteur Playwright introuvable` | Mettez à jour `SELECTORS` dans `src/binance.js` (voir section dédiée) |
| `Timeout connexion Binance` | Augmentez `BINANCE_LOGIN_TIMEOUT` dans `.env` |
| Codes non détectés | Vérifiez que `TARGET_CHANNELS` contient le bon canal |
| Bot plante au démarrage sur VPS | Installez les dépendances système : `npx playwright install-deps chromium` |
| Compte Telegram déconnecté | Session expirée — supprimez les fichiers `client.session*` et reconnectez-vous |

---

## 📄 Licence

MIT — Usage personnel uniquement.
