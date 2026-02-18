@file:OptIn(InternalReadiumApi::class)

package expo.modules.readium

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.PendingIntent.FLAG_IMMUTABLE
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import androidx.annotation.RequiresApi
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.exception.Exceptions
import kotlin.math.roundToLong
import androidx.core.net.toUri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaController
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import androidx.media3.session.SessionToken
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONArray
import org.json.JSONObject
import org.readium.r2.shared.InternalReadiumApi
import org.readium.r2.shared.extensions.toList
import org.readium.r2.shared.extensions.toMap
import org.readium.r2.shared.publication.Locator
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

data class Track(
    val uri: Uri,
    val bookUuid: String,
    val title: String,
    val duration: Double,
    val bookTitle: String,
    val author: String?,
    val coverUri: Uri?,
    val relativeUri: String,
    val narrator: String?,
    val mimeType: String
) {
    fun toJson(): Map<String, Any> {
        return mapOf(
            "bookUuid" to this.bookUuid,
            "uri" to this.uri.toString(),
            "title" to this.title,
            "duration" to this.duration,
            "bookTitle" to this.bookTitle,
            "author" to this.author,
            "coverUri" to this.coverUri.toString(),
            "relativeUri" to this.relativeUri,
            "narrator" to this.narrator,
            "mimeType" to this.mimeType
        ) as Map<String, Any>
    }

    companion object {
        fun fromJson(json: Map<String, Any?>): Track {
            return Track(
                bookUuid = json["bookUuid"]?.let { it as? String }
                    ?: throw Exception("Track missing required field: bookUuid"),
                uri = (json["uri"]?.let { it as? String }
                    ?: throw Exception("Track missing required field: uri")).toUri(),
                title = json["title"]?.let { it as? String }
                    ?: throw Exception("Track missing required field: title"),
                duration = json["duration"]?.let { it as? Double }
                    ?: throw Exception("Track missing required field: duration"),
                bookTitle = json["bookTitle"]?.let { it as? String }
                    ?: throw Exception("Track missing required field: bookTitle"),
                author = json["author"]?.let { it as? String },
                coverUri = (json["coverUri"]?.let { it as? String })?.toUri(),
                relativeUri = json["relativeUri"]?.let { it as? String }
                    ?: throw Exception("Track missing required field: relativeUri"),
                narrator = json["narrator"]?.let { it as? String },
                mimeType = json["mimeType"]?.let { it as? String }
                    ?: throw Exception("Track missing required field: mimeType")
            )
        }

        fun fromMediaItem(mediaItem: MediaItem): Track? {
            return Track(
                uri = mediaItem.localConfiguration?.uri ?: return null,
                relativeUri = mediaItem.mediaId,
                bookUuid = mediaItem.localConfiguration?.tag as? String ?: return null,
                title = mediaItem.mediaMetadata.title?.toString() ?: return null,
                bookTitle = mediaItem.mediaMetadata.albumTitle?.toString() ?: return null,
                author = mediaItem.mediaMetadata.artist?.toString(),
                narrator = mediaItem.mediaMetadata.composer?.toString(),
                duration = mediaItem.mediaMetadata.durationMs?.toDouble() ?: return null,
                mimeType = mediaItem.localConfiguration?.mimeType ?: return null,
                coverUri = mediaItem.mediaMetadata.artworkUri
            )
        }
    }
}

interface Listener : Player.Listener {
    fun onClipChanged(overlayPar: OverlayPar)
    fun onPositionChanged(position: Double)
    fun onTrackChanged(track: Track, position: Double)
}

val interruptionInterval = 5.minutes

@androidx.annotation.OptIn(UnstableApi::class)
class PlaybackService : MediaLibraryService() {
    private var mediaSession: MediaLibrarySession? = null
    private var player: ExoPlayer? = null
    private var mediaIdToClips = mapOf<String, List<OverlayPar>>()
    private var root = MediaItem.Builder()
        .setMediaId("root")
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setIsBrowsable(false)
                .setIsPlayable(false)
                .build()
        )
        .build()

    // Track connected automotive controllers for URI permission granting
    private val automotiveControllers = mutableSetOf<String>()

    // Grant URI permission for current track's artwork to automotive controllers
    private fun grantArtworkUriPermissions(artworkUri: Uri) {
        if (automotiveControllers.isEmpty()) return

        // Only grant for content:// URIs
        if (artworkUri.scheme != "content") return

        for (packageName in automotiveControllers) {
            try {
                grantUriPermission(
                    packageName,
                    artworkUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (e: Exception) {
                //
            }
        }
    }

    // Create your player and media session in the onCreate lifecycle event
    @RequiresApi(Build.VERSION_CODES.O)
    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                    .setUsage(C.USAGE_MEDIA)
                    .build(), true
            )
            // Pause when headphones disconnected
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .setSeekBackIncrementMs(1500)
            .setSeekForwardIncrementMs(1500)
            .setName("Storyteller")
            .build()

        mediaSession =
            with(
                MediaLibrarySession.Builder(this, player, getCallback())
            ) {
                setId(packageName)
                setMediaButtonPreferences(
                    listOf(
                        CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD)
                            .setDisplayName("Seek forward")
                            .setPlayerCommand(Player.COMMAND_SEEK_FORWARD)
                            .setSlots(CommandButton.SLOT_FORWARD)
                            .build(),
                        CommandButton.Builder(CommandButton.ICON_SKIP_BACK)
                            .setDisplayName("Seek back")
                            .setPlayerCommand(Player.COMMAND_SEEK_BACK)
                            .setSlots(CommandButton.SLOT_BACK)
                            .build(),
                        CommandButton.Builder(CommandButton.ICON_PREVIOUS)
                            .setDisplayName("Skip to previous")
                            .setPlayerCommand(Player.COMMAND_SEEK_TO_PREVIOUS)
                            .setSlots(CommandButton.SLOT_OVERFLOW)
                            .build(),
                        CommandButton.Builder(CommandButton.ICON_NEXT)
                            .setDisplayName("Skip to next")
                            .setPlayerCommand(Player.COMMAND_SEEK_TO_NEXT)
                            .setSlots(CommandButton.SLOT_OVERFLOW)
                            .build(),
                        // TODO: Add bookmark/highlight commands
                    )
                )
                packageManager?.getLaunchIntentForPackage(packageName)?.let { sessionIntent ->
                    sessionIntent.flags =
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                    sessionIntent.data = "storyteller://notification.click".toUri()
                    sessionIntent.action = Intent.ACTION_VIEW

                    setSessionActivity(
                        PendingIntent.getActivity(
                            this@PlaybackService,
                            0,
                            sessionIntent,
                            FLAG_IMMUTABLE
                        )
                    )
                }
                setMediaNotificationProvider(
                    DefaultMediaNotificationProvider.Builder(
                        this@PlaybackService
                    ).build()
                )
                build()
            }

        this.player = player
    }

    /** Called when swiping the activity away from recents. */
    override fun onTaskRemoved(rootIntent: Intent?) {
        // If the player is playing, trigger a pause so that the
        // app will save the position
        mediaSession?.run {
            if (player.isPlaying) {
                player.pause()
            }
        }
        super.onTaskRemoved(rootIntent)

        release()
        stopSelf()
    }

    // Remember to release the player and media session in onDestroy
    override fun onDestroy() {
        super.onDestroy()
        release()
    }

    private fun release() {
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? =
        mediaSession

    private fun sortClips(bookUuid: String) {
        val clips = BookService.getOverlayClips(bookUuid)
        val mediaIdToClipsMutable =
            mutableMapOf<String, MutableList<OverlayPar>>().withDefault { mutableListOf() }
        for (clip in clips) {
            val trackClips = mediaIdToClipsMutable.getValue(clip.audioResource)
            trackClips.add(clip)
            mediaIdToClipsMutable[clip.audioResource] = trackClips
        }
        mediaIdToClips = mediaIdToClipsMutable
    }

    @androidx.annotation.OptIn(UnstableApi::class)
    private fun scheduleMessages(mediaItem: MediaItem, index: Int) {
        val trackClips = mediaIdToClips[mediaItem.mediaId] ?: return

        trackClips.forEach { clip ->
            player?.createMessage { messageType, payload ->
                // Send custom command to notify clients about clip change
                val clip = payload as OverlayPar
                notifyClipChanged(clip)
            }?.apply {
                setPosition(index, (clip.start * 1000).roundToLong())
                setPayload(clip)
                setDeleteAfterDelivery(false)
                send()
            }
        }
    }

    private fun notifyClipChanged(clip: OverlayPar) {
        mediaSession?.broadcastCustomCommand(
            SessionCommand("CLIP_CHANGED", Bundle()),
            Bundle().apply {
                putString(
                    "clip", JSONObject(
                        mapOf(
                            "audioResource" to clip.audioResource,
                            "start" to clip.start,
                            "end" to clip.end,
                            "locator" to clip.locator.toJSON(),
                            "fragmentId" to clip.fragmentId,
                            "textResource" to clip.textResource
                        )
                    ).toString()
                )
            }
        )
    }

    private fun getCallback(): MediaLibrarySession.Callback {
        return object : MediaLibrarySession.Callback {
            override fun onGetLibraryRoot(
                session: MediaLibrarySession,
                browser: MediaSession.ControllerInfo,
                params: LibraryParams?
            ): ListenableFuture<LibraryResult<MediaItem>> {
                return Futures.immediateFuture(LibraryResult.ofItem(root, params))
            }

            override fun onGetChildren(
                session: MediaLibrarySession,
                browser: MediaSession.ControllerInfo,
                parentId: String,
                page: Int,
                pageSize: Int,
                params: LibraryParams?
            ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
                return Futures.immediateFuture(
                    LibraryResult.ofItemList(emptyList(), params)
                )
            }

            override fun onCustomCommand(
                session: MediaSession,
                controller: MediaSession.ControllerInfo,
                customCommand: SessionCommand,
                args: Bundle
            ): ListenableFuture<SessionResult> {
                val result = Futures.immediateFuture(
                    SessionResult(SessionResult.RESULT_SUCCESS)
                )
                when (customCommand.customAction) {
                    "TRACK_LOAD_STARTED" -> {
                        val trackCount = args.getInt("trackCount")
                        val bookUuid = args.getString("bookUuid") ?: return result

                        if (session.player.mediaItemCount == trackCount && trackCount > 0) {
                            sortClips(bookUuid)
                            for (i in 0..session.player.mediaItemCount - 1) {
                                val mediaItem = session.player.getMediaItemAt(i)

                                scheduleMessages(mediaItem, i)
                            }
                        } else {
                            session.player.addListener(object : Player.Listener {
                                override fun onTimelineChanged(
                                    timeline: Timeline,
                                    reason: Int
                                ) {
                                    if (session.player.mediaItemCount != trackCount || trackCount == 0) return

                                    session.player.removeListener(this)
                                    sortClips(bookUuid)
                                    for (i in 0..session.player.mediaItemCount - 1) {
                                        val mediaItem = session.player.getMediaItemAt(i)

                                        scheduleMessages(mediaItem, i)
                                        grantArtworkUriPermissions(
                                            mediaItem.mediaMetadata.artworkUri ?: continue
                                        )
                                    }
                                }
                            })
                        }

                    }
                }

                return result
            }

            override fun onConnect(
                session: MediaSession,
                controller: MediaSession.ControllerInfo
            ): MediaSession.ConnectionResult {
                val isAutomotiveController = session.isAutomotiveController(controller)
                val isAutoCompanionController =
                    session.isAutoCompanionController(controller)

                if (isAutomotiveController || isAutoCompanionController) {
                    automotiveControllers.add(controller.packageName)
                    val artworkUri = player?.currentMediaItem?.mediaMetadata?.artworkUri
                    if (artworkUri != null) {
                        grantArtworkUriPermissions(artworkUri)
                    }
                }

                val availableSessionCommands =
                    MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS.buildUpon()
                        .add(SessionCommand("TRACK_LOAD_STARTED", Bundle.EMPTY))
                        .build()

                val availablePlayerCommands =
                    MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS.buildUpon()
                        .add(Player.COMMAND_SEEK_BACK)
                        .add(Player.COMMAND_SEEK_FORWARD)
                        .add(Player.COMMAND_SEEK_TO_NEXT)
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                        .build()

                return MediaSession.ConnectionResult.accept(
                    availableSessionCommands,
                    availablePlayerCommands
                )
            }

            override fun onDisconnected(
                session: MediaSession,
                controller: MediaSession.ControllerInfo
            ) {
                automotiveControllers.remove(controller.packageName)
                super.onDisconnected(session, controller)
            }
        }
    }
}

@OptIn(ExperimentalTime::class)
class AudiobookPlayer(
    val appContext: AppContext,
    val listener: Listener
) : Player.Listener, MediaController.Listener {
    var bookUuid: String? = null
    var controller: MediaController? = null
    var relativeUriToIndex: Map<String, Int> = mapOf()
    var relativeUriToClips: Map<String, List<OverlayPar>> = mapOf()
    var audioProgressCollector: Job? = null

    private var automaticRewind = false
    private var afterInterruptionRewind = 0.0
    private var afterBreakRewind = 0.0
    private var lastPaused: Instant? = null

    @androidx.annotation.OptIn(UnstableApi::class)
    suspend fun loadTracks(tracks: List<Track>) {
        val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
        val sessionToken =
            SessionToken(context, ComponentName(context, PlaybackService::class.java))

        unload()

        val controllerFuture =
            MediaController.Builder(context, sessionToken).setListener(this).buildAsync()

        controllerFuture.addListener(
            {
                val controller = controllerFuture.get()
                this.controller = controller

                controller.addListener(listener)
                controller.addListener(this@AudiobookPlayer)

                val firstTrack = tracks.firstOrNull() ?: return@addListener
                val bookUuid = firstTrack.bookUuid
                this.bookUuid = bookUuid

                controller.sendCustomCommand(
                    SessionCommand("TRACK_LOAD_STARTED", Bundle.EMPTY),
                    Bundle().apply {
                        putInt("trackCount", tracks.size)
                        putString("bookUuid", bookUuid)
                    }
                )

                val clips = BookService.getOverlayClips(bookUuid)

                val relativeUriToClipsMutable =
                    mutableMapOf<String, MutableList<OverlayPar>>().withDefault { mutableListOf() }
                for (clip in clips) {
                    val trackClips = relativeUriToClipsMutable.getValue(clip.audioResource)
                    trackClips.add(clip)
                    relativeUriToClipsMutable[clip.audioResource] = trackClips
                }
                relativeUriToClips = relativeUriToClipsMutable

                val relativeUriToIndexMutable = mutableMapOf<String, Int>()
                tracks.forEachIndexed { index, track ->
                    val metadata = MediaMetadata.Builder().apply {
                        setTrackNumber(index + 1)
                        setTotalTrackCount(tracks.size)
                        setArtworkUri(track.coverUri)
                        setArtist(track.author)
                        setComposer(track.narrator)
                        setAlbumTitle(track.bookTitle)
                        setDurationMs(track.duration.roundToLong())
                        setTitle(track.title)
                        setExtras(Bundle().apply { putString("bookUuid", bookUuid) })
                    }.build()

                    val mediaItem =
                        MediaItem.Builder().apply {
                            setMediaId(track.relativeUri)
                            setUri(track.uri)
                            setMimeType(track.mimeType)
                            setMediaMetadata(metadata)
                        }.build()

                    controller.addMediaItem(mediaItem)
                    relativeUriToIndexMutable[track.relativeUri] = index
                }
                relativeUriToIndex = relativeUriToIndexMutable

                controller.prepare()
            },
            MoreExecutors.directExecutor()
        )

        controllerFuture.await()

        listener.onTrackChanged(getCurrentTrack() ?: return, getPosition())
    }

    fun getIsPlaying(): Boolean {
        val player = controller ?: return false
        return player.isPlaying
    }

    fun getPosition(): Double {
        val player = controller ?: return 0.0
        return player.currentPosition / 1000.0
    }

    fun getCurrentClip(): OverlayPar? {
        val track = getCurrentTrack() ?: return null
        val trackClips = relativeUriToClips[track.relativeUri] ?: return null
        return searchForClip(trackClips, getPosition())
    }

    fun getCurrentTrack(): Track? {
        val player = controller ?: return null
        val mediaItem = player.currentMediaItem ?: return null
        return getTrackFromMediaItem(mediaItem)
    }

    private fun getTrackFromMediaItem(item: MediaItem): Track? {
        return Track(
            uri = item.localConfiguration?.uri ?: return null,
            relativeUri = item.mediaId,
            bookUuid = item.mediaMetadata.extras?.getString("bookUuid") ?: return null,
            title = item.mediaMetadata.title?.toString() ?: return null,
            bookTitle = item.mediaMetadata.albumTitle?.toString() ?: return null,
            author = item.mediaMetadata.artist?.toString(),
            narrator = item.mediaMetadata.composer?.toString(),
            duration = item.mediaMetadata.durationMs?.toDouble() ?: return null,
            mimeType = item.localConfiguration?.mimeType ?: return null,
            coverUri = item.mediaMetadata.artworkUri
        )
    }

    fun getTracks(): List<Track> {
        val player = controller ?: return listOf()
        val tracks = mutableListOf<Track>()
        val count = player.mediaItemCount
        for (i in 0..count - 1) {
            val mediaItem = player.getMediaItemAt(i)
            val track = Track.fromMediaItem(mediaItem) ?: continue
            tracks.add(track)
        }
        return tracks
    }

    private fun emitClipChange(relativeUri: String, positionSeconds: Double) {
        val trackClips = relativeUriToClips[relativeUri] ?: return
        val currentClip = searchForClip(trackClips, positionSeconds)
        if (currentClip != null) {
            listener.onClipChanged(currentClip)
        }
    }

    fun play(automaticRewind: Boolean = true) {
        val player = controller ?: return
        if (automaticRewind && this.automaticRewind) {
            if (lastPaused?.let { it + interruptionInterval > Clock.System.now() } ?: false) {
                seekBy(-afterInterruptionRewind, true)
            } else {
                seekBy(-afterBreakRewind, true)
            }
        }
        player.play()

        val currentTrack = getCurrentTrack() ?: return
        val position = getPosition()

        emitClipChange(currentTrack.relativeUri, position)
    }

    fun pause() {
        val player = controller ?: return
        player.pause()
    }

    @androidx.annotation.OptIn(UnstableApi::class)
    fun seekBy(amount: Double, bounded: Boolean = false) {
        val player = controller ?: return

        val endPosition = getPosition() + amount
        val currentTrack = getCurrentTrack() ?: return

        if (endPosition < 0.0) {
            if (player.currentMediaItemIndex == 0 || bounded) {
                player.seekTo(0)
            } else {
                val seekToIndex = player.currentMediaItemIndex - 1
                val seekToItem = player.getMediaItemAt(seekToIndex)
                val seekToTrack = getTrackFromMediaItem(seekToItem) ?: return
                player.seekTo(
                    seekToIndex,
                    ((seekToTrack.duration + endPosition) * 1000).roundToLong()
                )
            }
        } else if (endPosition >= currentTrack.duration) {
            if (player.currentMediaItemIndex == player.mediaItemCount - 1 || bounded) {
                player.seekTo((currentTrack.duration * 1000).roundToLong())
            } else {
                player.seekTo(
                    player.currentMediaItemIndex + 1,
                    ((endPosition - currentTrack.duration) * 1000).roundToLong()
                )
            }
        } else {
            player.seekTo((endPosition * 1000).roundToLong())

            onPositionChanged(endPosition)
        }

        val track = getCurrentTrack() ?: return
        val position = getPosition()

        emitClipChange(track.relativeUri, position)
    }

    fun seekTo(relativeUri: String, position: Double, skipEmit: Boolean?) {
        val player = controller ?: return
        val currentTrack = getCurrentTrack()
        val index = relativeUriToIndex[relativeUri] ?: return
        player.seekTo(index, (position * 1000).roundToLong())

        if (currentTrack?.relativeUri.toString() == relativeUri) {
            onPositionChanged(position)
        }

        if (!(skipEmit ?: false)) {
            emitClipChange(relativeUri, position)
        }
    }

    fun skip(position: Double) {
        val player = controller ?: return
        player.seekTo((position * 1000).roundToLong())

        val currentTrack = getCurrentTrack() ?: return

        emitClipChange(currentTrack.relativeUri, position)
    }

    fun next() {
        val player = controller ?: return
        player.seekToNextMediaItem()

        val currentTrack = getCurrentTrack() ?: return
        val position = getPosition()

        emitClipChange(currentTrack.relativeUri, position)
    }

    fun prev() {
        val player = controller ?: return
        player.seekToPrevious()

        val currentTrack = getCurrentTrack() ?: return
        val position = getPosition()

        emitClipChange(currentTrack.relativeUri, position)
    }

    fun setRate(rate: Double) {
        val player = controller ?: return
        player.setPlaybackSpeed(rate.toFloat())
    }

    fun setAutomaticRewind(enabled: Boolean, afterInterruption: Double, afterBreak: Double) {
        this.automaticRewind = enabled
        this.afterInterruptionRewind = afterInterruption
        this.afterBreakRewind = afterBreak
    }

    fun unload() {
        audioProgressCollector?.cancel()
        audioProgressCollector = null
        controller?.run {
            removeMediaItems(0, mediaItemCount)
            release()
        }
        controller = null
        bookUuid = null
        relativeUriToClips = mapOf()
        relativeUriToIndex = mapOf()
    }


    fun onPositionChanged(position: Double) {
        listener.onPositionChanged(position)
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
        listener.onTrackChanged(getCurrentTrack() ?: return, getPosition())
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        val player = controller ?: return

        if (isPlaying) {
            audioProgressCollector = appContext.backgroundCoroutineScope.launch {
                audioProgress(player).collect {
                    listener.onPositionChanged(it / 1000.0)
                }
            }
        } else {
            audioProgressCollector?.cancel()
            audioProgressCollector = null

            lastPaused = Clock.System.now()
        }
    }

    override fun onCustomCommand(
        controller: MediaController,
        command: SessionCommand,
        args: Bundle
    ): ListenableFuture<SessionResult> {
        val result = Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        // TODO: Is this isPlaying check correct?
        if (command.customAction == "CLIP_CHANGED" && controller.isPlaying) {
            val clipData = args.getString("clip") ?: return result
            val clipMap = JSONObject(clipData).toMap()
            val clip = OverlayPar(
                clipMap["audioResource"] as String,
                clipMap["fragmentId"] as String,
                clipMap["textResource"] as String,
                clipMap["start"] as? Double ?: (clipMap["start"] as Int).toDouble(),
                clipMap["end"] as? Double ?: (clipMap["end"] as Int).toDouble(),
                Locator.fromJSON(JSONObject(clipMap["locator"] as Map<String, Any>))!!
            )
            listener.onClipChanged(clip)
        }
        return result
    }


    private fun audioProgress(player: Player) = flow {
        while (true) {
            val position = suspendCancellableCoroutine<Long> { continuation ->
                Handler(player.applicationLooper).post {
                    continuation.resume(player.currentPosition) { cause, _, _ -> }
                }
            }
            emit(position)
            // TODO: divide by playback speed
            delay(1000)
        }
    }
}

fun searchForClip(clips: List<OverlayPar>, position: Double): OverlayPar? {
    var startIndex = 0
    var endIndex = clips.size - 1
    while (startIndex <= endIndex) {
        val midIndex = (startIndex + endIndex) / 2
        val midItem = clips[midIndex]
        if (position < midItem.start) {
            endIndex = midIndex - 1
            continue
        }
        if (position >= midItem.end) {
            startIndex = midIndex + 1
            continue
        }
        return midItem
    }
    return null
}