package dev.smoores.storyteller.data

import android.content.Context

class BrowserLoginStore(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences("browser_login", Context.MODE_PRIVATE)

    fun load(): String? = preferences.getString(serverURLKey, null)

    fun save(serverURL: String) {
        preferences.edit().putString(serverURLKey, serverURL).apply()
    }

    fun clear() {
        preferences.edit().remove(serverURLKey).apply()
    }

    private companion object {
        const val serverURLKey = "pendingServerURL"
    }
}
