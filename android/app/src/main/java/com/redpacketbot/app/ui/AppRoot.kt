package com.redpacketbot.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.redpacketbot.app.ClaimEntry
import com.redpacketbot.app.ui.components.WinCelebration

/** Écrans de l'app. « onglet/section » ouvre un onglet sur une partie précise. */
object Routes {
    const val HOME = "home"
    const val ACTIVITY = "activity"
    const val ACTIVITY_LOGS = "activity/logs"
    const val SQUARE = "square"
    const val SOURCES = "sources"
    const val SOURCES_TELEGRAM = "sources/telegram"
    const val SOURCES_X = "sources/x"
    const val SOURCES_BINANCE = "sources/binance"
    const val SETTINGS = "settings"
    const val HEALTH = "health"
    const val WIZARD = "wizard"

    /** Valeur de l'extra « screen » (notifications, adb) → écran. Les anciennes valeurs restent valables. */
    fun fromScreenExtra(screen: String?): String? = when (screen) {
        "home" -> HOME
        "settings" -> SETTINGS
        "telegram" -> SOURCES_TELEGRAM
        "x" -> SOURCES_X
        "binance" -> SOURCES_BINANCE
        "sources" -> SOURCES
        "health" -> HEALTH
        "logs" -> ACTIVITY_LOGS
        "activity" -> ACTIVITY
        "square" -> SQUARE
        "wizard" -> WIZARD
        else -> null
    }

    fun tabOf(route: String) = route.substringBefore('/')
    fun isTab(route: String) = tabOf(route) in TABS.map { it.route }
}

private data class Tab(val route: String, val emoji: String, val label: String)

private val TABS = listOf(
    Tab(Routes.HOME, "🏠", "Accueil"),
    Tab(Routes.ACTIVITY, "📜", "Activité"),
    Tab(Routes.SQUARE, "🧧", "Square"),
    Tab(Routes.SOURCES, "📡", "Sources"),
    Tab(Routes.SETTINGS, "⚙️", "Réglages"),
)

@Composable
fun AppRoot(vm: BotViewModel, pendingRoute: MutableState<String?>, importedEnv: MutableState<String?>) {
    var route by rememberSaveable { mutableStateOf(Routes.HOME) }
    var lastTab by rememberSaveable { mutableStateOf(Routes.HOME) }

    fun go(target: String) {
        if (Routes.isTab(target)) lastTab = Routes.tabOf(target)
        route = target
    }

    // Lien profond (notification, .env partagé) : consommé une seule fois
    LaunchedEffect(pendingRoute.value) {
        pendingRoute.value?.let {
            go(it)
            pendingRoute.value = null
        }
    }
    // Premier lancement, réglages vides : l'assistant de démarrage
    LaunchedEffect(Unit) {
        if (!vm.wizardDone && !vm.loadConfig().isComplete && route == Routes.HOME && pendingRoute.value == null) {
            go(Routes.WIZARD)
        }
    }
    BackHandler(enabled = route != Routes.HOME) {
        go(if (Routes.isTab(route)) Routes.HOME else lastTab)
    }

    val imeVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val showBar = Routes.isTab(route) && !imeVisible
    val money by vm.money.collectAsStateWithLifecycle()

    // 💱 Devise choisie dans les Réglages : lue par tous les écrans
    CompositionLocalProvider(LocalMoney provides money) {
        Box(Modifier.fillMaxSize()) {
            Scaffold(
                containerColor = MaterialTheme.colorScheme.background,
                bottomBar = {
                    if (showBar) {
                        NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
                            TABS.forEach { tab ->
                                NavigationBarItem(
                                    selected = Routes.tabOf(route) == tab.route,
                                    onClick = { go(tab.route) },
                                    icon = { Text(tab.emoji, fontSize = 20.sp) },
                                    label = { Text(tab.label) },
                                    colors = NavigationBarItemDefaults.colors(
                                        indicatorColor = MaterialTheme.colorScheme.secondaryContainer,
                                        selectedTextColor = MaterialTheme.colorScheme.onSurface,
                                    ),
                                )
                            }
                        }
                    }
                },
            ) { padding ->
                Box(Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding)) {
                    Crossfade(targetState = route, label = "screen") { current ->
                        when (Routes.tabOf(current)) {
                            Routes.ACTIVITY -> ActivityScreen(vm, startOnLogs = current == Routes.ACTIVITY_LOGS)
                            Routes.SQUARE -> SquareScreen(vm)
                            Routes.SOURCES -> SourcesScreen(
                                vm,
                                focus = current.substringAfter('/', ""),
                                onNavigate = ::go,
                            )
                            Routes.SETTINGS -> SettingsScreen(vm, importedEnv, onNavigate = ::go)
                            Routes.HEALTH -> HealthScreen(vm, onBack = { go(lastTab) })
                            Routes.WIZARD -> WizardScreen(vm, onDone = {
                                vm.wizardDone = true
                                go(Routes.HOME)
                            })
                            else -> HomeScreen(vm, onNavigate = ::go)
                        }
                    }
                }
            }

            WinOverlay(vm)
        }
    }
}

/** 🧧 Fête un code gagné pendant que l'app est ouverte (jamais un ancien gain). */
@Composable
private fun WinOverlay(vm: BotViewModel) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val latestWin = snapshot.activity.items.firstOrNull { it.status == "won" }
    var seenAt by rememberSaveable { mutableLongStateOf(-1L) }
    var showing by remember { mutableStateOf<ClaimEntry?>(null) }

    LaunchedEffect(latestWin?.at) {
        val at = latestWin?.at ?: 0L
        if (seenAt < 0) {
            seenAt = at // première lecture : les gains déjà là ne sont pas fêtés
            return@LaunchedEffect
        }
        if (latestWin != null && at > seenAt) {
            seenAt = at
            if (System.currentTimeMillis() - at < 5 * 60_000L) showing = latestWin
        }
    }
    showing?.let { shown ->
        // Version à jour du gain : sa valeur en dollars arrive quelques secondes après
        val entry = snapshot.activity.items.firstOrNull { it.code == shown.code && it.at == shown.at } ?: shown
        WinCelebration(entry, onDone = { showing = null })
    }
}
