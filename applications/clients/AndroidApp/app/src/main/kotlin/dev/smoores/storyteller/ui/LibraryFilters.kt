package dev.smoores.storyteller.ui

import dev.smoores.storyteller.model.Book
import kotlin.math.roundToInt
import org.json.JSONObject

internal const val UNKNOWN_NARRATOR = "Unknown Narrator"
internal const val UNKNOWN_VALUE = "Unknown"
internal const val UNRATED_VALUE = "Unrated"

// Field list, ordering, and section breaks mirror LibraryMetadataField.sortFields
// on iOS; Date Read/File Size/Status use the same core sort keys. The alignment
// submenu is omitted until StoryAlign metadata reaches the Android bridge.
internal enum class LibrarySortField(
    val label: String,
    val section: Int,
    val defaultAscending: Boolean,
) {
    Title("Title", 0, true),
    Author("Author", 0, true),
    Narrator("Narrator", 0, true),
    Series("Series", 0, true),
    PublicationDate("Pub Date", 0, false),
    Language("Language", 0, true),
    Pages("Pages", 0, true),
    Duration("Duration", 0, false),
    DateAdded("Date Added", 1, false),
    DateRead("Date Read", 1, false),
    Status("Status", 1, true),
    Progress("Progress", 1, false),
    FileSize("File Size", 1, false),
}

internal fun sortComparator(field: LibrarySortField): Comparator<Book> {
    val byTitle = compareBy<Book> { it.sortTitle.lowercase() }
    return when (field) {
        LibrarySortField.Title -> byTitle
        LibrarySortField.Author ->
            compareBy<Book> { it.sortAuthor.lowercase() }.then(byTitle)
        LibrarySortField.Narrator ->
            compareBy<Book> { it.sortNarrator.lowercase() }.then(byTitle)
        LibrarySortField.Series ->
            compareBy<Book>({ it.sortSeriesName.lowercase() }, { it.sortSeriesPosition })
                .then(byTitle)
        LibrarySortField.PublicationDate ->
            compareBy<Book> { it.sortPublicationDate }.then(byTitle)
        LibrarySortField.Language ->
            compareBy<Book> { it.language.orEmpty().lowercase() }.then(byTitle)
        LibrarySortField.Pages -> compareBy<Book> { it.pageCount ?: 0 }.then(byTitle)
        LibrarySortField.Duration -> compareBy<Book> { it.durationSeconds }.then(byTitle)
        LibrarySortField.DateAdded -> compareBy<Book> { it.sortAdded }.then(byTitle)
        LibrarySortField.DateRead -> compareBy<Book> { it.sortLastRead }.then(byTitle)
        LibrarySortField.Status ->
            compareBy<Book> { it.status.orEmpty().lowercase() }.then(byTitle)
        LibrarySortField.Progress -> compareBy<Book> { it.progress }.then(byTitle)
        LibrarySortField.FileSize -> compareBy<Book> { it.fileSizeBytes }.then(byTitle)
    }
}

// Same options and predicates as MediaGridFormatFilterOption on iOS.
internal enum class LibraryFormatFilter(val label: String) {
    Readaloud("Readaloud"),
    Ebook("Ebook"),
    Audiobook("Audiobook"),
    EbookOnly("Ebook Only"),
    AudiobookOnly("Audiobook Only"),
    MissingReadaloud("Missing Readaloud");

    fun matches(book: Book): Boolean = when (this) {
        Readaloud -> book.hasReadaloud
        Ebook -> book.hasEbook
        Audiobook -> book.hasAudio || book.hasReadaloud
        EbookOnly -> book.hasEbook && !book.hasAudio && !book.hasReadaloud
        AudiobookOnly -> book.hasAudio && !book.hasEbook && !book.hasReadaloud
        MissingReadaloud -> book.hasEbook && book.hasAudio && !book.hasReadaloud
    }
}

internal enum class LibraryProgressFilter(val label: String) {
    NotStarted("Not Started"),
    InProgress("In Progress"),
    Finished("Completed"),
}

internal fun Book.matchesProgress(filter: LibraryProgressFilter?): Boolean = when (filter) {
    null -> true
    LibraryProgressFilter.NotStarted -> progress < 0.001
    LibraryProgressFilter.InProgress -> progress >= 0.001 && progress < 0.999
    LibraryProgressFilter.Finished -> progress >= 0.999
}

internal enum class LibraryLocationFilter(val label: String) {
    Downloaded("Downloaded"),
    ServerOnly("Server Only");

    fun matches(book: Book): Boolean = when (this) {
        Downloaded -> book.hasDownloadedMedia
        ServerOnly -> !book.hasDownloadedMedia
    }
}

internal fun Book.ratingFilterValue(): String {
    val value = rating ?: return UNRATED_VALUE
    return value.roundToInt().coerceIn(1, 5).toString()
}

internal fun ratingFilterLabel(value: String): String = when (value) {
    UNRATED_VALUE -> UNRATED_VALUE
    "1" -> "1 Star"
    else -> "$value Stars"
}

internal data class LibraryFilterState(
    val format: LibraryFormatFilter? = null,
    val rating: String? = null,
    val author: String? = null,
    val narrator: String? = null,
    val series: String? = null,
    val pubYear: String? = null,
    val tag: String? = null,
    val status: String? = null,
    val progress: LibraryProgressFilter? = null,
    val location: LibraryLocationFilter? = null,
) {
    val isActive: Boolean
        get() = format != null || rating != null || author != null || narrator != null ||
            series != null || pubYear != null || tag != null || status != null ||
            progress != null || location != null

    fun matches(book: Book): Boolean {
        if (format?.matches(book) == false) return false
        if (rating != null && book.ratingFilterValue() != rating) return false
        if (author != null && author !in book.authorNames) return false
        if (narrator != null) {
            val matchesNarrator = if (narrator == UNKNOWN_NARRATOR) {
                book.narrators.isEmpty()
            } else {
                narrator in book.narrators
            }
            if (!matchesNarrator) return false
        }
        if (series != null && book.series.none { it.name == series }) return false
        if (pubYear != null) {
            val year = book.publicationYear.ifEmpty { UNKNOWN_VALUE }
            if (year != pubYear) return false
        }
        if (tag != null && tag !in book.tags) return false
        if (status != null && (book.status ?: UNKNOWN_VALUE) != status) return false
        if (!book.matchesProgress(progress)) return false
        if (location?.matches(book) == false) return false
        return true
    }

    fun encode(): String = JSONObject().apply {
        format?.let { put("format", it.name) }
        rating?.let { put("rating", it) }
        author?.let { put("author", it) }
        narrator?.let { put("narrator", it) }
        series?.let { put("series", it) }
        pubYear?.let { put("pubYear", it) }
        tag?.let { put("tag", it) }
        status?.let { put("status", it) }
        progress?.let { put("progress", it.name) }
        location?.let { put("location", it.name) }
    }.toString()

    companion object {
        fun decode(value: String): LibraryFilterState {
            if (value.isEmpty()) return LibraryFilterState()
            val obj = runCatching { JSONObject(value) }.getOrNull()
                ?: return LibraryFilterState()
            fun str(key: String): String? =
                obj.optString(key).takeIf { it.isNotEmpty() }
            return LibraryFilterState(
                format = str("format")?.let { name ->
                    LibraryFormatFilter.entries.firstOrNull { it.name == name }
                },
                rating = str("rating"),
                author = str("author"),
                narrator = str("narrator"),
                series = str("series"),
                pubYear = str("pubYear"),
                tag = str("tag"),
                status = str("status"),
                progress = str("progress")?.let { name ->
                    LibraryProgressFilter.entries.firstOrNull { it.name == name }
                },
                location = str("location")?.let { name ->
                    LibraryLocationFilter.entries.firstOrNull { it.name == name }
                },
            )
        }
    }
}

internal data class LibraryFilterOptions(
    val ratings: List<String>,
    val authors: List<String>,
    val narrators: List<String>,
    val seriesNames: List<String>,
    val pubYears: List<String>,
    val tags: List<String>,
    val statuses: List<String>,
)

internal fun libraryFilterOptions(books: List<Book>): LibraryFilterOptions {
    val ratings = books.map { it.ratingFilterValue() }.toSortedSet().toList()
        .sortedWith(compareByDescending { it.toIntOrNull() ?: -1 })
    val authors = books.flatMap { it.authorNames }.toSortedSet(String.CASE_INSENSITIVE_ORDER)
    val narrators = books.flatMap { it.narrators }.toSortedSet(String.CASE_INSENSITIVE_ORDER)
        .toMutableList()
        .also { if (books.any { book -> book.narrators.isEmpty() }) it.add(UNKNOWN_NARRATOR) }
    val seriesNames = books.flatMap { book -> book.series.map { it.name } }
        .toSortedSet(String.CASE_INSENSITIVE_ORDER)
    val pubYears = books.map { it.publicationYear.ifEmpty { UNKNOWN_VALUE } }
        .toSortedSet().toList()
        .sortedWith(
            compareByDescending<String> { it != UNKNOWN_VALUE }
                .thenByDescending { it },
        )
    val tags = books.flatMap { it.tags }.toSortedSet(String.CASE_INSENSITIVE_ORDER)
    val statuses = books.map { it.status ?: UNKNOWN_VALUE }
        .toSortedSet(String.CASE_INSENSITIVE_ORDER)
    return LibraryFilterOptions(
        ratings = ratings,
        authors = authors.toList(),
        narrators = narrators,
        seriesNames = seriesNames.toList(),
        pubYears = pubYears,
        tags = tags.toList(),
        statuses = statuses.toList(),
    )
}
