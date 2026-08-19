package dev.smoores.storyteller.model

import java.io.Serializable
import org.json.JSONArray
import org.json.JSONObject

data class BookID(
    val sourceID: String,
    val uuid: String,
) : Serializable

data class Book(
    val id: BookID,
    val title: String,
    val subtitle: String?,
    val authors: String,
    val authorNames: List<String>,
    val narrators: List<String>,
    val series: List<BookSeries>,
    val tags: List<String>,
    val collections: List<String>,
    val description: String?,
    val language: String?,
    val publicationDateDisplay: String,
    val createdAt: String?,
    val createdAtDisplay: String,
    val updatedAtDisplay: String,
    val rating: Double?,
    val progress: Double,
    val pageCount: Int?,
    val durationDisplay: String,
    val durationSeconds: Double,
    val sortTitle: String,
    val sortAuthor: String,
    val sortNarrator: String,
    val sortSeriesName: String,
    val sortSeriesPosition: Double,
    val sortAdded: String,
    val sortLastRead: String,
    val sortPublicationDate: String,
    val publicationYear: String,
    val status: String?,
    val fileSizeBytes: Long,
    val coverVersion: String,
    val media: List<BookMedia>,
    val playbackOwner: String?,
    val showOnItem: Map<String, String> = emptyMap(),
    val alignmentSummary: AlignmentSummary? = null,
) {
    val hasEbook: Boolean get() = media.any { it.category == "ebook" }
    val hasAudio: Boolean get() = media.any { it.category == "audio" }
    val hasReadaloud: Boolean get() = media.any { it.category == "synced" }
    val hasDownloadedMedia: Boolean get() = media.any(BookMedia::downloaded)
}

data class BookDetails(
    val version: String,
    val description: String?,
    val publicationDateDisplay: String,
    val createdAtDisplay: String,
    val updatedAtDisplay: String,
)

data class BookSeries(
    val name: String,
    val position: Double?,
)

data class BookMedia(
    val category: String,
    val format: String?,
    val pageCount: Int?,
    val durationDisplay: String,
    val fileSizeDisplay: String,
    val status: String?,
    val downloaded: Boolean,
    val removable: Boolean,
    val downloadState: String?,
    val downloadProgress: Double?,
)

data class LibrarySnapshot(
    val books: List<Book>,
    val homeSections: List<HomeSection>,
    val sourceStatus: String,
    val sourceMessage: String?,
)

data class HomeSection(
    val kind: String,
    val title: String,
    val bookIDs: List<BookID>,
)

data class DownloadOperation(
    val bookID: BookID,
    val category: String,
)

data class DownloadUpdate(
    val operation: DownloadOperation,
    val state: String,
    val progress: Double?,
)

data class SourceStatusUpdate(
    val status: String,
    val message: String?,
)

data class AppSettings(
    val progressSyncIntervalSeconds: Double,
    val metadataRefreshIntervalSeconds: Double,
    val autoSyncToNewerServerPosition: Boolean,
    val liveReadingSyncEnabled: Boolean,
    val colorMode: String = "full",
    val colorIntensity: Double = 0.65,
    val doubleCoverAlignment: String = "auto",
    val experimentalSettings: Boolean = false,
)

data class StorytellerSettings(
    val configured: Boolean = false,
    val sourceID: String? = null,
    val serverURL: String = "",
    val username: String = "",
    val connectionStatus: String = "notConfigured",
    val connectionMessage: String? = null,
    val connected: Boolean? = null,
    val usesBrowserLogin: Boolean = false,
)

data class RatingDimensionInfo(
    val id: String,
    val label: String,
)

data class UserRating(
    val rating: Double?,
    val review: String?,
    val dimensions: Map<String, Double>?,
)

data class RatingContext(
    val editable: Boolean = false,
    val record: UserRating? = null,
    val dimensions: List<RatingDimensionInfo> = emptyList(),
    val reviewerName: String? = null,
)

data class RatingDraft(
    val starsEdited: Boolean,
    val stars: Double?,
    val sendDimensions: Boolean,
    val dimensions: Map<String, Double>?,
    val reviewChanged: Boolean,
    val review: String,
)

data class RatingSaveResult(
    val outcome: String,
    val record: UserRating?,
    val message: String?,
)

data class NamedUuid(
    val uuid: String?,
    val name: String,
)

data class IdentifierDisplayRow(
    val label: String,
    val value: String,
    val url: String?,
    val audiobookScoped: Boolean,
)

data class IdentifierRow(
    val typeUuid: String?,
    val value: String,
    val scope: String,
    val formatUuid: String?,
)

data class IdentifierType(
    val uuid: String,
    val displayName: String,
)

data class LiveSyncStatus(
    val isActive: Boolean,
    val packetsSent: Int,
    val packetsReceived: Int,
    val peerCount: Int,
    val lastError: String?,
)

data class DebugLogState(
    val verbose: Boolean,
    val messages: List<String>,
)

data class AlignmentSummary(
    val grade: String,
    val score: Int?,
    val chapters: Int,
    val missingSentences: Int,
    val mutedChapters: Int,
    val failedChapters: Int,
    val unalignedAudio: Int,
)

data class AlignmentReportFlag(
    val label: String,
    val tone: String,
)

data class AlignmentSentenceContext(
    val prevSentence: String?,
    val matchedSentence: String?,
    val nextSentence: String?,
)

data class AlignmentTranscriptionContext(
    val before: String?,
    val after: String?,
)

data class AlignmentReportChapter(
    val href: String,
    val label: String,
    val chapterSentenceCount: Int,
    val alignedSentenceCount: Int,
    val coverage: Double?,
    val delta: Int,
    val flagged: Boolean,
    val flags: List<AlignmentReportFlag>,
    val firstMatchedSentenceContext: AlignmentSentenceContext?,
    val lastMatchedSentenceContext: AlignmentSentenceContext?,
    val transcriptionContext: AlignmentTranscriptionContext?,
    val endTranscriptionContext: AlignmentTranscriptionContext?,
    val audioDuration: Double,
    val markedOk: Boolean,
    val excludedFromScore: Boolean,
)

data class AlignmentUnalignedChapter(
    val href: String,
    val label: String,
    val reason: String,
    val preview: String?,
    val intended: Boolean,
)

data class AlignmentUnalignedAudioFile(
    val filepath: String,
    val title: String?,
    val duration: Double?,
    val transcription: String?,
    val excluded: Boolean,
)

data class BookAlignmentReport(
    val createdAt: String?,
    val summary: AlignmentSummary,
    val totalAudioDuration: Double,
    val alignedAudioDuration: Double,
    val totalSentences: Int,
    val alignedSentences: Int,
    val chapters: List<AlignmentReportChapter>,
    val unalignedChapters: List<AlignmentUnalignedChapter>,
    val unalignedAudioFiles: List<AlignmentUnalignedAudioFile>,
)

data class AlignmentOverrideState(
    val markedOkChapters: Map<String, Boolean>,
    val excludedChapters: Map<String, Boolean>,
    val intendedUnalignedChapters: Map<String, Boolean>,
    val excludedAudioFiles: Map<String, Boolean>,
)

data class QuickEditContext(
    val editable: Boolean = false,
    val hint: String? = null,
)

data class QuickEditFields(
    val title: String? = null,
    val subtitle: String? = null,
    val description: String? = null,
    val authors: String? = null,
    val narrators: String? = null,
    val seriesName: String? = null,
    val seriesPosition: String? = null,
    val publicationDate: String? = null,
    val tags: String? = null,
)

data class QuickEditResult(
    val outcome: String,
    val field: String?,
    val message: String?,
)

data class IdentifierContext(
    val editable: Boolean = false,
    val failureMessage: String? = null,
    val displayRows: List<IdentifierDisplayRow> = emptyList(),
    val rows: List<IdentifierRow> = emptyList(),
    val types: List<IdentifierType> = emptyList(),
    val scopes: List<String> = listOf("book"),
)

data class BulkActionOptions(
    val singleServerSourceID: String? = null,
    val statuses: List<NamedUuid> = emptyList(),
    val collections: List<NamedUuid> = emptyList(),
    val removableCollections: List<NamedUuid> = emptyList(),
    val removableTags: List<NamedUuid> = emptyList(),
    val removableCreators: Map<String, List<NamedUuid>> = emptyMap(),
)

data class AudiobookChapter(
    val id: String,
    val title: String,
    val duration: Double,
)

data class ServerPosition(
    val title: String?,
    val totalProgression: Double?,
)

data class AudiobookPlayerState(
    val bookID: BookID,
    val title: String,
    val author: String,
    val isPlaying: Boolean,
    val currentTime: Double,
    val duration: Double,
    val bookProgress: Double,
    val currentChapterID: String?,
    val currentChapterIndex: Int?,
    val chapterElapsed: Double,
    val chapterDuration: Double,
    val chapterProgress: Double,
    val playbackRate: Double,
    val volume: Double,
    val chapters: List<AudiobookChapter>,
    val sleepTimerMode: String?,
    val sleepTimerRemaining: Double?,
    val pendingServerPosition: ServerPosition?,
)

data class BookImage(
    val id: String,
    val title: String,
    val kind: String,
    val caption: String?,
    val pageLabel: String?,
    val sectionIndex: Int,
    val chapterTitle: String?,
) {
    val positionLabel: String
        get() = pageLabel?.let { "p. $it" } ?: chapterTitle ?: "Section ${sectionIndex + 1}"
}

data class ReadingVisit(
    val id: String,
    val startedAt: Double,
    val endedAt: Double,
    val startDescription: String,
    val endDescription: String,
    val startProgression: Double?,
    val endProgression: Double?,
    val source: String,
    val endText: String?,
    val chapterTitle: String?,
) {
    val durationSeconds: Double get() = maxOf(0.0, (endedAt - startedAt) / 1000)
}

data class ReaderOpenResult(
    val readerPath: String,
    val originalPath: String,
    val hasAudioNarration: Boolean,
    val title: String,
)

enum class SessionKind { Readaloud, Audiobook }

data class SessionState(
    val kind: SessionKind,
    val bookID: BookID,
    val title: String,
    val author: String?,
    val isPlaying: Boolean,
    val playbackRate: Double,
)

data class ReaderTocEntry(
    val label: String,
    val href: String,
    val level: Int,
    val sectionIndex: Int,
)

data class ReaderTheme(
    val id: String,
    val name: String,
    val isBuiltIn: Boolean,
    val isEdited: Boolean,
    val appearance: String,
    val backgroundColor: String,
    val foregroundColor: String,
    val highlightColor: String,
    val highlightThickness: Double,
    val readaloudHighlightMode: String,
    val userHighlightMode: String,
    val userHighlightColors: List<String>,
    val userHighlightLabels: List<String>,
    val customCSS: String?,
    val readaloudHighlightFade: Double = 0.0,
    val readaloudTextItalic: Boolean = false,
    val readaloudTextBold: Boolean = false,
    val readaloudUnderlineStyle: String = "solid",
) {
    fun availableForLight(): Boolean = appearance != "dark"

    fun availableForDark(): Boolean = appearance != "light"

    fun toEditJson(includeId: Boolean): String = JSONObject().apply {
        if (includeId) put("id", id)
        put("name", name)
        put("appearance", appearance)
        put("backgroundColor", backgroundColor)
        put("foregroundColor", foregroundColor)
        put("highlightColor", highlightColor)
        put("highlightThickness", highlightThickness)
        put("readaloudHighlightMode", readaloudHighlightMode)
        put("userHighlightMode", userHighlightMode)
        put("userHighlightColors", JSONArray(userHighlightColors))
        put("userHighlightLabels", JSONArray(userHighlightLabels))
        put("customCSS", customCSS.orEmpty())
        put("readaloudHighlightFade", readaloudHighlightFade)
        put("readaloudTextItalic", readaloudTextItalic)
        put("readaloudTextBold", readaloudTextBold)
        put("readaloudUnderlineStyle", readaloudUnderlineStyle)
    }.toString()
}

// Defaults mirror AndroidReaderSettings, which mirrors SettingsDefaults.swift.
data class ReaderDisplaySettings(
    val fontSize: Double = 24.0,
    val fontFamily: String = "System Default",
    val lineSpacing: Double = 1.4,
    val marginLeftRight: Double = 2.0,
    val marginTopBottom: Double = 2.0,
    val marginTop: Double = 6.0,
    val marginBottom: Double = 4.0,
    val wordSpacing: Double = 0.0,
    val letterSpacing: Double = 0.0,
    val paragraphSpacing: Double = 0.0,
    val firstLineIndent: Boolean = false,
    val textAlignment: String = "justify",
    val singleColumnMode: Boolean = true,
    val scrollingMode: Boolean = false,
    val enableMarginClickNavigation: Boolean = true,
    val lockViewToAudio: Boolean = true,
    val readaloudDimOthers: Boolean = false,
    val readaloudDimAmount: Double = 0.5,
) {
    fun toUpdateJson(): String = JSONObject().apply {
        put("fontSize", fontSize)
        put("fontFamily", fontFamily)
        put("lineSpacing", lineSpacing)
        put("marginLeftRight", marginLeftRight)
        put("marginTopBottom", marginTopBottom)
        put("marginTop", marginTop)
        put("marginBottom", marginBottom)
        put("wordSpacing", wordSpacing)
        put("letterSpacing", letterSpacing)
        put("paragraphSpacing", paragraphSpacing)
        put("firstLineIndent", firstLineIndent)
        put("textAlignment", textAlignment)
        put("singleColumnMode", singleColumnMode)
        put("scrollingMode", scrollingMode)
        put("enableMarginClickNavigation", enableMarginClickNavigation)
        put("lockViewToAudio", lockViewToAudio)
        put("readaloudDimOthers", readaloudDimOthers)
        put("readaloudDimAmount", readaloudDimAmount)
    }.toString()
}

data class ReaderSearchResult(
    val cfi: String,
    val pre: String,
    val match: String,
    val post: String,
)

data class ReaderSearchSection(
    val label: String,
    val results: List<ReaderSearchResult>,
)

data class ReaderSearchState(
    val query: String = "",
    val isSearching: Boolean = false,
    val progress: Double = 0.0,
    val totalCount: Int = 0,
    val sections: List<ReaderSearchSection> = emptyList(),
    val error: String? = null,
)

data class ReaderHighlight(
    val id: String,
    val text: String,
    val colorId: String?,
    val note: String?,
    val isBookmark: Boolean,
    val chapterTitle: String?,
)

data class ReaderHighlightPaletteEntry(
    val id: String,
    val color: String,
    val label: String,
)

data class ReaderPendingEdit(
    val id: String,
    val text: String,
    val colorId: String?,
    val note: String?,
)

data class ReaderOverlayOptions(
    val showProgress: Boolean = true,
    val showPageNumber: Boolean = true,
    val showTimeRemainingInBook: Boolean = true,
    val showTimeRemainingInChapter: Boolean = true,
    val showSkipBackward: Boolean = true,
    val showPlayPause: Boolean = true,
    val showSkipForward: Boolean = true,
    val alwaysShowMiniPlayer: Boolean = false,
    val showMiniPlayerStats: Boolean = false,
) {
    fun toUpdateJson(): String = JSONObject().apply {
        put("showProgress", showProgress)
        put("showPageNumber", showPageNumber)
        put("showTimeRemainingInBook", showTimeRemainingInBook)
        put("showTimeRemainingInChapter", showTimeRemainingInChapter)
        put("showSkipBackward", showSkipBackward)
        put("showPlayPause", showPlayPause)
        put("showSkipForward", showSkipForward)
        put("alwaysShowMiniPlayer", alwaysShowMiniPlayer)
        put("showMiniPlayerStats", showMiniPlayerStats)
    }.toString()
}

data class ReaderState(
    val title: String,
    val author: String,
    val hasAudioNarration: Boolean,
    val toc: List<ReaderTocEntry>,
    val selectedChapterId: Int?,
    val chapterCount: Int?,
    val bookFraction: Double?,
    val chapterFraction: Double?,
    val chapterCurrentPage: Int?,
    val chapterTotalPages: Int?,
    val isPlaying: Boolean,
    val playbackRate: Double,
    val volume: Double,
    val bookTimeRemaining: Double?,
    val chapterTimeRemaining: Double?,
    val chapterElapsedSeconds: Double?,
    val chapterTotalSeconds: Double?,
    val sleepTimerActive: Boolean,
    val sleepTimerRemaining: Double?,
    val sleepTimerType: String?,
    val sleepTimerEndOfChapter: Boolean,
    val overlayToggleCount: Int,
    val keepScreenOn: Boolean,
    val backgroundColor: String?,
    val foregroundColor: String?,
    val activeThemeId: String?,
    val selectedLightThemeId: String?,
    val selectedDarkThemeId: String?,
    val themes: List<ReaderTheme>,
    val settings: ReaderDisplaySettings?,
    val overlay: ReaderOverlayOptions,
    val miniPlayer: MiniPlayerCustomization = MiniPlayerCustomization(),
    val dock: DockCustomization = DockCustomization(),
    val menuBar: MenuBarCustomization = MenuBarCustomization(),
    val playbackModes: PlaybackModes = PlaybackModes(),
    val experimentalSettings: Boolean = false,
    val search: ReaderSearchState,
    val highlights: List<ReaderHighlight>,
    val highlightPalette: List<ReaderHighlightPaletteEntry>,
    val pendingSelectionText: String?,
    val pendingEdit: ReaderPendingEdit?,
    val pendingServerPosition: ServerPosition?,
    val timelineBackDescription: String? = null,
    val timelineForwardDescription: String? = null,
)
