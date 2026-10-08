package com.redpacketbot.app

import android.net.LocalServerSocket
import android.net.LocalSocket
import android.net.LocalSocketAddress
import android.os.Process
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import kotlin.concurrent.thread

/**
 * Socket local dans le stockage privé de l'app (pas un socket « abstrait » :
 * Node.js mobile 18 ne sait pas s'y connecter). Seul notre propre processus
 * (même UID) est accepté.
 */
fun bindLocalServer(file: File): LocalServerSocket {
    file.parentFile?.mkdirs()
    file.delete()
    val socket = LocalSocket(LocalSocket.SOCKET_STREAM)
    socket.bind(LocalSocketAddress(file.absolutePath, LocalSocketAddress.Namespace.FILESYSTEM))
    return LocalServerSocket(socket.fileDescriptor)
}

private fun LocalSocket.isOurs(): Boolean = try {
    peerCredentials.uid == Process.myUid()
} catch (_: Exception) {
    false
}

/**
 * Pont entre le service et Node.js (même processus), une ligne JSON par message :
 *
 *  Node → app : { id, t, data }   (t = webview.create, prompt, event…)
 *  app → Node : { re, data | error }  réponse à une requête
 *               { t, data }           événement (shutdown, binance.loginDone…)
 */
class NodeBridge(val socketFile: File, private val onMessage: (JSONObject) -> Unit) {
    private val server = bindLocalServer(socketFile)
    @Volatile
    private var output: OutputStream? = null
    @Volatile
    private var closed = false

    fun start() {
        thread(name = "bridge-accept", isDaemon = true) {
            while (!closed) {
                val socket = try {
                    server.accept()
                } catch (_: Exception) {
                    break
                }
                if (!socket.isOurs()) {
                    Log.w(TAG, "Pont : connexion refusée (autre application)")
                    socket.close()
                    continue
                }
                output = socket.outputStream
                thread(name = "bridge-read", isDaemon = true) { readLoop(socket) }
            }
        }
    }

    private fun readLoop(socket: LocalSocket) {
        try {
            socket.inputStream.bufferedReader(Charsets.UTF_8).forEachLine { line ->
                if (line.isNotBlank()) {
                    try {
                        onMessage(JSONObject(line))
                    } catch (e: Exception) {
                        Log.w(TAG, "Message de Node illisible : ${e.message}")
                    }
                }
            }
        } catch (_: Exception) {
            // Node s'est arrêté
        }
    }

    @Synchronized
    fun send(message: JSONObject) {
        val out = output ?: return
        try {
            out.write((message.toString() + "\n").toByteArray(Charsets.UTF_8))
            out.flush()
        } catch (e: Exception) {
            Log.w(TAG, "Envoi vers Node impossible : ${e.message}")
        }
    }

    fun reply(id: Int, data: Any? = null) =
        send(JSONObject().put("re", id).put("data", data ?: JSONObject.NULL))

    fun replyError(id: Int, error: String) = send(JSONObject().put("re", id).put("error", error))

    fun event(type: String, data: JSONObject = JSONObject()) =
        send(JSONObject().put("t", type).put("data", data))

    fun close() {
        closed = true
        try {
            server.close()
        } catch (_: Exception) {
        }
        socketFile.delete()
    }

    private companion object {
        const val TAG = "RedPacketBot"
    }
}

/**
 * Passerelle vers le protocole DevTools de nos WebViews. Chromium l'ouvre sur
 * un socket abstrait (webview_devtools_remote_<pid>), que seul notre processus
 * peut joindre et que Node 18 ne sait pas atteindre : Kotlin fait le lien entre
 * un socket fichier (pour Node) et ce socket abstrait.
 */
class DevToolsProxy(val socketFile: File) {
    private val server = bindLocalServer(socketFile)
    @Volatile
    private var closed = false

    fun start() {
        thread(name = "devtools-accept", isDaemon = true) {
            while (!closed) {
                val client = try {
                    server.accept()
                } catch (_: Exception) {
                    break
                }
                if (!client.isOurs()) {
                    client.close()
                    continue
                }
                thread(name = "devtools-link", isDaemon = true) { link(client) }
            }
        }
    }

    private fun link(client: LocalSocket) {
        val upstream = LocalSocket()
        try {
            upstream.connect(
                LocalSocketAddress("webview_devtools_remote_${Process.myPid()}", LocalSocketAddress.Namespace.ABSTRACT),
            )
        } catch (e: Exception) {
            Log.w(TAG, "DevTools de la WebView injoignable : ${e.message}")
            client.close()
            upstream.close()
            return
        }
        val closeBoth: () -> Unit = {
            runCatching { client.close() }
            runCatching { upstream.close() }
        }
        thread(name = "devtools-up", isDaemon = true) { pump(client.inputStream, upstream.outputStream, closeBoth) }
        pump(upstream.inputStream, client.outputStream, closeBoth)
    }

    private fun pump(input: InputStream, output: OutputStream, onEnd: () -> Unit) {
        val buffer = ByteArray(64 * 1024)
        try {
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                output.write(buffer, 0, read)
                output.flush()
            }
        } catch (_: Exception) {
            // une des deux extrémités s'est fermée
        } finally {
            onEnd()
        }
    }

    fun close() {
        closed = true
        try {
            server.close()
        } catch (_: Exception) {
        }
        socketFile.delete()
    }

    private companion object {
        const val TAG = "RedPacketBot"
    }
}
