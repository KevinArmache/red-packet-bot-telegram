package com.redpacketbot.app

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/**
 * Version de l'app, au format « 1.0.0 (404525) ». Le grand nombre (versionCode)
 * augmente à chaque compilation (« npm run apk ») : c'est lui qui distingue deux APK,
 * comme dans le nom du fichier dist/RedPacketBot-1.0.0-404525.apk.
 */
object AppVersion {
    val label: String = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

    /** Installation ou dernière mise à jour de l'app sur ce téléphone, 0 si inconnue. */
    fun installedAt(context: Context): Long = try {
        val packages = context.packageManager
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packages.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            packages.getPackageInfo(context.packageName, 0)
        }
        info.lastUpdateTime
    } catch (_: PackageManager.NameNotFoundException) {
        0L
    }
}
