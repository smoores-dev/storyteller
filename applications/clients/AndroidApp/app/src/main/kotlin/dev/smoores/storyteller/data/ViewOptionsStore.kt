package dev.smoores.storyteller.data

import android.content.Context
import android.content.SharedPreferences
import dev.smoores.storyteller.ui.LibraryViewOptions
import org.json.JSONObject

// Per-view grid options, keyed the way iOS keys its per-view AppStorage entries.
internal class ViewOptionsStore(context: Context) {
    private val preferences: SharedPreferences =
        context.getSharedPreferences("view_options", Context.MODE_PRIVATE)

    fun load(viewKey: String): LibraryViewOptions {
        val json = preferences.getString(viewKey, null) ?: return LibraryViewOptions()
        return runCatching {
            val obj = JSONObject(json)
            LibraryViewOptions(
                coverStyle = obj.optString("coverStyle", "auto"),
                coverSize = obj.optDouble("coverSize", 0.5).toFloat(),
                gridSpacing = obj.optString("gridSpacing", "cozy"),
                showReadaloudBadge = obj.optBoolean("showReadaloudBadge", true),
                showProgressBadge = obj.optBoolean("showProgressBadge", false),
                showOnItem = obj.optString("showOnItem", "auto"),
            )
        }.getOrDefault(LibraryViewOptions())
    }

    fun save(viewKey: String, options: LibraryViewOptions) {
        val json = JSONObject().apply {
            put("coverStyle", options.coverStyle)
            put("coverSize", options.coverSize.toDouble())
            put("gridSpacing", options.gridSpacing)
            put("showReadaloudBadge", options.showReadaloudBadge)
            put("showProgressBadge", options.showProgressBadge)
            put("showOnItem", options.showOnItem)
        }.toString()
        preferences.edit().putString(viewKey, json).apply()
    }
}
