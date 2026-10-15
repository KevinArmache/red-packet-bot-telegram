# 🩺 Guide de débogage — l'app Android avec Claude

Ce guide sert quand l'app **Red Packet Bot** se comporte mal sur le téléphone. Il explique comment laisser **Claude** (Claude Code, sur le PC) examiner le téléphone par câble USB. Il garde aussi la trace des **problèmes déjà résolus et de leur solution**, pour que personne ne refasse l'enquête.

> Pour une panne courante (Telegram ou Binance à reconnecter, réglages), commence par le [dépannage du guide Android](GUIDE-ANDROID.md#11-dépannage).

## Sommaire

1. [Brancher le téléphone pour Claude](#1-brancher-le-téléphone-pour-claude)
2. [Demander à Claude](#2-demander-à-claude)
3. [Les commandes utiles](#3-les-commandes-utiles)
4. [Résolu : le bot s'endort quand on verrouille ou qu'on quitte l'app (Tecno)](#4-résolu--le-bot-sendort-quand-on-verrouille-ou-quon-quitte-lapp-tecno)
5. [Résolu : l'ancien bot Termux tournait encore](#5-résolu--lancien-bot-termux-tournait-encore)
6. [Résolu : « GAGNÉ » dans les logs, mais rien d'encaissé sur Cryptobox (téléphone)](#6-résolu--gagné-dans-les-logs-mais-rien-dencaissé-sur-cryptobox-téléphone)
7. [Résolu : Telegram coupé 30 à 50 minutes la nuit (HiOS « AI Net »)](#7-résolu--telegram-coupé-30-à-50-minutes-la-nuit-hios--ai-net-)
8. [Résolu : le bot ne repartait pas après une mise à jour de l'app](#8-résolu--le-bot-ne-repartait-pas-après-une-mise-à-jour-de-lapp)
9. [Résolu : pauses anti-ban de 2 h plusieurs fois par jour](#9-résolu--pauses-anti-ban-de-2-h-plusieurs-fois-par-jour)
10. [Si le bot s'endort de nouveau](#10-si-le-bot-sendort-de-nouveau)
11. [X (Twitter) : lecture des notifications de l'appli X](#11-x-twitter--lecture-des-notifications-de-lappli-x)

---

## 1. Brancher le téléphone pour Claude

**Une seule fois :**

1. Paramètres → **À propos du téléphone** → appuie **7 fois** sur « Numéro de build ». Les options pour les développeurs apparaissent.
2. Paramètres → **Système** → **Options pour les développeurs** → active **Débogage USB**.

**À chaque séance :**

1. Branche le téléphone au PC avec un câble USB qui transfère les données (pas un câble de charge seule).
2. Sur le téléphone, accepte « Autoriser le débogage USB ? » et coche **Toujours autoriser depuis cet ordinateur**.
3. Dis à Claude que le téléphone est branché. Il vérifie lui-même la connexion (`adb devices` doit afficher une ligne terminée par `device` ; `unauthorized` veut dire que la fenêtre du téléphone attend ta réponse).

> [!NOTE]
> - `adb` est installé avec Android Studio : `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`.
> - Le débogage USB ne gêne pas le bot. Mais il donne au PC branché un accès complet au téléphone : n'accepte la fenêtre que sur **ton** PC.

---

## 2. Demander à Claude

Ouvre Claude Code dans le dossier du bot, puis décris :

- **le symptôme** : ce que tu faisais (écran verrouillé, app quittée, redémarrage…) et ce que tu as vu ;
- **quand** : l'heure, même approximative, car le journal d'Android ne remonte que de quelques heures ;
- **ce qu'affiche l'app** : 🏠 Accueil (couleur du bouton rond, « 💤 Android a endormi le bot … fois »), 📡 Sources, et 📜 Activité → 🖥️ Logs ;
- que le téléphone est **branché avec le débogage USB**.

Exemple :

> Quand je verrouille le téléphone, le bot s'endort. Le téléphone est branché en USB avec le débogage activé : trouve la cause avec adb, corrige-la, puis ajoute la solution dans GUIDE-DEBOGAGE.md.

**Ce que Claude peut faire :**

- lire le journal d'Android (`logcat`) et l'état du système (`dumpsys`) ;
- recompiler l'APK (`npm run apk`) et l'installer par câble avec `adb install -r`. C'est une **mise à jour** : tes réglages et tes sessions Telegram et Binance sont gardés, car la clé de signature est la même (dossier `~/.red-packet-bot`) ;
- lire le code des applis système du téléphone, pour comprendre une règle cachée de HiOS, sans rien y modifier.

**Ce que Claude ne doit jamais recevoir :** tes codes Telegram, ton mot de passe Binance ou 2FA, le contenu de ton `.env`. Il n'en a pas besoin pour déboguer.

**Une limite :** l'APK normale n'est pas « débogable », donc `adb` ne peut pas lire ses fichiers.

- **L'état du bot**, lui, reste lisible même téléphone verrouillé : `adb shell dumpsys activity service com.redpacketbot.app/.BotService` donne la version, le statut, l'âge du dernier signe de vie et le nombre de mises en veille forcées (`sleeps`). Voir la [partie 3](#3-les-commandes-utiles).
- **Les logs** : ajoute `logs` à la même commande pour leurs 40 dernières lignes. Sinon, utilise **📜 Activité** → **🖥️ Logs** → **📤 Partager**.
- **La variante de test** (`npm run apk -- --debug`, app séparée `com.redpacketbot.app.debug`) rend ses fichiers lisibles avec `adb shell run-as com.redpacketbot.app.debug …`.

---

## 3. Les commandes utiles

- Remplace `<UID>` par le numéro que donne `pm list packages -U redpacket` (10459 sur le Camon 40 en octobre 2026 ; il change si l'app est désinstallée puis réinstallée), et `<PID>` par celui que donne `pidof com.redpacketbot.app:bot`.
- Les filtres (`grep`) sont placés **dans** `adb shell "…"` : ils tournent sur le téléphone, ce qui marche aussi dans PowerShell.
- Dans Git Bash, commence par `export MSYS_NO_PATHCONV=1`, sinon les chemins comme `/sdcard/…` sont réécrits.

**L'app et le bot**

```bash
adb shell dumpsys activity service com.redpacketbot.app/.BotService
                                                 # → version, statut, dernier signe de vie, sleeps (mises en veille
                                                 #   forcées : doit rester à 0), coupures Telegram, messages lus
adb shell dumpsys activity service com.redpacketbot.app/.BotService logs
                                                 # → la même chose + les 40 dernières lignes des logs du bot
adb shell "dumpsys package com.redpacketbot.app | grep -E 'versionName|versionCode|lastUpdateTime'"
                                                 # → la version installée (aussi en bas de l'Accueil)
adb shell pm list packages -U redpacket          # → package:com.redpacketbot.app uid:<UID>
adb shell pidof com.redpacketbot.app:bot         # → le PID du processus « :bot » (rien = le bot ne tourne pas)
                                                 #   ⚠️ un PID ne prouve plus que le bot tourne : avec l'accès aux
                                                 #   notifications (X), Android garde ce processus pour l'écouteur.
                                                 #   La preuve : nodeRunning=true dans le dumpsys ci-dessus
adb shell "dumpsys activity services com.redpacketbot.app | grep isForeground"
                                                 # → isForeground=true … types=0x40000000
adb shell "dumpsys deviceidle whitelist | grep redpacket"
                                                 # → user,com.redpacketbot.app,<UID> (batterie sans restriction)
adb shell am get-standby-bucket com.redpacketbot.app   # → 5 (exempté)
adb shell dumpsys activity exit-info com.redpacketbot.app   # pourquoi le bot s'est arrêté (reason=…)
```

**X (Twitter)** (voir la [partie 11](#11-x-twitter--lecture-des-notifications-de-lappli-x))

```bash
adb shell dumpsys activity service com.redpacketbot.app/.BotService
                                                 # → ligne « x: enabled=… access=… listener=… posts=… lastPost=… »
adb shell "dumpsys notification | grep -i -A6 'notification listeners'"
                                                 # → l'écouteur XNotificationListener est-il lié ?
adb shell cmd notification allow_listener com.redpacketbot.app/com.redpacketbot.app.XNotificationListener
                                                 # accorde l'accès aux notifications sans passer par l'écran
adb shell "dumpsys notification --noredact | grep -A80 pkg=com.twitter.android"
                                                 # le contenu exact des notifications de X (title, text, bigText…)
adb shell cmd notification post -S bigtext -t "Binance" xtest "Red Packet 🎁 Code : AB12CD34"
                                                 # notification de test : lue SEULEMENT en essai à blanc (X_DRY_RUN)
```

**L'écran**

```bash
adb shell "dumpsys power | grep mWakefulness="   # → Awake (allumé) ou Asleep (éteint)
adb shell input keyevent 26                      # appuie sur le bouton marche/arrêt
```

**Le gel HiOS** (voir la [partie 4](#4-résolu--le-bot-sendort-quand-on-verrouille-ou-quon-quitte-lapp-tecno))

```bash
adb shell cat /sys/fs/cgroup/apps/uid_<UID>/cgroup.freeze
                                                 # → 0 = libre, 1 = gelée
adb shell "grep voluntary_ctxt /proc/<PID>/status"
                                                 # 2 fois à 30 s d'écart : le nombre doit augmenter
adb shell dumpsys activity service com.transsion.usf/.UsfMainService -hiber is_frozen <UID> com.redpacketbot.app
                                                 # → unfreeze:imp-reason-notify-progress (épargnée)
                                                 #   frozen:netDown (gelée ET coupée d'Internet)
adb shell "logcat -d | grep -E 'Usf_Hiber|isProgressing' | grep -E 'redpacket|<UID>'"
                                                 # le journal du gel pour l'app
adb shell "dumpsys notification --noredact | grep -A30 pkg=com.redpacketbot.app | grep -E 'android.title=|showChronometer'"
                                                 # → android.showChronometer=Boolean (true)
```

**La page Binance du bot, vue depuis le PC** (outils développeur de Chromium)

```bash
adb forward tcp:9333 localabstract:webview_devtools_remote_<PID>
curl http://127.0.0.1:9333/json/list             # → la page « Red Packet | Binance » de la WebView
```

- Dans Chrome sur le PC, `chrome://inspect` affiche aussi la page : on peut lire son contenu (onglet Elements) et ses requêtes (onglet Network). L'aperçu reste noir, car la WebView n'est jamais affichée.
- Sers-t'en pour **observer**. N'y tape jamais un code à la main, sauf test voulu : chaque code n'est soumis qu'une fois (règle zéro retry).

**Installer une APK en gardant les données**

```bash
adb install -r dist/RedPacketBot.apk             # → Success ; le bot repart tout seul
```

---

## 4. Résolu : le bot s'endort quand on verrouille ou qu'on quitte l'app (Tecno)

**Résolu le 08/10/2026** sur un Tecno Camon 40 (CM5), Android 16, HiOS 16.2 (service de gel « Usf » version 35.1.0.103).

### Le symptôme

Dès qu'on verrouille l'écran, ou qu'on quitte l'app, le bot arrête de travailler. Il ne voit plus les messages Telegram, son « signe de vie » vieillit, et « 💤 Android a endormi le bot » apparaît. Il repart quand on rouvre l'app. C'était déjà le problème de l'ancien bot Termux.

### Ce qui était déjà en place, et ne suffisait pas

- service de premier plan (`isForeground=true`), avec notification permanente et *wake lock* ;
- batterie sans restriction (`user,com.redpacketbot.app,…`) ;
- groupe de veille Android « exempté » (`5`) ;
- démarrage automatique et applis protégées dans Phone Master.

### Le diagnostic

1. Le journal montrait un gel **5 secondes** après chaque réveil :

   ```
   Usf_Hiber/stateManager: freeze uid: 10459 com.redpacketbot.app costTime=5ms ,last unfreeze 5s ago
   Usf_Hiber/hiber: idleUids: uid=10459, pkgName=com.redpacketbot.app
   Usf_Hiber/hiber: proxy alarm (uid=10459, pkgName=com.redpacketbot.app)
   ```

2. `cgroup.freeze` valait `1`, et l'activité des processus ne bougeait plus du tout en 15 s : l'app était **entièrement arrêtée**.
3. `is_frozen` répondait `frozen:netDown` : gelée **et coupée d'Internet**. Même un message Telegram ne pouvait plus la réveiller.

### La cause

**HiOS a son propre « congélateur »** : le service **Usf_Hiber**, dans l'appli système `com.transsion.usf`.

- 5 secondes après qu'une appli passe en arrière-plan (écran éteint, ou app quittée), il **gèle tout son UID** (tous ses processus) et **lui coupe Internet**.
- Il **ignore** le service de premier plan et la batterie « sans restriction ».
- Il n'épargne une appli que dans des « scènes importantes ». Écran éteint, ce sont :
  - **une notification avec un chronomètre ou une progression en cours** ;
  - une fenêtre flottante ;
  - un son réel (il détecte le silence) ;
  - un enregistrement en cours ;
  - le GPS ;
  - un VPN ;
  - le Bluetooth ;
  - un gros trafic réseau (au moins 100 Ko/s) ;
  - les applis par défaut (écran d'accueil, clavier, SMS, téléphone) ;
  - le fond d'écran animé.
- Un mode « ne jamais geler » existe (`setAppMode`), mais il est réservé aux applis système : ADB ne peut pas l'activer.

Ces règles ont été lues dans le code de HiOS, décompilé depuis `/system_ext/priv-app/UsfApp/UsfApp.apk` (classes `TranImportantScene` et `TranAppStateManager`).

HiOS écoute toutes les notifications. Une notification dont les données contiennent `android.showChronometer = true`, ou `android.progress` avec une progression pas encore terminée, marque l'appli comme « en cours » (`isProgressing`). Une appli marquée ainsi n'est plus gelée.

### La solution (dans l'app : rien à régler sur le téléphone)

- **`BotService.buildNotification()`** : la notification « Bot en marche » affiche un **chronomètre** « en marche depuis… » (`setUsesChronometer(true)`).
- **`BotService.scheduleRestart()`** : pendant l'attente d'une relance, la notification « Relance du bot » affiche un **compte à rebours**. Sans lui, HiOS gèlerait l'app et retiendrait l'alarme de relance.
- **Écran Santé** : le point « Notifications autorisées » vérifie aussi que la notification « Bot en marche » n'est pas désactivée, car c'est elle qui protège le bot.

### La vérification

Juste après l'installation, le journal de HiOS affiche :

```
Usf_appStateManager: uid: 10459    packageName:com.redpacketbot.app ,isProgressing:true
Usf_Hiber/importantScene: statusbar progressing: packageName=com.redpacketbot.app ,uid:10459
```

- `is_frozen` répond `unfreeze:imp-reason-notify-progress` : HiOS épargne l'app à cause de la notification.
- Le rapport d'état du bot (`dumpsys activity service com.redpacketbot.app/.BotService`) garde `sleeps=0`, et un signe de vie de quelques secondes, tout au long d'un test écran éteint.
- Test final de 10 minutes écran éteint (08/10/2026, de 23:52 à 00:02), avec 21 mesures toutes les 30 s :
  - `cgroup.freeze` à `0` à chaque mesure ;
  - aucun « freeze uid » de HiOS pour l'app ;
  - `sleeps=0` et `disconnects=0` ;
  - signe de vie toujours de moins de 15 s ;
  - activité du bot en hausse continue (de 5 213 à 71 883).
- Pendant 6 minutes écran éteint (avec deux brefs allumages) :
  - `cgroup.freeze` est resté à `0` ;
  - l'activité du bot a augmenté sans arrêt (de 8 388 à 36 276 changements de contexte) ;
  - aucun « freeze uid » pour l'app dans le journal.

### Limite connue : les micro-pauses écran allumé

Quand tu lances une appli, HiOS fige aussi toutes les applis en arrière-plan pendant 0,02 à 2,5 s, pour accélérer le téléphone. Le journal affiche alors `fastFreeze reason=cpuboost` ou `appStart`. Le chronomètre n'y change rien : seules les applis de verrouillage y échappent (accès « Afficher par-dessus les autres applis » et accès aux données d'utilisation).

C'est sans conséquence pratique. Les connexions tiennent, et un message arrivé pendant la pause est traité juste après. Rien à voir avec le gel décrit plus haut, qui, lui, durait jusqu'à ce que tu rouvres l'app.

### Pièges pour qui modifie l'app

- Garde `setUsesChronometer(true)` sur **chaque** mise à jour de la notification du bot (toutes passent par `buildNotification()`).
- N'utilise **pas** `NotificationCompat` (androidx) pour les notifications de l'app. Il ajoute toujours `android.progress = 0` et `android.progressMax = 0`, que HiOS lit comme une progression **terminée** : la protection de toute l'appli saute. On le voit avec Telegram dans le journal : `isProgressing:true`, puis aussitôt `false`. L'app utilise le `Notification.Builder` d'Android.
- Pour la même raison, jamais de `setProgress(max, max)` (progression finie).
- HiOS garde l'état « en cours » quand la notification disparaît, et lors d'une mise à jour de l'app. Seule exception : si son propre service redémarre, l'app n'est plus protégée jusqu'à la prochaine mise à jour de sa notification (au plus 15 s).

---

## 5. Résolu : l'ancien bot Termux tournait encore

**Trouvé et réglé le 08/10/2026.**

### Le problème

Rien ne se voyait à l'écran. Mais la liste des processus montrait encore l'ancien bot sous l'UID de Termux :

- `node /bot/index.js`, lancé par `run.sh` ;
- l'écran virtuel `Xvnc` ;
- Chromium.

HiOS le gelait la plupart du temps, et **Termux:Boot** le relançait à chaque redémarrage du téléphone.

**Le risque :** deux bots « secours du PC » sur le même compte. Le relais n'a qu'un message d'état par rôle, et les deux bots se le disputaient. Dès l'arrêt du PC, ils auraient réclamé **les mêmes codes**.

### Ce qui a été fait

- Arrêt forcé, puis désinstallation de **Termux, Termux:Boot, Termux:API, Termux:Widget et AVNC**. Leurs données sont parties avec eux : Debian, Chromium, l'ancienne session Telegram et les cookies Binance.
- Suppression des fichiers secrets restés dans le stockage :
  - `Download/Telegram/cookies.json` (la session Binance copiée pour Termux, étape « 7.2 bis » de l'ancien guide) ;
  - `Download/Telegram/.env` (les réglages du PC, déjà importés dans l'app) ;
  - leurs copies dans le cache de Telegram (`Android/data/org.telegram.messenger/files/Telegram/Telegram Documents/`) : deux `4_….env`, et un `4_….json` de 8 775 octets qui était la même session Binance.
- Suppression des installateurs `Download/F-Droid.apk`, `F-Droid (1).apk` et `F-Droid (2).apk`, qui ne servaient qu'à installer Termux.
- Les réglages « phantom process killer » de l'ancien guide étaient déjà aux valeurs d'origine : rien à défaire.
- Fin de l'ancienne session Telegram du bot Termux, depuis Telegram → **Paramètres** → **Appareils**. Elle s'affichait « mtcute on **Node.js/v24.21.0** (Linux arm64) », app « mybot 0.29.7 ».

> [!WARNING]
> Dans cette liste, garde la session « mtcute on **Node.js/v18.20.4** (Linux arm64) » : c'est celle de l'app. Si elle est terminée par erreur, l'app affiche « 🔑 Telegram à reconnecter » : **📡 Sources** → **✈️ Telegram** → **🔄 Se reconnecter**.

L'ancienne session Binance de Termux, elle, n'a plus de cookies nulle part et expirera seule : inutile d'y toucher.

> [!NOTE]
> **Piloter Telegram par adb, en sécurité :**
> - Telegram empêche les captures sur l'écran Appareils (image noire) : lis l'écran par l'accessibilité avec `uiautomator dump`.
> - Avant chaque appui, vérifie dans la **même** commande que Telegram est au premier plan (`dumpsys window | grep mCurrentFocus`) et que le bon texte est affiché. Sinon, l'appui peut tomber dans une autre appli : c'est arrivé une fois avec TikTok.
> - Ne touche jamais « Fermer toutes les autres sessions » : cela déconnecterait aussi l'app du bot et tes PC.

### Vérifier qu'il ne reste rien

```bash
adb shell "pm list packages | grep -i -E 'termux|avnc'"      # rien ne doit s'afficher
adb shell "ps -A -o USER,ARGS | grep -E 'proot|Xvnc|/bot/'"  # rien (à part la ligne du grep)
```

---

## 6. Résolu : « GAGNÉ » dans les logs, mais rien d'encaissé sur Cryptobox (téléphone)

**Résolu le 09/10/2026.**

### Le symptôme

Les logs annonçaient « 💰 GAGNÉ ! Code … → montant à vérifier sur Binance » pour chaque code, et le bilan affichait « 💰 Gains 21 (100 %) ». En réalité, l'historique Cryptobox était vide : aucun code n'avait été encaissé depuis l'installation de l'app.

### Le diagnostic

On a branché les outils développeur de Chromium sur la WebView du bot, par câble, depuis le PC (voir la [partie 3](#3-les-commandes-utiles)). Un observateur **passif** (il ne clique pas et ne tape rien) a lu la page et enregistré les requêtes pendant les réclamations du bot :

1. Après le passage du bot, le champ contenait encore le dernier code, sans aucune fenêtre ouverte : le clic sur « Ouvrir » n'avait jamais eu lieu.
2. Un test avec un code récent, à la demande de l'utilisateur, a montré que réclamer un code se fait **en deux temps** :
   - « Réclamer » envoie `POST …/gift-box/code/query`. Binance répond si le Red Packet est encore à prendre (`grabbed`, `fullyClaimed`), sans rien encaisser.
   - La fenêtre « Vous avez reçu un Red Packet » apparaît alors avec un bouton `<button>` « Ouvrir ». Ce clic envoie `POST …/gift-box/code/grabV2`, qui encaisse : `{"success":true,"currency":"SPELL","grabAmountStr":"0.0009"}`.
3. Sur le téléphone, cette fenêtre arrivait **4 à 6 secondes** après le clic. Mesure faite : la WebView, jamais affichée, ne produisait plus que **0,7 image par seconde**, et Chromium attend une image pour traiter chaque clic (4,4 s par événement de souris).

### Les causes

- Le bot cherchait « Ouvrir » pendant environ 1 seconde : trop court sur le téléphone, la fenêtre arrivait après.
- Le bot annonçait « GAGNÉ » dès qu'aucun message d'erreur n'était visible. Un clic sans effet passait donc pour un gain.

### La solution

- **Le résultat vient des réponses de Binance**, plus de l'écran. `claimCode` (dans `src/binance.js`) écoute les deux requêtes avant de cliquer :
  - un refus (code inexistant, Red Packet épuisé ou déjà réclamé, limite) est lu dans la réponse de `code/query` ;
  - le montant (« 0.0009 SPELL ») vient de la réponse de `grabV2`, et va dans les logs et dans l'alerte Telegram, comme sur le PC.
- **« Ouvrir » est attendu jusqu'à 20 s**, et cherché uniquement dans la fenêtre du Red Packet. Le bot ne clique toujours qu'une fois sur « Réclamer » et une fois sur « Ouvrir ».
- **Plus jamais de faux « GAGNÉ »** : sans réponse de Binance, le résultat est « ❔ inconnu », avec une alerte, et il n'est pas compté comme gagné.
- **Pompe d'images** (`BotService`, Android seulement). Pendant une réclamation ou un chargement, l'app dessine la WebView dans une minuscule image toutes les 33 ms. Chromium produit alors une image à chaque fois, et clics comme fenêtres redeviennent fluides, même écran éteint.

### La vérification

- **Sur le PC** : `npm run test:claim`. 12 scénarios avec le vrai Chromium du bot, face à une page Cryptobox simulée. Tous réussis, avec un seul « Réclamer » et au plus un « Ouvrir » à chaque fois :
  - succès avec montant, y compris avec une fenêtre lente ou la fenêtre des cookies ouverte ;
  - déjà réclamé, épuisé, code refusé, refus à l'ouverture ;
  - fenêtre absente, et note trompeuse avec une ouverture sans preuve : résultat « inconnu » ;
  - réponse tardive d'un ancien code : ignorée ;
  - session expirée (HTTP 401) : « session à reconnecter » ;
  - limite atteinte : pause anti-ban.
- **Sur le téléphone** :
  - le test manuel avec JJF5L4EC a encaissé 0.0009 SPELL (réponse `grabV2`, fenêtre « Nikko_Op vous a envoyé un Red Packet … 0.0009 SPELL ») ;
  - avec la nouvelle version, les vrais codes du 09/10/2026 ont été encaissés, chaque fois confirmés par la réponse `grabV2` : J67D686D → 0.00045218 USTC en 5,9 s, XCZME2B7 → 0.00005088 USTC en 7,3 s, 17TEOTG0 → 0.00052167 USTC en 4,8 s. Avant le correctif, une réclamation (ratée) prenait 13 s.

Après une réclamation, la pompe d'images s'arrête bien au bout d'une minute (`pump: au repos` dans le rapport d'état). Le 09/10/2026, juste après le démarrage, la WebView tournait d'elle-même à 55–58 images/s. La chute à 0,7 image/s n'est apparue qu'après des heures de fonctionnement, la nuit. Pour savoir si la pompe suffit dans cet état, surveille la durée « traité en … ms » des logs : vers 5–7 s, tout va bien ; si elle remonte vers 13 s, la pompe ne suffit pas.

---

## 7. Résolu : Telegram coupé 30 à 50 minutes la nuit (HiOS « AI Net »)

**Résolu le 09/10/2026.**

### Le symptôme

La nuit, « 📡 Connexion Telegram perdue — reconnexion automatique… », puis « rétablie » 30 à 50 minutes plus tard, plusieurs fois (03:14 → 03:45, 03:51 → 04:40). Les codes publiés pendant ces trous étaient perdus (« Messages périmés » en hausse).

### Le diagnostic

L'historique Wi-Fi d'Android (`adb shell dumpsys wifi`) montrait, aux mêmes minutes, des ordres d'extinction et de rallumage du Wi-Fi envoyés par le service système de HiOS :

```
time=10-09 03:14:51.983 … what=CMD_WIFI_TOGGLED 0 … WorkSource{1000 com.transsion.usf}
time=10-09 03:45:34.243 … what=CMD_WIFI_TOGGLED … WorkSource{1000 com.transsion.usf}
```

### La cause

La fonction « **AI Net** » de HiOS (optimiseur réseau de nuit, dans `com.transsion.usf`) coupe le Wi-Fi et les données pendant la période de sommeil qu'elle prédit, écran éteint, en les rallumant quelques minutes de temps en temps. Elle ne fait d'exception pour aucune appli. Son interrupteur est le réglage système `ai_net_control_enable` (1 = actif).

### La solution

```bash
adb shell settings put global ai_net_control_enable 0
```

HiOS ne relit ce réglage qu'au démarrage : **redémarre le téléphone une fois** après la commande. Le réglage reste ensuite à 0. L'écran **Santé** de l'app signale désormais AI Net s'il redevient actif, par exemple après une mise à jour de HiOS.

**Vérifié le 09/10/2026 après le redémarrage** : le journal de HiOS affiche `Usf_NetOpt/AiNetControllerService: ========= not Support, mUiSwitch: false …`. Pour le revoir :

```bash
adb shell "logcat -d | grep AiNetControllerService"   # mUiSwitch: false = AI Net coupé
adb shell settings get global ai_net_control_enable    # 0
```

---

## 8. Résolu : le bot ne repartait pas après une mise à jour de l'app

**Résolu le 09/10/2026.**

**Le symptôme** : après `adb install -r`, le bot restait arrêté.

**La cause** : HiOS bloque l'annonce « appli mise à jour » (`MY_PACKAGE_REPLACED`) quand l'app n'est pas déjà lancée. Le journal d'Android le montre :

```
tranpm/BroadcastPolicy: limitScheduleReceiverColdLocked by systemSence - cold: … targetPkg = com.redpacketbot.app
```

Le gardien (toutes les 15 min) ne relançait qu'après 10 minutes sans signe de vie.

**La solution** :
- **Ouvrir l'app relance le bot** s'il devrait tourner.
- **Le gardien relance dès 2 minutes** sans signe de vie, dans les deux cas sauf si tu l'as arrêté ou si une relance est déjà prévue.
- Après une installation par câble, `adb shell am start -n com.redpacketbot.app/.MainActivity` relance le bot tout de suite.

**Même chose au redémarrage du téléphone** (constaté le 09/10/2026) : HiOS n'a pas transmis `BOOT_COMPLETED` à l'app, qui n'a pas démarré seule.
- La parade : autoriser le **démarrage automatique** de Red Packet Bot dans Phone Master (écran Santé de l'app, point « Tecno : démarrage automatique »).
- Sinon, le gardien relance le bot dans les 15 minutes. C'est une tâche planifiée d'Android, conservée au redémarrage, que HiOS ne bloque pas. Ouvrir l'app le relance aussi tout de suite.

---

## 9. Résolu : pauses anti-ban de 2 h plusieurs fois par jour

**Résolu le 09/10/2026.**

### Le symptôme

Le bot s'arrêtait de réclamer **2 heures, plusieurs fois par jour**, avec dans les logs :

```
🚨 AVERTISSEMENT ANTI-BAN : Binance signale des tentatives restantes.
🛑 Pause de sécurité de 2 heures déclenchée pour réinitialiser le compteur.
```

### Le diagnostic

- **La règle de Binance**, lue dans sa FAQ officielle (« How to Create and Claim Red Packets on Binance? », mise à jour le 04/06/2026, versions EN, FR et ZH) : « votre compte sera verrouillé pendant 5 heures après 10 tentatives de saisie de code de Red Packet erronées **consécutives** ». Pas de limite de réclamations par jour. Aucune remise à zéro avec le temps n'est publiée.
- **Aucune vérification d'un code sans le soumettre.** La FAQ et les bots open source (GitHub) n'en montrent aucune : le clic « Réclamer » (`code/query`) est la seule vérification, et c'est lui qui compte les codes faux.
- **Les codes d'erreur de `code/query`**, relevés dans plusieurs bots open source (non officiels) :

  | Code | Signification |
  |---|---|
  | `PAY4001COM000`, `403803`, `403804` | code invalide |
  | `403802` | Red Packet épuisé |
  | `403067` | blocage (durée dans le message) |
  | `100002001` | session expirée |
  | `data.validateId` | captcha |

### La cause

C'était le bot qui se bloquait, pas Binance : `claimFailure` (`src/binance.js`) se mettait en pause 2 h dès que le refus contenait « tentative » ou « attempt ». Or ce message dit justement qu'il **reste** des essais avant le blocage.

### La solution

- **Les refus de Binance sont lus en détail** (`classifyRefusal`, `parseRemaining`, `parseLockMs` dans `src/binance.js`) :
  - nature du refus (code d'erreur d'abord, texte FR/EN en secours) ;
  - nombre d'essais restants ;
  - durée d'un vrai blocage.
- **Pause seulement sur un vrai blocage** (durée annoncée, 5 h par défaut) ou un captcha (1 h). Plus jamais sur un simple avertissement.
- **Nouveau module `src/antiban.js`** : il compte les codes faux d'affilée (recalé sur le chiffre de Binance) et protège selon `ANTIBAN_MODE` :
  - `stop` (défaut) : codes clairs seulement à 8, plus aucun code à 9 ;
  - `light` : codes clairs seulement à 8, sans arrêt.
- **État gardé et partagé** : `.run/antiban.json` (redémarrages) et jetons `fails= failsAt= halt=` du message `#botrelay` (PC ⇄ téléphone).
- **`#reprendre`** dans les Messages enregistrés : sortie de l'arrêt ⛔.
- **Réglages** dans le `.env` et dans l'app : **Réglages → 🛡️ Anti-blocage Binance**.

### La vérification

- `npm run test:guard` : 96 vérifications (refus, compteur, modes, `#reprendre`, relais, sources des codes).
- `npm run test:claim` : 17 scénarios avec le vrai Chromium, dont :
  - « il vous reste 7 tentatives » → aucune pause ;
  - `403067` → pause lue dans le message.
- **À surveiller au premier code refusé** : la ligne `📭 Code X — [code] texte · N essai(s) restant(s)`. Si `N` n'apparaît pas alors que Binance l'affiche, il faut adapter `parseRemaining` au texte exact.

---

## 10. Si le bot s'endort de nouveau

Une mise à jour de HiOS peut changer les règles du gel. Dans l'ordre :

1. **Le bot a-t-il vraiment été endormi ?** `adb shell dumpsys activity service com.redpacketbot.app/.BotService` : `sleeps` compte les mises en veille forcées depuis le démarrage du bot (0 = aucune), et le dernier signe de vie doit dater de moins de 30 s.
2. **La notification « Bot en marche » est-elle affichée, avec son chronomètre ?** Si non : écran Santé → « Notifications autorisées ».
3. **HiOS épargne-t-il encore l'app ?** Lance `is_frozen` et le journal du gel ([partie 3](#3-les-commandes-utiles)), écran éteint :
   - pas de `isProgressing:true` pour l'app, ou des `freeze uid: <UID>` : la règle de la partie 4 ne marche plus ;
   - pour retrouver ce qui protège une appli, demande à Claude de décompiler de nouveau `UsfApp.apk` (outils : `jadx`, et `dexdump` du SDK Android).
4. **Les autres pistes**, à garder en réserve. Elles ont été lues dans le code de HiOS en octobre 2026, mais pas testées :
   - **Fenêtre flottante** (permission « Afficher par-dessus les autres applis ») : HiOS l'épargne aussi écran éteint. C'est la meilleure piste de secours.
   - **VPN local** : épargné, mais il prend la place d'un éventuel VPN du téléphone.
   - **Son silencieux** : ne marcherait pas, car HiOS détecte le silence.
   - **Mode « ne jamais geler »** (`setAppMode`) : réservé aux applis système, refusé à ADB.

---

## 11. X (Twitter) : lecture des notifications de l'appli X

Ajouté en octobre 2026. Il n'existe pas d'API X gratuite pour lire les posts, et lire le site avec un robot se fait bloquer. Le téléphone lit donc les **notifications de l'appli X officielle**, pour les comptes suivis avec la cloche « Tous les posts ».

### Le chemin d'un code X

1. **`XNotificationListener`** (Kotlin, processus `:bot`) reçoit chaque notification du téléphone. Il ignore tout ce qui ne vient pas de `com.twitter.android`, ainsi que les résumés de groupe et les notifications permanentes. Il garde le titre, `text`, `bigText`, les lignes, les messages et les liens cachés (`URLSpan`). Une notification déjà transmise avec le même texte est ignorée pendant 15 min.
2. Il appelle `BotService.onXNotification()`, qui l'envoie à Node par le pont (message `x.post`). Si le bot ne tourne pas, la notification est comptée (`dropped`) et oubliée : elle serait périmée au démarrage.
3. **`src/xsource.js`** (Node) vérifie la fraîcheur (`MAX_MESSAGE_AGE_S`, et rien d'antérieur au démarrage), la liste `X_ACCOUNTS`, nettoie le texte (@mentions, #hashtags, $cashtags, liens t.co, mot coupé par « … »), puis extrait les codes avec **les règles de Telegram** (`extractCodes`).
4. Qui réclame :
   - téléphone `solo`, ou responsable en ce moment : il réclame lui-même (`handleDetectedCode`) ;
   - sinon : message silencieux `#xcode CODE src=… from=@compte at=… inst=…` dans les Messages enregistrés. Le PC le lit (`xsource.handleSelfMessage`) et les **deux** appareils jugent sur la date serveur Telegram de ce message (`relay.canClaim`), comme pour un code de canal. Un `#xcode` de plus de 30 s, édité ou mal formé est ignoré. Le téléphone le supprime après 10 min.
5. L'anti-blocage s'applique comme pour Telegram : X n'a pas de monospace, donc ses codes sont `label`, `lien` ou `texte`, et les codes `texte` sont sautés au niveau « codes clairs ».

Le PC annonce qu'il prend les codes X par le jeton ` x=1` de sa ligne `#botrelay` (`X_RELAY_ACCEPT=true`, par défaut). Sans ce jeton, le téléphone envoie l'alerte « ⚠️ Le PC ne prend pas les codes X ».

### Tester sans risque

1. **⚙️ Réglages** → **🐦 X** → **Essai à blanc** (`X_DRY_RUN=true`) : tout tourne, mais rien n'est tapé sur Binance (« 🧪 Essai à blanc » dans les logs, statut 🧪 dans **📜 Activité**). Le code n'est pas mémorisé : il peut resservir.
2. Notification de test par câble (acceptée **seulement** en essai à blanc) :
   `adb shell cmd notification post -S bigtext -t "Binance" xtest "Red Packet 🎁 Code : AB12CD34"`
3. Sur le PC, un `#xcode` tapé à la main dans les Messages enregistrés doit donner 🎁 puis 🧪 :
   `#xcode AB12CD34 src=label from=@test at=1800000000000 inst=00000000 dry=1` (remplace `at` par l'heure actuelle en millisecondes ; le bot juge sur la date du message).

### Le format réel des notifications de X : à relever

Le format des notifications de X peut changer à chaque mise à jour de l'appli. Au premier essai sur le Camon 40, relève-le avec `dumpsys notification --noredact` (partie 3) pour un post court, un post long, un lien Cryptobox, 3 posts rapides (regroupement), une réponse, et une suggestion de X. Note ici :

- où se trouvent le texte du post (`android.text`, `android.bigText`, `android.textLines`) et le nom du compte (`android.title`, jamais `android.subText`, souvent ton propre compte) ;
- si X coupe les posts longs (« … ») et si les liens sont des `t.co` ;
- le délai entre la publication et la notification ;
- le canal (`channel=`) des posts suivis par cloche, comparé à celui des suggestions.

> [!WARNING]
> **Android 15 et plus peut masquer les codes à usage unique** (codes de connexion) dans les notifications transmises aux applis comme Red Packet Bot. `dumpsys --noredact` montre le vrai texte, pas ce que l'app reçoit. Pour le vérifier : **Logs détaillés (DEBUG)** + essai à blanc, puis compare la ligne « 🐦 Notification X de … » des logs avec `dumpsys`. Si le texte y est remplacé, il n'existe pas de contournement propre : la permission qui lève ce masquage est réservée aux applis système.

### Pièges pour qui modifie l'app

- **Garder l'écouteur dans le processus `:bot`** (manifeste) : il joint ainsi `BotService.instance` directement, comme l'écran de connexion Binance. Une autre voie (Intent vers le service) relancerait le service au premier plan à chaque notification.
- Android lie l'écouteur tout seul : il **recrée le processus `:bot`** même bot arrêté. C'est sans effet (Node ne démarre que par `launchNode`), mais `pidof com.redpacketbot.app:bot` ne prouve plus que le bot tourne.
- Les textes de `Status.describe()` (titres de la notification) sont repris dans GUIDE-ANDROID.md : ne les change pas sans mettre le guide à jour.
