package com.redpacketbot.app.ui

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.redpacketbot.app.AppFiles
import com.redpacketbot.app.BotConfig
import com.redpacketbot.app.BotState
import com.redpacketbot.app.Heartbeat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Ce que l'interface sait du bot (relu toutes les secondes). */
data class Snapshot(
    val state: JSONObject,
    val heartbeat: Heartbeat?,
    val config: BotConfig,
    val hasTelegramSession: Boolean,
    val userStopped: Boolean,
) {
    val status: String get() = state.optString("status", BotState.STOPPED)

    /**
     * Le bot tourne (ou démarre) dans le processus « :bot ». Un état « en
     * marche » sans signe de vie depuis 5 min veut dire que le processus a
     * été tué : l'écran propose alors de le démarrer.
     */
    val isRunning: Boolean
        get() {
            if (userStopped) return false
            return when (status) {
                BotState.STARTING, BotState.TELEGRAM_LOGIN -> true
                BotState.RUNNING -> {
                    val since = maxOf(state.optLong("statusSince", 0L), heartbeat?.writtenAt ?: 0L)
                    System.currentTimeMillis() - since < 5 * 60_000L
                }
                else -> false
            }
        }

    val prompt: JSONObject? get() = state.optJSONObject("prompt")

    companion object {
        fun load(context: Context): Snapshot {
            val files = AppFiles(context)
            return Snapshot(
                state = BotState.read(files),
                heartbeat = Heartbeat.read(files.heartbeat),
                config = BotConfig.load(files.config),
                hasTelegramSession = files.telegramSession.exists(),
                userStopped = files.userStopped.exists(),
            )
        }
    }
}

@Composable
fun rememberSnapshot(): State<Snapshot> {
    val context = LocalContext.current
    val snapshot = remember { mutableStateOf(Snapshot.load(context)) }
    LaunchedEffect(Unit) {
        while (true) {
            snapshot.value = withContext(Dispatchers.IO) { Snapshot.load(context) }
            delay(1000)
        }
    }
    return snapshot
}
