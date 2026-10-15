package com.redpacketbot.app

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.RedPacketTheme

/**
 * Connexion Binance, en plein écran, avec le clavier du téléphone.
 *
 * Tourne dans le processus du bot (« :bot ») : les cookies sont ceux de la
 * WebView qui réclame les codes. Dès que le champ Cryptobox apparaît, la
 * connexion est faite : le bot est prévenu et recharge sa page.
 */
class BinanceLoginActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private val handler = Handler(Looper.getMainLooper())
    private var done = false
    private var appPageSeen = 0
    private val status = mutableStateOf(
        "🔑 Connecte-toi à Binance (e-mail ou téléphone, mot de passe, code 2FA). " +
            "Pince pour zoomer. L'écran se ferme tout seul une fois connecté.",
    )
    private val connected = mutableStateOf(false)
    private val progress = mutableIntStateOf(0)

    private val checkTask = object : Runnable {
        override fun run() {
            checkLogin()
            if (!done) handler.postDelayed(this, 2000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        // Créée une seule fois (rotation et thème gérés par configChanges dans le manifeste)
        webView = WebView(this)
        WebViewSetup.configure(webView, this)
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                checkLogin()
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                Toast.makeText(this@BinanceLoginActivity, "La page Binance a planté, réessaie.", Toast.LENGTH_LONG).show()
                finish()
                return true
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.intValue = newProgress
            }
        }

        setContent {
            RedPacketTheme {
                Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
                    // Android 15 dessine sous les barres système : on laisse la place aux
                    // barres et au clavier (sinon il cacherait les champs de connexion)
                    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
                        Surface(color = MaterialTheme.colorScheme.surfaceContainerLow) {
                            Row(
                                Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    status.value,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (connected.value) AppColors.success else MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.weight(1f),
                                )
                                TextButton(onClick = { finish() }) { Text("✖️ Fermer") }
                            }
                        }
                        if (progress.intValue in 1..99) {
                            LinearProgressIndicator(
                                progress = { progress.intValue / 100f },
                                modifier = Modifier.fillMaxWidth(),
                                color = AppColors.gold,
                            )
                        }
                        AndroidView(factory = { webView }, modifier = Modifier.fillMaxWidth().weight(1f))
                    }
                }
            }
        }

        // Retour : page précédente de Binance, sinon fermeture de l'écran
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        webView.loadUrl(WebViewSetup.CRYPTOBOX_URL)
        handler.postDelayed(checkTask, 3000)
    }

    /** Connecté = page Cryptobox avec son champ de code visible. */
    private fun checkLogin() {
        if (done) return
        val url = webView.url ?: return
        val uri = android.net.Uri.parse(url)
        val host = uri.host ?: ""
        val onBinance = host == "www.binance.com" || host == "binance.com"
        val onLogin = host.startsWith("accounts.binance.") || (uri.path ?: "").contains("/login")
        if (!onBinance || onLogin) {
            appPageSeen = 0
            return
        }
        if (!(uri.path ?: "").contains("/payment/cryptobox")) {
            // Connecté mais arrivé ailleurs (tableau de bord) : retour à Cryptobox
            if (++appPageSeen >= 2) {
                appPageSeen = 0
                webView.loadUrl(WebViewSetup.CRYPTOBOX_URL)
            }
            return
        }
        webView.evaluateJavascript(CODE_INPUT_VISIBLE) { result ->
            if (result == "true" && !done) onLoggedIn()
        }
    }

    private fun onLoggedIn() {
        done = true
        CookieManager.getInstance().flush()
        BotService.instance?.onBinanceLoginDone()
        status.value = "✅ Connecté à Binance — le bot reprend la main."
        connected.value = true
        Toast.makeText(this, "✅ Connecté à Binance", Toast.LENGTH_LONG).show()
        handler.postDelayed({ finish() }, 1500)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        CookieManager.getInstance().flush()
        webView.destroy()
        super.onDestroy()
    }

    private companion object {
        // Même champ que SELECTORS.codeInput du bot (hors « :visible »)
        const val CODE_INPUT_VISIBLE = """(function(){
            var e = document.querySelector('input[placeholder*="code" i], input[name="code"]');
            if (!e) return false;
            var r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        })()"""
    }
}
