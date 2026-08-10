package dev.smoores.storyteller.platform

import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

internal data class AndroidNowPlayingSnapshot(
    val title: String,
    val artist: String?,
    val albumTitle: String?,
    val durationSeconds: Double?,
    val elapsedSeconds: Double?,
    val playbackRate: Double,
    val isPlaying: Boolean,
    val artwork: ByteArray?,
)

internal data class AndroidNowPlayingCommandConfiguration(
    val token: String,
    val skipForwardSeconds: Double,
    val skipBackwardSeconds: Double,
    val supportsChangePlaybackPosition: Boolean,
    val supportsChangePlaybackRate: Boolean,
)

internal data class AndroidNowPlayingChapter(
    val id: String,
    val title: String,
    val durationSeconds: Double,
)

internal data class AndroidNowPlayingAudiobookState(
    val currentChapterID: String?,
    val currentChapterIndex: Int?,
    val chapters: List<AndroidNowPlayingChapter>,
)

internal fun interface AndroidNowPlayingCommandSink {
    fun send(token: String, command: String, value: Double, text: String)
}

/**
 * Kotlin/Media3 backend for AndroidNowPlayingPresenter, the Swift implementation
 * of StorytellerKit's NowPlayingPresenting protocol.
 *
 * Mirrors now-playing state into a Player for a future MediaLibrarySession and
 * routes its commands back to the Swift playback actor. Audio transport remains
 * owned by AndroidAudioPlayer and its ExoPlayer backend.
 */
@OptIn(UnstableApi::class)
internal class AndroidNowPlayingSessionPlayer(
    looper: Looper,
    private val commandSink: AndroidNowPlayingCommandSink,
) : SimpleBasePlayer(looper) {
    private var snapshot: AndroidNowPlayingSnapshot? = null
    private var commandConfiguration: AndroidNowPlayingCommandConfiguration? = null
    private var audiobookState: AndroidNowPlayingAudiobookState? = null

    fun update(snapshot: AndroidNowPlayingSnapshot) {
        requireApplicationThread()
        this.snapshot = snapshot
        invalidateState()
    }

    fun clear() {
        requireApplicationThread()
        snapshot = null
        audiobookState = null
        invalidateState()
    }

    fun updateAudiobookState(state: AndroidNowPlayingAudiobookState?) {
        requireApplicationThread()
        if (audiobookState == state) return
        audiobookState = state
        invalidateState()
    }

    fun configureCommands(configuration: AndroidNowPlayingCommandConfiguration) {
        requireApplicationThread()
        commandConfiguration = configuration
        invalidateState()
    }

    fun teardownCommands(token: String) {
        requireApplicationThread()
        if (commandConfiguration?.token != token) return
        commandConfiguration = null
        invalidateState()
    }

    override fun getState(): State {
        requireApplicationThread()
        val snapshot = snapshot
        val configuration = commandConfiguration
        val commands = availableCommands(snapshot != null, configuration)

        if (snapshot == null) {
            return State.Builder()
                .setAvailableCommands(commands)
                .setPlaybackState(Player.STATE_IDLE)
                .setPlayWhenReady(false, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
                .build()
        }

        val metadataBuilder = MediaMetadata.Builder()
            .setTitle(snapshot.title)
            .setArtist(snapshot.artist?.takeIf(String::isNotBlank))
            .setAlbumTitle(snapshot.albumTitle)
            .setIsPlayable(true)
            .setMediaType(MediaMetadata.MEDIA_TYPE_AUDIO_BOOK_CHAPTER)
        snapshot.artwork?.let {
            metadataBuilder.setArtworkData(it, MediaMetadata.PICTURE_TYPE_FRONT_COVER)
        }
        val metadata = metadataBuilder.build()
        val (playlist, currentMediaItemIndex) = chapterPlaylist(snapshot, metadata)

        return State.Builder()
            .setAvailableCommands(commands)
            .setPlaylist(playlist)
            .setCurrentMediaItemIndex(currentMediaItemIndex)
            .setContentPositionMs(snapshot.elapsedSeconds.secondsToMilliseconds())
            .setPlaybackParameters(PlaybackParameters(snapshot.normalizedRate().toFloat()))
            .setPlaybackState(Player.STATE_READY)
            .setPlayWhenReady(
                snapshot.isPlaying,
                Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST,
            )
            .setSeekForwardIncrementMs(configuration?.skipForwardSeconds.secondsToMilliseconds())
            .setSeekBackIncrementMs(configuration?.skipBackwardSeconds.secondsToMilliseconds())
            .build()
    }

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<Any> {
        val configuration = commandConfiguration ?: return immediateVoidFuture()
        snapshot = snapshot?.copy(isPlaying = playWhenReady)
        commandSink.send(
            configuration.token,
            if (playWhenReady) COMMAND_PLAY else COMMAND_PAUSE,
            0.0,
            "",
        )
        return immediateVoidFuture()
    }

    override fun handleSetMediaItems(
        mediaItems: List<MediaItem>,
        startIndex: Int,
        startPositionMs: Long,
    ): ListenableFuture<Any> = immediateVoidFuture()

    override fun handlePrepare(): ListenableFuture<Any> = immediateVoidFuture()

    override fun handleSeek(
        mediaItemIndex: Int,
        positionMs: Long,
        seekCommand: Int,
    ): ListenableFuture<Any> {
        val configuration = commandConfiguration ?: return immediateVoidFuture()
        // BasePlayer's local next/previous resolution runs against a snapshot
        // that lags the engine, so the gesture travels unresolved.
        when (seekCommand) {
            Player.COMMAND_SEEK_TO_NEXT -> {
                commandSink.send(configuration.token, COMMAND_NEXT_CHAPTER, 0.0, "")
                return immediateVoidFuture()
            }
            Player.COMMAND_SEEK_TO_PREVIOUS -> {
                commandSink.send(configuration.token, COMMAND_PREVIOUS_CHAPTER, 0.0, "")
                return immediateVoidFuture()
            }
            Player.COMMAND_SEEK_TO_MEDIA_ITEM -> {
                val state = audiobookState ?: return immediateVoidFuture()
                val target = presentedChapterIndices(state).getOrNull(mediaItemIndex)
                    ?: return immediateVoidFuture()
                val chapter = state.chapters.getOrNull(target) ?: return immediateVoidFuture()
                commandSink.send(
                    configuration.token,
                    COMMAND_SELECT_CHAPTER,
                    0.0,
                    chapter.id,
                )
                return immediateVoidFuture()
            }
        }
        snapshot = snapshot?.copy(elapsedSeconds = positionMs.coerceAtLeast(0L) / 1_000.0)

        when (seekCommand) {
            Player.COMMAND_SEEK_BACK -> commandSink.send(
                configuration.token,
                COMMAND_SKIP_BACKWARD,
                configuration.skipBackwardSeconds,
                "",
            )
            Player.COMMAND_SEEK_FORWARD -> commandSink.send(
                configuration.token,
                COMMAND_SKIP_FORWARD,
                configuration.skipForwardSeconds,
                "",
            )
            Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM -> commandSink.send(
                configuration.token,
                COMMAND_CHANGE_POSITION,
                positionMs.coerceAtLeast(0L) / 1_000.0,
                "",
            )
        }
        return immediateVoidFuture()
    }

    override fun handleSetPlaybackParameters(
        playbackParameters: PlaybackParameters,
    ): ListenableFuture<Any> {
        val configuration = commandConfiguration ?: return immediateVoidFuture()
        snapshot = snapshot?.copy(playbackRate = playbackParameters.speed.toDouble())
        commandSink.send(
            configuration.token,
            COMMAND_CHANGE_RATE,
            playbackParameters.speed.toDouble(),
            "",
        )
        return immediateVoidFuture()
    }

    private fun availableCommands(
        hasSnapshot: Boolean,
        configuration: AndroidNowPlayingCommandConfiguration?,
    ): Player.Commands {
        val commands = Player.Commands.Builder()
            .add(Player.COMMAND_GET_CURRENT_MEDIA_ITEM)
            .add(Player.COMMAND_GET_METADATA)
            .add(Player.COMMAND_GET_TIMELINE)
            // The MediaLibrarySession callback resolves and prepares selected
            // Storyteller books before these no-op mirror-player operations run.
            .add(Player.COMMAND_SET_MEDIA_ITEM)
            .add(Player.COMMAND_PREPARE)

        if (hasSnapshot && configuration != null) {
            commands
                .add(Player.COMMAND_PLAY_PAUSE)
                .add(Player.COMMAND_SEEK_BACK)
                .add(Player.COMMAND_SEEK_FORWARD)
            if (configuration.supportsChangePlaybackPosition) {
                commands.add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
            }
            if (configuration.supportsChangePlaybackRate) {
                commands.add(Player.COMMAND_SET_SPEED_AND_PITCH)
            }
            if ((audiobookState?.chapters?.size ?: 0) > 1) {
                chapterSeekCommands.forEach(commands::add)
            }
        }
        return commands.build()
    }

    private fun chapterPlaylist(
        snapshot: AndroidNowPlayingSnapshot,
        nowPlayingMetadata: MediaMetadata,
    ): Pair<List<MediaItemData>, Int> {
        val audiobookState = audiobookState
        if (audiobookState == null || audiobookState.chapters.isEmpty()) {
            val mediaItem = MediaItem.Builder()
                .setMediaId(NOW_PLAYING_MEDIA_ID)
                .setMediaMetadata(nowPlayingMetadata)
                .build()
            val mediaItemData = MediaItemData.Builder(NOW_PLAYING_MEDIA_ID)
                .setMediaItem(mediaItem)
                .setMediaMetadata(nowPlayingMetadata)
                .setDurationUs(snapshot.durationSeconds.secondsToMicrosecondsOrUnset())
                .setIsSeekable(commandConfiguration?.supportsChangePlaybackPosition == true)
                .build()
            return listOf(mediaItemData) to 0
        }

        val currentIndex = currentChapterIndex(audiobookState)
        val windowStart = (currentIndex - 1).coerceAtLeast(0)
        val playlist = presentedChapterIndices(audiobookState).map { index ->
            val chapter = audiobookState.chapters[index]
            val title = if (index < windowStart) {
                "Previous · ${chapter.title}"
            } else {
                chapter.title
            }
            val chapterMetadata = MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(snapshot.title)
                .setAlbumTitle(snapshot.albumTitle)
                .setIsPlayable(true)
                .setMediaType(MediaMetadata.MEDIA_TYPE_AUDIO_BOOK_CHAPTER)
                .build()
            val playbackMetadata =
                if (index == currentIndex) nowPlayingMetadata else chapterMetadata
            val mediaID = "$NOW_PLAYING_CHAPTER_PREFIX$index"
            MediaItemData.Builder(mediaID)
                .setMediaItem(
                    MediaItem.Builder()
                        .setMediaId(mediaID)
                        .setMediaMetadata(chapterMetadata)
                        .build(),
                )
                .setMediaMetadata(playbackMetadata)
                .setDurationUs(chapter.durationSeconds.secondsToMicrosecondsOrUnset())
                .setIsSeekable(commandConfiguration?.supportsChangePlaybackPosition == true)
                .build()
        }
        return playlist to (currentIndex - windowStart)
    }

    // Android Auto opens the queue at the top with no scroll-to-active API, so
    // the playlist starts one chapter before the active one and earlier
    // chapters wrap around to the end.
    private fun presentedChapterIndices(state: AndroidNowPlayingAudiobookState): List<Int> {
        val windowStart = (currentChapterIndex(state) - 1).coerceAtLeast(0)
        return (windowStart until state.chapters.size) + (0 until windowStart)
    }

    private fun currentChapterIndex(state: AndroidNowPlayingAudiobookState): Int =
        state.currentChapterID
            ?.let { currentID -> state.chapters.indexOfFirst { it.id == currentID } }
            ?.takeIf { it >= 0 }
            ?: state.currentChapterIndex?.takeIf(state.chapters.indices::contains)
            ?: 0

    private fun requireApplicationThread() {
        check(Looper.myLooper() == applicationLooper) {
            "AndroidNowPlayingSessionPlayer must be accessed on its application looper"
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun immediateVoidFuture(): ListenableFuture<Any> =
        Futures.immediateVoidFuture() as ListenableFuture<Any>

    companion object {
        private const val NOW_PLAYING_MEDIA_ID = "storyteller-now-playing"
        private const val NOW_PLAYING_CHAPTER_PREFIX = "storyteller-now-playing-chapter-"

        val chapterSeekCommands = listOf(
            Player.COMMAND_SEEK_TO_MEDIA_ITEM,
            Player.COMMAND_SEEK_TO_NEXT,
            Player.COMMAND_SEEK_TO_PREVIOUS,
        )

        const val COMMAND_PLAY = "play"
        const val COMMAND_PAUSE = "pause"
        const val COMMAND_SKIP_FORWARD = "skipForward"
        const val COMMAND_SKIP_BACKWARD = "skipBackward"
        const val COMMAND_CHANGE_POSITION = "changePlaybackPosition"
        const val COMMAND_CHANGE_RATE = "changePlaybackRate"
        const val COMMAND_SELECT_CHAPTER = "selectChapter"
        const val COMMAND_NEXT_CHAPTER = "nextChapter"
        const val COMMAND_PREVIOUS_CHAPTER = "previousChapter"
    }
}

private fun AndroidNowPlayingSnapshot.normalizedRate(): Double =
    playbackRate.takeIf { it.isFinite() && it > 0.0 } ?: 1.0

private fun Double?.secondsToMilliseconds(): Long =
    this?.takeIf { it.isFinite() }?.coerceAtLeast(0.0)?.times(1_000.0)?.toLong() ?: 0L

@OptIn(UnstableApi::class)
private fun Double?.secondsToMicrosecondsOrUnset(): Long =
    this?.takeIf { it.isFinite() && it >= 0.0 }?.times(C.MICROS_PER_SECOND)?.toLong()
        ?: C.TIME_UNSET
