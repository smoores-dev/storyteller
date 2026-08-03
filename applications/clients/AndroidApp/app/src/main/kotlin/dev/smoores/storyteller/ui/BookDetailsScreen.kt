package dev.smoores.storyteller.ui

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.automirrored.filled.FormatAlignLeft
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ArrowBackIosNew
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import dev.smoores.storyteller.model.AlignmentOverrideState
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.BookAlignmentReport
import dev.smoores.storyteller.model.DownloadOperation
import dev.smoores.storyteller.model.IdentifierContext
import dev.smoores.storyteller.model.IdentifierRow
import dev.smoores.storyteller.model.IdentifierType
import dev.smoores.storyteller.model.QuickEditContext
import dev.smoores.storyteller.model.QuickEditFields
import dev.smoores.storyteller.model.QuickEditResult
import dev.smoores.storyteller.model.RatingContext
import dev.smoores.storyteller.model.RatingDraft
import dev.smoores.storyteller.model.RatingSaveResult
import kotlinx.coroutines.launch

@Composable
internal fun BookDetailsScreen(
    book: Book,
    library: List<Book>,
    pendingDownloads: Set<DownloadOperation>,
    coverRevision: Int,
    modifier: Modifier,
    navigateBack: () -> Unit,
    openSettings: () -> Unit,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    download: (String) -> Unit,
    cancelDownload: (String) -> Unit,
    deleteDownload: (String) -> Unit,
    open: (String) -> Unit,
    selectRelated: (Book) -> Unit,
    webURL: String?,
    loadRatingContext: suspend (Book) -> RatingContext,
    saveRating: suspend (Book, RatingDraft) -> RatingSaveResult,
    removeRating: suspend (Book) -> RatingSaveResult,
    openCategory: (LibraryCategoryKind, String) -> Unit = { _, _ -> },
    loadIdentifierContext: (suspend (Book) -> IdentifierContext)? = null,
    saveIdentifiers: suspend (Book, List<IdentifierRow>) -> Boolean = { _, _ -> false },
    createIdentifierType: suspend (String, String, String) -> IdentifierType =
        { _, _, _ -> throw IllegalStateException("unavailable") },
    loadQuickEditContext: (suspend (Book) -> QuickEditContext)? = null,
    updateMetadata: suspend (Book, QuickEditFields) -> QuickEditResult =
        { _, _ -> QuickEditResult("failed", null, null) },
    loadAlignmentReport: (suspend (Book) -> BookAlignmentReport)? = null,
    saveAlignmentOverrides: suspend (Book, AlignmentOverrideState) -> Boolean = { _, _ -> false },
) {
    var showAlignmentReport by remember(book.id) { mutableStateOf(false) }
    var quickEditState by remember(book.id) { mutableStateOf<QuickEditContext?>(null) }
    var showQuickEdit by remember(book.id) { mutableStateOf(false) }
    LaunchedEffect(book.id) {
        loadQuickEditContext?.let { load ->
            quickEditState = runCatching { load(book) }.getOrNull()
        }
    }
    val ratingScope = rememberCoroutineScope()
    var ratingState by remember(book.id) { mutableStateOf<RatingContext?>(null) }
    var showRatingEditor by remember(book.id) { mutableStateOf(false) }
    var identifierState by remember(book.id) { mutableStateOf<IdentifierContext?>(null) }
    var showIdentifierEditor by remember(book.id) { mutableStateOf(false) }
    var identifierRevision by remember(book.id) { mutableStateOf(0) }
    LaunchedEffect(book.id) {
        ratingState = runCatching { loadRatingContext(book) }.getOrNull()
    }
    LaunchedEffect(book.id, identifierRevision) {
        loadIdentifierContext?.let { load ->
            identifierState = runCatching { load(book) }.getOrNull()
        }
    }
    val darkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val colorfulnessKey = CoverColorSettings.key
    val fallbackPalette = remember(darkTheme, colorfulnessKey) {
        coverBackgroundPalette(null, darkTheme)
    }
    var backgroundPalette by remember(book.id, darkTheme, colorfulnessKey) {
        mutableStateOf(fallbackPalette)
    }
    val heroColor = backgroundPalette.surface
    val onHero = if (heroColor.luminance() < 0.48f) Color.White else Color(0xff171717)
    val contentColor = backgroundPalette.contentBackground
    val relatedSeries = remember(book, library) {
        val series = book.series.firstOrNull()?.name
        if (series == null) emptyList() else library.filter {
            it.id != book.id && it.series.any { value -> value.name.equals(series, ignoreCase = true) }
        }.take(12)
    }
    val relatedAuthor = remember(book, library, relatedSeries) {
        val author = book.authorNames.firstOrNull()
        val excluded = relatedSeries.mapTo(mutableSetOf(), Book::id)
        if (author == null) emptyList() else library.filter {
            it.id != book.id && it.id !in excluded &&
                it.authorNames.any { value -> value.equals(author, ignoreCase = true) }
        }.take(12)
    }
    var pendingDeletion by remember { mutableStateOf<MediaActionOption?>(null) }
    Column(
        modifier
            .fillMaxSize()
            .background(contentColor)
            .verticalScroll(rememberScrollState())
            .padding(bottom = 24.dp),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(bottomStart = 20.dp, bottomEnd = 20.dp))
                .background(
                    Brush.verticalGradient(
                        colorStops = arrayOf(
                            0f to heroColor,
                            0.68f to heroColor,
                            0.84f to lerp(heroColor, contentColor, 0.32f),
                            1f to contentColor,
                        ),
                    ),
                )
                .statusBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(top = 12.dp)
                .padding(bottom = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                HeroIconButton(Icons.Default.ArrowBackIosNew, "Back", onHero, navigateBack)
                Spacer(Modifier.weight(1f))
                val removable = book.media.filter { it.downloaded && it.removable }
                Row(
                    Modifier.clip(RoundedCornerShape(50))
                        .background(onHero.copy(alpha = 0.08f))
                        .border(1.dp, onHero.copy(alpha = 0.16f), RoundedCornerShape(50))
                        .padding(horizontal = 8.dp),
                ) {
                    IconButton(onClick = openSettings, modifier = Modifier.size(40.dp)) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings", tint = onHero)
                    }
                    Box {
                        val context = LocalContext.current
                        var optionsExpanded by remember { mutableStateOf(false) }
                        IconButton(
                            onClick = { optionsExpanded = true },
                            enabled = webURL != null || removable.isNotEmpty() ||
                                quickEditState?.editable == true,
                            modifier = Modifier.size(40.dp),
                        ) {
                            Icon(Icons.Default.MoreHoriz, contentDescription = "Options", tint = onHero)
                        }
                        DropdownMenu(
                            expanded = optionsExpanded,
                            onDismissRequest = { optionsExpanded = false },
                        ) {
                            if (quickEditState?.editable == true) {
                                DropdownMenuItem(
                                    text = { Text("Quick Edit") },
                                    leadingIcon = {
                                        Icon(Icons.Default.Edit, contentDescription = null)
                                    },
                                    onClick = {
                                        optionsExpanded = false
                                        showQuickEdit = true
                                    },
                                )
                            }
                            webURL?.let { url ->
                                DropdownMenuItem(
                                    text = { Text("Open in Web") },
                                    leadingIcon = {
                                        Icon(Icons.Default.OpenInBrowser, contentDescription = null)
                                    },
                                    onClick = {
                                        optionsExpanded = false
                                        runCatching {
                                            context.startActivity(
                                                Intent(Intent.ACTION_VIEW, Uri.parse(url)),
                                            )
                                        }
                                    },
                                )
                            }
                            if (removable.isNotEmpty()) {
                                DropdownMenuItem(
                                    text = { Text("Delete Download") },
                                    leadingIcon = {
                                        Icon(Icons.Default.Delete, contentDescription = null)
                                    },
                                    onClick = {
                                        optionsExpanded = false
                                        pendingDeletion = removable.first().let { media ->
                                            MediaActionOption(
                                                category = media.category,
                                                title = mediaTitle(media.category),
                                                downloaded = true,
                                                removable = true,
                                                downloadState = media.downloadState,
                                                progress = media.downloadProgress,
                                            )
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
            }
            BookCover(
                book = book,
                width = 640,
                height = 960,
                revision = coverRevision,
                load = cover,
                cached = cachedCover,
                modifier = Modifier.width(152.dp).aspectRatio(0.675f),
                onPrimaryBitmap = {
                    backgroundPalette = coverBackgroundPalette(it, darkTheme)
                },
                artworkScale = 0.94f,
                showsPanel = false,
                layersMedia = false,
                showsReadaloudBadge = false,
                showsProgressBadge = true,
                progressColor = backgroundPalette.accent,
                progressBackgroundColor = backgroundPalette.accentBackground,
            )
            Text(
                book.title,
                color = onHero,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            book.subtitle?.takeIf(String::isNotBlank)?.let {
                Text(it, color = onHero.copy(alpha = 0.78f), style = MaterialTheme.typography.titleMedium)
            }
            CreatorSummary(book, onHero, openCategory)
            SeriesSummary(book, onHero, openCategory)
            val ratingContext = ratingState
            if (ratingContext?.editable == true) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    InteractiveRatingStars(
                        value = ratingContext.record?.rating ?: book.rating,
                        starSize = 17.dp,
                        spacing = 0.dp,
                        fillColor = Color(0xffffc107),
                        emptyColor = onHero.copy(alpha = 0.22f),
                        onCommit = { value ->
                            ratingScope.launch {
                                val result = runCatching {
                                    saveRating(
                                        book,
                                        RatingDraft(
                                            starsEdited = true,
                                            stars = value,
                                            sendDimensions = false,
                                            dimensions = null,
                                            reviewChanged = false,
                                            review = "",
                                        ),
                                    )
                                }.getOrNull()
                                if (result?.outcome == "saved") {
                                    ratingState = ratingContext.copy(record = result.record)
                                }
                            }
                        },
                    )
                    (ratingContext.record?.rating ?: book.rating)?.takeIf { it > 0 }?.let {
                        Text(
                            RatingMath.format(it),
                            color = onHero.copy(alpha = 0.8f),
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                    Icon(
                        Icons.Default.Edit,
                        contentDescription = "Rate & review",
                        tint = onHero.copy(alpha = 0.72f),
                        modifier = Modifier
                            .size(15.dp)
                            .clickable { showRatingEditor = true },
                    )
                }
            } else {
                Rating(book.rating, onHero)
            }
            HeroMediaSummary(book, onHero)
            MediaActions(
                book = book,
                pendingDownloads = pendingDownloads,
                modifier = Modifier.padding(top = 4.dp),
                download = download,
                cancelDownload = cancelDownload,
                palette = backgroundPalette,
                open = open,
                requestDelete = { pendingDeletion = it },
            )
            if (book.tags.isNotEmpty()) {
                TagRow(
                    book.tags,
                    onHero,
                    Modifier.padding(top = 3.dp),
                    openTag = { openCategory(LibraryCategoryKind.Tags, it) },
                )
            }
        }

        Column(
            Modifier.fillMaxWidth().background(contentColor)
                .padding(horizontal = 10.dp)
                .padding(top = 18.dp, bottom = 18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            val userReview = ratingState?.record?.review?.trim()?.takeIf { it.isNotEmpty() }
            val description = book.description?.takeIf(String::isNotBlank)
            if (description != null || userReview != null) {
                DetailCard(
                    if (userReview != null) "Description & Reviews" else "Description",
                    Icons.AutoMirrored.Filled.FormatAlignLeft,
                    palette = backgroundPalette,
                    initiallyExpanded = true,
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        description?.let {
                            if (userReview != null) {
                                Text(
                                    "Description",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                            DescriptionContent(it)
                        }
                        userReview?.let { review ->
                            if (description != null) HorizontalDivider()
                            Text(
                                ratingState?.reviewerName?.let { "Review by $it" }
                                    ?: "User Review",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = FontWeight.SemiBold,
                            )
                            ReviewContent(review)
                        }
                    }
                }
            }
            if (relatedSeries.isNotEmpty()) {
                RelatedShelf(
                    "More in ${book.series.first().name} series",
                    relatedSeries,
                    backgroundPalette,
                    coverRevision,
                    cover,
                    cachedCover,
                    selectRelated,
                )
            }
            if (relatedAuthor.isNotEmpty()) {
                RelatedShelf(
                    "More by ${book.authorNames.first()}",
                    relatedAuthor,
                    backgroundPalette,
                    coverRevision,
                    cover,
                    cachedCover,
                    selectRelated,
                )
            }
            DetailCard(
                "Book Info",
                Icons.Default.Info,
                palette = backgroundPalette,
                initiallyExpanded = true,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    BookInfo(book, openCategory)
                    identifierState?.let { identifiers ->
                        if (identifiers.displayRows.isNotEmpty() || identifiers.editable) {
                            IdentifiersSection(
                                context = identifiers,
                                onEdit = if (identifiers.editable) {
                                    { showIdentifierEditor = true }
                                } else {
                                    null
                                },
                            )
                        }
                    }
                }
            }
            DetailCard(
                "Media Info",
                Icons.Default.Inventory2,
                palette = backgroundPalette,
                initiallyExpanded = true,
            ) {
                MediaInfo(book)
            }
            book.alignmentSummary?.let { summary ->
                if (loadAlignmentReport != null) {
                    DetailCard(
                        "Alignment",
                        Icons.Default.Verified,
                        palette = backgroundPalette,
                        initiallyExpanded = true,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { showAlignmentReport = true },
                        ) {
                            GradePill(summary.grade)
                            Text("Alignment report", modifier = Modifier.weight(1f))
                            summary.score?.let {
                                Text(
                                    "$it%",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Icon(
                                Icons.Default.ChevronRight,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }

    if (showAlignmentReport && loadAlignmentReport != null) {
        AlignmentReportDialogHost(
            book = book,
            loadReport = loadAlignmentReport,
            saveOverrides = saveAlignmentOverrides,
            onDismiss = { showAlignmentReport = false },
        )
    }

    if (showQuickEdit && quickEditState?.editable == true) {
        QuickEditSheet(
            book = book,
            save = updateMetadata,
            onDismiss = { showQuickEdit = false },
        )
    }

    identifierState?.let { context ->
        if (showIdentifierEditor && context.editable) {
            IdentifierEditorSheet(
                book = book,
                context = context,
                save = saveIdentifiers,
                createType = createIdentifierType,
                onSaved = { identifierRevision += 1 },
                onDismiss = { showIdentifierEditor = false },
            )
        }
    }

    ratingState?.let { context ->
        if (showRatingEditor && context.editable) {
            RatingEditorSheet(
                book = book,
                context = context,
                accent = backgroundPalette.accent,
                saveRating = saveRating,
                removeRating = removeRating,
                onSaved = { result ->
                    ratingState = context.copy(record = result.record)
                },
                onDismiss = { showRatingEditor = false },
            )
        }
    }

    pendingDeletion?.let { option ->
        AlertDialog(
            onDismissRequest = { pendingDeletion = null },
            title = { Text("Delete download?") },
            text = { Text("Remove the downloaded ${option.title.lowercase()} from this device?") },
            confirmButton = {
                TextButton(onClick = {
                    pendingDeletion = null
                    deleteDownload(option.category)
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { pendingDeletion = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun CreatorSummary(
    book: Book,
    color: Color,
    openCategory: (LibraryCategoryKind, String) -> Unit,
) {
    if (book.authorNames.isNotEmpty()) {
        CreatorLine(
            prefix = "Written by",
            names = book.authorNames,
            color = color.copy(alpha = 0.78f),
            style = MaterialTheme.typography.bodyMedium,
            open = { openCategory(LibraryCategoryKind.Authors, it) },
        )
    } else if (book.authors.isNotBlank()) {
        Text("Written by ${book.authors}", color = color.copy(alpha = 0.78f), style = MaterialTheme.typography.bodyMedium)
    }
    if (book.narrators.isNotEmpty()) {
        CreatorLine(
            prefix = "Narrated by",
            names = book.narrators,
            color = color.copy(alpha = 0.74f),
            style = MaterialTheme.typography.bodySmall,
            open = { openCategory(LibraryCategoryKind.Narrators, it) },
        )
    }
}

// Long creator lists collapse to the first two names, matching the iOS disclosure rule.
@Composable
private fun CreatorLine(
    prefix: String,
    names: List<String>,
    color: Color,
    style: androidx.compose.ui.text.TextStyle,
    open: (String) -> Unit,
) {
    var expanded by remember(names) { mutableStateOf(false) }
    val visible = if (expanded || names.size <= 2) names else names.take(2)
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(prefix, color = color, style = style)
        // Commas trail each name so wrapped lines never start with one.
        visible.forEachIndexed { index, name ->
            Text(
                name + (if (index < visible.size - 1) "," else ""),
                color = color,
                style = style,
                modifier = Modifier.clickable { open(name) },
            )
        }
        if (!expanded && names.size > 2) {
            Text(
                "+${names.size - 2} more",
                color = color.copy(alpha = 0.6f),
                style = style,
                modifier = Modifier.clickable { expanded = true },
            )
        }
    }
}

@Composable
private fun SeriesSummary(
    book: Book,
    color: Color,
    openCategory: (LibraryCategoryKind, String) -> Unit,
) {
    book.series.forEach { series ->
        val position = series.position?.let {
            if (it % 1.0 == 0.0) it.roundToInt().toString() else it.toString()
        }
        Text(
            position?.let { "${series.name} • Book $it" } ?: series.name,
            color = color.copy(alpha = 0.86f),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.clickable {
                openCategory(LibraryCategoryKind.Series, series.name)
            },
        )
    }
}

@Composable
private fun Rating(rating: Double?, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        repeat(5) { index ->
            Icon(
                Icons.Default.Star,
                contentDescription = null,
                tint = if (rating != null && index < rating.roundToInt()) Color(0xffffc107) else color.copy(alpha = 0.22f),
                modifier = Modifier.size(17.dp),
            )
        }
        if (rating != null && rating > 0) {
            Text(" %.1f".format(rating), color = color.copy(alpha = 0.8f), style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun HeroMediaSummary(book: Book, color: Color) {
    val values = buildList {
        book.pageCount?.takeIf { it > 0 }?.let { add("$it ${if (it == 1) "page" else "pages"}") }
        book.durationDisplay.takeIf(String::isNotBlank)?.let(::add)
    }
    if (values.isNotEmpty()) {
        Text(
            values.joinToString(" • "),
            color = color.copy(alpha = 0.72f),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Normal,
        )
    }
}

@Composable
private fun TagRow(
    tags: List<String>,
    color: Color,
    modifier: Modifier = Modifier,
    openTag: ((String) -> Unit)? = null,
) {
    val uniqueTags = remember(tags) { tags.distinct() }
    var expanded by remember(tags) { mutableStateOf(false) }
    val visibleTags = if (expanded) uniqueTags else uniqueTags.take(3)

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            visibleTags.forEach { tag ->
                Text(
                    tag,
                    color = color.copy(alpha = 0.86f),
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.12f))
                        .let { base ->
                            if (openTag == null) base else base.clickable { openTag(tag) }
                        }
                        .padding(horizontal = 9.dp, vertical = 4.dp),
                )
            }
        }

        if (uniqueTags.size > 3) {
            Row(
                modifier = Modifier.clickable { expanded = !expanded },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    if (expanded) "Show less" else "${uniqueTags.size - 3} more",
                    color = color.copy(alpha = 0.82f),
                    style = MaterialTheme.typography.labelSmall,
                )
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = color.copy(alpha = 0.82f),
                    modifier = Modifier.size(16.dp).rotate(if (expanded) 180f else 0f),
                )
            }
        }
    }
}

@Composable
private fun DetailCard(
    title: String,
    icon: ImageVector,
    palette: CoverBackgroundPalette,
    initiallyExpanded: Boolean = false,
    content: @Composable () -> Unit,
) {
    var expanded by remember(title) { mutableStateOf(initiallyExpanded) }
    val cardShape = RoundedCornerShape(12.dp)
    Column(
        Modifier.fillMaxWidth().clip(cardShape)
            .background(palette.cardBackground)
            .border(1.dp, palette.cardBorder, cardShape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(if (expanded) 12.dp else 0.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().clickable { expanded = !expanded },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                title,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 10.dp).weight(1f),
                fontWeight = FontWeight.SemiBold,
            )
            Icon(
                if (expanded) Icons.Default.ExpandMore else Icons.Default.ChevronRight,
                contentDescription = if (expanded) "Collapse" else "Expand",
            )
        }
        if (expanded) {
            Box(Modifier.fillMaxWidth()) { content() }
        }
    }
}

@Composable
private fun ReviewContent(review: String) {
    var showsAll by remember(review) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            review,
            maxLines = if (showsAll) Int.MAX_VALUE else 8,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodyMedium,
        )
        if (review.length > 280) {
            Text(
                if (showsAll) "Show Less" else "Show More",
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.clickable { showsAll = !showsAll },
            )
        }
    }
}

@Composable
private fun DescriptionContent(description: String) {
    var showsAll by remember(description) { mutableStateOf(false) }
    val formatted = remember(description) { markdownDescription(description) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            formatted,
            maxLines = if (showsAll) Int.MAX_VALUE else 8,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodyMedium,
        )
        if (description.length > 280) {
            Text(
                if (showsAll) "Show Less" else "Show More",
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.clickable { showsAll = !showsAll },
            )
        }
    }
}

private fun markdownDescription(value: String) = buildAnnotatedString {
    var bold = false
    var italic = false
    var index = 0
    while (index < value.length) {
        when {
            value.startsWith("**", index) -> {
                bold = !bold
                index += 2
            }
            value[index] == '*' -> {
                italic = !italic
                index += 1
            }
            else -> {
                val next = value.indexOf('*', index).let { if (it == -1) value.length else it }
                withStyle(
                    SpanStyle(
                        fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal,
                        fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
                    ),
                ) {
                    append(value.substring(index, next).replace("__", ""))
                }
                index = next
            }
        }
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun AlignmentReportDialogHost(
    book: Book,
    loadReport: suspend (Book) -> BookAlignmentReport,
    saveOverrides: suspend (Book, AlignmentOverrideState) -> Boolean,
    onDismiss: () -> Unit,
) {
    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = androidx.compose.material3.rememberModalBottomSheetState(
            skipPartiallyExpanded = true,
        ),
    ) {
        BookAlignmentReportScreen(
            book = book,
            loadReport = loadReport,
            saveOverrides = saveOverrides,
            navigateBack = onDismiss,
            modifier = Modifier.heightIn(max = 640.dp),
        )
    }
}

@Composable
private fun IdentifiersSection(
    context: IdentifierContext,
    onEdit: (() -> Unit)?,
) {
    val androidContext = LocalContext.current
    HorizontalDivider(Modifier.padding(start = 104.dp))
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.width(104.dp),
        ) {
            Text("Identifiers", color = MaterialTheme.colorScheme.onSurfaceVariant)
            onEdit?.let {
                Icon(
                    Icons.Default.Edit,
                    contentDescription = "Edit identifiers",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(start = 6.dp)
                        .size(14.dp)
                        .clickable { it() },
                )
            }
        }
        Column(
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(2.dp),
            modifier = Modifier.weight(1f),
        ) {
            if (context.displayRows.isEmpty()) {
                Text("None", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            context.displayRows.forEach { row ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (row.label == "ISBN-13") {
                        Icon(
                            if (row.audiobookScoped) {
                                Icons.Default.Headphones
                            } else {
                                Icons.AutoMirrored.Filled.MenuBook
                            },
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(end = 4.dp).size(14.dp),
                        )
                    }
                    Text(
                        "${row.label}: ${row.value}",
                        textAlign = TextAlign.End,
                        color = if (row.url != null) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            Color.Unspecified
                        },
                        modifier = if (row.url == null) {
                            Modifier
                        } else {
                            Modifier.clickable {
                                runCatching {
                                    androidContext.startActivity(
                                        Intent(Intent.ACTION_VIEW, Uri.parse(row.url)),
                                    )
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}

private sealed interface BookInfoRow {
    data class Plain(val label: String, val value: String) : BookInfoRow
    data class Linked(
        val label: String,
        val values: List<String>,
        val open: (String) -> Unit,
    ) : BookInfoRow
}

@Composable
private fun BookInfo(book: Book, openCategory: (LibraryCategoryKind, String) -> Unit) {
    val rows = buildList {
        book.language?.takeIf(String::isNotBlank)?.let { add(BookInfoRow.Plain("Language", it)) }
        book.publicationDateDisplay.takeIf(String::isNotBlank)?.let { published ->
            if (book.publicationYear.isNotBlank()) {
                add(
                    BookInfoRow.Linked("Published", listOf(published)) {
                        openCategory(LibraryCategoryKind.Years, book.publicationYear)
                    },
                )
            } else {
                add(BookInfoRow.Plain("Published", published))
            }
        }
        if (book.tags.isNotEmpty()) {
            add(
                BookInfoRow.Linked("Tags", book.tags.distinct()) {
                    openCategory(LibraryCategoryKind.Tags, it)
                },
            )
        }
        if (book.collections.isNotEmpty()) {
            add(
                BookInfoRow.Linked("Collections", book.collections) {
                    openCategory(LibraryCategoryKind.Collections, it)
                },
            )
        }
        book.createdAtDisplay.takeIf(String::isNotBlank)?.let { add(BookInfoRow.Plain("Added", it)) }
        book.updatedAtDisplay.takeIf(String::isNotBlank)?.let { add(BookInfoRow.Plain("Updated", it)) }
    }
    Column {
        rows.forEachIndexed { index, row ->
            if (index > 0) HorizontalDivider(Modifier.padding(start = 104.dp))
            when (row) {
                is BookInfoRow.Plain -> Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Text(
                        row.label,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.width(104.dp),
                    )
                    Text(row.value, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
                }
                is BookInfoRow.Linked -> Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Text(
                        row.label,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.width(104.dp),
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.End),
                        modifier = Modifier.weight(1f),
                    ) {
                        // Commas trail each value so wrapped lines never start with one.
                        row.values.forEachIndexed { valueIndex, value ->
                            Text(
                                value + (if (valueIndex < row.values.size - 1) "," else ""),
                                textAlign = TextAlign.End,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.clickable { row.open(value) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MetadataRows(rows: List<Pair<String, String>>) {
    Column {
        rows.forEachIndexed { index, (label, value) ->
            if (index > 0) HorizontalDivider(Modifier.padding(start = 104.dp))
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(104.dp))
                Text(value, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun MediaInfo(book: Book) {
    val byCategory = book.media.associateBy { it.category }
    val rows = listOf(
        Triple("Ebook", Icons.AutoMirrored.Filled.MenuBook, byCategory["ebook"]),
        Triple("Audiobook", Icons.Default.Headphones, byCategory["audio"]),
        Triple("Readaloud", Icons.Default.GraphicEq, byCategory["synced"]),
    )
    Column {
        rows.forEachIndexed { index, (title, icon, media) ->
            if (index > 0) HorizontalDivider(Modifier.padding(start = 30.dp))
            Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Column(Modifier.padding(start = 10.dp)) {
                    Text(title, fontWeight = FontWeight.Medium)
                    Text(
                        mediaInfoSummary(media),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

private fun mediaInfoSummary(media: dev.smoores.storyteller.model.BookMedia?): String {
    if (media == null) return "Not available"
    val parts = buildList {
        when (media.category) {
            "ebook" -> {
                media.format?.takeIf(String::isNotBlank)?.let(::add)
                media.pageCount?.takeIf { it > 0 }?.let {
                    add("$it ${if (it == 1) "page" else "pages"}")
                }
                media.fileSizeDisplay.takeIf(String::isNotBlank)?.let(::add)
            }
            "audio" -> {
                media.durationDisplay.takeIf(String::isNotBlank)?.let(::add)
                media.fileSizeDisplay.takeIf(String::isNotBlank)?.let(::add)
            }
            "synced" -> {
                media.status?.takeIf(String::isNotBlank)?.let {
                    add(it.lowercase().replaceFirstChar(Char::titlecase))
                }
                media.pageCount?.takeIf { it > 0 }?.let {
                    add("$it ${if (it == 1) "page" else "pages"}")
                }
                media.durationDisplay.takeIf(String::isNotBlank)?.let(::add)
                media.fileSizeDisplay.takeIf(String::isNotBlank)?.let(::add)
            }
        }
    }
    return parts.takeIf(List<String>::isNotEmpty)?.joinToString(" • ") ?: "Available"
}

@Composable
private fun RelatedShelf(
    title: String,
    books: List<Book>,
    palette: CoverBackgroundPalette,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    select: (Book) -> Unit,
) {
    DetailCard(title, Icons.AutoMirrored.Filled.MenuBook, palette = palette) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(books, key = Book::id) { related ->
                Column(Modifier.width(80.dp).clickable { select(related) }) {
                    BookCover(
                        book = related,
                        width = 240,
                        height = 360,
                        revision = coverRevision,
                        load = cover,
                        cached = cachedCover,
                        modifier = Modifier.fillMaxWidth().aspectRatio(COVER_PANEL_ASPECT_RATIO),
                    )
                    Text(related.title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 5.dp))
                }
            }
        }
    }
}

@Composable
private fun HeroIconButton(
    icon: ImageVector,
    description: String,
    color: Color,
    action: () -> Unit,
) {
    IconButton(
        onClick = action,
        modifier = Modifier.size(35.dp).clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.08f))
            .border(1.dp, color.copy(alpha = 0.16f), RoundedCornerShape(50)),
    ) {
        Icon(icon, contentDescription = description, tint = color, modifier = Modifier.size(18.dp))
    }
}

private fun mediaTitle(category: String): String = when (category) {
    "ebook" -> "Ebook"
    "audio" -> "Audiobook"
    "synced" -> "Readaloud"
    else -> "Media"
}

@Composable
private fun MediaActions(
    book: Book,
    pendingDownloads: Set<DownloadOperation>,
    modifier: Modifier = Modifier,
    download: (String) -> Unit,
    cancelDownload: (String) -> Unit,
    palette: CoverBackgroundPalette,
    open: (String) -> Unit,
    requestDelete: (MediaActionOption) -> Unit,
) {
    val options = book.media.mapNotNull { media ->
        val title = when (media.category) {
            "ebook" -> "Ebook"
            "audio" -> "Audiobook"
            "synced" -> "Readaloud"
            else -> return@mapNotNull null
        }
        MediaActionOption(
            category = media.category,
            title = title,
            downloaded = media.downloaded,
            removable = media.removable,
            downloadState = media.downloadState,
            progress = media.downloadProgress,
        )
    }
    if (options.isEmpty()) return

    Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        options.forEach { option ->
            MediaAction(
                option = option,
                pending = DownloadOperation(book.id, option.category) in pendingDownloads,
                modifier = Modifier.weight(1f),
                palette = palette,
                download = { download(option.category) },
                cancelDownload = { cancelDownload(option.category) },
                play = { open(option.category) },
                delete = if (option.removable) ({ requestDelete(option) }) else null,
            )
        }
    }

}

private data class MediaActionOption(
    val category: String,
    val title: String,
    val downloaded: Boolean,
    val removable: Boolean,
    val downloadState: String?,
    val progress: Double?,
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MediaAction(
    option: MediaActionOption,
    pending: Boolean,
    modifier: Modifier,
    palette: CoverBackgroundPalette,
    download: () -> Unit,
    cancelDownload: () -> Unit,
    play: () -> Unit,
    delete: (() -> Unit)?,
) {
    val cancellable = option.downloadState == "queued" ||
        option.downloadState == "downloading"
    val finishing = option.downloadState == "importing" ||
        option.downloadState == "completed"
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        when {
            option.downloaded -> Surface(
                shape = RoundedCornerShape(9.dp),
                color = palette.accentBackground,
                contentColor = palette.brightAccent,
                modifier = Modifier.minimumInteractiveComponentSize().fillMaxWidth(),
            ) {
                Row(
                    Modifier
                        .combinedClickable(onClick = play, onLongClick = delete)
                        .heightIn(min = 40.dp)
                        .padding(MediaActionContentPadding),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    MediaActionLabel(option.title)
                }
            }
            cancellable || finishing || pending -> OutlinedButton(
                onClick = cancelDownload,
                enabled = cancellable,
                modifier = Modifier.fillMaxWidth().heightIn(min = 36.dp),
                shape = RoundedCornerShape(9.dp),
                border = null,
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = palette.accentBackground,
                    contentColor = palette.brightAccent,
                    disabledContainerColor = palette.accentBackground,
                    disabledContentColor = palette.mutedAccent,
                ),
                contentPadding = MediaActionContentPadding,
            ) {
                MediaProgress(option.progress, palette.brightAccent)
                Spacer(Modifier.width(4.dp))
                MediaActionLabel(option.title)
                if (cancellable) {
                    Spacer(Modifier.width(2.dp))
                    Icon(
                        Icons.Default.Close,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
            else -> Button(
                onClick = download,
                modifier = Modifier.fillMaxWidth().heightIn(min = 36.dp),
                shape = RoundedCornerShape(9.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = palette.accentBackground,
                    contentColor = palette.mutedAccent,
                ),
                contentPadding = MediaActionContentPadding,
            ) {
                Icon(
                    Icons.Default.ArrowDownward,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(4.dp))
                MediaActionLabel(option.title)
            }
        }
    }
}

@Composable
private fun MediaActionLabel(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.labelSmall,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
private fun MediaProgress(progress: Double?, color: Color) {
    if (progress != null && progress > 0) {
        CircularProgressIndicator(
            progress = { progress.toFloat().coerceIn(0f, 1f) },
            modifier = Modifier.size(18.dp),
            strokeWidth = 2.dp,
            color = color,
        )
    } else {
        CircularProgressIndicator(
            modifier = Modifier.size(18.dp),
            strokeWidth = 2.dp,
            color = color,
        )
    }
}

private val MediaActionContentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)
