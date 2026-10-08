# 🩺 Guide de débogage — l'app Android avec Claude

Ce guide sert quand l'app **Red Packet Bot** se comporte mal sur le téléphone. Il explique comment laisser **Claude** (Claude Code, sur le PC) examiner le téléphone par câble USB. Il garde aussi la trace des **problèmes déjà résolus et de leur solution**, pour que personne ne refasse l'enquête.

> Pour une panne courante (Telegram ou Binance à reconnecter, réglages), commence par le [dépannage du guide Android](GUIDE-ANDROID.md#11-dépannage).

## Sommaire

1. [Brancher le téléphone pour Claude](#1-brancher-le-téléphone-pour-claude)
2. [Demander à Claude](#2-demander-à-claude)
3. [Les commandes utiles](#3-les-commandes-utiles)
4. [Résolu : le bot s'endort quand on verrouille ou qu'on quitte l'app (Tecno)](#4-résolu--le-bot-sendort-quand-on-verrouille-ou-quon-quitte-lapp-tecno)
5. [Résolu : l'ancien bot Termux tournait encore](#5-résolu--lancien-bot-termux-tournait-encore)
6. [Si le bot s'endort de nouveau](#6-si-le-bot-sendort-de-nouveau)

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
- **ce qu'affiche l'app** : écran Accueil (« Dernier signe de vie », « 💤 Android a endormi le bot … fois ») et onglet Logs ;
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
- **Les logs** : ajoute `logs` à la même commande pour leurs 40 dernières lignes. Sinon, utilise l'onglet **Logs** → **Partager**.
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
                                                 # → la version installée (aussi en haut de l'écran Accueil)
adb shell pm list packages -U redpacket          # → package:com.redpacketbot.app uid:<UID>
adb shell pidof com.redpacketbot.app:bot         # → le PID du bot (rien = le bot ne tourne pas)
adb shell "dumpsys activity services com.redpacketbot.app | grep isForeground"
                                                 # → isForeground=true … types=0x40000000
adb shell "dumpsys deviceidle whitelist | grep redpacket"
                                                 # → user,com.redpacketbot.app,<UID> (batterie sans restriction)
adb shell am get-standby-bucket com.redpacketbot.app   # → 5 (exempté)
adb shell dumpsys activity exit-info com.redpacketbot.app   # pourquoi le bot s'est arrêté (reason=…)
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
> Dans cette liste, garde la session « mtcute on **Node.js/v18.20.4** (Linux arm64) » : c'est celle de l'app. Si elle est terminée par erreur, l'app affiche « 🔑 Telegram à reconnecter » : écran Connexion Telegram → **Se reconnecter**.

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

## 6. Si le bot s'endort de nouveau

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
