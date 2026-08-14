package dev.smoores.storyteller.ui

import android.content.Context
import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import dev.smoores.storyteller.bridge.StorytellerBridgeClient
import dev.smoores.storyteller.data.LastOpenBookRoute
import dev.smoores.storyteller.data.LastOpenBookStore
import dev.smoores.storyteller.model.AlignmentOverrideState
import dev.smoores.storyteller.model.AppSettings
import dev.smoores.storyteller.model.AudiobookPlayerState
import dev.smoores.storyteller.model.BookAlignmentReport
import dev.smoores.storyteller.model.SessionKind
import dev.smoores.storyteller.model.SessionState
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.BookDetails
import dev.smoores.storyteller.model.BookID
import dev.smoores.storyteller.model.DebugLogState
import dev.smoores.storyteller.model.DownloadOperation
import dev.smoores.storyteller.model.DownloadUpdate
import dev.smoores.storyteller.model.HomeSection
import dev.smoores.storyteller.model.LiveSyncStatus
import dev.smoores.storyteller.model.BulkActionOptions
import dev.smoores.storyteller.model.IdentifierContext
import dev.smoores.storyteller.model.IdentifierRow
import dev.smoores.storyteller.model.IdentifierType
import dev.smoores.storyteller.model.QuickEditContext
import dev.smoores.storyteller.model.QuickEditFields
import dev.smoores.storyteller.model.QuickEditResult
import dev.smoores.storyteller.model.RatingContext
import dev.smoores.storyteller.model.RatingDraft
import dev.smoores.storyteller.model.RatingSaveResult
import dev.smoores.storyteller.model.ReaderOpenResult
import dev.smoores.storyteller.model.ReaderState
import dev.smoores.storyteller.model.ReadingVisit
import dev.smoores.storyteller.model.SourceStatusUpdate
import dev.smoores.storyteller.model.StorytellerSettings
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class StorytellerUiState(
    val settingsLoaded: Boolean = false,
    val settings: StorytellerSettings = StorytellerSettings(),
    val appSettings: AppSettings? = null,
    val books: List<Book> = emptyList(),
    val bookDetails: Map<BookID, BookDetails> = emptyMap(),
    val homeSections: List<HomeSection> = emptyList(),
    val libraryLoaded: Boolean = false,
    val coverRevision: Int = 0,
    val sourceStatus: String = "notConfigured",
    val sourceMessage: String? = null,
    val libraryBusy: Boolean = false,
    val refreshingLibrary: Boolean = false,
    val savingSettings: Boolean = false,
    val pendingDownloads: Set<DownloadOperation> = emptySet(),
    val audiobookLoading: Boolean = false,
    val audiobook: AudiobookPlayerState? = null,
    val session: SessionState? = null,
    val readerOpen: ReaderOpenResult? = null,
    val reader: ReaderState? = null,
    val readerBookID: BookID? = null,
    val readerModeName: String? = null,
    val successfulSettingsSaves: Int = 0,
    val error: String? = null,
)

class StorytellerViewModel private constructor(
    private val client: StorytellerBridgeClient,
    private val lastOpenBooks: LastOpenBookStore,
) : ViewModel() {
    private val mutableState = MutableStateFlow(StorytellerUiState())
    val state: StateFlow<StorytellerUiState> = mutableState.asStateFlow()

    private val refreshMutex = Mutex()
    private val audiobookMutex = Mutex()
    private val libraryChanges = Channel<Unit>(Channel.CONFLATED)
    private var currentAudiobookID: BookID? = null
    private var audiobookRequest = 0L
    private var currentReaderKey: Pair<BookID, String>? = null
    private var readerRequest = 0L
    private var downloadUpdates: Map<DownloadOperation, DownloadUpdate> = emptyMap()
    private val bookDetailsLoading = mutableSetOf<BookID>()

    init {
        client.observeAudiobookChanges { audiobook ->
            mutableState.value = mutableState.value.copy(audiobook = audiobook)
        }
        client.observeReaderState { reader ->
            mutableState.value = mutableState.value.copy(reader = reader)
        }
        client.observeSession { session ->
            mutableState.value = mutableState.value.copy(session = session)
        }
        client.observeDownloadChanges { updates ->
            viewModelScope.launch { applyDownloadUpdates(updates) }
        }
        client.observeSourceStatusChanges { update ->
            viewModelScope.launch { applySourceStatus(update) }
        }
        viewModelScope.launch {
            for (change in libraryChanges) {
                runCatching { refreshLibraryNow(refresh = false) }.onFailure(::showError)
            }
        }
        viewModelScope.launch {
            if (runCatching { client.bootstrap() }.onFailure(::showError).isFailure) {
                mutableState.value = mutableState.value.copy(
                    settingsLoaded = true,
                    libraryLoaded = true,
                )
                return@launch
            }

            runCatching {
                client.observeLibraryChanges(::librarySnapshotDidChange)
            }.onFailure(::showError)
            runCatching { loadSettings() }.onFailure { error ->
                mutableState.value = mutableState.value.copy(settingsLoaded = true)
                showError(error)
            }
            runCatching { refreshLibraryNow(refresh = false) }.onFailure { error ->
                mutableState.value = mutableState.value.copy(libraryLoaded = true)
                showError(error)
            }
        }
    }

    fun refreshLibrary() {
        viewModelScope.launch {
            runCatching { refreshLibraryNow(refresh = true) }.onFailure(::showError)
        }
    }

    fun loadBookDetails(book: Book) {
        val details = mutableState.value.bookDetails[book.id]
        if (details?.version == book.coverVersion || !bookDetailsLoading.add(book.id)) return

        viewModelScope.launch {
            runCatching { client.bookDetails(book) }
                .onSuccess { loaded ->
                    val current = mutableState.value
                    val currentBook = current.books.firstOrNull { it.id == book.id }
                    if (currentBook?.coverVersion == loaded.version) {
                        mutableState.value = current.copy(
                            bookDetails = current.bookDetails + (book.id to loaded),
                        )
                    }
                }
                .onFailure(::showError)
            bookDetailsLoading.remove(book.id)
        }
    }

    suspend fun bulkActionOptions(books: List<Book>): BulkActionOptions =
        client.bulkActionOptions(books)

    suspend fun bulkAction(
        action: String,
        books: List<Book>,
        sourceID: String? = null,
        names: List<String>? = null,
        uuids: List<String>? = null,
        role: String? = null,
        statusUUID: String? = null,
        statusName: String? = null,
        preventReImport: Boolean? = null,
    ): Boolean = client.bulkAction(
        action = action,
        books = books,
        sourceID = sourceID,
        names = names,
        uuids = uuids,
        role = role,
        statusUUID = statusUUID,
        statusName = statusName,
        preventReImport = preventReImport,
    )

    suspend fun liveSyncStatus(): LiveSyncStatus = client.liveSyncStatus()

    suspend fun debugLog(): DebugLogState = client.debugLog()

    suspend fun clearDebugLog() = client.clearDebugLog()

    fun setVerboseLogging(enabled: Boolean) {
        viewModelScope.launch { client.setVerboseLogging(enabled) }
    }

    suspend fun alignmentReport(book: Book): BookAlignmentReport = client.alignmentReport(book)

    suspend fun saveAlignmentOverrides(book: Book, state: AlignmentOverrideState): Boolean =
        client.saveAlignmentOverrides(book, state)

    suspend fun quickEditContext(book: Book): QuickEditContext = client.quickEditContext(book)

    suspend fun updateBookMetadata(book: Book, fields: QuickEditFields): QuickEditResult =
        client.updateBookMetadata(book, fields)

    suspend fun identifierContext(book: Book): IdentifierContext =
        client.bookIdentifierContext(book)

    suspend fun saveIdentifiers(book: Book, rows: List<IdentifierRow>): Boolean =
        client.saveBookIdentifiers(book, rows)

    suspend fun createIdentifierType(
        sourceID: String,
        name: String,
        urlTemplate: String,
    ): IdentifierType = client.createIdentifierType(sourceID, name, urlTemplate)

    suspend fun ratingContext(book: Book): RatingContext = client.bookRatingContext(book)

    suspend fun saveRating(book: Book, draft: RatingDraft): RatingSaveResult =
        client.saveBookRating(book, draft)

    suspend fun removeRating(book: Book): RatingSaveResult = client.deleteBookRating(book)

    fun saveSettings(serverURL: String, username: String, password: String) {
        mutableState.value = mutableState.value.copy(savingSettings = true, error = null)
        viewModelScope.launch {
            runCatching {
                val settings = client.saveAndConnectStorytellerSettings(serverURL, username, password)
                val connected = settings.connected == true
                mutableState.value = mutableState.value.copy(
                    settingsLoaded = true,
                    settings = settings,
                    savingSettings = false,
                    // Credentials that fail to connect keep the screen open showing the
                    // server's error instead of dismissing.
                    successfulSettingsSaves = mutableState.value.successfulSettingsSaves +
                        if (connected) 1 else 0,
                )
                // The connect bridge has already fetched the library.
                if (connected) refreshLibraryNow(refresh = false)
            }.onFailure { error ->
                mutableState.value = mutableState.value.copy(savingSettings = false)
                showError(error)
            }
        }
    }

    fun updateAppSettings(
        progressSyncIntervalSeconds: Double? = null,
        metadataRefreshIntervalSeconds: Double? = null,
        autoSyncToNewerServerPosition: Boolean? = null,
        liveReadingSyncEnabled: Boolean? = null,
        colorMode: String? = null,
        colorIntensity: Double? = null,
        doubleCoverAlignment: String? = null,
        experimentalSettings: Boolean? = null,
    ) {
        viewModelScope.launch {
            runCatching {
                client.saveAppSettings(
                    progressSyncIntervalSeconds = progressSyncIntervalSeconds,
                    metadataRefreshIntervalSeconds = metadataRefreshIntervalSeconds,
                    autoSyncToNewerServerPosition = autoSyncToNewerServerPosition,
                    liveReadingSyncEnabled = liveReadingSyncEnabled,
                    colorMode = colorMode,
                    colorIntensity = colorIntensity,
                    doubleCoverAlignment = doubleCoverAlignment,
                    experimentalSettings = experimentalSettings,
                )
            }
                .onSuccess { saved ->
                    CoverColorSettings.update(saved)
                    mutableState.value = mutableState.value.copy(appSettings = saved)
                }
                .onFailure(::showError)
        }
    }

    fun download(book: Book, category: String) {
        val operation = DownloadOperation(book.id, category)
        mutableState.value = mutableState.value.copy(
            pendingDownloads = mutableState.value.pendingDownloads + operation,
            error = null,
        )
        viewModelScope.launch {
            runCatching {
                client.download(book, category)
            }.onFailure(::showError)
            mutableState.value = mutableState.value.copy(
                pendingDownloads = mutableState.value.pendingDownloads - operation,
            )
        }
    }

    fun cancelDownload(book: Book, category: String) {
        val operation = DownloadOperation(book.id, category)
        viewModelScope.launch {
            runCatching {
                client.cancelDownload(book, category)
                mutableState.value = mutableState.value.copy(
                    pendingDownloads = mutableState.value.pendingDownloads - operation,
                )
            }.onFailure(::showError)
        }
    }

    fun deleteDownload(book: Book, category: String) {
        viewModelScope.launch {
            runCatching {
                client.deleteDownload(book, category)
                refreshLibraryNow(refresh = false)
            }.onFailure(::showError)
        }
    }

    fun openAudiobook(book: Book) {
        val sharedAudiobookID = mutableState.value.audiobook?.bookID
        if (currentAudiobookID == book.id || sharedAudiobookID == book.id) {
            currentAudiobookID = book.id
            return
        }
        currentAudiobookID = book.id
        val request = ++audiobookRequest
        mutableState.value = mutableState.value.copy(audiobookLoading = true, error = null)
        viewModelScope.launch {
            val result = runCatching {
                audiobookMutex.withLock { client.openAudiobook(book) }
            }
            if (request != audiobookRequest) return@launch
            result.onFailure(::showError)
            mutableState.value = mutableState.value.copy(audiobookLoading = false)
        }
    }

    fun closeAudiobook() {
        currentAudiobookID = null
        val request = ++audiobookRequest
        mutableState.value = mutableState.value.copy(audiobookLoading = false)
        viewModelScope.launch {
            val result = runCatching {
                audiobookMutex.withLock { client.closeAudiobook() }
            }
            if (request == audiobookRequest) result.onFailure(::showError)
        }
    }

    fun lastOpenBook(): LastOpenBookRoute? = lastOpenBooks.load()

    fun rememberLastOpenBook(bookID: BookID, mode: String) = lastOpenBooks.save(bookID, mode)

    fun forgetLastOpenBook() = lastOpenBooks.clear()

    fun openReader(book: Book, mode: String) {
        val key = book.id to mode
        if (currentReaderKey == key) return
        currentReaderKey = key
        val request = ++readerRequest
        mutableState.value = mutableState.value.copy(
            readerOpen = null,
            reader = null,
            readerBookID = book.id,
            readerModeName = mode,
            error = null,
        )
        viewModelScope.launch {
            val result = runCatching { client.openReader(book, mode) }
            if (request != readerRequest) return@launch
            result
                .onSuccess { open ->
                    mutableState.value = mutableState.value.copy(readerOpen = open)
                }
                .onFailure { error ->
                    currentReaderKey = null
                    showError(error)
                }
        }
    }

    fun closeReader() {
        if (currentReaderKey == null && mutableState.value.readerOpen == null) return
        currentReaderKey = null
        ++readerRequest
        mutableState.value = mutableState.value.copy(
            readerOpen = null,
            reader = null,
            readerBookID = null,
            readerModeName = null,
        )
        viewModelScope.launch {
            runCatching { client.closeReader() }.onFailure(::showError)
        }
    }

    fun readerControl(command: String, value: Double = 0.0, text: String = "") {
        viewModelScope.launch {
            runCatching { client.readerControl(command, value, text) }.onFailure(::showError)
        }
    }

    suspend fun readingTimeline(): List<ReadingVisit> =
        runCatching { client.readingTimeline() }.getOrDefault(emptyList())

    suspend fun clearReadingTimeline(visitIDs: List<String>) {
        runCatching { client.clearReadingTimeline(visitIDs) }.onFailure(::showError)
    }

    fun readerMessageFromJS(name: String, body: String) = client.readerMessageFromJS(name, body)

    fun registerReaderWebView(owner: Any, webView: android.webkit.WebView) =
        client.registerReaderWebView(owner, webView)

    fun unregisterReaderWebView(owner: Any) = client.unregisterReaderWebView(owner)

    fun toggleSession() {
        viewModelScope.launch {
            runCatching { client.sessionTogglePlayPause() }.onFailure(::showError)
        }
    }

    fun closeSession() {
        val session = mutableState.value.session ?: return
        lastOpenBooks.clear()
        when {
            mutableState.value.readerBookID == session.bookID &&
                mutableState.value.readerOpen != null -> closeReader()
            session.kind == SessionKind.Audiobook -> closeAudiobook()
            else -> viewModelScope.launch {
                runCatching { client.sessionClose() }.onFailure(::showError)
            }
        }
    }

    fun toggleAudiobookPlayback() = controlAudiobook("togglePlayPause")

    fun skipAudiobookBackward() = controlAudiobook("skipBackward")

    fun skipAudiobookForward() = controlAudiobook("skipForward")

    fun previousAudiobookChapter() = controlAudiobook("previousChapter")

    fun nextAudiobookChapter() = controlAudiobook("nextChapter")

    fun seekAudiobookChapter(fraction: Double) =
        controlAudiobook("seekChapterFraction", value = fraction)

    fun selectAudiobookChapter(chapterID: String) =
        controlAudiobook("selectChapter", text = chapterID)

    fun setAudiobookPlaybackRate(rate: Double) =
        controlAudiobook("setPlaybackRate", value = rate)

    fun setAudiobookVolume(volume: Double) =
        controlAudiobook("setVolume", value = volume)

    fun startAudiobookSleepTimer(seconds: Double) =
        controlAudiobook("startSleepTimer", value = seconds)

    fun startAudiobookEndOfChapterSleepTimer() =
        controlAudiobook("startEndOfChapterSleepTimer")

    fun cancelAudiobookSleepTimer() = controlAudiobook("cancelSleepTimer")

    fun acceptAudiobookServerPosition() = controlAudiobook("acceptServerPosition")

    fun declineAudiobookServerPosition() = controlAudiobook("declineServerPosition")

    suspend fun cover(book: Book, audio: Boolean, width: Int, height: Int): Bitmap? =
        client.cover(book, audio, width, height)

    fun cachedCover(book: Book, audio: Boolean): Bitmap? = client.cachedCover(book, audio)

    fun appDidBecomeActive() {
        client.appDidBecomeActive()
    }

    // sceneActive waits for onResume so the webview is resumed before any
    // re-anchor navigation is attempted.
    fun appDidResume() {
        if (mutableState.value.readerOpen != null) readerControl("sceneActive")
    }

    fun appDidEnterBackground() {
        client.appDidEnterBackground()
        if (mutableState.value.readerOpen != null) readerControl("sceneBackground")
    }

    fun clearError() {
        mutableState.value = mutableState.value.copy(error = null)
    }

    override fun onCleared() {
        libraryChanges.close()
        client.close()
        super.onCleared()
    }

    private suspend fun loadSettings() {
        val settings = client.storytellerSettings()
        mutableState.value = mutableState.value.copy(
            settingsLoaded = true,
            settings = settings,
        )
        runCatching { client.appSettings() }.onSuccess { loaded ->
            CoverColorSettings.update(loaded)
            mutableState.value = mutableState.value.copy(appSettings = loaded)
        }
    }

    private fun librarySnapshotDidChange() {
        libraryChanges.trySend(Unit)
    }

    private suspend fun refreshLibraryNow(refresh: Boolean) {
        refreshMutex.withLock {
            mutableState.value = mutableState.value.copy(
                libraryBusy = true,
                refreshingLibrary = refresh,
            )
            try {
                val snapshot = client.librarySnapshot(refresh)
                val current = mutableState.value
                val settings = current.settings
                val refreshCovers = refresh || !current.libraryLoaded ||
                    current.sourceStatus != snapshot.sourceStatus ||
                    current.books.map(Book::coverIdentity) !=
                    snapshot.books.map(Book::coverIdentity)
                val books = updateDownloadStates(
                    books = snapshot.books,
                    updates = downloadUpdates,
                    operations = downloadUpdates.keys,
                )
                val versions = books.associate { it.id to it.coverVersion }
                mutableState.value = current.copy(
                    books = books,
                    bookDetails = current.bookDetails.filter { (id, details) ->
                        versions[id] == details.version
                    },
                    homeSections = snapshot.homeSections,
                    libraryLoaded = true,
                    coverRevision = current.coverRevision + if (refreshCovers) 1 else 0,
                    sourceStatus = snapshot.sourceStatus,
                    sourceMessage = snapshot.sourceMessage,
                    settings = if (settings.configured) {
                        settings.copy(
                            connectionStatus = snapshot.sourceStatus,
                            connectionMessage = snapshot.sourceMessage,
                        )
                    } else {
                        settings
                    },
                )
            } finally {
                mutableState.value = mutableState.value.copy(
                    libraryBusy = false,
                    refreshingLibrary = false,
                )
            }
        }
    }

    private fun applyDownloadUpdates(updates: List<DownloadUpdate>) {
        val next = updates.associateBy(DownloadUpdate::operation)
        val affected = downloadUpdates.keys + next.keys
        downloadUpdates = next
        val current = mutableState.value
        mutableState.value = current.copy(
            books = updateDownloadStates(current.books, next, affected),
        )
    }

    private fun applySourceStatus(update: SourceStatusUpdate) {
        val current = mutableState.value
        val reconnected = current.sourceStatus != "connected" && update.status == "connected"
        mutableState.value = current.copy(
            sourceStatus = update.status,
            sourceMessage = update.message,
            coverRevision = current.coverRevision + if (reconnected) 1 else 0,
            settings = if (current.settings.configured) {
                current.settings.copy(
                    connectionStatus = update.status,
                    connectionMessage = update.message,
                )
            } else {
                current.settings
            },
        )
    }

    private fun updateDownloadStates(
        books: List<Book>,
        updates: Map<DownloadOperation, DownloadUpdate>,
        operations: Set<DownloadOperation>,
    ): List<Book> {
        if (operations.isEmpty()) return books
        val affectedBookIDs = operations.mapTo(mutableSetOf(), DownloadOperation::bookID)
        return books.map { book ->
            if (book.id !in affectedBookIDs) return@map book
            book.copy(
                media = book.media.map { media ->
                    val operation = DownloadOperation(book.id, media.category)
                    if (operation !in operations) return@map media
                    val update = updates[operation]
                    media.copy(
                        downloadState = update?.state,
                        downloadProgress = update?.progress,
                    )
                },
            )
        }
    }

    private fun showError(error: Throwable) {
        mutableState.value = mutableState.value.copy(
            error = error.message ?: error.toString(),
            libraryBusy = false,
            refreshingLibrary = false,
        )
    }

    private fun controlAudiobook(
        command: String,
        value: Double = 0.0,
        text: String = "",
    ) {
        viewModelScope.launch {
            runCatching {
                client.controlAudiobook(command, value, text)
            }.onFailure(::showError)
        }
    }

    companion object {
        fun factory(context: Context): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    StorytellerViewModel(
                        StorytellerBridgeClient(context.applicationContext),
                        LastOpenBookStore(context.applicationContext),
                    ) as T
            }
    }
}

private data class CoverIdentity(
    val id: BookID,
    val version: String,
    val hasEbook: Boolean,
    val hasAudio: Boolean,
    val hasReadaloud: Boolean,
)

private fun Book.coverIdentity() = CoverIdentity(
    id = id,
    version = coverVersion,
    hasEbook = hasEbook,
    hasAudio = hasAudio,
    hasReadaloud = hasReadaloud,
)
