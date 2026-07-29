package dev.smoores.storyteller.platform

import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionError
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import dev.smoores.storyteller.MainActivity
import dev.smoores.storyteller.R
import dev.smoores.storyteller.bridge.StorytellerBridgeClient
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.BookID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import kotlin.math.abs
import kotlin.math.roundToInt

/** Hosts Storyteller's now-playing Player and downloaded audio catalog for Android Auto. */
@OptIn(UnstableApi::class)
class StorytellerMediaLibraryService : MediaLibraryService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val bootstrapMutex = Mutex()
    private var session: MediaLibrarySession? = null
    private var bootstrapped = false
    private lateinit var client: StorytellerBridgeClient

    private val buttonPreferencesListener = object : Player.Listener {
        override fun onPlaybackParametersChanged(playbackParameters: PlaybackParameters) {
            refreshMediaButtonPreferences()
        }

        override fun onAvailableCommandsChanged(availableCommands: Player.Commands) {
            refreshMediaButtonPreferences()
        }

        override fun onTimelineChanged(timeline: Timeline, reason: Int) {
            refreshMediaButtonPreferences()
        }
    }

    private fun refreshMediaButtonPreferences() {
        val session = session ?: return
        session.setMediaButtonPreferences(mediaButtonPreferences(session.player))
    }

    override fun onCreate() {
        super.onCreate()
        client = StorytellerBridgeClient(applicationContext)
        val sessionActivity = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val player = AndroidNowPlayingBridge.sessionPlayer()
        session = MediaLibrarySession.Builder(this, player, libraryCallback)
            .setSessionActivity(sessionActivity)
            .setMediaButtonPreferences(mediaButtonPreferences(player))
            .setPeriodicPositionUpdateEnabled(false)
            .build()
        player.addListener(buttonPreferencesListener)
        serviceScope.launch {
            runCatching { client.observeLibraryChanges(::onCatalogChanged) }
        }
    }

    private fun onCatalogChanged() {
        mainHandler.post {
            val session = session ?: return@post
            session.notifyChildrenChanged(ROOT_MEDIA_ID, Int.MAX_VALUE, null)
            AutoCategory.entries.forEach { category ->
                session.notifyChildrenChanged(category.folderId, Int.MAX_VALUE, null)
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? =
        session

    override fun onDestroy() {
        session?.player?.removeListener(buttonPreferencesListener)
        session?.release()
        session = null
        client.close()
        serviceScope.cancel()
        super.onDestroy()
    }

    private val libraryCallback = object : MediaLibrarySession.Callback {
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): MediaSession.ConnectionResult {
            val sessionCommands =
                MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS
                    .buildUpon()
                    .add(cyclePlaybackRateCommand)
                    .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(sessionCommands)
                .build()
        }

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(LibraryResult.ofItem(rootMediaItem, params))

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            if (parentId == ROOT_MEDIA_ID) {
                return Futures.immediateFuture(
                    LibraryResult.ofItemList(
                        AutoCategory.entries.map(AutoCategory::folderItem)
                            .requestedPage(page, pageSize),
                        params,
                    ),
                )
            }
            val category = AutoCategory.forFolderId(parentId)
                ?: return Futures.immediateFuture(
                    LibraryResult.ofError(SessionError.ERROR_BAD_VALUE, params),
                )
            return serviceFuture {
                LibraryResult.ofItemList(
                    bookMediaItems(downloadedBooks(category), category)
                        .requestedPage(page, pageSize),
                    params,
                )
            }
        }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String,
        ): ListenableFuture<LibraryResult<MediaItem>> {
            if (mediaId == ROOT_MEDIA_ID) {
                return Futures.immediateFuture(LibraryResult.ofItem(rootMediaItem, null))
            }
            AutoCategory.forFolderId(mediaId)?.let {
                return Futures.immediateFuture(LibraryResult.ofItem(it.folderItem, null))
            }
            return serviceFuture {
                val book = resolveBook(mediaId)
                if (book == null) {
                    LibraryResult.ofError(SessionError.ERROR_BAD_VALUE)
                } else {
                    LibraryResult.ofItem(bookMediaItem(book.first, book.second), null)
                }
            }
        }

        override fun onSetMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: List<MediaItem>,
            startIndex: Int,
            startPositionMs: Long,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> =
            serviceFuture {
                val requestedID = mediaItems.singleOrNull()?.mediaId
                    ?: throw IllegalArgumentException("Expected one Storyteller book")
                val (book, category) = resolveBook(requestedID)
                    ?: throw IllegalArgumentException("Book is not downloaded: $requestedID")

                client.openHeadlessPlayback(book.id, category.mediaCategory)
                awaitPlaybackCommands()
                MediaSession.MediaItemsWithStartPosition(
                    listOf(bookMediaItem(book, category)),
                    0,
                    0L,
                )
            }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle,
        ): ListenableFuture<SessionResult> {
            if (customCommand.customAction != CYCLE_PLAYBACK_RATE_ACTION) {
                return Futures.immediateFuture(
                    SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED),
                )
            }
            return serviceFuture {
                ensureBootstrapped()
                client.cyclePlaybackRate()
                SessionResult(SessionResult.RESULT_SUCCESS)
            }
        }
    }

    private suspend fun resolveBook(mediaId: String): Pair<Book, AutoCategory>? {
        val (category, bookID) = parseBookMediaId(mediaId) ?: return null
        val book = downloadedBooks(category).firstOrNull { it.id == bookID } ?: return null
        return book to category
    }

    private suspend fun downloadedBooks(category: AutoCategory): List<Book> {
        ensureBootstrapped()
        return client.librarySnapshot(refresh = false).books
            .filter(category::includes)
            .sortedWith(
                compareByDescending<Book> { it.sortLastRead }
                    .thenBy(String.CASE_INSENSITIVE_ORDER) { it.title }
                    .thenBy { it.id.uuid },
            )
    }

    private suspend fun bookMediaItems(
        books: List<Book>,
        category: AutoCategory,
    ): List<MediaItem> = coroutineScope {
        books.map { book -> async { bookMediaItem(book, category) } }.awaitAll()
    }

    private suspend fun bookMediaItem(book: Book, category: AutoCategory): MediaItem {
        val metadata = MediaMetadata.Builder()
            .setTitle(book.title)
            .setArtist(book.authors.takeIf(String::isNotBlank))
            .setIsBrowsable(false)
            .setIsPlayable(true)
            .setMediaType(MediaMetadata.MEDIA_TYPE_AUDIO_BOOK)
        coverArtworkBytes(book)?.let { bytes ->
            metadata.setArtworkData(bytes, MediaMetadata.PICTURE_TYPE_FRONT_COVER)
        }
        return MediaItem.Builder()
            .setMediaId(bookMediaId(book, category))
            .setMediaMetadata(metadata.build())
            .build()
    }

    private suspend fun coverArtworkBytes(book: Book): ByteArray? {
        val bitmap = runCatching {
            client.cover(book, audio = true, width = COVER_ART_SIZE, height = COVER_ART_SIZE)
                ?: client.cover(book, audio = false, width = COVER_ART_SIZE, height = COVER_ART_SIZE)
        }.getOrNull() ?: return null
        val output = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, output)
        return output.toByteArray()
    }

    private suspend fun ensureBootstrapped() {
        if (bootstrapped) return
        bootstrapMutex.withLock {
            if (!bootstrapped) {
                client.bootstrap()
                bootstrapped = true
            }
        }
    }

    private suspend fun awaitPlaybackCommands() {
        // Swift's presenter posts its configure/update calls to this looper.
        // This barrier makes them visible before Media3 evaluates its follow-up play.
        suspendCancellableCoroutine { continuation ->
            mainHandler.post {
                if (continuation.isActive) continuation.resume(Unit)
            }
        }
        check(session?.player?.isCommandAvailable(Player.COMMAND_PLAY_PAUSE) == true) {
            "Storyteller playback commands were not installed"
        }
    }

    private fun <T> serviceFuture(operation: suspend () -> T): ListenableFuture<T> {
        val future = SettableFuture.create<T>()
        serviceScope.launch {
            try {
                future.set(operation())
            } catch (_: CancellationException) {
                future.cancel(false)
            } catch (error: Throwable) {
                future.setException(error)
            }
        }
        return future
    }

    private val speedIcons: List<Pair<Int, Int>> by lazy {
        val hundredths = resources.getIntArray(R.array.speed_icon_hundredths)
        val drawables = resources.obtainTypedArray(R.array.speed_icon_drawables)
        try {
            hundredths.mapIndexed { index, value ->
                value to drawables.getResourceId(index, 0)
            }
        } finally {
            drawables.recycle()
        }
    }

    private fun speedIconButton(playbackRate: Double): CommandButton.Builder {
        val hundredths = (playbackRate * 100).roundToInt()
        val iconResId = speedIcons
            .minByOrNull { abs(it.first - hundredths) }
            ?.second
            ?.takeIf { it != 0 }
            ?: return CommandButton.Builder(CommandButton.ICON_PLAYBACK_SPEED)
        return CommandButton.Builder(CommandButton.ICON_UNDEFINED).setCustomIconResId(iconResId)
    }

    private fun mediaButtonPreferences(player: Player): List<CommandButton> = buildList {
        add(
            CommandButton.Builder(CommandButton.ICON_SKIP_BACK_15)
                .setDisplayName("Back 15 seconds")
                .setPlayerCommand(Player.COMMAND_SEEK_BACK)
                .build(),
        )
        add(
            CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD_15)
                .setDisplayName("Forward 15 seconds")
                .setPlayerCommand(Player.COMMAND_SEEK_FORWARD)
                .build(),
        )
        if (player.isCommandAvailable(Player.COMMAND_PLAY_PAUSE)) {
            add(
                speedIconButton(player.playbackParameters.speed.toDouble())
                    .setDisplayName("Playback speed")
                    .setSessionCommand(cyclePlaybackRateCommand)
                    .setSlots(CommandButton.SLOT_OVERFLOW)
                    .build(),
            )
        }
    }

    private companion object {
        const val CYCLE_PLAYBACK_RATE_ACTION =
            "dev.smoores.storyteller.action.CYCLE_PLAYBACK_RATE"
        val cyclePlaybackRateCommand = SessionCommand(CYCLE_PLAYBACK_RATE_ACTION, Bundle.EMPTY)
    }
}

private enum class AutoCategory(
    val folderId: String,
    val mediaCategory: String,
    val owner: String,
    val title: String,
) {
    READALOUD("storyteller-readalouds", "synced", "readaloud", "Readalouds"),
    AUDIOBOOK("storyteller-audiobooks", "audio", "audiobook", "Audiobooks");

    fun includes(book: Book): Boolean = book.playbackOwner == owner

    val folderItem: MediaItem by lazy {
        MediaItem.Builder()
            .setMediaId(folderId)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_AUDIO_BOOKS)
                    .build(),
            )
            .build()
    }

    companion object {
        fun forFolderId(id: String): AutoCategory? = entries.firstOrNull { it.folderId == id }

        fun forMediaCategory(category: String): AutoCategory? =
            entries.firstOrNull { it.mediaCategory == category }
    }
}

private const val ROOT_MEDIA_ID = "storyteller-root"
private const val MEDIA_ID_SCHEME = "storyteller"
private const val COVER_ART_SIZE = 256

private val rootMediaItem: MediaItem = MediaItem.Builder()
    .setMediaId(ROOT_MEDIA_ID)
    .setMediaMetadata(
        MediaMetadata.Builder()
            .setTitle("Storyteller")
            .setIsBrowsable(true)
            .setIsPlayable(false)
            .build(),
    )
    .build()

private fun bookMediaId(book: Book, category: AutoCategory): String =
    Uri.Builder()
        .scheme(MEDIA_ID_SCHEME)
        .authority(category.mediaCategory)
        .appendPath(book.id.sourceID)
        .appendPath(book.id.uuid)
        .build()
        .toString()

private fun parseBookMediaId(mediaId: String): Pair<AutoCategory, BookID>? {
    val uri = Uri.parse(mediaId)
    if (uri.scheme != MEDIA_ID_SCHEME) return null
    val category = uri.authority?.let(AutoCategory::forMediaCategory) ?: return null
    val segments = uri.pathSegments
    if (segments.size != 2 || segments.any(String::isBlank)) return null
    return category to BookID(sourceID = segments[0], uuid = segments[1])
}

private fun <T> List<T>.requestedPage(page: Int, pageSize: Int): List<T> {
    if (page < 0 || pageSize <= 0) return emptyList()
    val start = page.toLong() * pageSize
    if (start >= size) return emptyList()
    val end = minOf(size.toLong(), start + pageSize).toInt()
    return subList(start.toInt(), end)
}
