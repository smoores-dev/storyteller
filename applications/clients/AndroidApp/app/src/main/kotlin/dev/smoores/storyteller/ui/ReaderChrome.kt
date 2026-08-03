package dev.smoores.storyteller.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FormatAlignJustify
import androidx.compose.material.icons.automirrored.filled.FormatAlignLeft
import androidx.compose.material.icons.automirrored.filled.FormatAlignRight
import androidx.compose.material.icons.filled.FormatSize
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.automirrored.filled.RotateLeft
import androidx.compose.material.icons.automirrored.filled.RotateRight
import androidx.compose.material.icons.automirrored.filled.Toc
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.ReaderDisplaySettings
import dev.smoores.storyteller.model.ReaderHighlight
import dev.smoores.storyteller.model.ReaderHighlightPaletteEntry
import dev.smoores.storyteller.model.ReaderOverlayOptions
import dev.smoores.storyteller.model.ReaderSearchState
import dev.smoores.storyteller.model.ReaderTheme
import dev.smoores.storyteller.model.ReaderTocEntry
import kotlin.math.roundToInt
import org.json.JSONObject

// Fallback matching ReaderTheme.builtInLight/builtInDark for frames where the
// Swift side has not yet published effective theme colors.
internal fun readerChromeColors(isDark: Boolean): Pair<Color, Color> {
    return if (isDark) {
        Color(0xFF1A1A1A) to Color(0xFFEEEEEE)
    } else {
        Color.White to Color.Black
    }
}

internal fun parseHexColor(value: String?): Color? {
    if (value.isNullOrEmpty()) return null
    return runCatching { Color(android.graphics.Color.parseColor(value)) }.getOrNull()
}

internal fun selectedTocIndex(toc: List<ReaderTocEntry>, sectionIndex: Int?): Int? {
    if (sectionIndex == null) return null
    val exact = toc.indexOfFirst { it.sectionIndex == sectionIndex }
    if (exact >= 0) return exact
    return toc.indexOfLast { it.sectionIndex < sectionIndex }.takeIf { it >= 0 }
}

@Composable
internal fun ReaderTopBar(
    backgroundColor: Color,
    contentColor: Color,
    onBack: () -> Unit,
    onShowSearch: () -> Unit,
    onShowBookmarks: () -> Unit,
    onShowToc: () -> Unit,
    onShowSettings: () -> Unit,
    onShowDisplayOptions: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(color = backgroundColor, contentColor = contentColor, modifier = modifier) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .height(48.dp)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            Spacer(modifier = Modifier.weight(1f))
            IconButton(onClick = onShowSearch) {
                Icon(Icons.Filled.Search, contentDescription = "Search in book")
            }
            IconButton(onClick = onShowBookmarks) {
                Icon(Icons.Filled.Bookmark, contentDescription = "Highlights and bookmarks")
            }
            IconButton(onClick = onShowToc) {
                Icon(Icons.AutoMirrored.Filled.Toc, contentDescription = "Contents")
            }
            IconButton(onClick = onShowSettings) {
                Icon(Icons.Filled.FormatSize, contentDescription = "Customize reader")
            }
            IconButton(onClick = onShowDisplayOptions) {
                Icon(Icons.Filled.MoreHoriz, contentDescription = "Display options")
            }
        }
    }
}

@Composable
internal fun HighlightEditorDialog(
    title: String,
    selectedText: String,
    palette: List<ReaderHighlightPaletteEntry>,
    initialColorId: String?,
    initialNote: String,
    isEditing: Boolean,
    onSave: (String?, String) -> Unit,
    onDelete: (() -> Unit)?,
    onDismiss: () -> Unit,
) {
    var colorId by remember { mutableStateOf(initialColorId ?: palette.firstOrNull()?.id) }
    var bookmarkOnly by remember { mutableStateOf(isEditing && initialColorId == null) }
    var note by remember { mutableStateOf(initialNote) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "“$selectedText”",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 4,
                )
                if (!bookmarkOnly) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        palette.forEach { entry ->
                            val swatch = parseHexColor(entry.color) ?: Color.Gray
                            Box(
                                modifier = Modifier
                                    .width(32.dp)
                                    .height(32.dp)
                                    .background(swatch, CircleShape)
                                    .border(
                                        width = if (entry.id == colorId) 3.dp else 1.dp,
                                        color = if (entry.id == colorId) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            Color.Gray.copy(alpha = 0.5f)
                                        },
                                        shape = CircleShape,
                                    )
                                    .clickable { colorId = entry.id },
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Note (optional)") },
                    minLines = 2,
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                SettingSwitch(
                    label = "Bookmark only (no highlight color)",
                    checked = bookmarkOnly,
                    onToggle = { bookmarkOnly = it },
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(if (bookmarkOnly) null else colorId, note.trim()) },
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            Row {
                if (onDelete != null) {
                    TextButton(onClick = onDelete) {
                        Text("Delete", color = MaterialTheme.colorScheme.error)
                    }
                }
                TextButton(onClick = onDismiss) {
                    Text("Cancel")
                }
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReaderBookmarksSheet(
    highlights: List<ReaderHighlight>,
    palette: List<ReaderHighlightPaletteEntry>,
    onSelect: (ReaderHighlight) -> Unit,
    onDelete: (ReaderHighlight) -> Unit,
    onDismiss: () -> Unit,
) {
    val paletteColors = palette.associate { it.id to parseHexColor(it.color) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Text(
            "Highlights & Bookmarks",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
        )
        if (highlights.isEmpty()) {
            Text(
                "Select text in the book to add a highlight or bookmark.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 24.dp),
            )
        }
        LazyColumn(modifier = Modifier.fillMaxHeight(0.7f)) {
            itemsIndexed(highlights) { _, highlight ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(highlight) }
                        .padding(horizontal = 24.dp, vertical = 10.dp),
                ) {
                    if (highlight.isBookmark) {
                        Icon(
                            Icons.Filled.Bookmark,
                            contentDescription = "Bookmark",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.width(20.dp),
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .width(14.dp)
                                .height(14.dp)
                                .background(
                                    paletteColors[highlight.colorId] ?: Color.Gray,
                                    CircleShape,
                                ),
                        )
                    }
                    Column(
                        modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            highlight.text,
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 2,
                        )
                        highlight.note?.takeIf { it.isNotBlank() }?.let { note ->
                            Text(
                                note,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 2,
                            )
                        }
                        highlight.chapterTitle?.let { chapter ->
                            Text(
                                chapter,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }
                    }
                    IconButton(onClick = { onDelete(highlight) }) {
                        Icon(Icons.Filled.Close, contentDescription = "Delete")
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReaderSearchSheet(
    search: ReaderSearchState,
    onSearch: (String, Boolean, Boolean) -> Unit,
    onClear: () -> Unit,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf(search.query) }
    var matchCase by remember { mutableStateOf(false) }
    var matchWholeWords by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val submit = {
        if (query.isNotBlank()) {
            focusManager.clearFocus()
            onSearch(query.trim(), matchCase, matchWholeWords)
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            modifier = Modifier
                .fillMaxHeight(0.75f)
                .padding(horizontal = 24.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("Search in book") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { submit() }),
                trailingIcon = {
                    if (query.isNotEmpty()) {
                        IconButton(
                            onClick = {
                                query = ""
                                onClear()
                            },
                        ) {
                            Icon(Icons.Filled.Close, contentDescription = "Clear search")
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FilterChip(
                    selected = matchCase,
                    onClick = { matchCase = !matchCase },
                    label = { Text("Match Case") },
                )
                FilterChip(
                    selected = matchWholeWords,
                    onClick = { matchWholeWords = !matchWholeWords },
                    label = { Text("Whole Words") },
                )
                Spacer(modifier = Modifier.weight(1f))
                TextButton(onClick = submit, enabled = query.isNotBlank()) {
                    Text("Search")
                }
            }

            if (search.isSearching) {
                LinearProgressIndicator(
                    progress = { search.progress.toFloat().coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            search.error?.let { error ->
                Text(error, color = MaterialTheme.colorScheme.error)
            }
            if (search.query.isNotEmpty() && !search.isSearching && search.error == null) {
                Text(
                    if (search.totalCount == 1) {
                        "1 result for “${search.query}”"
                    } else {
                        "${search.totalCount} results for “${search.query}”"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            LazyColumn {
                search.sections.forEach { section ->
                    if (section.results.isEmpty()) return@forEach
                    item {
                        Text(
                            section.label,
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
                        )
                    }
                    itemsIndexed(section.results) { _, result ->
                        Text(
                            buildAnnotatedString {
                                append(result.pre)
                                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                                    append(result.match)
                                }
                                append(result.post)
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSelect(result.cfi) }
                                .padding(vertical = 8.dp),
                        )
                    }
                }
            }
        }
    }
}

// Fixed band heights so toggling individual items never resizes the fitted
// webview. Only enabling/disabling playback controls changes the band. The
// overlay is only visible while system bars are hidden (nav inset 0), so the
// band the webview reserves is exactly padding + content + padding.
private val OverlayControlsContentHeight = 56.dp
private val OverlayStatsContentHeight = 34.dp

// The webview may run right up to the overlay content. Only the content box
// and the padding below it stay clear.
internal fun readerOverlayReservedInset(withPlaybackControls: Boolean): Dp =
    (if (withPlaybackControls) OverlayControlsContentHeight else OverlayStatsContentHeight) + 22.dp

@Composable
internal fun ReaderBottomOverlay(
    statsVisible: Boolean,
    hasAudioNarration: Boolean,
    isPlaying: Boolean,
    options: ReaderOverlayOptions,
    positionAtTop: Boolean,
    miniPlayerVisible: Boolean,
    bookFraction: Double?,
    currentPage: Int?,
    totalPages: Int?,
    bookTimeRemaining: Double?,
    chapterTimeRemaining: Double?,
    backgroundColor: Color,
    readerControl: (String, Double, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val statsColor = Color.Gray.copy(alpha = 0.8f)
    val hasBookStats = (options.showProgress && bookFraction != null) ||
        (options.showPageNumber && currentPage != null && (totalPages ?: 0) > 0)
    val hasTimeStats = hasAudioNarration &&
        (options.showTimeRemainingInBook || options.showTimeRemainingInChapter)
    val hasStats = statsVisible && (hasBookStats || hasTimeStats)
    // Sizing must ignore transient visibility so the band height stays stable.
    val controlsEnabled = hasAudioNarration &&
        (options.showSkipBackward || options.showPlayPause || options.showSkipForward)
    // The mini player owns the playback controls whenever it is on screen.
    val hasControls = controlsEnabled && !miniPlayerVisible

    Surface(
        color = if (hasStats || hasControls) backgroundColor else Color.Transparent,
        modifier = modifier,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (positionAtTop) {
                        Modifier.statusBarsPadding()
                    } else {
                        Modifier.navigationBarsPadding()
                    }
                )
                .padding(
                    start = 20.dp,
                    end = 20.dp,
                    top = 8.dp,
                    bottom = if (positionAtTop) 8.dp else 22.dp,
                )
                .then(
                    if (positionAtTop) {
                        Modifier
                    } else {
                        Modifier.height(
                            if (controlsEnabled) {
                                OverlayControlsContentHeight
                            } else {
                                OverlayStatsContentHeight
                            }
                        )
                    }
                ),
        ) {
            if (statsVisible) {
                Column(
                    modifier = Modifier.align(Alignment.CenterStart),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    if (options.showProgress && bookFraction != null) {
                        StatRow(
                            text = "${(bookFraction.coerceIn(0.0, 1.0) * 100).roundToInt()}%",
                            icon = Icons.AutoMirrored.Filled.MenuBook,
                            iconLeading = true,
                            color = statsColor,
                        )
                    }
                    if (options.showPageNumber &&
                        currentPage != null && totalPages != null && totalPages > 0
                    ) {
                        StatRow(
                            text = "Page $currentPage of $totalPages",
                            icon = Icons.Filled.Bookmark,
                            iconLeading = true,
                            color = statsColor,
                        )
                    }
                }
                if (hasTimeStats) {
                    Column(
                        modifier = Modifier.align(Alignment.CenterEnd),
                        horizontalAlignment = Alignment.End,
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        if (options.showTimeRemainingInBook) {
                            StatRow(
                                text = formatTimeHoursMinutes(bookTimeRemaining),
                                icon = Icons.AutoMirrored.Filled.MenuBook,
                                iconLeading = false,
                                color = statsColor,
                            )
                        }
                        if (options.showTimeRemainingInChapter) {
                            StatRow(
                                text = formatTimeMinutesSeconds(chapterTimeRemaining),
                                icon = Icons.Filled.Bookmark,
                                iconLeading = false,
                                color = statsColor,
                            )
                        }
                    }
                }
            }
            if (hasControls) {
                Row(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalArrangement = Arrangement.spacedBy(20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (options.showSkipBackward) {
                        OverlayControl(
                            icon = Icons.AutoMirrored.Filled.RotateLeft,
                            contentDescription = "Skip back",
                            tint = statsColor,
                            buttonSize = 46.dp,
                            iconSize = 22.dp,
                            onClick = { readerControl("prevSentence", 0.0, "") },
                        )
                    }
                    if (options.showPlayPause) {
                        OverlayControl(
                            icon = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                            contentDescription = if (isPlaying) "Pause" else "Play",
                            tint = statsColor,
                            buttonSize = 56.dp,
                            iconSize = 28.dp,
                            onClick = { readerControl("togglePlayPause", 0.0, "") },
                        )
                    }
                    if (options.showSkipForward) {
                        OverlayControl(
                            icon = Icons.AutoMirrored.Filled.RotateRight,
                            contentDescription = "Skip forward",
                            tint = statsColor,
                            buttonSize = 46.dp,
                            iconSize = 22.dp,
                            onClick = { readerControl("nextSentence", 0.0, "") },
                        )
                    }
                }
            }
        }
    }
}

// IconButton pads itself out to a 48dp touch target, which crowds the stats.
@Composable
private fun OverlayControl(
    icon: ImageVector,
    contentDescription: String,
    tint: Color,
    buttonSize: Dp,
    iconSize: Dp,
    onClick: () -> Unit,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .size(buttonSize),
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            tint = tint,
            modifier = Modifier.size(iconSize),
        )
    }
}

@Composable
private fun StatRow(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconLeading: Boolean,
    color: Color,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (iconLeading) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.width(14.dp))
        }
        Text(text, style = MaterialTheme.typography.labelSmall, color = color)
        if (!iconLeading) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.width(14.dp))
        }
    }
}

internal fun formatTimeHoursMinutes(time: Double?): String {
    if (time == null || !time.isFinite()) return "—h—m"
    val totalSeconds = time.roundToInt().coerceAtLeast(0)
    return "${totalSeconds / 3600}h${(totalSeconds % 3600) / 60}m"
}

internal fun formatTimeMinutesSeconds(time: Double?): String {
    if (time == null || !time.isFinite()) return "—m—s"
    val totalSeconds = time.roundToInt().coerceAtLeast(0)
    return "${totalSeconds / 60}m${totalSeconds % 60}s"
}

@Composable
internal fun ReaderProgressHairline(
    fraction: Double,
    isDark: Boolean,
    modifier: Modifier = Modifier,
) {
    val inset = 0.1f
    Row(modifier = modifier.fillMaxWidth().height(3.dp)) {
        Spacer(modifier = Modifier.weight(inset))
        Box(modifier = Modifier.weight(1f - inset * 2)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction.coerceIn(0.0, 1.0).toFloat())
                    .height(3.dp)
                    .align(Alignment.CenterStart)
                    .background(Color.Gray.copy(alpha = if (isDark) 0.6f else 0.7f)),
            )
        }
        Spacer(modifier = Modifier.weight(inset))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReaderDisplayOptionsSheet(
    options: ReaderOverlayOptions,
    lockViewToAudio: Boolean,
    hasAudioNarration: Boolean,
    onChangeOptions: (ReaderOverlayOptions) -> Unit,
    onChangeLockViewToAudio: (Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            modifier = Modifier
                .fillMaxHeight(0.7f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Display Options", style = MaterialTheme.typography.titleMedium)

            if (hasAudioNarration) {
                SettingsSectionHeader("Playback")
                SettingSwitch(
                    label = "Free Browse When Paused",
                    checked = !lockViewToAudio,
                    onToggle = { onChangeLockViewToAudio(!it) },
                )

                SettingsSectionHeader("Mini Player")
                SettingSwitch(
                    label = "Always Show",
                    checked = options.alwaysShowMiniPlayer,
                    onToggle = { onChangeOptions(options.copy(alwaysShowMiniPlayer = it)) },
                )
                SettingSwitch(
                    label = "Show Stats Below",
                    checked = options.showMiniPlayerStats,
                    onToggle = { onChangeOptions(options.copy(showMiniPlayerStats = it)) },
                )
            }

            SettingsSectionHeader("Overlay Info")
            SettingSwitch(
                label = "Book Progress",
                checked = options.showProgress,
                onToggle = { onChangeOptions(options.copy(showProgress = it)) },
            )
            SettingSwitch(
                label = "Page Number",
                checked = options.showPageNumber,
                onToggle = { onChangeOptions(options.copy(showPageNumber = it)) },
            )
            if (hasAudioNarration) {
                SettingSwitch(
                    label = "Time in Book",
                    checked = options.showTimeRemainingInBook,
                    onToggle = { onChangeOptions(options.copy(showTimeRemainingInBook = it)) },
                )
                SettingSwitch(
                    label = "Time in Chapter",
                    checked = options.showTimeRemainingInChapter,
                    onToggle = { onChangeOptions(options.copy(showTimeRemainingInChapter = it)) },
                )

                SettingsSectionHeader("Overlay Controls")
                SettingSwitch(
                    label = "Skip Back",
                    checked = options.showSkipBackward,
                    onToggle = { onChangeOptions(options.copy(showSkipBackward = it)) },
                )
                SettingSwitch(
                    label = "Play/Pause",
                    checked = options.showPlayPause,
                    onToggle = { onChangeOptions(options.copy(showPlayPause = it)) },
                )
                SettingSwitch(
                    label = "Skip Forward",
                    checked = options.showSkipForward,
                    onToggle = { onChangeOptions(options.copy(showSkipForward = it)) },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReaderTocSheet(
    toc: List<ReaderTocEntry>,
    selectedIndex: Int?,
    onSelect: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val listState = rememberLazyListState(
        initialFirstVisibleItemIndex = (selectedIndex ?: 0).coerceAtLeast(0),
    )
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Text(
            "Contents",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
        )
        LazyColumn(state = listState, modifier = Modifier.fillMaxHeight(0.75f)) {
            itemsIndexed(toc) { index, entry ->
                val selected = index == selectedIndex
                Text(
                    entry.label,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (selected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(index) }
                        .padding(
                            start = (24 + entry.level * 20).dp,
                            end = 24.dp,
                            top = 12.dp,
                            bottom = 12.dp,
                        ),
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReaderSettingsSheet(
    settings: ReaderDisplaySettings,
    themes: List<ReaderTheme>,
    selectedLightThemeId: String?,
    selectedDarkThemeId: String?,
    onChange: (ReaderDisplaySettings, Boolean) -> Unit,
    onReset: () -> Unit,
    onSelectLightTheme: (String) -> Unit,
    onSelectDarkTheme: (String) -> Unit,
    onShowManageThemes: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        // Capped height so the page stays visible behind the sheet for live
        // preview, like the 0.7-fraction detent on iOS.
        Column(
            modifier = Modifier
                .fillMaxHeight(0.62f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Customize Reader", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.weight(1f))
                TextButton(onClick = onReset) {
                    Text("Reset to Defaults")
                }
            }

            SettingsSectionHeader("Reader")

            SettingSlider(
                label = "Font Size",
                value = settings.fontSize,
                range = 8f..60f,
                format = { "${it.roundToInt()}" },
                onPreview = { onChange(settings.copy(fontSize = it.roundToInt().toDouble()), false) },
                onCommit = { onChange(settings.copy(fontSize = it.roundToInt().toDouble()), true) },
            )

            ChipRow(
                label = "Font",
                options = listOf(
                    "System Default" to "Default",
                    "serif" to "Serif",
                    "sans-serif" to "Sans",
                    "monospace" to "Mono",
                ),
                selected = settings.fontFamily,
                onSelect = { onChange(settings.copy(fontFamily = it), true) },
            )

            SettingSwitch(
                label = "Single Column",
                checked = settings.singleColumnMode || settings.scrollingMode,
                enabled = !settings.scrollingMode,
                onToggle = { onChange(settings.copy(singleColumnMode = it), true) },
            )
            SettingSwitch(
                label = "Scrolling Mode",
                checked = settings.scrollingMode,
                onToggle = { onChange(settings.copy(scrollingMode = it), true) },
            )
            SettingSwitch(
                label = "Margin Tap to Turn Pages",
                checked = settings.enableMarginClickNavigation,
                onToggle = { onChange(settings.copy(enableMarginClickNavigation = it), true) },
            )

            SettingSlider(
                label = "Line Spacing",
                value = settings.lineSpacing,
                range = 1f..2.5f,
                format = { String.format("%.1f", it) },
                onPreview = { onChange(settings.copy(lineSpacing = roundTo(it, 1)), false) },
                onCommit = { onChange(settings.copy(lineSpacing = roundTo(it, 1)), true) },
            )

            AlignmentRow(
                selected = settings.textAlignment,
                onSelect = { onChange(settings.copy(textAlignment = it), true) },
            )

            HorizontalDivider()

            SettingSlider(
                label = "Margins (Left/Right)",
                value = settings.marginLeftRight,
                range = 0f..30f,
                format = { "${it.roundToInt()}%" },
                onPreview = {
                    onChange(settings.copy(marginLeftRight = it.roundToInt().toDouble()), false)
                },
                onCommit = {
                    onChange(settings.copy(marginLeftRight = it.roundToInt().toDouble()), true)
                },
            )
            SettingSlider(
                label = "Margins (Top/Bottom)",
                value = settings.marginTopBottom,
                range = 0f..30f,
                format = { "${it.roundToInt()}%" },
                onPreview = {
                    onChange(settings.copy(marginTopBottom = it.roundToInt().toDouble()), false)
                },
                onCommit = {
                    onChange(settings.copy(marginTopBottom = it.roundToInt().toDouble()), true)
                },
            )

            HorizontalDivider()

            SettingSlider(
                label = "Word Spacing",
                value = settings.wordSpacing,
                range = -0.5f..2f,
                format = { String.format("%.1fem", it) },
                onPreview = { onChange(settings.copy(wordSpacing = roundTo(it, 1)), false) },
                onCommit = { onChange(settings.copy(wordSpacing = roundTo(it, 1)), true) },
            )
            SettingSlider(
                label = "Letter Spacing",
                value = settings.letterSpacing,
                range = -0.1f..0.5f,
                format = { String.format("%.2fem", it) },
                onPreview = { onChange(settings.copy(letterSpacing = roundTo(it, 2)), false) },
                onCommit = { onChange(settings.copy(letterSpacing = roundTo(it, 2)), true) },
            )

            HorizontalDivider()

            SettingsSectionHeader("Themes")

            ThemePickerRow(
                label = "Light Mode Theme",
                themes = themes.filter { it.availableForLight() },
                selectedId = selectedLightThemeId,
                onSelect = onSelectLightTheme,
            )
            ThemePickerRow(
                label = "Dark Mode Theme",
                themes = themes.filter { it.availableForDark() },
                selectedId = selectedDarkThemeId,
                onSelect = onSelectDarkTheme,
            )
            TextButton(onClick = onShowManageThemes) {
                Icon(Icons.Filled.Palette, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Manage Themes...")
            }
        }
    }
}

@Composable
internal fun SettingsSectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.padding(top = 4.dp),
    )
}

@Composable
private fun ThemePickerRow(
    label: String,
    themes: List<ReaderTheme>,
    selectedId: String?,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = themes.firstOrNull { it.id == selectedId }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        Box {
            TextButton(onClick = { expanded = true }) {
                selected?.let {
                    ThemeSwatch(it, size = 22.dp)
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text(selected?.name ?: "Select")
                Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                themes.forEach { theme ->
                    DropdownMenuItem(
                        text = { Text(theme.name) },
                        leadingIcon = { ThemeSwatch(theme, size = 24.dp) },
                        trailingIcon = {
                            if (theme.id == selectedId) {
                                Icon(Icons.Filled.Check, contentDescription = "Selected")
                            }
                        },
                        onClick = {
                            expanded = false
                            onSelect(theme.id)
                        },
                    )
                }
            }
        }
    }
}

internal fun roundTo(value: Float, decimals: Int): Double {
    var factor = 1.0
    repeat(decimals) { factor *= 10 }
    return (value * factor).roundToInt() / factor
}

@Composable
internal fun SettingSlider(
    label: String,
    value: Double,
    range: ClosedFloatingPointRange<Float>,
    format: (Float) -> String,
    onPreview: (Float) -> Unit,
    onCommit: (Float) -> Unit,
) {
    Column {
        Text(
            "$label: ${format(value.toFloat())}",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Slider(
            value = value.toFloat(),
            onValueChange = onPreview,
            onValueChangeFinished = { onCommit(value.toFloat()) },
            valueRange = range,
        )
    }
}

@Composable
internal fun SettingSwitch(
    label: String,
    checked: Boolean,
    onToggle: (Boolean) -> Unit,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onToggle, enabled = enabled)
    }
}

@Composable
internal fun ChipRow(
    label: String,
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    Column {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { (value, display) ->
                FilterChip(
                    selected = selected == value,
                    onClick = { onSelect(value) },
                    label = { Text(display) },
                )
            }
        }
    }
}

@Composable
private fun AlignmentRow(
    selected: String,
    onSelect: (String) -> Unit,
) {
    Column {
        Text(
            "Text Alignment",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                "left" to Icons.AutoMirrored.Filled.FormatAlignLeft,
                "justify" to Icons.Filled.FormatAlignJustify,
                "right" to Icons.AutoMirrored.Filled.FormatAlignRight,
            ).forEach { (value, icon) ->
                FilterChip(
                    selected = selected == value,
                    onClick = { onSelect(value) },
                    label = { Icon(icon, contentDescription = value) },
                )
            }
        }
    }
}
