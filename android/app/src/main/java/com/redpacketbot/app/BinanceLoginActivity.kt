package com.redpacketbot.app

import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Connexion Binance, en plein écran, avec le clavier du téléphone.
 *
 * Tourne dans le processus du bot (« :bot ») : les cookies sont ceux de la
 * WebView qui réclame les codes. Dès que le champ Cryptobox apparaît, la
 * connexion est faite : le bot est prévenu et recharge sa page.
 */
class BinanceLoginActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var status: TextView
    private val handler = Handler(Looper.getMainLooper())
    private var done = false
    private var appPageSeen = 0

    private val checkTask = object : Runnable {
        override fun run() {
            checkLogin()
            if (!done) handler.postDelayed(this, 2000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        status = TextView(this).apply {
            text = "🔑 Connecte-toi à Binance (e-mail ou téléphone, mot de passe, code 2FA). " +
                "Pince pour zoomer. L'écran se ferme tout seul une fois connecté."
            setTextColor(Color.WHITE)
            textSize = 14f
            setPadding(24, 16, 24, 16)
        }
        val close = Button(this).apply {
            text = "Fermer"
            setOnClickListener { finish() }
        }
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#B71C1C"))
            addView(status, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(close)
        }

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

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#B71C1C"))
            addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        }
        // Android 15 dessine sous les barres système : on laisse la place aux
        // barres et au clavier (sinon il cacherait les champs de connexion)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)

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
        status.text = "✅ Connecté à Binance — le bot reprend la main."
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
