package com.redpacketbot.app

import android.content.Context
import java.io.File

/**
 * Où l'app range ses fichiers : stockage privé de l'app (jamais /sdcard),
 * partagé entre l'interface et le processus du bot.
 */
class AppFiles(context: Context) {
    private val root: File = context.filesDir

    /** Réglages (mêmes noms que le .env du PC). */
    val config = File(root, "config.json")

    val runDir = File(root, "run").apply { mkdirs() }
    /** État écrit par le service du bot, lu par l'interface. */
    val state = File(runDir, "state.json")
    /** Présent = bot arrêté par toi (le démarrage auto et le watchdog le respectent). */
    val userStopped = File(runDir, "user-stopped")
    /** Présent = prochain démarrage en mode « connexion Telegram ». */
    val telegramLoginRequest = File(runDir, "telegram-login")
    /** Configuration passée à Node.js au démarrage. */
    val nodeConfig = File(runDir, "node-config.json")
    /** État de la lecture des notifications X (XNotificationListener). */
    val xListener = File(runDir, "x-listener.json")

    /** Dossier de données du bot (BOT_DATA_DIR) : historique, session, alertes. */
    val botData = File(root, "bot-data").apply { mkdirs() }
    val heartbeat = File(botData, ".run/heartbeat")
    /** Derniers codes, gains, graphique 24 h, stats par source (src/activity.js). */
    val activity = File(botData, ".run/activity.json")
    /** 🧧 Red Packets de Binance Square repérés sur Telegram (src/square.js). */
    val square = File(botData, ".run/square.json")
    /** 🧧 Ce que tu en as fait (« Pris », « Raté »…) : écrit par l'app, lu par le bot. */
    val squareMarks = File(botData, ".run/square-marks.json")
    val nodeExit = File(botData, ".run/node-exit.json")
    val logFile = File(botData, "logs/bot.log")
    val telegramSession = File(botData, "telegram-session.txt")

    /** Code du bot (index.js, src/, node_modules) extrait de l'APK. */
    val nodeProject = File(root, "nodejs-project")
}

/** Écriture atomique : jamais de fichier à moitié écrit, même si le processus meurt. */
fun File.writeTextAtomic(text: String) {
    parentFile?.mkdirs()
    val tmp = File(parentFile, "$name.tmp")
    tmp.writeText(text)
    if (!tmp.renameTo(this)) {
        writeText(text)
        tmp.delete()
    }
}
