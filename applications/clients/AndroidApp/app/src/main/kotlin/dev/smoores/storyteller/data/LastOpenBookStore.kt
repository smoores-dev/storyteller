package dev.smoores.storyteller.data

import android.content.Context
import dev.smoores.storyteller.model.BookID
import org.json.JSONObject

data class LastOpenBookRoute(
    val bookID: BookID,
    val mode: String,
)

class LastOpenBookStore(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences("last_open_book", Context.MODE_PRIVATE)

    fun load(): LastOpenBookRoute? {
        val raw = preferences.getString(routeKey, null) ?: return null
        return runCatching {
            val route = JSONObject(raw)
            LastOpenBookRoute(
                bookID = BookID(
                    sourceID = route.getString("sourceID"),
                    uuid = route.getString("uuid"),
                ),
                mode = route.getString("mode"),
            )
        }.getOrNull()
    }

    fun save(bookID: BookID, mode: String) {
        val route = JSONObject().apply {
            put("sourceID", bookID.sourceID)
            put("uuid", bookID.uuid)
            put("mode", mode)
        }
        preferences.edit().putString(routeKey, route.toString()).apply()
    }

    fun clear() {
        preferences.edit().remove(routeKey).apply()
    }

    private companion object {
        const val routeKey = "route"
    }
}
