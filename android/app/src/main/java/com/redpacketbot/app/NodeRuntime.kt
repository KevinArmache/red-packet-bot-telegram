package com.redpacketbot.app

import android.content.Context
import java.io.File
import java.util.zip.ZipInputStream

/**
 * Node.js mobile (libnode.so) : extrait le code du bot de l'APK et démarre
 * Node dans un thread. Node ne peut démarrer qu'UNE fois par processus :
 * pour le relancer, l'app redémarre le processus « :bot ».
 *
 * libnode.so (≈ 60 Mo) n'est chargé qu'au démarrage de Node : lire l'état
 * ne le charge pas, et un téléphone incompatible ne fait pas planter l'app.
 */
object NodeRuntime {
    private var librariesLoaded = false

    private external fun startNode(arguments: Array<String>): Int

    @Volatile
    var started = false
        private set

    /** Extrait nodejs-project.zip (assets) si l'APK a changé. Renvoie le dossier du bot. */
    fun prepareProject(context: Context, files: AppFiles): File {
        val version = context.assets.open("nodejs-project.version").bufferedReader().use { it.readText().trim() }
        val target = files.nodeProject
        val marker = File(target, ".version")
        if (marker.exists() && marker.readText().trim() == version) return target

        target.deleteRecursively()
        target.mkdirs()
        val canonicalRoot = target.canonicalPath + File.separator
        ZipInputStream(context.assets.open("nodejs-project.zip").buffered()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val out = File(target, entry.name)
                // Protection : aucun fichier hors du dossier du bot
                if (!out.canonicalPath.startsWith(canonicalRoot)) continue
                if (entry.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    out.outputStream().use { zip.copyTo(it) }
                }
                zip.closeEntry()
            }
        }
        marker.writeText(version)
        return target
    }

    /**
     * Démarre Node (une seule fois). Lève UnsatisfiedLinkError si libnode.so
     * ne peut pas être chargé sur ce téléphone. onExit est appelé si
     * node::Start rend la main.
     */
    @Synchronized
    fun start(arguments: Array<String>, onExit: (Int) -> Unit) {
        check(!started) { "Node.js est déjà démarré dans ce processus" }
        if (!librariesLoaded) {
            System.loadLibrary("node")
            System.loadLibrary("nodebridge")
            librariesLoaded = true
        }
        started = true
        Thread(null, {
            val code = try {
                startNode(arguments)
            } catch (t: Throwable) {
                -1
            }
            onExit(code)
        }, "node", 16L * 1024 * 1024).start()
    }
}
