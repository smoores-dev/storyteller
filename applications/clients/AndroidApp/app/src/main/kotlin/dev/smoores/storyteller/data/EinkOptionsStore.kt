package dev.smoores.storyteller.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

// Device-local hardware tweaks; intentionally kept out of the synced global
// config so one device's eink settings never travel to another.
internal data class EinkOptions(
    val optimizeRefresh: Boolean = true,
    val coverScreensaver: Boolean = false,
)

internal class EinkOptionsStore(context: Context) {
    private val preferences: SharedPreferences =
        context.getSharedPreferences("eink_options", Context.MODE_PRIVATE)

    fun load(): EinkOptions {
        val json = preferences.getString(KEY, null) ?: return EinkOptions()
        return runCatching {
            val obj = JSONObject(json)
            EinkOptions(
                optimizeRefresh = obj.optBoolean("optimizeRefresh", true),
                coverScreensaver = obj.optBoolean("coverScreensaver", false),
            )
        }.getOrDefault(EinkOptions())
    }

    fun save(options: EinkOptions) {
        val json = JSONObject().apply {
            put("optimizeRefresh", options.optimizeRefresh)
            put("coverScreensaver", options.coverScreensaver)
        }.toString()
        preferences.edit().putString(KEY, json).apply()
    }

    private companion object {
        const val KEY = "options"
    }
}
