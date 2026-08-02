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
        configureSwiftNetworking(filesDir)
    }
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
