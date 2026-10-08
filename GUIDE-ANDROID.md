# 📱 Guide Android — le bot 24 h/24 avec l'app Red Packet Bot

Ce guide installe le bot sur ton téléphone Android sous forme d'**application (APK)**. C'est le **même bot que sur le PC** (même détection des codes, mêmes alertes, même relais), mais tout se fait dans l'app : pas de Termux, pas de commandes à taper sur le téléphone.

- **Le téléphone est le secours du PC.** Le PC réclame les codes en priorité ; le téléphone prend le relais dès que le PC s'arrête.
- **La connexion Binance se fait directement dans l'app**, en plein écran, avec le clavier du téléphone.
- **L'app tourne en permanence** : notification fixe, relance automatique après un plantage, après un redémarrage du téléphone et après une mise à jour.

Compte environ **20 minutes** sur le téléphone la première fois, plus le temps de la première compilation sur le PC.

## Sommaire

1. [Ce qu'il te faut](#1-ce-quil-te-faut)
2. [Fabriquer l'APK sur le PC](#2-fabriquer-lapk-sur-le-pc)
3. [Installer l'APK sur le téléphone](#3-installer-lapk-sur-le-téléphone)
4. [Les réglages du bot](#4-les-réglages-du-bot)
5. [La connexion Telegram](#5-la-connexion-telegram)
6. [La connexion Binance](#6-la-connexion-binance)
7. [Les réglages du téléphone (écran Santé)](#7-les-réglages-du-téléphone-écran-santé)
8. [Au quotidien](#8-au-quotidien)
9. [Le relais avec le PC](#9-le-relais-avec-le-pc)
10. [Mettre à jour l'app](#10-mettre-à-jour-lapp)
11. [Dépannage](#11-dépannage)
12. [Désinstaller](#12-désinstaller)

---

## 1. Ce qu'il te faut

**Sur le téléphone :**

- Android **10 ou plus**, 64 bits. Le guide prend l'exemple d'un **Tecno Camon 40 (HiOS 15, Android 15)**.
- Environ **300 Mo** d'espace libre.
- Un **Wi-Fi stable**, et le téléphone **branché sur son chargeur** le plus souvent possible.

**Sur le PC (une seule fois, pour fabriquer l'APK) :**

- Le projet du bot, qui marche déjà sur le PC (`npm start`), avec **Node.js 22 ou plus** (24 conseillé).
- **Android Studio**, installé une fois. Il fournit le SDK Android et Java ; l'app n'a pas besoin qu'il soit ouvert.
  - Dans Android Studio, **Paramètres** → **Languages & Frameworks** → **Android SDK** → onglet **SDK Tools** : coche **NDK (Side by side)** et **CMake**, puis **Apply**. Le script veut le NDK **27.1.12297006** et CMake **3.22.1** : si l'une des deux versions manque, coche **Show Package Details** pour la choisir.

**Côté comptes :**

- Le **même compte Telegram** que sur le PC (le téléphone aura sa propre connexion à ce compte).
- Ton compte **Binance**.
- Ton **bot d'alertes** @BotFather (conseillé) : voir la section « Alertes Telegram » du [README](README.md#-alertes-telegram).

---

## 2. Fabriquer l'APK sur le PC

Dans un terminal, dans le dossier du projet :

```bash
npm install
npm run apk
```

La première fois, compte **de 10 à 45 minutes** selon ta connexion : Gradle télécharge plusieurs centaines de Mo d'outils, une seule fois. Le script :

1. télécharge **Node.js mobile** (environ 57 Mo, une seule fois) ;
2. emballe le code du bot et ses dépendances ;
3. crée ta **clé de signature** dans `C:\Users\<toi>\.red-packet-bot\` ;
4. compile l'APK avec Gradle.

À la fin, il affiche :

```
✅ APK prête (… Mo, version 1.0.0 / …) :
   …\red-packet-bot-telegram\dist\RedPacketBot.apk
```

> [!IMPORTANT]
> **Garde une copie du dossier `.red-packet-bot`** (clé USB, cloud privé). Toutes les versions de l'app doivent être signées avec cette même clé. Sans elle, Android refusera la mise à jour : il faudra désinstaller l'app, et donc refaire les connexions Telegram et Binance.

Les compilations suivantes prennent une à trois minutes.

---

## 3. Installer l'APK sur le téléphone

Choisis **une** des trois méthodes.

**A. Par câble USB (le plus simple)**

1. Branche le téléphone au PC. Sur le téléphone, dans la notification USB, choisis **Transfert de fichiers**.
2. Sur le PC, copie `dist\RedPacketBot.apk` dans le dossier **Download** du téléphone.
3. Sur le téléphone, ouvre l'app **Fichiers** → **Download** → touche **RedPacketBot.apk**.

**B. Par Telegram**

1. Sur le PC, envoie `dist\RedPacketBot.apk` dans tes **Messages enregistrés** (Telegram Desktop).
2. Sur le téléphone, touche le fichier pour le télécharger, puis touche-le à nouveau pour l'ouvrir.

**C. Par câble avec ADB (si le débogage USB est activé)**

```bash
npm run apk:install
```

**Pendant l'installation :**

- Android demande d'**autoriser l'installation d'applis inconnues** pour l'app qui ouvre le fichier (Fichiers ou Telegram) : touche **Paramètres** → active l'autorisation → reviens en arrière.
- Si **Play Protect** ou **Phone Master** affiche un avertissement (« app inconnue »), touche **Plus de détails** → **Installer quand même**. C'est normal pour une app que tu as fabriquée toi-même.
- Si Android demande l'autorisation d'**envoyer des notifications**, touche **Autoriser**.

L'app **Red Packet Bot** apparaît avec une icône d'enveloppe rouge.

---

## 4. Les réglages du bot

Le plus simple est de reprendre le `.env` du PC.

1. Sur le PC, copie ton fichier `.env` sur le Bureau et renomme la copie `bot.env`.
2. Envoie `bot.env` dans tes **Messages enregistrés** Telegram.
3. Sur le téléphone, touche le fichier dans Telegram, puis le menu **⋮** → **Partager** (ou **Ouvrir avec**) → **Red Packet Bot**.
4. L'app s'ouvre sur **Réglages**, déjà remplis. Vérifie, puis touche **Enregistrer**.
5. **Supprime** ensuite `bot.env` des Messages enregistrés et du Bureau : ce fichier contient tes secrets.

Autres façons d'importer, dans **Réglages** → **Importer ton .env** :

- **Choisir le fichier** : si `bot.env` est déjà dans le dossier Download du téléphone ;
- **Coller** : si tu as copié le contenu du `.env`.

Tu peux aussi tout remplir à la main.

**Ce que l'app vérifie avant d'enregistrer :**

- `API_ID` est un nombre ;
- `API_HASH` fait 32 caractères, et ce n'est pas la valeur d'exemple ;
- le numéro est au format international (`+243…`) ;
- les canaux sont valides (`@pseudo`, lien `t.me/…`, ou ID qui commence par `-100`) ;
- le jeton du bot d'alertes a la bonne forme.

**Le rôle du téléphone :**

- **Secours du PC** (par défaut) : le PC réclame en priorité, le téléphone prend le relais quand le PC s'arrête. Le `.env` du PC (`BOT_ROLE=primary`) ne change pas ce réglage.
- **Appareil seul (solo)** : seulement si **aucun bot ne tourne sur le PC**. Sinon, les deux réclameraient chaque code.

---

## 5. La connexion Telegram

Le téléphone a **sa propre connexion** à ton compte Telegram : ne copie pas la session du PC (deux appareils sur la même session se déconnectent l'un l'autre).

1. Écran **Accueil** → **2. Connexion Telegram** → **Ouvrir**.
2. Touche **Se connecter**. Le bot démarre et demande le code à Telegram.
3. Le code arrive dans ton **app Telegram** (conversation « Telegram »), ou par SMS. L'app Red Packet Bot affiche aussi une notification **📱 Connexion Telegram**.
4. Tape le code dans le champ **Code reçu**, puis **Valider**.
5. Si ton compte a un **mot de passe 2FA**, l'app le demande ensuite.
6. L'écran affiche **✅ Connecté : ton nom (@pseudo)**.

La connexion apparaît dans Telegram → **Réglages** → **Appareils**.

> [!TIP]
> Code faux : l'app affiche **❌ Code incorrect** et te laisse réessayer. Pas de saisie pendant 15 minutes : la connexion est abandonnée, il suffit de recommencer.

---

## 6. La connexion Binance

1. Écran **Accueil** → **3. Connexion Binance** → **Ouvrir**.
2. La page Binance s'ouvre en plein écran, en version « ordinateur » : **pince pour zoomer**. Le clavier du téléphone s'ouvre normalement.
3. Connecte-toi (e-mail ou téléphone, mot de passe, code 2FA, éventuel puzzle). Choisis la connexion par mot de passe : le QR code ne peut pas être scanné par le téléphone qui l'affiche.
4. Dès que la page **Cryptobox** et son champ de code apparaissent, l'écran affiche **✅ Connecté à Binance** et se ferme tout seul.

Le bot utilise ensuite la même session, dans une page invisible.

**Session expirée :**

- De temps en temps, Binance demande de se reconnecter. Tu reçois alors la notification **🔑 Binance : reconnecte-toi**, et l'alerte 🔑 sur Telegram.
- Touche la notification et reconnecte-toi.
- En attendant, les codes sont ignorés sans brûler de tentative : le bot ne tape **jamais** un code sur la page de connexion.

---

## 7. Les réglages du téléphone (écran Santé)

> [!IMPORTANT]
> Sans ces réglages, Android (et **Phone Master** sur Tecno) finit par couper le bot quand l'écran est éteint. C'est l'étape la plus importante pour un bot 24 h/24.

> [!NOTE]
> **Le gel de HiOS (Tecno ; sans doute aussi Infinix et itel, du même groupe)** : 5 secondes après qu'une app passe en arrière-plan (écran verrouillé, ou app quittée), HiOS la **gèle**. Il coupe son processeur **et son Internet**, même si la batterie est « sans restriction ». C'est ce qui endormait l'ancien bot Termux.
>
> L'app s'en protège toute seule : HiOS épargne les applis dont une notification affiche un chronomètre en cours. Sa notification **« Bot en marche »** affiche donc depuis combien de temps le bot tourne.
>
> 👉 **Ne désactive jamais cette notification.** Tu peux la replier dans le volet, mais si tu la coupes, HiOS gèle de nouveau le bot.

Ouvre l'onglet **Santé**. Chaque point a un bouton qui ouvre le bon écran des réglages :

- les points **✅** sont vérifiés automatiquement ;
- pour les points **❔** (spécifiques à Tecno), fais le réglage puis **coche la case**.

**Vérifiés par l'app :**

1. **Notifications autorisées** → Autoriser. Indispensable sur Tecno : la notification « Bot en marche » protège le bot du gel de HiOS (voir l'encadré ci-dessus).
2. **Batterie : sans restriction** → **Autoriser** dans la fenêtre d'Android. C'est le réglage le plus important.
3. **Activité en arrière-plan autorisée** → l'écran de l'app s'ouvre : **Batterie** → active **Autoriser l'activité en arrière-plan** et désactive **Arrêter l'appli inactive** (s'il existe).
4. **Données en arrière-plan** → active **Données en arrière-plan** et **Utilisation des données non restreinte**.
5. **Relance à l'heure exacte** → normalement déjà ✅.
6. **Heure automatique** → active la date et l'heure automatiques. Le bot compare l'heure du téléphone à celle de Telegram.
7. **Compatibilité Node.js** → doit être ✅ (voir le [dépannage](#11-dépannage) sinon).

**À faire à la main sur Tecno / HiOS 15 :**

8. **Démarrage automatique** : **Phone Master** → **Accélérer** → **Gestion du démarrage auto** → active **Red Packet Bot**. Puis **Phone Master** → menu (en haut à gauche) → **Réglages** → **Applis protégées** → ajoute **Red Packet Bot**.
9. **Pas de nettoyage à l'écran verrouillé** : dans les réglages de **Phone Master**, désactive **Nettoyage à l'écran verrouillé**, ou mets l'app en liste blanche. Dans **Réglages** → **Batterie**, désactive l'**économie d'énergie**, **Power Marathon** et l'**optimisation du mode veille**.
10. **Verrouiller l'app dans les récentes** : ouvre les applis récentes, touche le petit triangle à côté de Red Packet Bot (ou maintiens la carte), puis **Verrouiller**.
11. **Pas de « congélation »** : appui long sur l'écran d'accueil → **Paramètres du bureau** → **Autres réglages** → **Congélateur** : Red Packet Bot ne doit pas y être.

Laisse le téléphone **en charge**, idéalement avec une limite de charge si le téléphone en propose une.

**Le test qui prouve que c'est bon :**

1. Démarre le bot.
2. Verrouille le téléphone pendant **10 minutes**.
3. Reviens sur l'écran Santé ou l'Accueil.

Si **« Android a endormi le bot »** apparaît, un réglage manque (souvent Phone Master ou la batterie). Le bot l'écrit aussi dans ses logs (« 💤 Le système a endormi le bot ») et t'envoie une alerte.

---

## 8. Au quotidien

**Démarrer :** écran **Accueil** → **▶️ Démarrer**. La notification permanente indique l'état du bot :

- **😴 En veille — le PC réclame** : le PC est actif, le téléphone attend. La page Binance est fermée après 2 minutes pour économiser la mémoire.
- **🟢 Actif — le téléphone réclame** : le PC est arrêté ou muet, le téléphone a pris le relais.
- **🔎 Vérification du relais…** : au démarrage, le temps de lire l'état du PC.
- **🔑 Binance à reconnecter** : touche la notification Binance.
- **🛑 Pause anti-ban** : limite Binance atteinte, reprise à l'heure indiquée.
- **🔑 Telegram à reconnecter** : écran Connexion Telegram.

La notification affiche aussi le nombre de codes détectés et gagnés, et un chronomètre : depuis combien de temps le bot tourne (ce chronomètre l'empêche aussi d'être gelé par HiOS).

**Arrêter :** bouton **⏹️ Arrêter** dans l'app, ou **Arrêter** dans la notification.

- C'est un **arrêt propre** : le téléphone publie « arrêté » pour le PC et termine les codes en cours.
- **Seul ce bouton arrête le bot durablement.** Fermer l'app ou la retirer des récentes ne l'arrête pas.

**Il repart tout seul :**

- **Après un plantage** : il est relancé après 10 s, puis l'attente double à chaque nouvel arrêt, jusqu'à 10 min (retour à 10 s s'il a tenu 5 min).
- **Si la session Telegram a expiré** : notification 🔑, et nouvel essai toutes les 30 min.
- **Après un redémarrage du téléphone** : il repart, mais seulement **après le premier déverrouillage**.
- **Après une mise à jour de l'app.**
- **S'il est figé** (aucun signe de vie pendant 5 min) : il est relancé.
- **Filet de sécurité** : un contrôle toutes les 15 min relance le bot s'il devait tourner mais ne répond plus.

**Écrans utiles :**

- **Accueil** : état, dernier signe de vie, messages analysés, coupures Telegram, étapes de mise en route, et **Alerte de test** (vérifie que ton bot @BotFather t'écrit bien).
- **Logs** : ce que fait le bot, en direct, en couleurs. **Copier** et **Partager** servent à demander de l'aide.

---

## 9. Le relais avec le PC

Le PC et le téléphone utilisent **le même compte Binance** : un seul réclame à la fois, pour ne jamais soumettre deux fois le même code. Le fonctionnement détaillé est dans le [README](README.md#-relais-pc--téléphone). En bref :

- PC **🟢 actif** → le téléphone reste en veille.
- PC **arrêté** (`Ctrl+C`) → le téléphone prend le relais **tout de suite**.
- PC **muet depuis 2 min 30** (éteint, planté, sans Internet) → le téléphone prend le relais.
- Dès que le PC redevient actif, le téléphone repasse en veille.

À respecter :

- **Un seul PC prioritaire** : le PC garde `BOT_ROLE=primary` (ou pas de ligne `BOT_ROLE`), le téléphone reste en **Secours du PC**.
- **Ne supprime pas** le message `#botrelay` de tes Messages enregistrés : c'est par lui que les deux appareils se parlent.
- **Mets le PC à jour en même temps** que l'app (`git pull` sur le PC) : les deux utilisent le même code.

---

## 10. Mettre à jour l'app

1. Sur le PC : `git pull`, puis `npm run apk`.
2. Installe le nouveau `dist\RedPacketBot.apk` **par-dessus** l'ancien (même méthode qu'à l'étape 3). **Ne désinstalle pas** l'ancienne version : tes réglages et tes connexions Telegram et Binance sont gardés.
3. Le bot redémarre tout seul après la mise à jour, s'il tournait.
4. Vérifie la version installée : elle s'affiche en haut à droite de l'écran **Accueil** (par exemple « v1.0.0 (404525) »), et en bas du même écran avec la date d'installation. Le grand nombre augmente à chaque `npm run apk` : c'est le même que dans le nom du fichier `dist\RedPacketBot-1.0.0-404525.apk`. Le bot l'écrit aussi au début de ses logs (« 📱 App Android : version … »).

Pense à mettre à jour le PC aussi (`npm install` si besoin, puis `npm start`).

---

## 11. Dépannage

| Ce que tu vois | Quoi faire |
|---|---|
| « Application non installée » à la mise à jour | L'APK n'est pas signée avec la même clé (dossier `.red-packet-bot` perdu ou autre PC). Désinstalle l'app, installe la nouvelle, refais les connexions Telegram et Binance. |
| `npm run apk` : « SDK Android introuvable » ou erreur NDK / CMake | Ouvre Android Studio une fois. Dans le SDK Manager, installe NDK **27.1.12297006** et CMake **3.22.1** (voir l'[étape 1](#1-ce-quil-te-faut)). |
| Le bouton **Démarrer** est grisé | Les réglages sont incomplets : onglet **Réglages**, corrige ce qui est indiqué, puis **Enregistrer**. |
| Le code Telegram n'arrive pas | Vérifie le numéro dans les Réglages. Regarde la conversation « Telegram » dans ton app Telegram, puis tes SMS. Recommence avec **Se reconnecter**. |
| **🔑 Telegram à reconnecter** | La session du téléphone a été fermée (par exemple dans Telegram → Appareils). Écran **Connexion Telegram** → **Se reconnecter**. |
| **🔑 Binance à reconnecter** souvent | Binance fait expirer ses sessions de temps en temps : reconnecte-toi depuis la notification. Si ça arrive tous les jours, déconnecte-toi de Binance sur les autres appareils inutilisés. |
| « 💤 Android a endormi le bot » | Un réglage de l'[étape 7](#7-les-réglages-du-téléphone-écran-santé) manque. Vérifie d'abord que la notification **« Bot en marche »** est bien affichée, avec son chronomètre : sans elle, HiOS gèle le bot. Ensuite : batterie sans restriction, démarrage auto et applis protégées dans Phone Master, nettoyage écran verrouillé désactivé. |
| Beaucoup de **coupures Telegram** | Wi-Fi instable, ou économiseur de données. Garde le Wi-Fi allumé pendant la veille (réglages Wi-Fi avancés) et vérifie l'écran Santé. |
| Pas d'alertes Telegram | Envoie **/start** à ton bot d'alertes, vérifie le jeton dans les Réglages, puis **Alerte de test** sur l'Accueil. Les logs expliquent la cause (« Alerte non envoyée : … »). |
| Notification **▶️ Relancer le bot** | Android a refusé de relancer le bot tout seul (souvent la batterie restreinte). Touche-la, puis **Démarrer**. Vérifie l'écran Santé. |
| Le bot ne repart pas après un redémarrage du téléphone | Déverrouille le téléphone une fois : Android ne lance aucune app avant. Vérifie le démarrage auto dans Phone Master. |
| **Compatibilité Node.js ⚠️** (pages de 16 Ko) | Ce téléphone utilise une mémoire en pages de 16 Ko, que Node.js mobile 18 ne gère pas encore. Garde le bot sur le PC (ou un autre téléphone). |
| L'app se ferme quand le bot redémarre | C'est normal si tu es sur l'écran de connexion Binance pendant une relance : rouvre-le. |
| Autre problème | Onglet **Logs** → **Partager**, et envoie les dernières lignes. Pour une enquête plus poussée, le [guide de débogage](GUIDE-DEBOGAGE.md) explique comment laisser Claude examiner le téléphone par câble USB, et liste les problèmes déjà résolus. |

---

## 12. Désinstaller

1. Dans l'app, **⏹️ Arrêter** (le PC est prévenu tout de suite).
2. Désinstalle **Red Packet Bot** comme n'importe quelle app : ses réglages et ses sessions sont effacés avec elle.
3. Dans Telegram → **Réglages** → **Appareils**, termine la session du téléphone si elle apparaît encore.
