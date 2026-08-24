package dev.smoores.storyteller.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.systemGestureExclusion
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.CallToAction
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FormatSize
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.SmartDisplay
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.WebAsset
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
import dev.smoores.storyteller.model.PlayerComplication
import dev.smoores.storyteller.model.ReaderHighlight
import dev.smoores.storyteller.model.ReaderHighlightPaletteEntry
import dev.smoores.storyteller.model.ReaderSearchState
import dev.smoores.storyteller.model.ReaderTocEntry
import java.util.Locale
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

private val customizeMenuItems = listOf(
    Triple("Text & Layout", Icons.Filled.FormatSize, CustomizeCard.TEXT_LAYOUT),
    Triple("Readaloud", Icons.Filled.Brush, CustomizeCard.READALOUD),
    Triple("Theme", Icons.Filled.Palette, CustomizeCard.THEME),
    Triple("Menu Bar", Icons.Filled.WebAsset, CustomizeCard.MENU_BAR),
    Triple("Miniplayer", Icons.Filled.SmartDisplay, CustomizeCard.MINIPLAYER),
    Triple("Dock", Icons.Filled.CallToAction, CustomizeCard.DOCK),
    Triple("Full Player", Icons.Filled.PlayCircle, CustomizeCard.FULL_PLAYER),
)

// Port of EbookPlayerMenuBar.swift: back chevron, then the configured slots,
// then the Customize menu, which always stays last.
@Composable
internal fun ReaderMenuBar(
    backgroundColor: Color,
    contentColor: Color,
    menuBarSlots: List<PlayerComplication>,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    isOrientationLocked: Boolean,
    onBack: () -> Unit,
    onShowCustomize: (CustomizeCard) -> Unit,
    modifier: Modifier = Modifier,
) {
    var customizeMenuOpen by remember { mutableStateOf(false) }
    val visibleSlots = menuBarSlots.filter {
        it != PlayerComplication.NONE && (display.hasAudioNarration || !it.requiresAudio)
    }
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
            visibleSlots.forEach { complication ->
                PlayerComplicationView(
                    complication = complication,
                    display = display,
                    actions = actions,
                    style = ComplicationStyle.MenuBar(contentColor),
                    isOrientationLocked = isOrientationLocked,
                    contentColor = contentColor,
                )
            }
            Box {
                IconButton(onClick = { customizeMenuOpen = true }) {
                    Icon(Icons.Filled.Tune, contentDescription = "Customize")
                }
                DropdownMenu(
                    expanded = customizeMenuOpen,
                    onDismissRequest = { customizeMenuOpen = false },
                ) {
                    Text(
                        "Customize:",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    )
                    customizeMenuItems.forEach { (label, icon, card) ->
                        DropdownMenuItem(
                            text = { Text(label) },
                            leadingIcon = { Icon(icon, contentDescription = null) },
                            onClick = {
                                customizeMenuOpen = false
                                onShowCustomize(card)
                            },
                        )
                    }
                }
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

// Mirrors formatTimeClock in Kit/Utilities/TimeFormatting.swift.
internal fun formatTimeClock(time: Double?): String {
    if (time == null || !time.isFinite()) return "--:--"
    val totalSeconds = time.roundToInt().coerceAtLeast(0)
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    return if (hours > 0) {
        String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format(Locale.US, "%d:%02d", minutes, seconds)
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

@Composable
internal fun SettingsSectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.padding(top = 4.dp),
    )
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
    icon: ImageVector? = null,
) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(end = 6.dp)
                        .size(16.dp),
                )
            }
            Text(
                "$label: ${format(value.toFloat())}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Slider(
            value = value.toFloat(),
            onValueChange = onPreview,
            onValueChangeFinished = { onCommit(value.toFloat()) },
            valueRange = range,
            // Thumbs at the range ends sit inside the system back-gesture
            // strip; without this, grabbing them triggers back instead.
            modifier = Modifier.systemGestureExclusion(),
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

