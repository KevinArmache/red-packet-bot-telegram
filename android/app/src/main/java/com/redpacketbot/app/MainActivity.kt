package com.redpacketbot.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.mutableStateOf
import com.redpacketbot.app.ui.AppRoot
import com.redpacketbot.app.ui.BotViewModel
import com.redpacketbot.app.ui.Routes
import com.redpacketbot.app.ui.theme.RedPacketTheme

class MainActivity : ComponentActivity() {

    companion object {
        /** Écran à ouvrir (notifications, adb) : voir Routes.fromScreenExtra. */
        const val EXTRA_SCREEN = "screen"
        const val SCREEN_HOME = "home"
        const val SCREEN_SETTINGS = "settings"
        const val SCREEN_TELEGRAM = "telegram"
        const val SCREEN_HEALTH = "health"
        const val SCREEN_LOGS = "logs"
        const val SCREEN_SOURCES = "sources"
        const val SCREEN_X = "x"
    }

    private val vm: BotViewModel by viewModels()

    /** Écran demandé par un lien (notification, .env partagé), consommé par l'interface. */
    private val pendingRoute = mutableStateOf<String?>(null)
    /** Contenu d'un .env ou d'une sauvegarde 🧳 reçu par « Partager » / « Ouvrir avec ». */
    private val importedEnv = mutableStateOf<String?>(null)

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Barres système transparentes, icônes adaptées au thème clair ou sombre
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        // Rotation ou passage clair/sombre : l'intent d'origine n'est pas rejoué
        // (sinon un .env partagé serait réimporté à chaque fois)
        if (savedInstanceState == null) handleIntent(intent)
        // Ouvrir l'app relance le bot s'il devrait tourner (après une mise à jour,
        // HiOS bloque parfois l'annonce qui le relance d'habitude)
        ensureBotRunning(this, "ouverture de l'app")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        setContent { RedPacketTheme { AppRoot(vm, pendingRoute, importedEnv) } }
    }

    override fun onResume() {
        super.onResume()
        // Retour des réglages Android : l'écran Santé se met à jour tout de suite
        vm.refreshHealth()
        // Taux dollar → franc congolais relu s'il date de plus de 6 h
        vm.refreshCdfRate()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        intent ?: return
        Routes.fromScreenExtra(intent.getStringExtra(EXTRA_SCREEN))?.let { pendingRoute.value = it }
        val text = when (intent.action) {
            // Fichier joint d'abord : une légende (EXTRA_TEXT) n'est pas un .env
            Intent.ACTION_SEND -> readUri(intent.streamUri())
                ?: intent.getStringExtra(Intent.EXTRA_TEXT)
            Intent.ACTION_VIEW -> readUri(intent.data)
            else -> null
        }
        if (text != null) {
            importedEnv.value = text
            pendingRoute.value = Routes.SETTINGS
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
            contentResolver.openInputStream(it)?.use { stream -> stream.readBytes().take(Backup.MAX_BYTES).toByteArray().decodeToString() }
        }.getOrNull()
    }
}
