package dev.smoores.storyteller.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

internal const val AUTO_UI_SCALE = 0f

// Device-local display tweaks; intentionally kept out of the synced global
// config so one device's scale never travels to another.
internal data class DisplayOptions(
    val uiScale: Float = AUTO_UI_SCALE,
    val volumeKeyPageTurn: Boolean = false,
)

internal class DisplayOptionsStore(context: Context) {
    private val preferences: SharedPreferences =
        context.getSharedPreferences("display_options", Context.MODE_PRIVATE)

    fun load(): DisplayOptions {
        val json = preferences.getString(KEY, null) ?: return DisplayOptions()
        return runCatching {
            val stored = JSONObject(json)
            DisplayOptions(
                uiScale = stored.optDouble("uiScale", AUTO_UI_SCALE.toDouble()).toFloat(),
                volumeKeyPageTurn = stored.optBoolean("volumeKeyPageTurn", false),
            )
        }.getOrDefault(DisplayOptions())
    }

    fun save(options: DisplayOptions) {
        val json = JSONObject().apply {
            put("uiScale", options.uiScale.toDouble())
            put("volumeKeyPageTurn", options.volumeKeyPageTurn)
        }.toString()
        preferences.edit().putString(KEY, json).apply()
    }

    private companion object {
        const val KEY = "options"
    }
}
