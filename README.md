# Red Packet Bot — Cryptobox Telegram/Binance

> Bot personnel Node.js qui surveille des canaux Telegram en temps réel et réclame automatiquement les codes **Cryptobox (Red Packets)** sur Binance via Playwright.

**Trois règles absolues** gravées dans le code :

| Règle | Ce que ça veut dire |
|-------|---------------------|
| ⛔ **Zéro retry** | Un code n'est soumis **qu'une seule fois**. S'il échoue, on passe au suivant — jamais de nouvelle tentative. |
| ⏮️ **Zéro rattrapage** | Aucun code publié **avant** le lancement du script n'est réclamé. Le bot ne traite que le direct. |
| 🎯 **Zéro raté** | Texte, légendes, **boutons inline**, **liens masqués**, aperçus de lien et **messages édités** sont tous analysés. |

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
├── index.js              # Orchestrateur principal + bilans d'activité
├── src/
│   ├── logger.js         # Logs horodatés, alignés et colorés
│   ├── stats.js          # Compteurs (codes, gains, latences, déconnexions)
│   ├── history.js        # Gestion anti-doublons (history.json)
│   ├── queue.js          # File d'attente promise (traitement séquentiel)
│   ├── telegram.js       # Client Telegram Userbot (mtcute) + détection des codes
│   └── binance.js        # Automatisation Binance (Playwright)
├── browser-data/         # Données de session Chromium (auto-créé)
├── history.json          # Codes déjà réclamés (auto-créé, purge à 48 h)
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

### Réglages obligatoires

```env
API_ID=12345678                          # Votre API ID Telegram
API_HASH=abcdef1234567890abcdef1234567890 # Votre API Hash Telegram
PHONE_NUMBER=+33612345678                # Votre numéro avec indicatif
TARGET_CHANNELS=@canal1,@canal2          # Canaux à surveiller (virgules, sans espaces)
BINANCE_LOGIN_TIMEOUT=300000             # 5 min pour la connexion manuelle
```

`TARGET_CHANNELS` accepte indifféremment `@pseudo`, `https://t.me/pseudo` ou un ID `-1001234567890`.
**Vous pouvez en mettre 100 sans problème** — voir [Tenir 100+ canaux](#-tenir-100-canaux).

### Réglages facultatifs

| Variable | Défaut | Rôle |
|----------|--------|------|
| `MAX_MESSAGE_AGE_S` | `180` | Garde-fou de fraîcheur. Un message **livré en retard** (après une coupure réseau) au-delà de ce délai est ignoré : son Red Packet est déjà vidé et le soumettre brûlerait une tentative Binance pour rien. `0` = désactivé. |
| `RESOLVE_LINKED_CHATS` | `true` | Explore aussi les groupes de commentaires liés aux canaux (certains y publient les codes). |
| `STATS_INTERVAL_MIN` | `30` | Fréquence du tableau `📊 Bilan d'activité` dans la console. `0` = désactivé. |
| `DEBUG` | `false` | Affiche le niveau `🔍 DEBUG` (messages ignorés, chats reçus, raisons de rejet). |
| `NO_COLOR` | *(absent)* | Définissez-la pour désactiver les couleurs ANSI (utile si vous redirigez la sortie vers un fichier). |

> ⚠️ `MAX_MESSAGE_AGE_S` **ne sert pas** à récupérer d'anciens codes : la règle « zéro rattrapage » s'applique toujours en premier. C'est uniquement un filet de sécurité pour les messages livrés tardivement.

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
npm start        # ou : node index.js
```

### Ce qui se passe lors du premier lancement

#### 1. Connexion Binance
Une fenêtre Chromium s'ouvre sur la page Cryptobox. Si vous n'êtes pas connecté :

```
⚠️  WARN — ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
             🔑 Connectez-vous manuellement à Binance dans le navigateur
             ⏱️ Timeout : 5 minutes
           ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

→ **Connectez-vous manuellement** dans la fenêtre (email/mot de passe + 2FA Binance).
Le bot continue ensuite tout seul et sauvegarde votre session dans `./browser-data/`.

#### 2. Authentification Telegram
```
📱 Code Telegram :
```
→ Entrez le code reçu par SMS ou dans votre application Telegram.

Si vous avez activé la **2FA Telegram** :
```
🔐 Mot de passe 2FA :
```

La session est sauvegardée dans `client.session` (SQLite) — vous ne serez **plus redemandé** aux prochains lancements.

---

## 🔄 Lancements suivants

```bash
npm start
```

Le bot démarre directement, sans redemander d'identifiants.

> ⏮️ **À chaque démarrage, le compteur repart à zéro.** Les codes publiés pendant que le bot était éteint ne seront **jamais** réclamés — ils sont de toute façon déjà épuisés, et les soumettre ne ferait que brûler le compteur anti-fraude Binance.

---

## 🎯 Comment les codes sont détectés

Le bot analyse **toutes** les surfaces d'un message, pas seulement son texte :

| Surface analysée | Exemple typique |
|------------------|-----------------|
| Texte & légende de média | `🎁 Code: 92J5LXPM` |
| **Boutons inline** (texte + URL) | bouton « 🎁 Réclamer » pointant vers `.../cryptobox/QW3RT5YU` |
| **Liens masqués** (`text_link`) | « [cliquez ici](https://…?code=8HJ2K4L9) » |
| Blocs `monospace` / `pre` | code posté entre backticks |
| Aperçu de lien (webpage) | URL, titre et description de la preview |
| **Messages édités** | canal qui publie un message puis y **ajoute le code** ensuite |

### Deux niveaux de confiance

Les Red Packets Binance font exactement **8 caractères alphanumériques**.

- **Strict** — appliqué au texte libre : le code doit mélanger lettres **et** chiffres. Sinon n'importe quel mot de 8 lettres deviendrait un faux positif.
- **Souple** — appliqué uniquement aux sources fiables (`monospace`, `Code : XXXXXXXX`, URL cryptobox) : accepte aussi les codes **100 % alphabétiques**, qui représentent environ 10 % des Red Packets. Une liste noire de mots courants et un test de densité de voyelles écartent les vrais mots.

Sont systématiquement rejetés : les suites de 8 chiffres (dates, identifiants), les codes préfixés `BP`, et les messages destinés à un autre exchange (Bybit, OKX, Bitget…) qui ne mentionnent pas Binance.

> 💡 Chaque faux positif coûte une tentative sur le compteur anti-fraude Binance. C'est pourquoi le niveau souple reste volontairement restreint aux sources où un code est explicitement annoncé.

---

## 📡 Tenir 100+ canaux

| Mécanisme | Pourquoi ça compte |
|-----------|--------------------|
| **Écoute active avant résolution** | Les handlers sont enregistrés **avant** que les canaux soient résolus : aucun angle mort pendant le démarrage. |
| **Résolution groupée** | Un seul balayage de la liste des dialogues (archivés inclus) résout la quasi-totalité des cibles : ≈3 appels API au lieu de ~200. |
| **Repli throttlé** | Les cibles absentes des dialogues passent par `getChat`, 4 en parallèle, avec gestion du `FLOOD_WAIT`. |
| **Rattrapage à la volée** | Un canal non résolu est adopté automatiquement dès son premier message, par correspondance `@username`. |
| **Groupes liés en arrière-plan** | Les groupes de commentaires sont explorés après le démarrage, espacés de 250 ms — sans jamais retarder la détection. |
| **Handler non bloquant** | Aucun `await` sur le chemin critique : un message ne peut pas en retarder un autre, quel que soit le nombre de canaux. |
| **File séquentielle** | Un seul onglet Binance ⇒ un code à la fois, en ordre d'arrivée. La file prévient dès qu'elle devient le goulot d'étranglement. |

---

## 📊 Logs de fonctionnement

Style `[timestamp] EMOJI NIVEAU — message`, niveaux alignés et colorés.

```
╔══════════════════════════════════════════════════════════════╗
║  🤖 Bot Red Packet — Telegram × Binance                      ║
║  ⚡ Détection instantanée · Zéro retry · Zéro rattrapage     ║
╚══════════════════════════════════════════════════════════════╝

══════════════════════ 🧩 Initialisation ═══════════════════════
[2026-08-04T10:33:21.534Z] 📘 INFO  — 📋 Historique : 42 code(s) en mémoire
[2026-08-04T10:33:21.538Z] ✅ OK    — 🟢 Navigateur Binance prêt
[2026-08-04T10:33:21.538Z] 📘 INFO  — 🎯 17 canal(aux) demandé(s) dans TARGET_CHANNELS

═════════════════════════ 📡 Telegram ══════════════════════════
[2026-08-04T10:33:21.538Z] ✅ OK    — 👤 Connecté : Kevin (@kev)
[2026-08-04T10:33:21.538Z] ✅ OK    — 🗂️  238 dialogue(s) indexé(s)

═════════════════════ 📡 Canaux surveillés ═════════════════════
   • @vgfboxes              @binance_box_channel   @cryptogws
   • @makzero               @rsbox                 @red_packeta

[2026-08-04T10:33:21.539Z] ✅ OK    — 🚀 Écoute active sur 21 chat(s) — 17 résolu(s) sur 17 cible(s)
[2026-08-04T10:33:21.539Z] 📘 INFO  — ⏮️ Aucun rattrapage : seuls les codes publiés après 11:33:21 sont pris

[2026-08-04T10:34:12.104Z] ✅ OK    — 🎁 Code trouvé : 92J5LXPM — depuis @vgfboxes
[2026-08-04T10:34:12.106Z] 📘 INFO  — 🚀 Réclamation en cours : 92J5LXPM
[2026-08-04T10:34:18.430Z] ✅ OK    — 💰 GAGNÉ ! Code 92J5LXPM → 0.00000005 BNB
[2026-08-04T10:34:18.431Z] ✅ OK    — 🏁 Code 92J5LXPM traité en 6324 ms
```

### Bilan d'activité

Affiché toutes les `STATS_INTERVAL_MIN` minutes, à minuit, et à l'arrêt du bot :

```
┌─ 📊 Bilan d'activité ─────────────────────────────────────────
│  ⏱️ Uptime              02h 36m 52s
│  📨 Messages analysés   1843 (dont 97 éditions)
│  🎁 Codes détectés      64
│  🚀 Réclamations        61
│  💰 Gains               48 (79 %)
│  📭 Échecs              13
│  ⏭️ Ignorés             0 (pause/navigateur)
│  🔁 Doublons filtrés    209
│  ⏮️ Avant démarrage     31 (jamais traités)
│  🕰️ Messages périmés    12
│  ⚡ Détection → clic    430 ms (pire : 5210 ms)
│  ⌛ Durée réclamation   6200 ms en moyenne
│  📥 Pic de file         5
│  📡 Déconnexions        0
└───────────────────────────────────────────────────────────────
```

**Comment le lire :**

- `⚡ Détection → clic` élevé (> 1 s) → la file est saturée, les Red Packets partent avant votre tour.
- `📥 Pic de file` > 4 → trop de canaux publient simultanément pour un seul onglet Binance.
- `⏮️ Avant démarrage` qui grimpe sans arrêt alors que `🎁 Codes détectés` reste à 0 → **l'horloge de la machine avance** sur l'heure réelle. Le bot vous alerte explicitement dans ce cas.
- `📡 Déconnexions` fréquentes → réseau instable, des codes passent pendant les coupures.

---

## 🛠️ Sélecteurs Playwright

> [!CAUTION]
> Les sélecteurs de la constante `SELECTORS` dans [`src/binance.js`](./src/binance.js) sont **fonctionnels et validés en production**. Ne les modifiez que si Binance change réellement son interface et que les réclamations échouent.

Ils couvrent : détection de session (`loggedInIndicators` / `loggedOutIndicators`), champ de saisie (`codeInput`), bouton de soumission (`submitButton`), modale de confirmation (`confirmButton`), lecture du gain (`successModal`) et message d'erreur (`errorMessage`).

**Pour mettre à jour un sélecteur :**
1. Ouvrez la page Cryptobox dans Chrome.
2. **F12** → onglet **Elements**.
3. Localisez l'élément et copiez son sélecteur CSS ou son `data-testid`.
4. Ajoutez-le **en tête** du tableau correspondant (les tableaux sont testés dans l'ordre, le premier visible gagne).

---

## 🛡️ Protections intégrées

### Côté Telegram

| Protection | Détail |
|------------|--------|
| **Écoute 100 % passive** | Le bot **reçoit** les messages par push. Il n'envoie rien, ne réagit à rien, ne marque rien comme lu. |
| **Aucun accès à l'historique** | Pas de `getHistory`, pas de polling. Combiné à `catchUp: false`, le bot ne demande jamais d'anciens messages. |
| **Très peu de requêtes** | La résolution groupée par dialogues remplace ~200 appels par ≈3. C'est le principal facteur de `FLOOD_WAIT` évité. |
| **`FLOOD_WAIT` géré** | Si Telegram impose une pause, le bot attend le délai demandé + 1 s (plafonné à 60 s) puis reprend une fois. |
| **Appels espacés** | L'exploration des groupes liés est étalée à 250 ms par canal, en arrière-plan. |

### Côté Binance

| Protection | Détail |
|------------|--------|
| **⛔ Une seule soumission par code** | Aucun code n'est jamais rejoué, quel que soit le résultat. C'est la protection la plus importante du compteur anti-fraude. |
| **Traitement séquentiel** | Un seul code à la fois, jamais de réclamations parallèles. |
| **Anti-doublons 48 h** | `history.json` empêche de resoumettre un code déjà traité, même après redémarrage. |
| **Pause auto 5 h** | Déclenchée si Binance répond « limite / limit / dépassé ». |
| **Pause auto 2 h** | Déclenchée si Binance mentionne « tentative / attempt » (compteur en train de se remplir). |
| **Navigateur furtif** | Chromium persistant + `puppeteer-extra-plugin-stealth`, `headless: false`, user-agent et locale réalistes. |

### Signaux d'alarme dans les logs

```
❌ ERROR — 🚨 ALERTE ANTI-BAN : La limite de Binance a été atteinte.
⚠️  WARN — 🛑 Le bot se met en pause automatique pour 5 heures.
```

> [!WARNING]
> Si ces messages reviennent **plusieurs fois par jour**, réduisez le nombre de canaux dans `TARGET_CHANNELS` : vous soumettez trop de codes morts. Vérifiez aussi le taux de réussite (`💰 Gains`) dans le bilan — un taux très bas signifie que vous arrivez systématiquement trop tard.

---

## 🖥️ Déploiement sur VPS (Ubuntu)

### Option 1 : PM2 (recommandé)

```bash
npm install -g pm2
pm2 start index.js --name "cryptobox-bot"
pm2 save
pm2 startup
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

> **Notes VPS :**
> - Playwright a besoin de dépendances système : `npx playwright install-deps chromium`
> - Le bot tourne en `headless: false` (fenêtre visible) : sur un VPS sans écran, installez `xvfb` et lancez via `xvfb-run node index.js`.
> - **Synchronisez l'horloge du serveur** (`timedatectl set-ntp true`). Une horloge qui avance ferait rejeter tous les messages comme « antérieurs au démarrage ».
> - Ajoutez `NO_COLOR=1` dans `.env` si vous redirigez les logs vers un fichier.

---

## 🔒 Recommandations de sécurité

1. **Ne partagez jamais** votre fichier `.env`, vos fichiers `client.session*` ou le dossier `browser-data/` — ils donnent un accès complet à vos comptes.
2. Ces éléments sont déjà dans le [`.gitignore`](./.gitignore) :
   ```gitignore
   .env
   client.session*
   browser-data/
   history.json*
   ```
3. **Numéro secondaire (idéal) :** un numéro virtuel (Google Voice, Twilio, Skype) est l'option la plus sûre — si le compte est banni, votre vrai compte reste intact.
4. **Risque Binance :** l'automatisation peut être détectée. Le mode fenêtré et les pauses anti-ban réduisent ce risque sans l'éliminer.
5. **Permissions VPS :** n'exécutez pas le bot en `root`, créez un utilisateur dédié.
6. **Surveillez les logs les premiers jours** — le bilan d'activité est fait pour ça.

---

## 🐛 Dépannage courant

| Problème | Solution |
|----------|----------|
| `🔑 Variables manquantes dans .env` | Vérifiez votre `.env` (copiez depuis `.env.example`) |
| `🎯 Aucun canal défini dans TARGET_CHANNELS` | Renseignez au moins un canal, séparés par des virgules |
| `🚧 N canal(aux) non résolu(s)` | Normal si le compte n'est pas abonné au canal. Ils sont captés à la volée dès leur premier message — sinon, abonnez-vous au canal. |
| **Aucun code détecté alors que le canal publie** | Vérifiez l'heure système (`⏰` dans les logs), puis lancez avec `DEBUG=true` pour voir la raison exacte de chaque rejet |
| `⏮️ Avant démarrage` qui grimpe sans détection | Horloge machine en avance → `w32tm /resync` (Windows) ou `timedatectl set-ntp true` (Linux) |
| `🐢 Limite Telegram atteinte` | Le bot gère seul. Si c'est fréquent au démarrage, réduisez le nombre de canaux. |
| `🚨 ALERTE ANTI-BAN` Binance | Le bot se met en pause seul. Trop de codes morts soumis : réduisez les canaux les moins rentables. |
| `⏭️ Code abandonné — champ de saisie introuvable` | Page Binance lente ou session expirée : vérifiez que vous êtes toujours connecté dans la fenêtre Chromium |
| `Timeout connexion Binance` | Augmentez `BINANCE_LOGIN_TIMEOUT` dans `.env` |
| Session Telegram invalide / compte déconnecté | Supprimez les fichiers `client.session*` et relancez |
| Bot plante au démarrage sur VPS | `npx playwright install-deps chromium` |

---

## 📄 Licence

MIT — Usage personnel uniquement.
