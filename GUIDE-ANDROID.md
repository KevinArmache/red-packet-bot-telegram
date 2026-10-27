# 📱 Guide Android — le bot 24 h/24 avec l'app Red Packet Bot

Ce guide installe le bot sur ton téléphone Android sous forme d'**application (APK)**. C'est le **même bot que sur le PC** (même détection des codes, mêmes alertes, même relais), mais tout se fait dans l'app : pas de Termux, pas de commandes à taper sur le téléphone.

- **Le téléphone est le secours du PC.** Le PC réclame les codes en priorité ; le téléphone prend le relais dès que le PC s'arrête.
- **La connexion Binance se fait directement dans l'app**, en plein écran, avec le clavier du téléphone.
- **L'app tourne en permanence** : notification fixe, relance automatique après un plantage, après un redémarrage du téléphone et après une mise à jour.
- **Elle lit aussi les codes publiés sur X (Twitter)**, par les notifications de l'appli X, sans scraping ni API (voir la [partie 7 bis](#7-bis-les-codes-publiés-sur-x-twitter)).
- **Au premier lancement, l'assistant 🧭** te guide en 5 étapes : Telegram, Binance, X, réglages du téléphone, alerte de test.

Compte environ **20 minutes** sur le téléphone la première fois, plus le temps de la première compilation sur le PC.

## Sommaire

1. [Ce qu'il te faut](#1-ce-quil-te-faut)
2. [Fabriquer l'APK sur le PC](#2-fabriquer-lapk-sur-le-pc)
3. [Installer l'APK sur le téléphone](#3-installer-lapk-sur-le-téléphone)
4. [Les réglages du bot](#4-les-réglages-du-bot)
5. [La connexion Telegram](#5-la-connexion-telegram)
6. [La connexion Binance](#6-la-connexion-binance)
7. [Les réglages du téléphone (écran Santé)](#7-les-réglages-du-téléphone-écran-santé)
7 bis. [Les codes publiés sur X (Twitter)](#7-bis-les-codes-publiés-sur-x-twitter)
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
4. L'app s'ouvre sur **⚙️ Réglages**, déjà remplis. Vérifie, puis touche **💾 Enregistrer** dans la barre qui apparaît en bas de l'écran (elle ne s'affiche que s'il y a des changements).
5. **Supprime** ensuite `bot.env` des Messages enregistrés et du Bureau : ce fichier contient tes secrets.

Autres façons d'importer, dans **⚙️ Réglages** → **📥 Importer ton .env** (ou à l'étape 1 de l'assistant 🧭) :

- **📂 Choisir le fichier** : si `bot.env` est déjà dans le dossier Download du téléphone ;
- **📋 Coller** : si tu as copié le contenu du `.env`.

Tu peux aussi tout remplir à la main.

**Ce que l'app vérifie avant d'enregistrer** (une erreur s'affiche en rouge, juste sous le champ concerné) :

- `API_ID` est un nombre ;
- `API_HASH` fait 32 caractères, et ce n'est pas la valeur d'exemple ;
- le numéro est au format international (`+243…`) ;
- les canaux sont valides (`@pseudo`, lien `t.me/…`, ou ID qui commence par `-100`) ;
- le jeton du bot d'alertes a la bonne forme ;
- ton canal de publication (📣) est un `@pseudo`, un lien `t.me/…` ou un ID `-100…`.

**📣 Publier mes gains** (facultatif) : chaque Red Packet gagné par le téléphone part tout de suite sur ton canal Telegram, avec son code et le montant.

- **Pas encore de canal :** bot démarré, remplis le nom du canal et le `@pseudo` voulu, puis touche **✨ Créer mon canal**. Le bot le crée avec ton compte Telegram, y met ton bot d'alertes administrateur et remplit le champ. Il publie aussitôt, sans redémarrer.
- **Canal existant :** mets-le dans le champ, puis ajoute ton bot d'alertes comme **administrateur du canal**, avec le droit « Publier des messages ».
- La carte affiche ensuite ✅ (ou ⚠️ avec quoi faire) et le lien `t.me/…` à partager. **🔎 Vérifier** refait le contrôle, sans rien publier.
- Mets le même canal dans le `.env` du PC (`PUBLISH_CHANNEL`) : c'est l'appareil qui gagne qui publie.

Détails dans le [README](README.md#-publier-tes-gains-sur-ton-canal).

**Le rôle du téléphone :**

- **Secours du PC** (par défaut) : le PC réclame en priorité, le téléphone prend le relais quand le PC s'arrête. Le `.env` du PC (`BOT_ROLE=primary`) ne change pas ce réglage.
- **Appareil seul (solo)** : seulement si **aucun bot ne tourne sur le PC**. Sinon, les deux réclameraient chaque code.

---

## 5. La connexion Telegram

Le téléphone a **sa propre connexion** à ton compte Telegram : ne copie pas la session du PC (deux appareils sur la même session se déconnectent l'un l'autre).

1. Onglet **📡 Sources** → carte **✈️ Telegram** (ou l'étape 1 de l'assistant 🧭).
2. Touche **🔐 Se connecter à Telegram**. Le bot démarre et demande le code à Telegram.
3. Le code arrive dans ton **app Telegram** (conversation « Telegram »), ou par SMS. L'app Red Packet Bot affiche aussi une notification **📱 Connexion Telegram**.
4. Tape le code dans le champ **Code reçu**, puis **Valider**.
5. Si ton compte a un **mot de passe 2FA**, l'app le demande ensuite.
6. L'écran affiche **✅ Connecté : ton nom (@pseudo)**.

La connexion apparaît dans Telegram → **Réglages** → **Appareils**.

> [!TIP]
> Code faux : l'app affiche **❌ Code incorrect** et te laisse réessayer. Pas de saisie pendant 15 minutes : la connexion est abandonnée, il suffit de recommencer.

---

## 6. La connexion Binance

1. Onglet **📡 Sources** → carte **🔐 Binance** → **Se connecter à Binance** (ou l'étape 2 de l'assistant 🧭).
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
> HiOS ne compte ce chronomètre que pendant 5 minutes. L'app le relance discrètement toutes les 4 minutes, sans rien changer à ce que tu vois (détails dans le [guide de débogage](GUIDE-DEBOGAGE.md#4-bis-résolu--hios-regelait-le-bot-5-minutes-après-chaque-démarrage)).
>
> 👉 **Ne désactive jamais cette notification.** Tu peux la replier dans le volet, mais si tu la coupes, HiOS gèle de nouveau le bot.

Ouvre l'écran **🩺 Santé** : touche la pastille **🩺 11/12** en haut à droite de l'Accueil, ou **⚙️ Réglages** → **🩺 Santé du téléphone**. Le score compte les points en ordre ; il passe au rouge s'il manque un réglage **🚨 indispensable**. Chaque point a un bouton qui ouvre le bon écran des réglages :

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
8. **Tecno : réseau gardé la nuit** (seulement sur HiOS) → doit être ✅. Sinon, la fonction « AI Net » de HiOS coupe le Wi-Fi et les données pendant ton sommeil, et le bot rate les codes. Pour la couper, PC branché en USB : `adb shell settings put global ai_net_control_enable 0`, puis redémarre le téléphone (détails dans le [guide de débogage](GUIDE-DEBOGAGE.md#7-résolu--telegram-coupé-30-à-50-minutes-la-nuit-hios--ai-net-)).
9. **🪟 Tecno : protection anti-gel renforcée** (recommandé) → **Autoriser**, puis active **Afficher par-dessus les autres applis**. Le bot pose une fenêtre invisible de 1 pixel qui double la protection de la notification. Android peut afficher « Red Packet Bot s'affiche par-dessus d'autres applis » : c'est normal.

**À faire à la main sur Tecno / HiOS 15 :**

10. **Démarrage automatique** : **Phone Master** → **Accélérer** → **Gestion du démarrage auto** → active **Red Packet Bot**. Puis **Phone Master** → menu (en haut à gauche) → **Réglages** → **Applis protégées** → ajoute **Red Packet Bot**.
11. **Pas de nettoyage à l'écran verrouillé** : dans les réglages de **Phone Master**, désactive **Nettoyage à l'écran verrouillé**, ou mets l'app en liste blanche. Dans **Réglages** → **Batterie**, désactive l'**économie d'énergie**, **Power Marathon** et l'**optimisation du mode veille**.
12. **Verrouiller l'app dans les récentes** : ouvre les applis récentes, touche le petit triangle à côté de Red Packet Bot (ou maintiens la carte), puis **Verrouiller**.
13. **Pas de « congélation »** : appui long sur l'écran d'accueil → **Paramètres du bureau** → **Autres réglages** → **Congélateur** : Red Packet Bot ne doit pas y être.

Laisse le téléphone **en charge**, idéalement avec une limite de charge si le téléphone en propose une.

**Le test qui prouve que c'est bon :**

1. Démarre le bot.
2. Verrouille le téléphone pendant **10 minutes**.
3. Reviens sur l'écran Santé ou l'Accueil.

Si **« Android a endormi le bot »** apparaît, un réglage manque (souvent Phone Master ou la batterie). Le bot l'écrit aussi dans ses logs (« 💤 Le système a endormi le bot ») et t'envoie une alerte.

---

## 7 bis. Les codes publiés sur X (Twitter)

Des Red Packets sont aussi publiés sur X. Il n'existe pas d'API gratuite pour les lire, et les robots qui lisent le site se font bloquer. L'app fait donc autrement : **le téléphone lit les notifications de l'appli X officielle**, pour les comptes que tu suis avec la cloche. Pour X, c'est toi qui reçois des notifications, comme d'habitude : pas de robot, rien à bloquer.

Les codes X suivent **les mêmes règles que ceux de Telegram**, anti-blocage compris : codes `BP` ignorés, codes en texte libre sautés quand le compteur de codes faux monte. Une règle de plus sur X : un code tout en lettres est pris aussi au milieu d'une phrase, s'il a l'air tiré au hasard. Chaque post X reçu laisse une ligne dans **📜 Activité → 🖥️ Logs** (`🐦 Post X de …`), avec son texte et ce que le bot en a fait. Quand le PC réclame, le téléphone lui transmet chaque code X (voir la [partie 9](#9-le-relais-avec-le-pc)).

**1. Sur l'appli X**

1. Installe **X** depuis le Play Store et connecte-toi.
2. Pour chaque compte qui publie des codes, ouvre son profil → touche la **cloche 🔔** → **Tous les posts**. Sans ça, X n'envoie aucune notification et le bot ne voit rien.
3. **Réglages** → **Applis** → **X** → **Batterie** → **Sans restriction**. Sinon, Android retarde les notifications de X écran éteint, et les codes arrivent trop tard.
4. Sur Tecno : **Phone Master** → **Gestion du démarrage auto** → active aussi **X**.

**2. Dans l'app Red Packet Bot**

1. **⚙️ Réglages** → **🐦 Codes publiés sur X** → active **Lire les posts X**.
2. **Comptes X** : écris les comptes à suivre, séparés par des virgules (par exemple `@binance, @binance_fr`). Vide, l'app lit **toutes** les notifications de X, y compris les suggestions de X : une liste est conseillée.
3. Touche **Autoriser** à côté de **Accès aux notifications**. Android ouvre l'écran **Accès aux notifications** : active **Red Packet Bot — codes publiés sur X**.
4. **💾 Enregistrer** : le bot redémarre avec la lecture de X.

> [!TIP]
> **L'interrupteur est grisé, ou Android parle de « paramètre restreint » ?** Android bloque ce réglage pour les applis installées hors du Play Store. Va dans **Réglages** → **Applis** → **Red Packet Bot** → menu **⋮** en haut à droite → **Autoriser les paramètres restreints**, puis réessaie.

**3. Tester sans risque : l'essai à blanc**

Active **🧪 Essai à blanc** (sous « Lire les posts X »). Toute la chaîne tourne (lecture du post, détection, relais vers le PC, anti-blocage), mais **aucun code n'est tapé sur Binance** : les logs affichent « 🧪 Essai à blanc : … aurait été réclamé ici ». Publie un faux code depuis un autre compte X que tu suis avec la cloche (par exemple `Code : AB12CD34`), puis regarde **📜 Activité**. **Coupe l'essai à blanc** une fois les tests faits.

**4. Suivre ce qui se passe**

Onglet **📡 Sources** → carte **🐦 X** : accès accordé ou non, appli X installée, dernier post vu, codes trouvés, et l'activité de chaque compte suivi.

**Limites, en toute honnêteté :**

- Un code publié **seulement dans une image** n'est pas lu (pas de texte dans la notification).
- Si X coupe un long post dans sa notification (« … »), un code placé tout à la fin peut manquer.
- Le téléphone doit être allumé, avec le bot en marche : un post arrivé bot arrêté est ignoré (il serait périmé au démarrage).
- Confidentialité : l'app ignore toute notification qui ne vient pas de X. Pour X, elle garde seulement l'auteur et les 120 premiers caractères du dernier post (affichés dans 📡 Sources), dans son stockage privé.

---

## 8. Au quotidien

**Démarrer :** onglet **🏠 Accueil** → touche le **grand bouton rond**. Son anneau montre l'état d'un coup d'œil : il pulse en **vert** quand le téléphone réclame, en **bleu** en veille (le PC réclame), il tourne en **or** pendant un démarrage, il est **gris** à l'arrêt et **rouge** en cas de problème (Binance à reconnecter, pause, arrêt anti-blocage). La notification permanente indique aussi l'état du bot :

- **😴 En veille — le PC réclame** : le PC est actif, le téléphone attend. La page Binance est fermée après 2 minutes pour économiser la mémoire.
- **🟢 Actif — le téléphone réclame** : le PC est arrêté ou muet, le téléphone a pris le relais.
- **🔎 Vérification du relais…** : au démarrage, le temps de lire l'état du PC.
- **🔑 Binance à reconnecter** : touche la notification Binance.
- **🛑 Pause anti-ban** : limite Binance atteinte, reprise à l'heure indiquée.
- **🔑 Telegram à reconnecter** : onglet **📡 Sources** → **✈️ Telegram**.

La notification affiche aussi les codes détectés et gagnés, le compteur anti-blocage (« 🛡️ anti-ban 2/10 ») et « 🐦 X actif » si la lecture de X est activée (déplie-la pour tout voir), plus un chronomètre : depuis combien de temps le bot tourne (ce chronomètre l'empêche aussi d'être gelé par HiOS).

**Arrêter :** touche le **grand bouton rond** puis confirme, ou **Arrêter** dans la notification. **Redémarrer :** appui long sur le bouton rond.

- C'est un **arrêt propre** : le téléphone publie « arrêté » pour le PC et termine les codes en cours.
- **Seul ce bouton arrête le bot durablement.** Fermer l'app ou la retirer des récentes ne l'arrête pas.

**Il repart tout seul :**

- **Après un plantage** : il est relancé après 10 s, puis l'attente double à chaque nouvel arrêt, jusqu'à 10 min (retour à 10 s s'il a tenu 5 min).
- **Si la session Telegram a expiré** : notification 🔑, et nouvel essai toutes les 30 min.
- **Après un redémarrage du téléphone** : il repart, mais seulement **après le premier déverrouillage**.
- **Après une mise à jour de l'app.**
- **S'il est figé** (aucun signe de vie pendant 5 min) : il est relancé.
- **Filet de sécurité** : un contrôle toutes les 15 min relance le bot s'il devait tourner mais ne répond plus.

**Les 4 onglets :**

- **🏠 Accueil** : le bouton d'état, le **relais 💻 PC ⇄ 📱 téléphone** (l'appareil qui réclame est entouré d'or), les chiffres (💰 gains du jour en dollars, avec le détail par crypto dessous, 🏆 gagnés, 🎁 détectés, 🎯 réussite, ⚡ délai avant saisie, ❌ refusés), le graphique des codes sur 24 h, la **jauge anti-blocage** (10 cases : or, puis orange au seuil « codes clairs », rouge à l'arrêt, 🔒 le blocage Binance jamais atteint) et les 5 derniers codes. Quand un code est gagné app ouverte, une enveloppe 🧧 s'ouvre à l'écran.
- **📜 Activité** : **🎁 Codes**, les 50 derniers codes avec leur origine (✈️ TG ou 🐦 X) et leur résultat, et pour chaque Red Packet gagné sa **valeur en dollars** (prix public de Binance au moment du gain), plus les totaux du jour et depuis le début ; **🖥️ Logs**, ce que fait le bot en direct, avec des filtres (Tout, Codes, Erreurs). **Copier** et **Partager** servent à demander de l'aide.
- **📡 Sources** : connexions Telegram et Binance, chaque canal avec ses codes et son dernier message (les canaux muets depuis 7 jours sont signalés), et la carte 🐦 X.
- **⚙️ Réglages** : tous les réglages, la Santé, l'assistant 🧭 et « À propos ».

L'**alerte de test** (vérifie que ton bot @BotFather t'écrit bien) est à la dernière étape de l'assistant 🧭 (**⚙️ Réglages** → **Relancer l'assistant de démarrage**).

**🔍 Rechercher un code** (en haut de **📜 Activité → 🎁 Codes**) : tape au moins 4 caractères. L'app cherche dans les derniers codes et dans tout l'historique des logs. Elle dit si le code a été vu, sur quel canal ou compte X, et ce qu'il est devenu (gagné, refusé, laissé au PC, sauté). Sinon, elle affiche « jamais vu » avec les causes possibles : canal absent de ta liste, code seulement en image…

**💱 Devise des gains** (**⚙️ Réglages → Affichage**) : dollar, franc congolais, ou les deux. Le choix s'applique tout de suite, sans redémarrer le bot. Le taux du jour vient d'open.er-api.com (gratuit, mis à jour chaque jour) ; tu peux aussi saisir ton propre taux (celui de ton changeur).

**Les tout petits montants** s'écrivent comme dans les applis crypto : `0,0₆16` veut dire 0, virgule, **6 zéros**, puis 16, soit 0,00000016. Le petit chiffre compte les zéros, pour que le montant tienne à l'écran sans en cacher.

L'app suit le thème du téléphone : **sombre « rouge & or »** si le mode sombre est activé, clair sinon.

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

**Les codes X et le PC :** seul le téléphone voit les posts X. Quand c'est le PC qui réclame, le téléphone lui envoie chaque code X par un message silencieux `#xcode …` dans tes **Messages enregistrés**. Ne le supprime pas, il s'efface tout seul après 10 minutes. Les deux appareils jugent ce message avec la même règle que les codes des canaux, donc un code n'est jamais tapé deux fois. Un PC pas à jour ne prend pas ces codes : le téléphone t'envoie alors l'alerte « ⚠️ Le PC ne prend pas les codes X ».

---

## 10. Mettre à jour l'app

1. Sur le PC : `git pull`, puis `npm run apk`.
2. Installe le nouveau `dist\RedPacketBot.apk` **par-dessus** l'ancien (même méthode qu'à l'étape 3). **Ne désinstalle pas** l'ancienne version : tes réglages et tes connexions Telegram et Binance sont gardés.
3. Le bot redémarre tout seul après la mise à jour, s'il tournait.
4. Vérifie la version installée : elle s'affiche tout en bas de l'**🏠 Accueil** (par exemple « version 1.0.0 (404525) ») avec la date d'installation, et dans **⚙️ Réglages** → **ℹ️ À propos**. Le grand nombre augmente à chaque `npm run apk` : c'est le même que dans le nom du fichier `dist\RedPacketBot-1.0.0-404525.apk`. Le bot l'écrit aussi au début de ses logs (« 📱 App Android : version … »).

Pense à mettre à jour le PC aussi (`npm install` si besoin, puis `npm start`).

---

## 11. Dépannage

| Ce que tu vois | Quoi faire |
|---|---|
| « Application non installée » à la mise à jour | L'APK n'est pas signée avec la même clé (dossier `.red-packet-bot` perdu ou autre PC). Désinstalle l'app, installe la nouvelle, refais les connexions Telegram et Binance. |
| `npm run apk` : « SDK Android introuvable » ou erreur NDK / CMake | Ouvre Android Studio une fois. Dans le SDK Manager, installe NDK **27.1.12297006** et CMake **3.22.1** (voir l'[étape 1](#1-ce-quil-te-faut)). |
| Le bouton rond ouvre l'assistant au lieu de démarrer | Les réglages sont incomplets : **⚙️ Réglages**, corrige ce qui est en rouge sous les champs, puis **💾 Enregistrer**. |
| Le code Telegram n'arrive pas | Vérifie le numéro dans les Réglages. Regarde la conversation « Telegram » dans ton app Telegram, puis tes SMS. Recommence avec **Se reconnecter**. |
| **🔑 Telegram à reconnecter** | La session du téléphone a été fermée (par exemple dans Telegram → Appareils). Onglet **📡 Sources** → **✈️ Telegram** → **🔄 Se reconnecter**. |
| **🔑 Binance à reconnecter** souvent | Binance fait expirer ses sessions de temps en temps : reconnecte-toi depuis la notification. Si ça arrive tous les jours, déconnecte-toi de Binance sur les autres appareils inutilisés. |
| « 💤 Android a endormi le bot » | Un réglage de l'[étape 7](#7-les-réglages-du-téléphone-écran-santé) manque. Vérifie d'abord que la notification **« Bot en marche »** est bien affichée, avec son chronomètre : sans elle, HiOS gèle le bot. Ensuite : batterie sans restriction, démarrage auto et applis protégées dans Phone Master, nettoyage écran verrouillé désactivé. |
| Beaucoup de **coupures Telegram** | Wi-Fi instable, ou économiseur de données. Garde le Wi-Fi allumé pendant la veille (réglages Wi-Fi avancés) et vérifie l'écran Santé. |
| **Coupures Telegram de 30 à 50 min la nuit** | C'est HiOS qui éteint le Wi-Fi (fonction « AI Net ») : voir le point 8 de l'[étape 7](#7-les-réglages-du-téléphone-écran-santé). |
| « ❔ Code … : résultat inconnu » | Binance n'a rien confirmé après « Ouvrir » (réseau coupé, page bloquée). Le code n'est jamais retenté. Regarde l'historique Cryptobox ; si ça se répète, envoie les logs. |
| « 💰 GAGNÉ » : où voir le montant ? | Dans les logs (« 💰 GAGNÉ ! Code … → 0.0009 SPELL ») et dans l'alerte Telegram, comme sur le PC. Le montant vient directement de la réponse de Binance. |
| Pas d'alertes Telegram | Envoie **/start** à ton bot d'alertes, vérifie le jeton dans les Réglages, puis l'**alerte de test** (dernière étape de l'assistant 🧭). Les logs expliquent la cause (« Alerte non envoyée : … »). |
| Notification **▶️ Relancer le bot** | Android a refusé de relancer le bot tout seul (souvent la batterie restreinte). Touche-la, puis le bouton rond de l'Accueil. Vérifie l'écran Santé. |
| Le bot ne repart pas après un redémarrage du téléphone | Déverrouille le téléphone une fois : Android ne lance aucune app avant. Vérifie le démarrage auto dans Phone Master. |
| **Compatibilité Node.js ⚠️** (pages de 16 Ko) | Ce téléphone utilise une mémoire en pages de 16 Ko, que Node.js mobile 18 ne gère pas encore. Garde le bot sur le PC (ou un autre téléphone). |
| L'app se ferme quand le bot redémarre | C'est normal si tu es sur l'écran de connexion Binance pendant une relance : rouvre-le. |
| 🐦 Aucun post X dans **📡 Sources** | Vérifie, dans l'ordre : **Lire les posts X** activé, **Accès aux notifications** ✅, la cloche **Tous les posts** sur le compte dans l'appli X, et que les notifications de X s'affichent bien dans le volet. Puis **Batterie** de X sans restriction et démarrage auto de X dans Phone Master. |
| 🐦 « Accès aux notifications » grisé | Android bloque ce réglage pour une app installée hors du Play Store : **Réglages** → **Applis** → **Red Packet Bot** → **⋮** → **Autoriser les paramètres restreints** (voir la [partie 7 bis](#7-bis-les-codes-publiés-sur-x-twitter)). |
| 🐦 Post X vu, mais pas de code | Chaque post X reçu laisse une ligne dans **📜 Activité → 🖥️ Logs**, avec son texte et ce que le bot en a fait : `🐦 Post X de … : aucun code — « … »`. **🖼️ image non lue** : le code était peut-être dans l'image, que le bot ne lit pas. Un post absent des logs n'est jamais arrivé en notification (cloche, notifications de X). Sinon, le code était coupé par X (« … »), ou le compte n'est pas dans ta liste **Comptes X** (« ignoré (compte absent de X_ACCOUNTS) »). |
| ⚠️ « Le PC ne prend pas les codes X » | Le PC n'est pas à jour : `git pull` sur le PC, puis relance-le. |
| Logs trop longs à lire | Onglet **📜 Activité** → **🖥️ Logs** → **🗑️** : l'écran repart de zéro, le bot continue de tourner. |
| Autre problème | Onglet **📜 Activité** → **🖥️ Logs** → **📤 Partager**, et envoie les dernières lignes. Pour une enquête plus poussée, le [guide de débogage](GUIDE-DEBOGAGE.md) explique comment laisser Claude examiner le téléphone par câble USB, et liste les problèmes déjà résolus. |

---

## 12. Désinstaller

1. Dans l'app, touche le bouton rond de l'**🏠 Accueil** puis **Arrêter** (le PC est prévenu tout de suite).
2. Désinstalle **Red Packet Bot** comme n'importe quelle app : ses réglages et ses sessions sont effacés avec elle.
3. Dans Telegram → **Réglages** → **Appareils**, termine la session du téléphone si elle apparaît encore.
