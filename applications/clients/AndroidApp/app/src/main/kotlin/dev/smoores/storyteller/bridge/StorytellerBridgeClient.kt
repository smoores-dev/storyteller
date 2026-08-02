package dev.smoores.storyteller.bridge

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import android.util.LruCache
import dev.smoores.storyteller.model.AppSettings
import dev.smoores.storyteller.model.AudiobookChapter
import dev.smoores.storyteller.model.AudiobookPlayerState
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.BookDetails
import dev.smoores.storyteller.model.BookID
import dev.smoores.storyteller.model.BookMedia
import dev.smoores.storyteller.model.DownloadOperation
import dev.smoores.storyteller.model.DownloadUpdate
import dev.smoores.storyteller.model.HomeSection
import dev.smoores.storyteller.model.LibrarySnapshot
import dev.smoores.storyteller.model.SessionKind
import dev.smoores.storyteller.model.SessionState
import dev.smoores.storyteller.model.ReaderDisplaySettings
import dev.smoores.storyteller.model.ReaderHighlight
import dev.smoores.storyteller.model.ReaderHighlightPaletteEntry
import dev.smoores.storyteller.model.ReaderOpenResult
import dev.smoores.storyteller.model.ReaderOverlayOptions
import dev.smoores.storyteller.model.ReaderPendingEdit
import dev.smoores.storyteller.model.ReaderSearchResult
import dev.smoores.storyteller.model.ReaderSearchSection
import dev.smoores.storyteller.model.ReaderSearchState
import dev.smoores.storyteller.model.ReaderState
import dev.smoores.storyteller.model.ReaderTheme
import dev.smoores.storyteller.model.ReaderTocEntry
import dev.smoores.storyteller.model.ServerPosition
import dev.smoores.storyteller.model.SourceStatusUpdate
import dev.smoores.storyteller.model.StorytellerSettings
import dev.smoores.storyteller.platform.AndroidAudioPlayerBridge
import dev.smoores.storyteller.platform.AndroidNetworkMonitor
import dev.smoores.storyteller.platform.AndroidSecureStore
import dev.smoores.storyteller.platform.LiveSyncNsdBridge
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import org.json.JSONArray
import org.json.JSONObject

class StorytellerBridgeClient(context: Context) {
    private val applicationContext = context.applicationContext
    private val filesDirectory = context.filesDir.absolutePath
    // The Swift core owns persistent cover bytes. This cache only bounds
    // decoded Android bitmaps used by the currently active UI session.
    private val coverBitmaps = object : LruCache<CoverCacheKey, Bitmap>(bitmapCacheSizeKilobytes()) {
        override fun sizeOf(key: CoverCacheKey, value: Bitmap): Int =
            maxOf(1, value.allocationByteCount / 1024)
    }
    private val missingCovers = ConcurrentHashMap.newKeySet<MissingCoverKey>()
    private val coverRequests = Semaphore(4)

    @Volatile
    private var bootstrapped = false

    suspend fun bootstrap() {
        AndroidSecureStore.initialize(applicationContext)
        AndroidAudioPlayerBridge.initialize(applicationContext)
        LiveSyncNsdBridge.initialize(applicationContext)
        val networkAvailable = AndroidNetworkMonitor.isNetworkAvailable(applicationContext)
        StorytellerAndroidBridge.bootstrapAndroid(filesDirectory).awaitResult()
        StorytellerAndroidBridge.androidNetworkAvailabilityDidChange(networkAvailable).awaitResult()
        AndroidNetworkMonitor.start(applicationContext)
        bootstrapped = true
        appDidBecomeActive()
    }

    fun appDidBecomeActive() {
        if (!bootstrapped) return
        StorytellerAndroidBridge.androidAppDidBecomeActive().whenComplete { _, error ->
            if (error != null) Log.e("StorytellerNetwork", "Could not activate source", error)
        }
    }

    fun appDidEnterBackground() {
        if (!bootstrapped) return
        StorytellerAndroidBridge.androidAppDidEnterBackground().whenComplete { _, error ->
            if (error != null) Log.e("StorytellerNetwork", "Could not deactivate source", error)
        }
    }

    suspend fun observeLibraryChanges(onChange: () -> Unit) {
        AndroidBridgeCallbacks.observe(this, onChange)
        StorytellerAndroidBridge.startLibraryObservation().awaitResult()
    }

    fun observeAudiobookChanges(onChange: (AudiobookPlayerState?) -> Unit) {
        AndroidBridgeCallbacks.observeAudiobook(this) { payload ->
            onChange(payload.takeIf(String::isNotBlank)?.let(::parseAudiobookState))
        }
    }

    fun observeDownloadChanges(onChange: (List<DownloadUpdate>) -> Unit) {
        AndroidBridgeCallbacks.observeDownloads(this) { payload ->
            onChange(parseDownloadUpdates(payload))
        }
    }

    fun observeSourceStatusChanges(onChange: (SourceStatusUpdate) -> Unit) {
        AndroidBridgeCallbacks.observeSourceStatus(this) { payload ->
            val status = JSONObject(payload)
            if (status.optString("status") == "connected") missingCovers.clear()
            onChange(
                SourceStatusUpdate(
                    status = status.optString("status", "disconnected"),
                    message = status.optionalString("message"),
                )
            )
        }
    }

    fun close() {
        AndroidBridgeCallbacks.clearObserver(this)
    }

    suspend fun storytellerSettings(): StorytellerSettings {
        val json = AndroidBridgeCallbacks.requestPayload { requestID ->
            StorytellerAndroidBridge.storytellerSettingsJSON(requestID)
        }
        return withContext(Dispatchers.Default) { parseSettings(json) }
    }

    suspend fun appSettings(): AppSettings {
        val json = AndroidBridgeCallbacks.requestPayload { requestID ->
            StorytellerAndroidBridge.appSettingsJSON(requestID)
        }
        return withContext(Dispatchers.Default) { parseAppSettings(json) }
    }

    suspend fun saveAppSettings(
        progressSyncIntervalSeconds: Double? = null,
        metadataRefreshIntervalSeconds: Double? = null,
        autoSyncToNewerServerPosition: Boolean? = null,
        liveReadingSyncEnabled: Boolean? = null,
    ): AppSettings {
        val update = JSONObject().apply {
            progressSyncIntervalSeconds?.let { put("progressSyncIntervalSeconds", it) }
            metadataRefreshIntervalSeconds?.let { put("metadataRefreshIntervalSeconds", it) }
            autoSyncToNewerServerPosition?.let { put("autoSyncToNewerServerPosition", it) }
            liveReadingSyncEnabled?.let { put("liveReadingSyncEnabled", it) }
        }.toString()
        val json = AndroidBridgeCallbacks.requestPayload { requestID ->
            StorytellerAndroidBridge.saveAppSettings(requestID, update)
        }
        return withContext(Dispatchers.Default) { parseAppSettings(json) }
    }

    private fun parseAppSettings(json: String): AppSettings {
        val obj = JSONObject(json)
        return AppSettings(
            progressSyncIntervalSeconds = obj.optDouble("progressSyncIntervalSeconds", 60.0),
            metadataRefreshIntervalSeconds = obj.optDouble(
                "metadataRefreshIntervalSeconds",
                300.0,
            ),
            autoSyncToNewerServerPosition = obj.optBoolean("autoSyncToNewerServerPosition"),
            liveReadingSyncEnabled = obj.optBoolean("liveReadingSyncEnabled"),
        )
    }

    suspend fun librarySnapshot(refresh: Boolean): LibrarySnapshot {
        if (refresh) missingCovers.clear()
        val json = AndroidBridgeCallbacks.requestPayload { requestID ->
            StorytellerAndroidBridge.librarySnapshotJSON(requestID, refresh)
        }
        return withContext(Dispatchers.Default) { parseLibrary(json) }
    }

    suspend fun bookDetails(book: Book): BookDetails {
        val json = AndroidBridgeCallbacks.requestPayload { requestID ->
            StorytellerAndroidBridge.bookDetailsJSON(
                requestID,
                book.id.uuid,
                book.id.sourceID,
            )
        }
        return withContext(Dispatchers.Default) {
            val details = JSONObject(json)
            BookDetails(
                version = details.optString("version"),
                description = details.optionalString("description"),
                publicationDateDisplay = details.optString("publicationDateDisplay"),
                createdAtDisplay = details.optString("createdAtDisplay"),
                updatedAtDisplay = details.optString("updatedAtDisplay"),
            )
        }
    }

    suspend fun download(book: Book, category: String) {
        StorytellerAndroidBridge.downloadBook(
            book.id.uuid,
            book.id.sourceID,
            category,
        ).awaitResult()
    }

    suspend fun cancelDownload(book: Book, category: String) {
        StorytellerAndroidBridge.cancelBookDownload(
            book.id.uuid,
            book.id.sourceID,
            category,
        ).awaitResult()
    }

    suspend fun deleteDownload(book: Book, category: String) {
        StorytellerAndroidBridge.deleteBookDownload(
            book.id.uuid,
            book.id.sourceID,
            category,
        ).awaitResult()
    }

    suspend fun openAudiobook(book: Book) {
        openAudiobook(book.id)
    }

    suspend fun openAudiobook(bookID: BookID) {
        audiobookOperations.withLock {
            StorytellerAndroidBridge.openAudiobook(
                bookID.uuid,
                bookID.sourceID,
            ).awaitResult()
        }
    }

    suspend fun closeAudiobook() {
        audiobookOperations.withLock {
            StorytellerAndroidBridge.closeAudiobook().awaitResult()
        }
    }

    suspend fun controlAudiobook(
        command: String,
        value: Double = 0.0,
        text: String = "",
    ) {
        StorytellerAndroidBridge.controlAudiobook(command, value, text).awaitResult()
    }

    suspend fun openHeadlessPlayback(bookID: BookID, category: String) {
        audiobookOperations.withLock {
            StorytellerAndroidBridge.openHeadlessPlayback(
                bookID.uuid,
                bookID.sourceID,
                category,
            ).awaitResult()
        }
    }

    suspend fun cyclePlaybackRate() {
        StorytellerAndroidBridge.cyclePlaybackRate().awaitResult()
    }

    suspend fun openReader(book: Book, mode: String): ReaderOpenResult {
        val json = AndroidBridgeCallbacks.requestPayload { requestID ->
            StorytellerAndroidBridge.openReader(
                requestID,
                book.id.uuid,
                book.id.sourceID,
                mode,
            )
        }
        return withContext(Dispatchers.Default) { parseReaderOpenResult(json) }
    }

    suspend fun closeReader() {
        StorytellerAndroidBridge.closeReader().awaitResult()
    }

    suspend fun readerControl(
        command: String,
        value: Double = 0.0,
        text: String = "",
    ) {
        StorytellerAndroidBridge.readerControl(command, value, text).awaitResult()
    }

    // Called from the WebView's JavascriptInterface thread; fire-and-forget.
    fun readerMessageFromJS(name: String, body: String) {
        StorytellerAndroidBridge.readerMessageFromJS(name, body)
    }

    fun registerReaderWebView(owner: Any, webView: android.webkit.WebView) {
        AndroidBridgeCallbacks.registerReaderWebView(owner, webView)
    }

    fun unregisterReaderWebView(owner: Any) {
        AndroidBridgeCallbacks.unregisterReaderWebView(owner)
    }

    fun observeReaderState(onChange: (ReaderState) -> Unit) {
        AndroidBridgeCallbacks.observeReaderState(this) { payload ->
            runCatching { parseReaderState(payload) }
                .getOrNull()
                ?.let(onChange)
        }
    }

    fun observeSession(onChange: (SessionState?) -> Unit) {
        AndroidBridgeCallbacks.observeSession(this) { payload ->
            onChange(payload.takeIf(String::isNotBlank)?.let(::parseSessionState))
        }
    }

    suspend fun sessionTogglePlayPause() {
        StorytellerAndroidBridge.sessionTogglePlayPause().awaitResult()
    }

    suspend fun sessionClose() {
        StorytellerAndroidBridge.sessionClose().awaitResult()
    }

    private fun parseSessionState(json: String): SessionState {
        val obj = JSONObject(json)
        return SessionState(
            kind = if (obj.optString("kind") == "audiobook") {
                SessionKind.Audiobook
            } else {
                SessionKind.Readaloud
            },
            bookID = BookID(
                sourceID = obj.optString("sourceID"),
                uuid = obj.optString("bookID"),
            ),
            title = obj.optString("title"),
            author = obj.optString("author").takeIf { it.isNotBlank() },
            isPlaying = obj.optBoolean("isPlaying"),
            playbackRate = obj.optDouble("playbackRate", 1.0),
        )
    }

    private fun parseReaderOpenResult(json: String): ReaderOpenResult {
        val obj = JSONObject(json)
        return ReaderOpenResult(
            readerPath = obj.getString("readerPath"),
            originalPath = obj.optString("originalPath"),
            hasAudioNarration = obj.optBoolean("hasAudioNarration"),
            title = obj.optString("title"),
        )
    }

    private fun parseReaderState(json: String): ReaderState {
        val obj = JSONObject(json)
        val tocArray = obj.optJSONArray("toc")
        val toc = buildList {
            if (tocArray != null) {
                for (index in 0 until tocArray.length()) {
                    val entry = tocArray.getJSONObject(index)
                    add(
                        ReaderTocEntry(
                            label = entry.optString("label"),
                            href = entry.optString("href"),
                            level = entry.optInt("level"),
                            sectionIndex = entry.optInt("sectionIndex"),
                        )
                    )
                }
            }
        }
        return ReaderState(
            title = obj.optString("title"),
            author = obj.optString("author"),
            hasAudioNarration = obj.optBoolean("hasAudioNarration"),
            toc = toc,
            selectedChapterId = obj.optionalInt("selectedChapterId"),
            bookFraction = obj.optionalDouble("bookFraction"),
            chapterFraction = obj.optionalDouble("chapterFraction"),
            chapterCurrentPage = obj.optionalInt("chapterCurrentPage"),
            chapterTotalPages = obj.optionalInt("chapterTotalPages"),
            isPlaying = obj.optBoolean("isPlaying"),
            playbackRate = obj.optDouble("playbackRate", 1.0),
            volume = obj.optDouble("volume", 1.0),
            bookTimeRemaining = obj.optionalDouble("bookTimeRemaining"),
            chapterTimeRemaining = obj.optionalDouble("chapterTimeRemaining"),
            chapterElapsedSeconds = obj.optionalDouble("chapterElapsedSeconds"),
            chapterTotalSeconds = obj.optionalDouble("chapterTotalSeconds"),
            sleepTimerActive = obj.optBoolean("sleepTimerActive"),
            sleepTimerRemaining = obj.optionalDouble("sleepTimerRemaining"),
            sleepTimerType = obj.optionalString("sleepTimerType"),
            overlayToggleCount = obj.optInt("overlayToggleCount"),
            keepScreenOn = obj.optBoolean("keepScreenOn"),
            backgroundColor = obj.optString("backgroundColor").takeIf { it.isNotEmpty() },
            foregroundColor = obj.optString("foregroundColor").takeIf { it.isNotEmpty() },
            activeThemeId = obj.optString("activeThemeId").takeIf { it.isNotEmpty() },
            selectedLightThemeId = obj.optString("selectedLightThemeId").takeIf { it.isNotEmpty() },
            selectedDarkThemeId = obj.optString("selectedDarkThemeId").takeIf { it.isNotEmpty() },
            themes = parseReaderThemes(obj.optJSONArray("themes")),
            settings = obj.optJSONObject("settings")?.let(::parseReaderDisplaySettings),
            overlay = obj.optJSONObject("overlay")?.let(::parseReaderOverlayOptions)
                ?: ReaderOverlayOptions(),
            search = obj.optJSONObject("search")?.let(::parseReaderSearch)
                ?: ReaderSearchState(),
            highlights = parseReaderHighlights(obj.optJSONArray("highlights")),
            highlightPalette = parseHighlightPalette(obj.optJSONArray("highlightPalette")),
            pendingSelectionText = obj.optionalString("pendingSelectionText"),
            pendingEdit = obj.optJSONObject("pendingEdit")?.let { edit ->
                ReaderPendingEdit(
                    id = edit.getString("id"),
                    text = edit.optString("text"),
                    colorId = edit.optionalString("colorId"),
                    note = edit.optionalString("note"),
                )
            },
            pendingServerPosition = obj.optJSONObject("pendingServerPosition")?.let { position ->
                ServerPosition(
                    title = position.optionalString("title"),
                    totalProgression = position.optionalDouble("totalProgression"),
                )
            },
        )
    }

    private fun parseReaderHighlights(array: JSONArray?): List<ReaderHighlight> = buildList {
        if (array != null) {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                add(
                    ReaderHighlight(
                        id = item.getString("id"),
                        text = item.optString("text"),
                        colorId = item.optionalString("colorId"),
                        note = item.optionalString("note"),
                        isBookmark = item.optBoolean("isBookmark"),
                        chapterTitle = item.optionalString("chapterTitle"),
                    )
                )
            }
        }
    }

    private fun parseHighlightPalette(
        array: JSONArray?,
    ): List<ReaderHighlightPaletteEntry> = buildList {
        if (array != null) {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                add(
                    ReaderHighlightPaletteEntry(
                        id = item.getString("id"),
                        color = item.optString("color"),
                        label = item.optString("label"),
                    )
                )
            }
        }
    }

    private fun parseReaderOverlayOptions(obj: JSONObject): ReaderOverlayOptions {
        val defaults = ReaderOverlayOptions()
        return ReaderOverlayOptions(
            showProgress = obj.optBoolean("showProgress", defaults.showProgress),
            showPageNumber = obj.optBoolean("showPageNumber", defaults.showPageNumber),
            showTimeRemainingInBook = obj.optBoolean(
                "showTimeRemainingInBook",
                defaults.showTimeRemainingInBook,
            ),
            showTimeRemainingInChapter = obj.optBoolean(
                "showTimeRemainingInChapter",
                defaults.showTimeRemainingInChapter,
            ),
            showSkipBackward = obj.optBoolean("showSkipBackward", defaults.showSkipBackward),
            showPlayPause = obj.optBoolean("showPlayPause", defaults.showPlayPause),
            showSkipForward = obj.optBoolean("showSkipForward", defaults.showSkipForward),
            alwaysShowMiniPlayer = obj.optBoolean(
                "alwaysShowMiniPlayer",
                defaults.alwaysShowMiniPlayer,
            ),
            showMiniPlayerStats = obj.optBoolean(
                "showMiniPlayerStats",
                defaults.showMiniPlayerStats,
            ),
        )
    }

    private fun parseReaderSearch(obj: JSONObject): ReaderSearchState {
        val sectionArray = obj.optJSONArray("sections")
        val sections = buildList {
            if (sectionArray != null) {
                for (index in 0 until sectionArray.length()) {
                    val section = sectionArray.getJSONObject(index)
                    val resultArray = section.optJSONArray("results")
                    add(
                        ReaderSearchSection(
                            label = section.optString("label"),
                            results = buildList {
                                if (resultArray != null) {
                                    for (resultIndex in 0 until resultArray.length()) {
                                        val result = resultArray.getJSONObject(resultIndex)
                                        add(
                                            ReaderSearchResult(
                                                cfi = result.getString("cfi"),
                                                pre = result.optString("pre"),
                                                match = result.optString("match"),
                                                post = result.optString("post"),
                                            )
                                        )
                                    }
                                }
                            },
                        )
                    )
                }
            }
        }
        return ReaderSearchState(
            query = obj.optString("query"),
            isSearching = obj.optBoolean("isSearching"),
            progress = obj.optDouble("progress", 0.0),
            totalCount = obj.optInt("totalCount"),
            sections = sections,
            error = obj.optionalString("error"),
        )
    }

    private fun parseStringList(array: JSONArray?): List<String> = buildList {
        if (array != null) {
            for (index in 0 until array.length()) {
                add(array.optString(index))
            }
        }
    }

    private fun parseReaderThemes(array: JSONArray?): List<ReaderTheme> = buildList {
        if (array != null) {
            for (index in 0 until array.length()) {
                val theme = array.getJSONObject(index)
                add(
                    ReaderTheme(
                        id = theme.getString("id"),
                        name = theme.optString("name"),
                        isBuiltIn = theme.optBoolean("isBuiltIn"),
                        isEdited = theme.optBoolean("isEdited"),
                        appearance = theme.optString("appearance", "any"),
                        backgroundColor = theme.optString("backgroundColor"),
                        foregroundColor = theme.optString("foregroundColor"),
                        highlightColor = theme.optString("highlightColor"),
                        highlightThickness = theme.optDouble("highlightThickness", 1.0),
                        readaloudHighlightMode = theme.optString("readaloudHighlightMode", "background"),
                        userHighlightMode = theme.optString("userHighlightMode", "underline"),
                        userHighlightColors = parseStringList(theme.optJSONArray("userHighlightColors")),
                        userHighlightLabels = parseStringList(theme.optJSONArray("userHighlightLabels")),
                        customCSS = theme.optionalString("customCSS"),
                    )
                )
            }
        }
    }

    private fun parseReaderDisplaySettings(obj: JSONObject): ReaderDisplaySettings {
        val defaults = ReaderDisplaySettings()
        return ReaderDisplaySettings(
            fontSize = obj.optDouble("fontSize", defaults.fontSize),
            fontFamily = obj.optString("fontFamily", defaults.fontFamily),
            lineSpacing = obj.optDouble("lineSpacing", defaults.lineSpacing),
            marginLeftRight = obj.optDouble("marginLeftRight", defaults.marginLeftRight),
            marginTopBottom = obj.optDouble("marginTopBottom", defaults.marginTopBottom),
            wordSpacing = obj.optDouble("wordSpacing", defaults.wordSpacing),
            letterSpacing = obj.optDouble("letterSpacing", defaults.letterSpacing),
            textAlignment = obj.optString("textAlignment", defaults.textAlignment),
            singleColumnMode = obj.optBoolean("singleColumnMode", defaults.singleColumnMode),
            scrollingMode = obj.optBoolean("scrollingMode", defaults.scrollingMode),
            enableMarginClickNavigation = obj.optBoolean(
                "enableMarginClickNavigation",
                defaults.enableMarginClickNavigation,
            ),
            lockViewToAudio = obj.optBoolean("lockViewToAudio", defaults.lockViewToAudio),
        )
    }

    suspend fun cover(book: Book, audio: Boolean, width: Int, height: Int): Bitmap? {
        val cacheKey = CoverCacheKey(book.id, book.coverVersion, audio)
        val missingKey = MissingCoverKey(book.id, book.coverVersion, audio)
        coverBitmaps.get(cacheKey)?.let { return it }
        if (missingKey in missingCovers) return null

        return coverRequests.withPermit {
            // Once a Swift request starts, let it finish and populate the cache.
            // Cancellation only prevents offscreen requests that are still queued.
            withContext(NonCancellable) {
                coverBitmaps.get(cacheKey)
                    ?: loadCover(book, audio, width, height, cacheKey, missingKey)
            }
        }
    }

    fun cachedCover(book: Book, audio: Boolean): Bitmap? =
        coverBitmaps.get(CoverCacheKey(book.id, book.coverVersion, audio))

    private suspend fun loadCover(
        book: Book,
        audio: Boolean,
        width: Int,
        height: Int,
        cacheKey: CoverCacheKey,
        missingKey: MissingCoverKey,
    ): Bitmap? {
        if (missingKey in missingCovers) return null

        var response = loadCoverResponse(book, audio, width, height, refresh = false)
        var decoded = decodeCover(response.data, width, height)
        if (decoded == null && response.data.isNotEmpty()) {
            response = loadCoverResponse(book, audio, width, height, refresh = true)
            decoded = decodeCover(response.data, width, height)
        }
        if (decoded == null) {
            missingCovers.add(missingKey)
        } else {
            if (response.shouldPersist) {
                StorytellerAndroidBridge.persistCoverBytes(
                    book.id.uuid,
                    book.id.sourceID,
                    audio,
                    response.data,
                ).awaitResult()
            }
            coverBitmaps.put(cacheKey, decoded)
        }
        return decoded
    }

    private suspend fun loadCoverResponse(
        book: Book,
        audio: Boolean,
        width: Int,
        height: Int,
        refresh: Boolean,
    ): CoverPayload =
        AndroidBridgeCallbacks.requestCover { requestID ->
            StorytellerAndroidBridge.coverResponseBytes(
                requestID,
                book.id.uuid,
                book.id.sourceID,
                book.coverVersion,
                audio,
                width,
                height,
                refresh,
            )
        }

    private suspend fun decodeCover(bytes: ByteArray, width: Int, height: Int): Bitmap? =
        withContext(Dispatchers.Default) {
            if (bytes.isEmpty()) return@withContext null
            decodeSampledBitmap(bytes, width, height)
        }

    suspend fun saveStorytellerSettings(
        serverURL: String,
        username: String,
        password: String,
    ): StorytellerSettings {
        val json = AndroidBridgeCallbacks.requestPayload { requestID ->
            StorytellerAndroidBridge.saveStorytellerSettings(
                requestID,
                serverURL,
                username,
                password,
            )
        }
        return withContext(Dispatchers.Default) { parseSettings(json) }
    }

    private fun parseSettings(json: String): StorytellerSettings {
        val root = JSONObject(json)
        return StorytellerSettings(
            configured = root.getBoolean("configured"),
            sourceID = root.optionalString("sourceID"),
            serverURL = root.optString("serverURL"),
            username = root.optString("username"),
            connectionStatus = root.optString("connectionStatus", "notConfigured"),
            connectionMessage = root.optionalString("connectionMessage"),
        )
    }

    private fun parseLibrary(json: String): LibrarySnapshot {
        val root = JSONObject(json)
        val items = root.getJSONArray("books")
        val books = List(items.length()) { index ->
            val item = items.getJSONObject(index)
            val mediaItems = item.getJSONArray("media")
            Book(
                id = BookID(
                    sourceID = item.getString("sourceID"),
                    uuid = item.getString("id"),
                ),
                title = item.getString("title"),
                subtitle = item.optionalString("subtitle"),
                authors = item.optString("authors"),
                authorNames = item.stringList("authorNames"),
                narrators = item.stringList("narrators"),
                series = item.getJSONArray("series").let { series ->
                    List(series.length()) { seriesIndex ->
                        val value = series.getJSONObject(seriesIndex)
                        dev.smoores.storyteller.model.BookSeries(
                            name = value.getString("name"),
                            position = value.optionalDouble("position"),
                        )
                    }
                },
                tags = item.stringList("tags"),
                collections = item.stringList("collections"),
                description = item.optionalString("description"),
                language = item.optionalString("language"),
                publicationDateDisplay = item.optString("publicationDateDisplay"),
                createdAt = item.optionalString("createdAt"),
                createdAtDisplay = item.optString("createdAtDisplay"),
                updatedAtDisplay = item.optString("updatedAtDisplay"),
                rating = item.optionalDouble("rating"),
                progress = item.optDouble("progress", 0.0),
                pageCount = item.takeUnless { it.isNull("pageCount") }?.optInt("pageCount"),
                durationDisplay = item.optString("durationDisplay"),
                durationSeconds = item.optDouble("durationSeconds", 0.0),
                sortTitle = item.optString("sortTitle", item.getString("title")),
                sortAuthor = item.optString("sortAuthor"),
                sortNarrator = item.optString("sortNarrator"),
                sortSeriesName = item.optString("sortSeriesName"),
                sortSeriesPosition = item.optDouble("sortSeriesPosition", Double.MAX_VALUE),
                sortAdded = item.optString("sortAdded"),
                sortLastRead = item.optString("sortLastRead"),
                sortPublicationDate = item.optString("sortPublicationDate"),
                publicationYear = item.optString("publicationYear"),
                status = item.optionalString("status"),
                fileSizeBytes = item.optLong("fileSizeBytes", 0L),
                coverVersion = item.optString("coverVersion"),
                media = List(mediaItems.length()) { mediaIndex ->
                    val media = mediaItems.getJSONObject(mediaIndex)
                    BookMedia(
                        category = media.getString("category"),
                        format = media.optionalString("format"),
                        pageCount = media.takeUnless { it.isNull("pageCount") }
                            ?.optInt("pageCount"),
                        durationDisplay = media.optString("durationDisplay"),
                        fileSizeDisplay = media.optString("fileSizeDisplay"),
                        status = media.optionalString("status"),
                        downloaded = media.getBoolean("downloaded"),
                        removable = media.getBoolean("removable"),
                        downloadState = media.optionalString("downloadState"),
                        downloadProgress = media.optionalDouble("downloadProgress"),
                    )
                },
                playbackOwner = item.optionalString("playbackOwner"),
            )
        }
        return LibrarySnapshot(
            books = books,
            homeSections = root.getJSONArray("homeSections").let { sections ->
                List(sections.length()) { index ->
                    val section = sections.getJSONObject(index)
                    val bookIDs = section.getJSONArray("bookIDs")
                    HomeSection(
                        kind = section.getString("kind"),
                        title = section.getString("title"),
                        bookIDs = List(bookIDs.length()) { bookIndex ->
                            val bookID = bookIDs.getJSONObject(bookIndex)
                            BookID(
                                sourceID = bookID.getString("sourceID"),
                                uuid = bookID.getString("uuid"),
                            )
                        },
                    )
                }
            },
            sourceStatus = root.optString("sourceStatus", "notConfigured"),
            sourceMessage = root.optionalString("sourceMessage"),
        )
    }

    private fun JSONObject.stringList(name: String): List<String> {
        val values = optJSONArray(name) ?: return emptyList()
        return List(values.length()) { values.getString(it) }
    }

    private companion object {
        // The activity and media service use separate clients but share one
        // Swift audiobook actor and Android audio backend.
        val audiobookOperations = Mutex()
    }
}

internal fun parseAudiobookState(json: String): AudiobookPlayerState {
    val root = JSONObject(json)
    val chapters = root.getJSONArray("chapters")
    val pending = root.optJSONObject("pendingServerPosition")
    return AudiobookPlayerState(
        bookID = BookID(
            sourceID = root.getString("sourceID"),
            uuid = root.getString("bookID"),
        ),
        title = root.getString("title"),
        author = root.getString("author"),
        isPlaying = root.getBoolean("isPlaying"),
        currentTime = root.getDouble("currentTime"),
        duration = root.getDouble("duration"),
        bookProgress = root.getDouble("bookProgress"),
        currentChapterID = root.optionalString("currentChapterID"),
        currentChapterIndex = root.optionalInt("currentChapterIndex"),
        chapterElapsed = root.getDouble("chapterElapsed"),
        chapterDuration = root.getDouble("chapterDuration"),
        chapterProgress = root.getDouble("chapterProgress"),
        playbackRate = root.getDouble("playbackRate"),
        volume = root.getDouble("volume"),
        chapters = List(chapters.length()) { index ->
            val chapter = chapters.getJSONObject(index)
            AudiobookChapter(
                id = chapter.getString("id"),
                title = chapter.getString("title"),
                duration = chapter.getDouble("duration"),
            )
        },
        sleepTimerMode = root.optionalString("sleepTimerMode"),
        sleepTimerRemaining = root.optionalDouble("sleepTimerRemaining"),
        pendingServerPosition = pending?.let {
            ServerPosition(
                title = it.optionalString("title"),
                totalProgression = it.optionalDouble("totalProgression"),
            )
        },
    )
}

private fun parseDownloadUpdates(json: String): List<DownloadUpdate> {
    val updates = JSONArray(json)
    return List(updates.length()) { index ->
        val update = updates.getJSONObject(index)
        DownloadUpdate(
            operation = DownloadOperation(
                bookID = BookID(
                    sourceID = update.getString("sourceID"),
                    uuid = update.getString("bookID"),
                ),
                category = update.getString("category"),
            ),
            state = update.getString("state"),
            progress = update.optionalDouble("progress"),
        )
    }
}

private data class CoverCacheKey(
    val bookID: BookID,
    val coverVersion: String,
    val audio: Boolean,
)

private data class MissingCoverKey(
    val bookID: BookID,
    val coverVersion: String,
    val audio: Boolean,
)

private fun JSONObject.optionalString(name: String): String? =
    if (isNull(name)) null else optString(name).takeIf(String::isNotBlank)

private fun JSONObject.optionalDouble(name: String): Double? =
    if (isNull(name) || !has(name)) null else getDouble(name)

private fun JSONObject.optionalInt(name: String): Int? =
    if (isNull(name) || !has(name)) null else getInt(name)

private fun bitmapCacheSizeKilobytes(): Int =
    maxOf(1, (Runtime.getRuntime().maxMemory() / 8 / 1024).toInt())

private fun decodeSampledBitmap(bytes: ByteArray, requestedWidth: Int, requestedHeight: Int): Bitmap? {
    if (requestedWidth <= 0 || requestedHeight <= 0) return null

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    var sampleSize = 1
    val halfWidth = bounds.outWidth / 2
    val halfHeight = bounds.outHeight / 2
    while (halfWidth / sampleSize >= requestedWidth &&
        halfHeight / sampleSize >= requestedHeight
    ) {
        sampleSize *= 2
    }

    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null
    if (decoded.width <= requestedWidth && decoded.height <= requestedHeight) return decoded

    val scale = minOf(
        requestedWidth.toDouble() / decoded.width,
        requestedHeight.toDouble() / decoded.height,
    )
    val scaledWidth = maxOf(1, (decoded.width * scale).toInt())
    val scaledHeight = maxOf(1, (decoded.height * scale).toInt())
    val scaled = Bitmap.createScaledBitmap(decoded, scaledWidth, scaledHeight, true)
    if (scaled !== decoded) decoded.recycle()
    return scaled
}

internal suspend fun <T> CompletableFuture<T>.awaitResult(): T =
    suspendCancellableCoroutine { continuation ->
        whenComplete { value, error ->
            if (error == null) {
                continuation.resumeWith(Result.success(value))
            } else {
                continuation.resumeWith(Result.failure(error.cause ?: error))
            }
        }
        continuation.invokeOnCancellation { cancel(true) }
    }
