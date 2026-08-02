package dev.smoores.storyteller.platform

import android.content.Context
import android.net.Uri
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import java.io.File

/**
 * Kotlin/Media3 backend for AndroidAudioPlayer, the Swift implementation of
 * StorytellerKit's AudioPlaying protocol.
 *
 * Owns one ExoPlayer and translates local-file transport operations and player
 * events. Book, chapter, progress, and now-playing orchestration remain in
 * StorytellerKit.
 */
internal class ExoAudioPlayer(
    context: Context,
    private val callback: Callback,
) : Player.Listener {
    interface Callback {
        fun loadDidComplete(loadID: String, durationSeconds: Double, error: String)
        fun playerEvent(loadID: String, event: String, flag: Boolean)
    }

    private val player: ExoPlayer = ExoPlayer.Builder(context)
        .setRenderersFactory(
            DefaultRenderersFactory(context)
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON),
        )
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .build(),
            true,
        )
        .setHandleAudioBecomingNoisy(true)
        .setWakeMode(C.WAKE_MODE_LOCAL)
        .build()

    private var activeLoadID: String? = null
    private var pendingLoadID: String? = null
    private var didReportEnd = false

    init {
        player.addListener(this)
    }

    val applicationLooper: Looper
        get() = player.applicationLooper

    fun load(loadID: String, localPath: String) {
        requirePlayerThread()
        cancelPendingLoad("Audio load was replaced")
        activeLoadID = null
        didReportEnd = false
        player.pause()
        player.stop()
        player.clearMediaItems()

        val file = File(localPath)
        if (!file.isFile) {
            callback.loadDidComplete(loadID, 0.0, "Audio file does not exist: $localPath")
            return
        }

        activeLoadID = loadID
        pendingLoadID = loadID
        didReportEnd = false

        player.setMediaItem(
            MediaItem.Builder()
                .setMediaId(loadID)
                .setUri(Uri.fromFile(file))
                .build(),
        )
        player.prepare()
    }

    fun play() {
        requirePlayerThread()
        player.play()
        // A paused seek can put ExoPlayer in ENDED without representing a
        // completed playback. Deliver that deferred EOF when playback resumes.
        if (player.playbackState == Player.STATE_ENDED) reportEndOnce()
    }

    fun pause() {
        requirePlayerThread()
        player.pause()
    }

    fun stop() {
        requirePlayerThread()
        cancelPendingLoad("Audio load was stopped")
        activeLoadID = null
        didReportEnd = false
        player.stop()
        player.clearMediaItems()
    }

    fun seek(seconds: Double) {
        requirePlayerThread()
        didReportEnd = false
        player.seekTo(seconds.secondsToMilliseconds())
    }

    fun currentTimeSeconds(): Double {
        requirePlayerThread()
        return player.currentPosition.millisecondsToSeconds()
    }

    fun durationSeconds(): Double {
        requirePlayerThread()
        return player.duration.takeUnless { it == C.TIME_UNSET }
            ?.millisecondsToSeconds()
            ?: 0.0
    }

    fun setRate(rate: Double) {
        requirePlayerThread()
        val normalizedRate = rate.takeIf { it.isFinite() && it > 0.0 } ?: 1.0
        player.playbackParameters = PlaybackParameters(normalizedRate.toFloat())
    }

    fun setVolume(volume: Double) {
        requirePlayerThread()
        val normalizedVolume = volume.takeIf(Double::isFinite)?.coerceIn(0.0, 1.0) ?: 1.0
        player.volume = normalizedVolume.toFloat()
    }

    fun release() {
        requirePlayerThread()
        cancelPendingLoad("Audio player was released")
        activeLoadID = null
        player.removeListener(this)
        player.release()
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
        requirePlayerThread()
        when (playbackState) {
            Player.STATE_READY -> completePendingLoad()
            Player.STATE_ENDED -> reportEndOnce()
        }
    }

    override fun onPlayerError(error: PlaybackException) {
        requirePlayerThread()
        val loadID = pendingLoadID ?: return
        pendingLoadID = null
        activeLoadID = null
        callback.loadDidComplete(loadID, 0.0, error.message ?: "ExoPlayer load failed")
    }

    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
        requirePlayerThread()
        if (playWhenReady) return
        val loadID = activeLoadID ?: return

        when (reason) {
            Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY ->
                callback.playerEvent(loadID, EVENT_ROUTE_CHANGED, true)
            Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS ->
                callback.playerEvent(loadID, EVENT_INTERRUPTION_BEGAN, false)
        }
    }

    private fun completePendingLoad() {
        val loadID = pendingLoadID ?: return
        if (loadID != activeLoadID) return
        pendingLoadID = null
        callback.loadDidComplete(loadID, durationSeconds(), "")
    }

    private fun reportEndOnce() {
        val loadID = activeLoadID ?: return
        if (!player.playWhenReady || didReportEnd || pendingLoadID != null) return
        didReportEnd = true
        callback.playerEvent(loadID, EVENT_FINISHED, false)
    }

    private fun cancelPendingLoad(message: String) {
        val loadID = pendingLoadID ?: return
        pendingLoadID = null
        callback.loadDidComplete(loadID, 0.0, message)
    }

    private fun requirePlayerThread() {
        check(Looper.myLooper() == applicationLooper) {
            "ExoAudioPlayer must be accessed on its application looper"
        }
    }

    companion object {
        const val EVENT_FINISHED = "finished"
        const val EVENT_INTERRUPTION_BEGAN = "interruptionBegan"
        const val EVENT_ROUTE_CHANGED = "routeChanged"
    }
}

private fun Double.secondsToMilliseconds(): Long =
    takeIf { it.isFinite() }?.coerceAtLeast(0.0)?.times(1_000.0)?.toLong() ?: 0L

private fun Long.millisecondsToSeconds(): Double = coerceAtLeast(0L) / 1_000.0
