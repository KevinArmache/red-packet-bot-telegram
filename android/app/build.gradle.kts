import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Réglages passés par « npm run apk » (android/scripts/build-apk.mjs)
val appVersionName = providers.gradleProperty("rpb.versionName").getOrElse("1.0.0")
val appVersionCode = providers.gradleProperty("rpb.versionCode").getOrElse("1").toInt()
val appAbis = providers.gradleProperty("rpb.abis").getOrElse("arm64-v8a").split(",").map { it.trim() }
val keystorePropsPath = providers.gradleProperty("rpb.keystore").orNull

android {
    namespace = "com.redpacketbot.app"
    compileSdk = 36
    ndkVersion = "27.1.12297006"

    defaultConfig {
        applicationId = "com.redpacketbot.app"
        minSdk = 29
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName

        ndk {
            abiFilters += appAbis
        }
        externalNativeBuild {
            cmake {
                // libnode.so (Node.js mobile) a besoin de libc++_shared.so
                arguments += "-DANDROID_STL=c++_shared"
            }
        }
    }

    signingConfigs {
        if (keystorePropsPath != null && file(keystorePropsPath).exists()) {
            val propsFile = file(keystorePropsPath)
            val props = Properties().apply { propsFile.reader(Charsets.UTF_8).use { load(it) } }
            create("release") {
                // Chemin relatif au dossier de la clé (dossier restauré sur un autre PC : OK)
                storeFile = propsFile.parentFile.resolve(props.getProperty("storeFile"))
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
        debug {
            // Variante de test : s'installe à côté de l'app normale
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    sourceSets {
        getByName("main") {
            // libnode.so téléchargé par le script de compilation (android/app/libnode/)
            jniLibs.srcDirs("libnode/bin")
        }
    }

    packaging {
        jniLibs {
            // Bibliothèques compressées dans l'APK (libnode.so fait 62 Mo)
            useLegacyPackaging = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.work:work-runtime-ktx:2.10.2")

    implementation(platform("androidx.compose:compose-bom:2025.06.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
}
