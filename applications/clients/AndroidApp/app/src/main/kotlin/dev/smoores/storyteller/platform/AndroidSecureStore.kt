package dev.smoores.storyteller.platform

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.annotation.Keep
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Android implementation of StorytellerKit's secure-item facade. */
@Keep
class AndroidSecureStore(context: Context) {
    private val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance(keyStoreName).apply { load(null) }

    @Synchronized
    private fun storeValue(key: String, value: String): Boolean = runCatching {
        val cipher = Cipher.getInstance(transformation)
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val payload = listOf(cipher.iv, encrypted)
            .joinToString(separator = ".") { Base64.encodeToString(it, Base64.NO_WRAP) }
        preferences.edit().putString(key, payload).commit()
    }.getOrDefault(false)

    @Synchronized
    private fun loadValue(key: String): String {
        val payload = preferences.getString(key, null) ?: return ""
        return runCatching {
            val parts = payload.split('.', limit = 2)
            require(parts.size == 2)
            val initializationVector = Base64.decode(parts[0], Base64.NO_WRAP)
            val encrypted = Base64.decode(parts[1], Base64.NO_WRAP)
            val cipher = Cipher.getInstance(transformation)
            cipher.init(
                Cipher.DECRYPT_MODE,
                encryptionKey(),
                GCMParameterSpec(authenticationTagBits, initializationVector),
            )
            String(cipher.doFinal(encrypted), Charsets.UTF_8)
        }.getOrDefault("")
    }

    @Synchronized
    private fun containsValue(key: String): Boolean = preferences.contains(key)

    @Synchronized
    private fun removeValue(key: String): Boolean =
        preferences.edit().remove(key).commit()

    private fun encryptionKey(): SecretKey {
        (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, keyStoreName)
        generator.init(
            KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        @Volatile
        private var instance: AndroidSecureStore? = null

        @JvmStatic
        fun initialize(context: Context) {
            if (instance != null) return
            synchronized(this) {
                if (instance == null) {
                    instance = AndroidSecureStore(context.applicationContext)
                }
            }
        }

        @JvmStatic
        fun store(key: String, value: String): Boolean =
            instance?.storeValue(key, value) ?: false

        @JvmStatic
        fun load(key: String): String = instance?.loadValue(key).orEmpty()

        @JvmStatic
        fun contains(key: String): Boolean = instance?.containsValue(key) ?: false

        @JvmStatic
        fun remove(key: String): Boolean = instance?.removeValue(key) ?: false

        const val preferencesName = "storyteller_secure_items"
        const val keyStoreName = "AndroidKeyStore"
        const val keyAlias = "dev.smoores.storyteller.credentials"
        const val transformation = "AES/GCM/NoPadding"
        const val authenticationTagBits = 128
    }
}
