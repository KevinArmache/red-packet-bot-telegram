package com.redpacketbot.app

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.CookieManager
import android.webkit.WebView
import androidx.webkit.UserAgentMetadata
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Réglages communs aux deux WebViews Binance (réclamation et connexion) :
 * elles doivent présenter EXACTEMENT la même identité de navigateur, sinon
 * Binance peut refuser la session d'une page à l'autre.
 *
 * Identité : Chrome de bureau sous Linux (ARM), comme le Chromium du bot
 * sous Termux autrefois — mise en page « ordinateur », sélecteurs inchangés.
 */
object WebViewSetup {
    const val CRYPTOBOX_URL = "https://www.binance.com/fr/my/wallet/account/payment/cryptobox"

    private fun webViewVersion(context: Context): String =
        WebViewCompat.getCurrentWebViewPackage(context)?.versionName ?: "140.0.0.0"

    fun userAgent(context: Context): String {
        val major = webViewVersion(context).substringBefore('.')
        return "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/$major.0.0.0 Safari/537.36"
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun configure(webView: WebView, context: Context) {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.mediaPlaybackRequiresUserGesture = true
        settings.userAgentString = userAgent(context)

        // Indices client (Sec-CH-UA) cohérents avec le user-agent de bureau
        if (WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) {
            val full = webViewVersion(context)
            val major = full.substringBefore('.')
            val brands = listOf(
                UserAgentMetadata.BrandVersion.Builder()
                    .setBrand("Chromium").setMajorVersion(major).setFullVersion(full).build(),
                UserAgentMetadata.BrandVersion.Builder()
                    .setBrand("Google Chrome").setMajorVersion(major).setFullVersion(full).build(),
                UserAgentMetadata.BrandVersion.Builder()
                    .setBrand("Not.A/Brand").setMajorVersion("99").setFullVersion("99.0.0.0").build(),
            )
            WebSettingsCompat.setUserAgentMetadata(
                settings,
                UserAgentMetadata.Builder()
                    .setBrandVersionList(brands)
                    .setFullVersion(full)
                    .setPlatform("Linux")
                    .setPlatformVersion("")
                    .setArchitecture("arm")
                    .setModel("")
                    .setMobile(false)
                    .setBitness(64)
                    .build(),
            )
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
    }
}
