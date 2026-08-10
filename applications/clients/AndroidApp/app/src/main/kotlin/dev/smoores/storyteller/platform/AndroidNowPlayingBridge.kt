package dev.smoores.storyteller.platform

import android.os.Handler
import android.os.Looper
import android.util.Base64
import androidx.annotation.Keep
import androidx.media3.common.Player
import dev.smoores.storyteller.bridge.StorytellerAndroidBridge
import org.json.JSONObject

/** Static primitive-only surface consumed by AndroidNowPlayingPresenter in Swift. */
@Keep
object AndroidNowPlayingBridge {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var artwork: ByteArray? = null
    private var player: AndroidNowPlayingSessionPlayer? = null

    /** Player to pass to a future MediaLibrarySession.Builder. */
    fun sessionPlayer(): Player {
        check(Looper.myLooper() == Looper.getMainLooper()) {
            "The MediaLibrarySession player must be created on the main looper"
        }
        return player()
    }

    @JvmStatic
    fun update(
        title: String,
        artist: String,
        albumTitle: String,
        durationSeconds: Double,
        elapsedSeconds: Double,
        playbackRate: Double,
        isPlaying: Boolean,
        artworkBase64: String,
        artworkChanged: Boolean,
    ) = onMain {
        if (artworkChanged) {
            artwork = artworkBase64.takeIf(String::isNotEmpty)?.let {
                Base64.decode(it, Base64.DEFAULT)
            }
        }
        player().update(
            AndroidNowPlayingSnapshot(
                title = title,
                artist = artist.takeIf(String::isNotEmpty),
                albumTitle = albumTitle.takeIf(String::isNotEmpty),
                durationSeconds = durationSeconds.takeIf { it >= 0.0 && it.isFinite() },
                elapsedSeconds = elapsedSeconds.takeIf { it >= 0.0 && it.isFinite() },
                playbackRate = playbackRate,
                isPlaying = isPlaying,
                artwork = artwork,
            ),
        )
    }

    @JvmStatic
    fun clear() = onMain {
        artwork = null
        player().clear()
    }

    @JvmStatic
    fun updateChapters(payload: String) = onMain {
        player().updateAudiobookState(payload.takeIf(String::isNotEmpty)?.let(::parseChapters))
    }

    internal fun parseChapters(payload: String): AndroidNowPlayingAudiobookState? {
        val json = runCatching { JSONObject(payload) }.getOrNull() ?: return null
        val entries = json.optJSONArray("chapters") ?: return null
        // Dropping an entry would shift every later index out of step with the
        // currentChapterIndex the sender computed, so a bad entry voids the lot.
        val chapters = (0 until entries.length()).map { index ->
            val entry = entries.optJSONObject(index) ?: return null
            val id = entry.stringOrNull("id") ?: return null
            AndroidNowPlayingChapter(
                id = id,
                title = entry.stringOrNull("title").orEmpty(),
                durationSeconds = entry.optDouble("duration", 0.0).takeIf(Double::isFinite) ?: 0.0,
            )
        }
        if (chapters.isEmpty()) return null
        return AndroidNowPlayingAudiobookState(
            currentChapterID = json.stringOrNull("currentChapterID"),
            currentChapterIndex = if (json.has("currentChapterIndex") &&
                !json.isNull("currentChapterIndex")
            ) {
                json.optInt("currentChapterIndex")
            } else {
                null
            },
            chapters = chapters,
        )
    }

    @JvmStatic
    fun configureCommands(
        token: String,
        skipForwardSeconds: Double,
        skipBackwardSeconds: Double,
        supportsChangePlaybackPosition: Boolean,
        supportsChangePlaybackRate: Boolean,
    ) = onMain {
        player().configureCommands(
            AndroidNowPlayingCommandConfiguration(
                token = token,
                skipForwardSeconds = skipForwardSeconds.nonnegativeOrZero(),
                skipBackwardSeconds = skipBackwardSeconds.nonnegativeOrZero(),
                supportsChangePlaybackPosition = supportsChangePlaybackPosition,
                supportsChangePlaybackRate = supportsChangePlaybackRate,
            ),
        )
    }

    @JvmStatic
    fun teardownCommands(token: String) = onMain {
        player().teardownCommands(token)
    }

    private fun player(): AndroidNowPlayingSessionPlayer = player ?: AndroidNowPlayingSessionPlayer(
        Looper.getMainLooper(),
        AndroidNowPlayingCommandSink { token, command, value, text ->
            StorytellerAndroidBridge.androidNowPlayingCommand(token, command, value, text)
        },
    ).also { player = it }

    private fun onMain(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            mainHandler.post(action)
        }
    }
}

private fun Double.nonnegativeOrZero(): Double =
    takeIf { it.isFinite() }?.coerceAtLeast(0.0) ?: 0.0

private fun JSONObject.stringOrNull(name: String): String? {
    if (!has(name) || isNull(name)) return null
    return optString(name).takeIf(String::isNotEmpty)
}
