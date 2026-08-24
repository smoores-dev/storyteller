package dev.smoores.storyteller.ui

import android.graphics.Bitmap
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items as listItems
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import dev.smoores.storyteller.R
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.BookID
import dev.smoores.storyteller.model.BulkActionOptions

private const val COVER_SCALE = 0.72f
private const val COVER_SPREAD = 0.08f
private const val EBOOK_ASPECT_RATIO = 0.67f
private const val PANEL_VERTICAL_MARGIN = 0.06f
internal const val COVER_PANEL_ASPECT_RATIO =
    1f / (COVER_SCALE / EBOOK_ASPECT_RATIO + PANEL_VERTICAL_MARGIN * 2f)
private val storytellerTitleFont = FontFamily(Font(R.font.young_serif))

internal enum class LibraryTab(val label: String) {
    Home("Home"),
    Library("Library"),
    Downloaded("Downloaded"),
}

private sealed interface CoverLoadState {
    data object Loading : CoverLoadState
    data object Missing : CoverLoadState
    data class Loaded(val bitmap: Bitmap) : CoverLoadState
}

private data class VisibleHomeSection(
    val kind: String,
    val title: String,
    val books: List<Book>,
)

@Composable
internal fun LibraryScreen(
    state: StorytellerUiState,
    tab: LibraryTab,
    searchText: String,
    sortField: LibrarySortField,
    sortAscending: Boolean,
    filters: LibraryFilterState,
    modifier: Modifier,
    configure: () -> Unit,
    select: (Book) -> Unit,
    selectSort: (LibrarySortField, Boolean) -> Unit,
    updateFilters: (LibraryFilterState) -> Unit,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    viewOptions: LibraryViewOptions = LibraryViewOptions(),
    bulkOptions: (suspend (List<Book>) -> BulkActionOptions)? = null,
    bulkAction: (suspend (BulkActionRequest) -> Boolean)? = null,
) {
    var selecting by remember { mutableStateOf(false) }
    var selectedIds by remember { mutableStateOf(setOf<BookID>()) }
    val query = searchText.trim()
    val visibleBooks = remember(
        state.books, tab, query, sortField, sortAscending, filters,
    ) {
        val comparator = sortComparator(sortField)
            .let { if (sortAscending) it else it.reversed() }
        val tabBooks = when (tab) {
            LibraryTab.Home -> emptyList()
            LibraryTab.Library -> state.books.sortedWith(comparator)
            LibraryTab.Downloaded -> state.books
                .filter(Book::hasDownloadedMedia)
                .sortedWith(comparator)
        }
        tabBooks.filter { book ->
            (query.isEmpty() || book.matches(query)) && filters.matches(book)
        }
    }
    val filterOptions = remember(state.books) { libraryFilterOptions(state.books) }
    val homeSections = remember(state.books, state.homeSections, query) {
        val booksByID = state.books.associateBy(Book::id)
        state.homeSections.map { section ->
            VisibleHomeSection(
                kind = section.kind,
                title = section.title,
                books = section.bookIDs.mapNotNull(booksByID::get).filter { book ->
                    query.isEmpty() || book.matches(query)
                },
            )
        }
    }

    Column(modifier.fillMaxSize()) {
        state.sourceMessage?.let { message ->
            Surface(color = MaterialTheme.colorScheme.errorContainer) {
                Text(
                    message,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                )
            }
        }
        val bulkAvailable = tab != LibraryTab.Home &&
            bulkOptions != null && bulkAction != null
        // Selected books that filtered out of view no longer participate in actions.
        LaunchedEffect(visibleBooks, selecting) {
            if (selecting) {
                selectedIds = selectedIds.intersect(visibleBooks.mapTo(mutableSetOf()) { it.id })
            } else {
                selectedIds = emptySet()
            }
        }
        if (tab != LibraryTab.Home && state.books.isNotEmpty()) {
            SortFilterBar(
                sortField = sortField,
                sortAscending = sortAscending,
                filters = filters,
                options = filterOptions,
                selectSort = selectSort,
                updateFilters = updateFilters,
                selecting = if (bulkAvailable) selecting else null,
                toggleSelecting = { selecting = !selecting },
            )
        }
        when {
            !state.settingsLoaded ||
                (state.settings.configured && !state.libraryLoaded) ->
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            !state.settings.configured -> EmptyLibrary(
                title = "No server configured",
                message = "Save a Storyteller source in Settings to load its library.",
                action = configure,
            )
            state.books.isEmpty() -> EmptyLibrary(
                title = "No books",
                message = connectionText(state.sourceStatus, state.sourceMessage),
                action = configure,
            )
            tab == LibraryTab.Home && homeSections.all { it.books.isEmpty() } &&
                searchText.isNotBlank() -> EmptyLibrary(
                title = "No matches",
                message = "Try a different title or author.",
            )
            tab != LibraryTab.Home && visibleBooks.isEmpty() &&
                (searchText.isNotBlank() || filters.isActive) ->
                EmptyLibrary(
                title = "No matches",
                message = "Try a different search or clear the filters.",
            )
            visibleBooks.isEmpty() && tab == LibraryTab.Downloaded -> EmptyLibrary(
                title = "No downloads",
                message = "Download a book from Home or Library to find it here.",
            )
            tab == LibraryTab.Home -> HomeSections(
                sections = homeSections,
                select = select,
                coverRevision = coverRevision,
                cover = cover,
                cachedCover = cachedCover,
                viewOptions = viewOptions,
            )
            else -> Box(Modifier.fillMaxSize()) {
                BookGrid(
                    books = visibleBooks,
                    select = select,
                    coverRevision = coverRevision,
                    cover = cover,
                    cachedCover = cachedCover,
                    viewOptions = viewOptions,
                    selecting = bulkAvailable && selecting,
                    selectedIds = selectedIds,
                    toggleSelected = { id ->
                        selecting = true
                        selectedIds = if (id in selectedIds) {
                            selectedIds - id
                        } else {
                            selectedIds + id
                        }
                    },
                )
                if (bulkAvailable && selecting) {
                    val selectedBooks = visibleBooks.filter { it.id in selectedIds }
                    BulkSelectionBar(
                        selectedBooks = selectedBooks,
                        allSelected = visibleBooks.isNotEmpty() &&
                            selectedBooks.size == visibleBooks.size,
                        selectAll = {
                            selectedIds = visibleBooks.mapTo(mutableSetOf()) { it.id }
                        },
                        deselectAll = { selectedIds = emptySet() },
                        clear = {
                            selectedIds = emptySet()
                            selecting = false
                        },
                        loadOptions = bulkOptions!!,
                        runAction = bulkAction!!,
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 16.dp),
                    )
                }
            }
        }
    }
}

private enum class FilterDimension(val label: String) {
    Format("Format"),
    Rating("User Rating"),
    Author("Author"),
    Narrator("Narrator"),
    Series("Series"),
    PubYear("Pub Year"),
    Tag("Tag"),
    Status("Status"),
    Progress("Progress"),
    Location("Location"),
}

@Composable
private fun SortFilterBar(
    sortField: LibrarySortField,
    sortAscending: Boolean,
    filters: LibraryFilterState,
    options: LibraryFilterOptions,
    selectSort: (LibrarySortField, Boolean) -> Unit,
    updateFilters: (LibraryFilterState) -> Unit,
    selecting: Boolean? = null,
    toggleSelecting: () -> Unit = {},
) {
    var sortMenuOpen by remember { mutableStateOf(false) }
    var filterMenuOpen by remember { mutableStateOf(false) }
    var filterPage by remember { mutableStateOf<FilterDimension?>(null) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            FilterChip(
                selected = false,
                onClick = { sortMenuOpen = true },
                label = { Text(sortField.label) },
                leadingIcon = {
                    Icon(
                        imageVector = if (sortAscending) {
                            Icons.Filled.ArrowUpward
                        } else {
                            Icons.Filled.ArrowDownward
                        },
                        contentDescription = if (sortAscending) "Ascending" else "Descending",
                        modifier = Modifier.size(16.dp),
                    )
                },
            )
            DropdownMenu(
                expanded = sortMenuOpen,
                onDismissRequest = { sortMenuOpen = false },
            ) {
                var lastSection = LibrarySortField.entries.first().section
                LibrarySortField.entries.forEach { field ->
                    if (field.section != lastSection) {
                        HorizontalDivider()
                        lastSection = field.section
                    }
                    DropdownMenuItem(
                        text = { Text(field.label) },
                        trailingIcon = {
                            if (field == sortField) {
                                Icon(
                                    imageVector = if (sortAscending) {
                                        Icons.Filled.ArrowUpward
                                    } else {
                                        Icons.Filled.ArrowDownward
                                    },
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        },
                        onClick = {
                            sortMenuOpen = false
                            if (field == sortField) {
                                selectSort(field, !sortAscending)
                            } else {
                                selectSort(field, field.defaultAscending)
                            }
                        },
                    )
                }
            }
        }

        Box {
            FilterChip(
                selected = filters.isActive,
                onClick = {
                    filterPage = null
                    filterMenuOpen = true
                },
                label = { Text("Filters") },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Filled.FilterList,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                },
            )
            DropdownMenu(
                expanded = filterMenuOpen,
                onDismissRequest = { filterMenuOpen = false },
            ) {
                FilterMenuContent(
                    page = filterPage,
                    filters = filters,
                    options = options,
                    setPage = { filterPage = it },
                    apply = { updated ->
                        updateFilters(updated)
                        filterMenuOpen = false
                    },
                )
            }
        }

        selecting?.let { isSelecting ->
            FilterChip(
                selected = isSelecting,
                onClick = toggleSelecting,
                label = { Text(if (isSelecting) "Done" else "Multiple") },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Filled.Checklist,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                },
            )
        }

        ActiveFilterChips(filters = filters, updateFilters = updateFilters)
    }
}

@Composable
private fun FilterMenuContent(
    page: FilterDimension?,
    filters: LibraryFilterState,
    options: LibraryFilterOptions,
    setPage: (FilterDimension?) -> Unit,
    apply: (LibraryFilterState) -> Unit,
) {
    if (page == null) {
        if (filters.isActive) {
            DropdownMenuItem(
                text = { Text("Clear Filters") },
                leadingIcon = { Icon(Icons.Filled.Close, contentDescription = null) },
                onClick = { apply(LibraryFilterState()) },
            )
            HorizontalDivider()
        }
        FilterDimension.entries.forEach { dimension ->
            val current = filters.currentLabel(dimension)
            DropdownMenuItem(
                text = { Text(dimension.label) },
                trailingIcon = {
                    Text(
                        current ?: "All",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (current != null) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                },
                onClick = { setPage(dimension) },
            )
        }
        return
    }

    DropdownMenuItem(
        text = { Text("Filters", style = MaterialTheme.typography.labelLarge) },
        leadingIcon = {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
        },
        onClick = { setPage(null) },
    )
    HorizontalDivider()

    @Composable
    fun option(label: String, selected: Boolean, onPick: () -> Unit) {
        DropdownMenuItem(
            text = { Text(label) },
            trailingIcon = {
                if (selected) Icon(Icons.Filled.Check, contentDescription = "Selected")
            },
            onClick = onPick,
        )
    }

    when (page) {
        FilterDimension.Format -> {
            option("All Titles", filters.format == null) {
                apply(filters.copy(format = null))
            }
            LibraryFormatFilter.entries.forEach { value ->
                option(value.label, filters.format == value) {
                    apply(filters.copy(format = value))
                }
            }
        }
        FilterDimension.Rating -> {
            option("All User Ratings", filters.rating == null) {
                apply(filters.copy(rating = null))
            }
            options.ratings.forEach { value ->
                option(ratingFilterLabel(value), filters.rating == value) {
                    apply(filters.copy(rating = value))
                }
            }
        }
        FilterDimension.Author -> {
            option("All Authors", filters.author == null) {
                apply(filters.copy(author = null))
            }
            options.authors.forEach { value ->
                option(value, filters.author == value) {
                    apply(filters.copy(author = value))
                }
            }
        }
        FilterDimension.Narrator -> {
            option("All Narrators", filters.narrator == null) {
                apply(filters.copy(narrator = null))
            }
            options.narrators.forEach { value ->
                option(value, filters.narrator == value) {
                    apply(filters.copy(narrator = value))
                }
            }
        }
        FilterDimension.Series -> {
            option("All Series", filters.series == null) {
                apply(filters.copy(series = null))
            }
            options.seriesNames.forEach { value ->
                option(value, filters.series == value) {
                    apply(filters.copy(series = value))
                }
            }
        }
        FilterDimension.PubYear -> {
            option("All Years", filters.pubYear == null) {
                apply(filters.copy(pubYear = null))
            }
            options.pubYears.forEach { value ->
                option(value, filters.pubYear == value) {
                    apply(filters.copy(pubYear = value))
                }
            }
        }
        FilterDimension.Tag -> {
            option("All Tags", filters.tag == null) {
                apply(filters.copy(tag = null))
            }
            options.tags.forEach { value ->
                option(value, filters.tag == value) {
                    apply(filters.copy(tag = value))
                }
            }
        }
        FilterDimension.Status -> {
            option("All Statuses", filters.status == null) {
                apply(filters.copy(status = null))
            }
            options.statuses.forEach { value ->
                option(value, filters.status == value) {
                    apply(filters.copy(status = value))
                }
            }
        }
        FilterDimension.Progress -> {
            option("All Progress", filters.progress == null) {
                apply(filters.copy(progress = null))
            }
            LibraryProgressFilter.entries.forEach { value ->
                option(value.label, filters.progress == value) {
                    apply(filters.copy(progress = value))
                }
            }
        }
        FilterDimension.Location -> {
            option("All Locations", filters.location == null) {
                apply(filters.copy(location = null))
            }
            LibraryLocationFilter.entries.forEach { value ->
                option(value.label, filters.location == value) {
                    apply(filters.copy(location = value))
                }
            }
        }
    }
}

private fun LibraryFilterState.currentLabel(dimension: FilterDimension): String? =
    when (dimension) {
        FilterDimension.Format -> format?.label
        FilterDimension.Rating -> rating?.let(::ratingFilterLabel)
        FilterDimension.Author -> author
        FilterDimension.Narrator -> narrator
        FilterDimension.Series -> series
        FilterDimension.PubYear -> pubYear
        FilterDimension.Tag -> tag
        FilterDimension.Status -> status
        FilterDimension.Progress -> progress?.label
        FilterDimension.Location -> location?.label
    }

private fun LibraryFilterState.clearing(dimension: FilterDimension): LibraryFilterState =
    when (dimension) {
        FilterDimension.Format -> copy(format = null)
        FilterDimension.Rating -> copy(rating = null)
        FilterDimension.Author -> copy(author = null)
        FilterDimension.Narrator -> copy(narrator = null)
        FilterDimension.Series -> copy(series = null)
        FilterDimension.PubYear -> copy(pubYear = null)
        FilterDimension.Tag -> copy(tag = null)
        FilterDimension.Status -> copy(status = null)
        FilterDimension.Progress -> copy(progress = null)
        FilterDimension.Location -> copy(location = null)
    }

@Composable
private fun ActiveFilterChips(
    filters: LibraryFilterState,
    updateFilters: (LibraryFilterState) -> Unit,
) {
    FilterDimension.entries.forEach { dimension ->
        val label = filters.currentLabel(dimension) ?: return@forEach
        FilterChip(
            selected = true,
            onClick = { updateFilters(filters.clearing(dimension)) },
            label = { Text(label) },
            trailingIcon = {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = "Clear ${dimension.label} filter",
                    modifier = Modifier.size(14.dp),
                )
            },
        )
    }
}

@Composable
private fun HomeSections(
    sections: List<VisibleHomeSection>,
    select: (Book) -> Unit,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    viewOptions: LibraryViewOptions = LibraryViewOptions(),
) {
    LazyColumn(
        contentPadding = PaddingValues(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        listItems(sections, key = VisibleHomeSection::kind) { section ->
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    section.title,
                    fontFamily = storytellerTitleFont,
                    fontSize = 22.sp,
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
                if (section.books.isEmpty()) {
                    Text(
                        "No items currently.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 20.dp),
                    )
                } else {
                    val rowState = rememberLazyListState()
                    // A keyed LazyRow anchors scroll to the first visible item, so a
                    // book moving to the front lands out of view past the left edge.
                    LaunchedEffect(section.books.firstOrNull()?.id) {
                        if (rowState.firstVisibleItemIndex <= 2) {
                            rowState.scrollToItem(0)
                        }
                    }
                    LazyRow(
                        state = rowState,
                        contentPadding = PaddingValues(horizontal = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(
                            viewOptions.spacing.points.dp * 0.75f,
                        ),
                    ) {
                        listItems(section.books, key = Book::id) { book ->
                            BookTile(
                                book = book,
                                select = select,
                                coverRevision = coverRevision,
                                cover = cover,
                                cachedCover = cachedCover,
                                modifier = Modifier.width((96 + viewOptions.coverSize * 48).dp),
                                viewOptions = viewOptions,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun BookGrid(
    books: List<Book>,
    select: (Book) -> Unit,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    viewOptions: LibraryViewOptions = LibraryViewOptions(),
    selecting: Boolean = false,
    selectedIds: Set<BookID> = emptySet(),
    toggleSelected: ((BookID) -> Unit)? = null,
) {
    // The size slider maps to a minimum tile width; columns flex to fill the row.
    val minTileWidth = (96 + viewOptions.coverSize * 104).dp
    val spacing = viewOptions.spacing.points.dp
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = minTileWidth),
        contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(spacing),
        verticalArrangement = Arrangement.spacedBy(spacing + 4.dp),
    ) {
        gridItems(books, key = Book::id) { book ->
            BookTile(
                book = book,
                select = select,
                coverRevision = coverRevision,
                cover = cover,
                cachedCover = cachedCover,
                modifier = Modifier.fillMaxWidth(),
                viewOptions = viewOptions,
                selecting = selecting,
                selected = book.id in selectedIds,
                toggleSelected = toggleSelected,
            )
        }
    }
}

@Composable
@OptIn(ExperimentalFoundationApi::class)
private fun BookTile(
    book: Book,
    select: (Book) -> Unit,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    modifier: Modifier,
    viewOptions: LibraryViewOptions = LibraryViewOptions(),
    selecting: Boolean = false,
    selected: Boolean = false,
    toggleSelected: ((BookID) -> Unit)? = null,
) {
    val tileModifier = if (toggleSelected == null) {
        modifier.clickable { select(book) }
    } else {
        modifier.combinedClickable(
            onClick = {
                if (selecting) toggleSelected(book.id) else select(book)
            },
            onLongClick = { toggleSelected(book.id) },
        )
    }
    Column(
        tileModifier
            .let { base ->
                if (selected) {
                    base
                        .border(
                            2.dp,
                            MaterialTheme.colorScheme.primary,
                            RoundedCornerShape(8.dp),
                        )
                        .padding(2.dp)
                } else {
                    base
                }
            },
    ) {
        Box {
            BookCover(
                book = book,
                width = 320,
                height = 480,
                revision = coverRevision,
                load = cover,
                cached = cachedCover,
                modifier = Modifier.fillMaxWidth().aspectRatio(COVER_PANEL_ASPECT_RATIO),
                preferredArtwork = viewOptions.style,
                showsReadaloudBadge = viewOptions.showReadaloudBadge,
                showsProgressBadge = viewOptions.showProgressBadge,
            )
            if (selecting) {
                Icon(
                    if (selected) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                    contentDescription = if (selected) "Selected" else "Not selected",
                    tint = if (selected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(6.dp)
                        .size(22.dp),
                )
            }
        }
        Text(
            book.title,
            style = MaterialTheme.typography.titleSmall,
            maxLines = 2,
            modifier = Modifier.padding(top = 6.dp),
        )
        val rows = ShowOnItem.displayRows(viewOptions.showOnItemSelection)
        when {
            rows == null -> if (book.authors.isNotBlank()) {
                Text(
                    book.authors,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                )
            }
            else -> rows.forEach { row ->
                Text(
                    ShowOnItem.rowText(row, book),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                )
            }
        }
    }
}

// Mirrors the iOS search predicate: space-separated terms ANDed, each matching
// title, an author name, or a series name.
private fun Book.matches(query: String): Boolean =
    query.split(" ").filter { it.isNotEmpty() }.all { term ->
        title.contains(term, ignoreCase = true) ||
            authorNames.any { it.contains(term, ignoreCase = true) } ||
            series.any { it.name.contains(term, ignoreCase = true) }
    }

@Composable
@OptIn(ExperimentalMaterial3Api::class)
internal fun LibraryHeader(
    selectedTab: LibraryTab,
    searchText: String,
    refreshing: Boolean,
    selectTab: (LibraryTab) -> Unit,
    updateSearch: (String) -> Unit,
    openMenu: () -> Unit,
    openSettings: () -> Unit,
    openViewOptions: (() -> Unit)? = null,
) {
    val focusManager = LocalFocusManager.current
    LaunchedEffect(Unit) {
        focusManager.clearFocus(force = true)
    }

    Surface(color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxWidth().statusBarsPadding()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = openMenu) {
                    if (refreshing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(Icons.Filled.Menu, contentDescription = "Browse library")
                    }
                }
                TextField(
                    value = searchText,
                    onValueChange = updateSearch,
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Search books") },
                    leadingIcon = {
                        Icon(Icons.Default.Search, contentDescription = null)
                    },
                    trailingIcon = if (searchText.isNotEmpty()) {
                        {
                            IconButton(onClick = { updateSearch("") }) {
                                Icon(Icons.Default.Close, contentDescription = "Clear search")
                            }
                        }
                    } else {
                        null
                    },
                    singleLine = true,
                    shape = CircleShape,
                    colors = TextFieldDefaults.colors(
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                    ),
                )
                openViewOptions?.let { open ->
                    IconButton(onClick = open) {
                        Icon(Icons.Default.Tune, contentDescription = "View options")
                    }
                }
                IconButton(onClick = openSettings) {
                    Icon(Icons.Default.Settings, contentDescription = "Server settings")
                }
            }
            PrimaryTabRow(selectedTabIndex = selectedTab.ordinal) {
                LibraryTab.entries.forEach { tab ->
                    Tab(
                        selected = selectedTab == tab,
                        onClick = { selectTab(tab) },
                        text = { Text(tab.label) },
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyLibrary(title: String, message: String, action: (() -> Unit)? = null) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, style = MaterialTheme.typography.headlineSmall)
            Text(message, modifier = Modifier.padding(top = 8.dp))
            if (action != null) {
                OutlinedButton(onClick = action, modifier = Modifier.padding(top = 16.dp)) {
                    Text("Open settings")
                }
            }
        }
    }
}

@Composable
internal fun BookCover(
    book: Book,
    width: Int,
    height: Int,
    revision: Int,
    load: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cached: (Book, Boolean) -> Bitmap?,
    modifier: Modifier,
    onPrimaryBitmap: (Bitmap?) -> Unit = {},
    artworkScale: Float = COVER_SCALE,
    showsPanel: Boolean = true,
    layersMedia: Boolean = true,
    showsReadaloudBadge: Boolean = true,
    showsProgressBadge: Boolean = false,
    progressColor: Color? = null,
    progressBackgroundColor: Color? = null,
    preferredArtwork: CoverStyle = CoverStyle.Auto,
    cornerRadius: Dp = 6.dp,
) {
    val ebookState = rememberCoverLoadState(
        book = book,
        audio = false,
        available = book.hasEbook || book.hasReadaloud,
        width = width,
        height = height,
        revision = revision,
        load = load,
        cached = cached,
    )
    val audioState = rememberCoverLoadState(
        book = book,
        audio = true,
        available = book.hasAudio,
        width = width,
        height = width,
        revision = revision,
        load = load,
        cached = cached,
    )
    val ebookBitmap = (ebookState as? CoverLoadState.Loaded)?.bitmap
    val audioBitmap = (audioState as? CoverLoadState.Loaded)?.bitmap
    val loadedEbookImage = remember(ebookBitmap) { ebookBitmap?.asImageBitmap() }
    val loadedAudioImage = remember(audioBitmap) { audioBitmap?.asImageBitmap() }
    val ebookImage = if (preferredArtwork == CoverStyle.Audio && loadedAudioImage != null) {
        null
    } else {
        loadedEbookImage
    }
    val audioImage = if (preferredArtwork == CoverStyle.Ebook && loadedEbookImage != null) {
        null
    } else {
        loadedAudioImage
    }
    val darkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val backgroundColor = if (showsPanel) {
        rememberCoverBackgroundColor(
            ebookBitmap ?: audioBitmap,
            darkTheme,
            book = book,
            audio = ebookBitmap == null,
        )
    } else {
        Color.Transparent
    }
    val primaryBitmap = ebookBitmap ?: audioBitmap
    LaunchedEffect(primaryBitmap) {
        primaryBitmap?.let(onPrimaryBitmap)
    }
    val coverShape = RoundedCornerShape(cornerRadius)

    Surface(
        modifier = modifier,
        shape = coverShape,
        color = if (showsPanel) backgroundColor else Color.Transparent,
        shadowElevation = if (showsPanel) 2.dp else 0.dp,
    ) {
        BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            val coverWidth = maxWidth * artworkScale
            val ebookHeight = coverWidth / EBOOK_ASPECT_RATIO
            val shift = maxWidth * COVER_SPREAD
            val hasBothCovers = layersMedia && ebookImage != null && audioImage != null
            // Unsynced ebook+audiobook pairs sit slightly askew until aligned, unless
            // the double-cover alignment setting forces them straight.
            val tilted = hasBothCovers && !book.hasReadaloud &&
                CoverColorSettings.doubleCoverAlignment != "straight"

            if (audioImage != null && (layersMedia || ebookImage == null)) {
                Image(
                    bitmap = audioImage,
                    contentDescription = "${book.title} audiobook cover",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .size(coverWidth)
                        .offset(x = if (hasBothCovers) shift else 0.dp)
                        .rotate(if (tilted) 2.5f else 0f)
                        .clip(coverShape)
                        .zIndex(1f),
                )
            }

            if (ebookImage != null) {
                Image(
                    bitmap = ebookImage,
                    contentDescription = "${book.title} ebook cover",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .width(coverWidth)
                        .height(ebookHeight)
                        .offset(x = if (hasBothCovers) -shift else 0.dp)
                        .rotate(if (tilted) -2.5f else 0f)
                        .clip(coverShape)
                        .zIndex(2f),
                )
            }

            if (ebookImage == null && audioImage == null) {
                if (ebookState == CoverLoadState.Loading ||
                    audioState == CoverLoadState.Loading
                ) {
                    CircularProgressIndicator()
                } else {
                    Text("No cover", style = MaterialTheme.typography.bodySmall)
                }
            }

            if (showsReadaloudBadge && book.hasReadaloud &&
                (ebookImage != null || audioImage != null)
            ) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                        .size(22.dp)
                        .zIndex(3f),
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f),
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_readaloud),
                        contentDescription = "Readaloud available",
                        tint = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(4.dp),
                    )
                }
            }

            if (showsProgressBadge && (ebookImage != null || audioImage != null)) {
                Surface(
                    modifier = Modifier.align(Alignment.BottomEnd).padding(3.dp).size(22.dp).zIndex(3f),
                    shape = CircleShape,
                    color = progressBackgroundColor
                        ?: MaterialTheme.colorScheme.surface.copy(alpha = 0.82f),
                ) {
                    CircularProgressIndicator(
                        progress = { book.progress.toFloat().coerceIn(0f, 1f) },
                        modifier = Modifier.padding(2.dp),
                        strokeWidth = 2.dp,
                        color = progressColor ?: MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}

@Composable
private fun rememberCoverLoadState(
    book: Book,
    audio: Boolean,
    available: Boolean,
    width: Int,
    height: Int,
    revision: Int,
    load: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cached: (Book, Boolean) -> Bitmap?,
): CoverLoadState {
    val initialState = if (!available) {
        CoverLoadState.Missing
    } else {
        cached(book, audio)?.let(CoverLoadState::Loaded) ?: CoverLoadState.Loading
    }
    val state by produceState<CoverLoadState>(
        initialState,
        book.id,
        book.coverVersion,
        audio,
        available,
        width,
        height,
        revision,
    ) {
        if (!available) {
            value = CoverLoadState.Missing
            return@produceState
        }
        cached(book, audio)?.let {
            value = CoverLoadState.Loaded(it)
            return@produceState
        }
        value = CoverLoadState.Loading
        value = runCatching { load(book, audio, width, height) }.getOrNull()
            ?.let(CoverLoadState::Loaded)
            ?: CoverLoadState.Missing
    }
    return state
}
