package dev.smoores.storyteller

import android.app.Application
import android.system.Os
import java.io.File

/**
 * Performs process-wide Android setup before either the activity or media
 * service can load the Swift runtime.
 */
class StorytellerApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        configureSwiftTemporaryDirectory(cacheDir)
        configureSwiftNetworking(filesDir)
        extractReaderFonts(this)
    }
}

// Swift CustomFontsActor reads bundled reader fonts through
// KitResources.fontsDirectory(), which on Android resolves to
// filesDir/reader-fonts; APK assets are not filesystem paths, so the staged
// assets/reader-fonts entries are extracted here once per install.
private fun extractReaderFonts(application: Application) {
    val target = File(application.filesDir, "reader-fonts")
    val stamp = File(target, ".apk-stamp")
    val lastUpdate = application.packageManager
        .getPackageInfo(application.packageName, 0)
        .lastUpdateTime
        .toString()
    if (stamp.exists() && stamp.readText() == lastUpdate) return
    target.deleteRecursively()
    target.mkdirs()
    val assets = application.assets
    assets.list("reader-fonts").orEmpty().forEach { name ->
        assets.open("reader-fonts/$name").use { input ->
            File(target, name).outputStream().use { input.copyTo(it) }
        }
    }
    stamp.writeText(lastUpdate)
}

// Android 12 and below never set TMPDIR (ActivityThread only gained the
// Os.setenv in 13/T, commit d5ccb038), so Swift Foundation falls back to
// /data/local/tmp, which apps cannot write; downloadTask then traps.
private fun configureSwiftTemporaryDirectory(cacheDirectory: File) {
    Os.setenv("TMPDIR", cacheDirectory.absolutePath, true)
}

private fun configureSwiftNetworking(filesDirectory: File) {
    val bundle = File(filesDirectory, "android-system-cacerts.pem")
    if (!bundle.exists()) {
        val certificates = File("/system/etc/security/cacerts")
            .listFiles()
            ?.sortedBy { it.name }
            .orEmpty()
        bundle.outputStream().buffered().use { output ->
            certificates.forEach { certificate ->
                certificate.inputStream().use { it.copyTo(output) }
                output.write('\n'.code)
            }
        }
    }
    // AndroidBootstrap adds another JNI runtime; CAINFO must be set before Swift loads.
    Os.setenv("URLSessionCertificateAuthorityInfoFile", bundle.absolutePath, true)
}
