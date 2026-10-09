package com.redpacketbot.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.redpacketbot.app.ui.AppTheme
import com.redpacketbot.app.ui.HealthScreen
import com.redpacketbot.app.ui.HomeScreen
import com.redpacketbot.app.ui.LogsScreen
import com.redpacketbot.app.ui.Red
import com.redpacketbot.app.ui.SettingsScreen
import com.redpacketbot.app.ui.TelegramScreen

class MainActivity : ComponentActivity() {

    companion object {
        const val EXTRA_SCREEN = "screen"
        const val SCREEN_HOME = "home"
        const val SCREEN_SETTINGS = "settings"
        const val SCREEN_TELEGRAM = "telegram"
        const val SCREEN_HEALTH = "health"
        const val SCREEN_LOGS = "logs"
    }

    private val screen = mutableStateOf(SCREEN_HOME)
    /** Contenu d'un .env reçu par « Partager » / « Ouvrir avec ». */
    private val importedEnv = mutableStateOf<String?>(null)

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        handleIntent(intent)
        // Ouvrir l'app relance le bot s'il devrait tourner (après une mise à jour,
        // HiOS bloque parfois l'annonce qui le relance d'habitude)
        ensureBotRunning(this, "ouverture de l'app")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        setContent { AppTheme { AppRoot(screen, importedEnv) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        intent ?: return
        intent.getStringExtra(EXTRA_SCREEN)?.let { screen.value = it }
        val text = when (intent.action) {
            // Fichier joint d'abord : une légende (EXTRA_TEXT) n'est pas un .env
            Intent.ACTION_SEND -> readUri(intent.streamUri())
                ?: intent.getStringExtra(Intent.EXTRA_TEXT)
            Intent.ACTION_VIEW -> readUri(intent.data)
            else -> null
        }
        if (text != null) {
            importedEnv.value = text
            screen.value = SCREEN_SETTINGS
        }
    }

    @Suppress("DEPRECATION")
    private fun Intent.streamUri(): Uri? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            getParcelableExtra(Intent.EXTRA_STREAM)
        }

    private fun readUri(uri: Uri?): String? = uri?.let {
        runCatching {
            contentResolver.openInputStream(it)?.use { stream -> stream.readBytes().take(200_000).toByteArray().decodeToString() }
        }.getOrNull()
    }
}

@Composable
private fun AppRoot(screen: MutableState<String>, importedEnv: MutableState<String?>) {
    Scaffold(
        topBar = {
            Surface(color = Red) {
                Row(
                    Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val title = when (screen.value) {
                        MainActivity.SCREEN_SETTINGS -> "⚙️ Réglages"
                        MainActivity.SCREEN_TELEGRAM -> "📡 Connexion Telegram"
                        MainActivity.SCREEN_HEALTH -> "🩺 Santé du téléphone"
                        MainActivity.SCREEN_LOGS -> "📜 Logs"
                        else -> null
                    }
                    Text(
                        title ?: "🧧 Red Packet Bot",
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    // Accueil : la version installée, visible d'un coup d'œil
                    if (title == null) {
                        Text("v${AppVersion.label}", color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp)
                    }
                }
            }
        },
        bottomBar = {
            NavigationBar {
                NavItem(screen, MainActivity.SCREEN_HOME, "Accueil") { Icon(Icons.Filled.Home, null) }
                NavItem(screen, MainActivity.SCREEN_SETTINGS, "Réglages") { Icon(Icons.Filled.Settings, null) }
                NavItem(screen, MainActivity.SCREEN_HEALTH, "Santé") { Icon(Icons.Filled.Build, null) }
                NavItem(screen, MainActivity.SCREEN_LOGS, "Logs") { Icon(Icons.AutoMirrored.Filled.List, null) }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            when (screen.value) {
                MainActivity.SCREEN_SETTINGS -> SettingsScreen(importedEnv)
                MainActivity.SCREEN_TELEGRAM -> TelegramScreen()
                MainActivity.SCREEN_HEALTH -> HealthScreen()
                MainActivity.SCREEN_LOGS -> LogsScreen()
                else -> HomeScreen(onNavigate = { screen.value = it })
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.NavItem(
    screen: MutableState<String>,
    target: String,
    label: String,
    icon: @Composable () -> Unit,
) {
    NavigationBarItem(
        selected = screen.value == target,
        onClick = { screen.value = target },
        icon = icon,
        label = { Text(label) },
    )
}
