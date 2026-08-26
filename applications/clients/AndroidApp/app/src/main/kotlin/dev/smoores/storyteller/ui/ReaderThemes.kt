package dev.smoores.storyteller.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import dev.smoores.storyteller.model.ReaderTheme
import kotlin.math.roundToInt
import org.json.JSONArray
import org.json.JSONObject

internal data class ThemeEditorRequest(
    val theme: ReaderTheme,
    val existingId: String?,
)

@Composable
internal fun ThemeSwatch(theme: ReaderTheme, size: Dp) {
    Box(
        modifier = Modifier
            .size(size)
            .background(
                resolveThemeColorPreview(theme.backgroundColor) ?: Color.Gray,
                RoundedCornerShape(size / 4),
            )
            .border(
                1.dp,
                Color.Gray.copy(alpha = 0.5f),
                RoundedCornerShape(size / 4),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            "Aa",
            style = MaterialTheme.typography.labelSmall,
            color = resolveThemeColorPreview(theme.foregroundColor) ?: Color.White,
        )
    }
}

private fun duplicateName(source: ReaderTheme, themes: List<ReaderTheme>): String {
    val base = "${source.name} Copy"
    if (themes.none { it.name == base }) return base
    var counter = 2
    while (themes.any { it.name == "$base $counter" }) counter++
    return "$base $counter"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ManageThemesSheet(
    themes: List<ReaderTheme>,
    selectedLightThemeId: String?,
    selectedDarkThemeId: String?,
    onSelectLightTheme: (String) -> Unit,
    onSelectDarkTheme: (String) -> Unit,
    onSaveTheme: (String) -> Unit,
    onDeleteTheme: (String) -> Unit,
    onResetTheme: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        ManageThemesContent(
            themes = themes,
            selectedLightThemeId = selectedLightThemeId,
            selectedDarkThemeId = selectedDarkThemeId,
            onSelectLightTheme = onSelectLightTheme,
            onSelectDarkTheme = onSelectDarkTheme,
            onSaveTheme = onSaveTheme,
            onDeleteTheme = onDeleteTheme,
            onResetTheme = onResetTheme,
            listModifier = Modifier
                .fillMaxHeight(0.75f)
                .navigationBarsPadding(),
        )
    }
}

@Composable
internal fun ManageThemesContent(
    themes: List<ReaderTheme>,
    selectedLightThemeId: String?,
    selectedDarkThemeId: String?,
    onSelectLightTheme: (String) -> Unit,
    onSelectDarkTheme: (String) -> Unit,
    onSaveTheme: (String) -> Unit,
    onDeleteTheme: (String) -> Unit,
    onResetTheme: (String) -> Unit,
    listModifier: Modifier = Modifier,
) {
    var editorRequest by remember { mutableStateOf<ThemeEditorRequest?>(null) }
    var confirmDelete by remember { mutableStateOf<ReaderTheme?>(null) }
    var newThemeMenuOpen by remember { mutableStateOf(false) }

    val builtIn = themes.filter { it.isBuiltIn }
    val custom = themes.filter { !it.isBuiltIn }

    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Manage Themes", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.weight(1f))
            Box {
                IconButton(onClick = { newThemeMenuOpen = true }) {
                    Icon(Icons.Filled.Add, contentDescription = "New theme")
                }
                DropdownMenu(
                    expanded = newThemeMenuOpen,
                    onDismissRequest = { newThemeMenuOpen = false },
                ) {
                    themes.forEach { source ->
                        DropdownMenuItem(
                            text = { Text("From \"${source.name}\"") },
                            leadingIcon = { ThemeSwatch(source, size = 24.dp) },
                            onClick = {
                                newThemeMenuOpen = false
                                editorRequest = ThemeEditorRequest(
                                    theme = source.copy(
                                        name = duplicateName(source, themes),
                                    ),
                                    existingId = null,
                                )
                            },
                        )
                    }
                }
            }
        }
        LazyColumn(modifier = listModifier) {
            item { ThemeListSectionHeader("Built-in Themes") }
            items(builtIn, key = { it.id }) { theme ->
                ThemeManageRow(
                    theme = theme,
                    isActiveLight = theme.id == selectedLightThemeId,
                    isActiveDark = theme.id == selectedDarkThemeId,
                    onTap = {
                        editorRequest = ThemeEditorRequest(
                            theme = theme,
                            existingId = theme.id,
                        )
                    },
                    onSelectLight = { onSelectLightTheme(theme.id) },
                    onSelectDark = { onSelectDarkTheme(theme.id) },
                    onDuplicate = {
                        onSaveTheme(
                            theme.copy(name = duplicateName(theme, themes))
                                .toEditJson(includeId = false)
                        )
                    },
                    onReset = if (theme.isEdited) {
                        { onResetTheme(theme.id) }
                    } else {
                        null
                    },
                    onDelete = null,
                )
            }
            if (custom.isNotEmpty()) {
                item { ThemeListSectionHeader("Custom Themes") }
                items(custom, key = { it.id }) { theme ->
                    ThemeManageRow(
                        theme = theme,
                        isActiveLight = theme.id == selectedLightThemeId,
                        isActiveDark = theme.id == selectedDarkThemeId,
                        onTap = {
                            editorRequest = ThemeEditorRequest(
                                theme = theme,
                                existingId = theme.id,
                            )
                        },
                        onSelectLight = { onSelectLightTheme(theme.id) },
                        onSelectDark = { onSelectDarkTheme(theme.id) },
                        onDuplicate = {
                            onSaveTheme(
                                theme.copy(name = duplicateName(theme, themes))
                                    .toEditJson(includeId = false)
                            )
                        },
                        onReset = null,
                        onDelete = { confirmDelete = theme },
                    )
                }
            }
        }
    }

    editorRequest?.let { request ->
        ThemeEditorDialog(
            initial = request.theme,
            existingId = request.existingId,
            onSave = { json ->
                onSaveTheme(json)
                editorRequest = null
            },
            onDelete = if (request.existingId != null && !request.theme.isBuiltIn) {
                {
                    editorRequest = null
                    confirmDelete = themes.firstOrNull { it.id == request.existingId }
                }
            } else {
                null
            },
            onDismiss = { editorRequest = null },
        )
    }

    confirmDelete?.let { theme ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("Delete Theme?") },
            text = { Text("This theme will be permanently deleted.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        onDeleteTheme(theme.id)
                        confirmDelete = null
                    },
                ) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = null }) {
                    Text("Cancel")
                }
            },
        )
    }
}

@Composable
private fun ThemeListSectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
    )
}

private fun highlightModeLabel(mode: String): String = when (mode) {
    "text" -> "Text highlight"
    "underline" -> "Underline highlight"
    else -> "Background highlight"
}

private fun appearanceLabel(appearance: String): String = when (appearance) {
    "light" -> "Light only"
    "dark" -> "Dark only"
    else -> "Both"
}

@Composable
private fun ThemeManageRow(
    theme: ReaderTheme,
    isActiveLight: Boolean,
    isActiveDark: Boolean,
    onTap: () -> Unit,
    onSelectLight: () -> Unit,
    onSelectDark: () -> Unit,
    onDuplicate: () -> Unit,
    onReset: (() -> Unit)?,
    onDelete: (() -> Unit)?,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onTap)
            .padding(horizontal = 24.dp, vertical = 10.dp),
    ) {
        ThemeSwatch(theme, size = 34.dp)
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(theme.name, style = MaterialTheme.typography.bodyLarge)
            Text(
                "${highlightModeLabel(theme.readaloudHighlightMode)} · " +
                    appearanceLabel(theme.appearance) +
                    if (theme.isEdited) " · Edited" else "",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (isActiveLight) {
            Icon(
                Icons.Filled.LightMode,
                contentDescription = "Active light theme",
                tint = Color(0xFFE8A33D),
                modifier = Modifier.padding(end = 8.dp),
            )
        }
        if (isActiveDark) {
            Icon(
                Icons.Filled.DarkMode,
                contentDescription = "Active dark theme",
                tint = Color(0xFF6C6CD9),
                modifier = Modifier.padding(end = 8.dp),
            )
        }
        Box {
            IconButton(onClick = { menuOpen = true }) {
                Icon(Icons.Filled.MoreVert, contentDescription = "Theme options")
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                if (theme.availableForLight()) {
                    DropdownMenuItem(
                        text = { Text("Use for Light Mode") },
                        onClick = {
                            menuOpen = false
                            onSelectLight()
                        },
                    )
                }
                if (theme.availableForDark()) {
                    DropdownMenuItem(
                        text = { Text("Use for Dark Mode") },
                        onClick = {
                            menuOpen = false
                            onSelectDark()
                        },
                    )
                }
                DropdownMenuItem(
                    text = { Text("Duplicate") },
                    onClick = {
                        menuOpen = false
                        onDuplicate()
                    },
                )
                if (onReset != null) {
                    DropdownMenuItem(
                        text = { Text("Reset to Stock") },
                        onClick = {
                            menuOpen = false
                            onReset()
                        },
                    )
                }
                if (onDelete != null) {
                    DropdownMenuItem(
                        text = { Text("Delete", color = MaterialTheme.colorScheme.error) },
                        onClick = {
                            menuOpen = false
                            onDelete()
                        },
                    )
                }
            }
        }
    }
}

internal val themePresetColors = listOf(
    "#FFD60A", "#FF9F0A", "#FF453A", "#FF375F", "#BF5AF2", "#5E5CE6", "#0A84FF",
    "#FFF59D", "#FFCC80", "#EF9A9A", "#F48FB1", "#CE93D8", "#90CAF9", "#A5D6A7",
    "#FFFFFF", "#FAF4E8", "#F5E9D5", "#E4EBF5", "#1A1A1A", "#22252A", "#000000",
)

private val highlightModeOptions = listOf(
    "background" to "Background",
    "text" to "Text",
    "underline" to "Underline",
)

private const val kPreviewLead = "A soft rain traced the window as "
private const val kPreviewReadaloud = "the narrator read this sentence aloud"
private const val kPreviewMid = ". You can also "
private const val kPreviewUser = "mark favorite passages"
private const val kPreviewTail = " with your own highlights."

@Composable
private fun ThemePreviewCard(
    background: String,
    foreground: String,
    readaloudColor: String,
    readaloudMode: String,
    readaloudThickness: Float,
    readaloudFade: Float,
    readaloudItalic: Boolean,
    readaloudBold: Boolean,
    readaloudUnderlineStyle: String,
    userColor: String,
    userMode: String,
    modifier: Modifier = Modifier,
) {
    val backgroundParsed = resolveThemeColorPreview(background) ?: Color.White
    val foregroundParsed = resolveThemeColorPreview(foreground) ?: Color.Black
    val readaloudParsed = resolveThemeColorPreview(readaloudColor) ?: Color.Blue
    val userParsed = parseHexColor(userColor) ?: Color.Yellow

    val readaloudStart = kPreviewLead.length
    val readaloudEnd = readaloudStart + kPreviewReadaloud.length
    val userStart = readaloudEnd + kPreviewMid.length
    val userEnd = userStart + kPreviewUser.length

    val annotated = buildAnnotatedString {
        append(kPreviewLead)
        if (readaloudMode == "text") {
            withStyle(
                SpanStyle(
                    color = readaloudParsed,
                    fontStyle = if (readaloudItalic) FontStyle.Italic else null,
                    fontWeight = if (readaloudBold) FontWeight.Bold else null,
                ),
            ) {
                append(kPreviewReadaloud)
            }
        } else {
            append(kPreviewReadaloud)
        }
        append(kPreviewMid)
        if (userMode == "text") {
            withStyle(SpanStyle(color = userParsed)) { append(kPreviewUser) }
        } else {
            append(kPreviewUser)
        }
        append(kPreviewTail)
    }

    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    Surface(
        color = backgroundParsed,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)),
        modifier = modifier.fillMaxWidth(),
    ) {
        Text(
            annotated,
            color = foregroundParsed,
            style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Serif),
            onTextLayout = { layout = it },
            modifier = Modifier
                .padding(horizontal = 16.dp, vertical = 14.dp)
                .drawBehind {
                    layout?.let {
                        drawRangeHighlight(
                            it, readaloudStart, readaloudEnd,
                            readaloudParsed, readaloudMode, readaloudThickness,
                            alpha = (1f - readaloudFade).coerceIn(0f, 1f),
                            underlineStyle = readaloudUnderlineStyle,
                        )
                        drawRangeHighlight(it, userStart, userEnd, userParsed, userMode, 1f)
                    }
                },
        )
    }
}

private fun DrawScope.drawRangeHighlight(
    layout: TextLayoutResult,
    start: Int,
    end: Int,
    color: Color,
    mode: String,
    thickness: Float,
    alpha: Float = 1f,
    underlineStyle: String = "solid",
) {
    if (mode == "text") return
    val startLine = layout.getLineForOffset(start)
    val endLine = layout.getLineForOffset(end - 1)
    for (line in startLine..endLine) {
        val segmentStart = maxOf(start, layout.getLineStart(line))
        val segmentEnd = minOf(end, layout.getLineEnd(line, visibleEnd = true))
        if (segmentEnd <= segmentStart) continue
        val left = layout.getHorizontalPosition(segmentStart, usePrimaryDirection = true)
        val right = layout.getHorizontalPosition(segmentEnd, usePrimaryDirection = true)
        if (right <= left) continue
        if (mode == "underline") {
            val y = layout.getLineBaseline(line) + 3.dp.toPx()
            when (underlineStyle) {
                "double" -> {
                    val gap = 2.5.dp.toPx()
                    drawRect(
                        color,
                        topLeft = Offset(left, y - gap),
                        size = Size(right - left, 1.dp.toPx()),
                    )
                    drawRect(
                        color,
                        topLeft = Offset(left, y),
                        size = Size(right - left, 1.dp.toPx()),
                    )
                }
                "squiggle" -> {
                    val period = 2.5.dp.toPx()
                    val amplitude = 2.dp.toPx()
                    val path = Path()
                    var x = left
                    var up = true
                    path.moveTo(x, y)
                    while (x < right) {
                        x = minOf(x + period, right)
                        path.lineTo(x, if (up) y - amplitude else y)
                        up = !up
                    }
                    drawPath(path, color, style = Stroke(width = 1.2f.dp.toPx()))
                }
                else -> drawRect(
                    color,
                    topLeft = Offset(left, y),
                    size = Size(right - left, 2.dp.toPx()),
                )
            }
        } else {
            val top = layout.getLineTop(line)
            val bottom = layout.getLineBottom(line)
            val center = (top + bottom) / 2f
            val halfHeight = (bottom - top) / 2f * thickness
            drawRect(
                color.copy(alpha = color.alpha * alpha),
                topLeft = Offset(left, center - halfHeight),
                size = Size(right - left, halfHeight * 2f),
            )
        }
    }
}

@Composable
internal fun ThemeEditorDialog(
    initial: ReaderTheme,
    existingId: String?,
    onSave: (String) -> Unit,
    onDelete: (() -> Unit)?,
    onDismiss: () -> Unit,
    // 0 Theme, 1 Readaloud, 2 Highlights, 3 Advanced; mirrors ThemeEditorTab.
    initialTab: Int = 0,
) {
    val isBuiltInEdit = initial.isBuiltIn && existingId != null
    val isDarkTheme = isSystemInDarkTheme()
    val initialDark =
        initial.appearance == "dark" || (initial.appearance == "any" && isDarkTheme)
    var name by remember { mutableStateOf(initial.name) }
    var appearance by remember { mutableStateOf(initial.appearance) }
    var background by remember {
        mutableStateOf(normalizeCoverValue(initial.backgroundColor, "background", initialDark))
    }
    var foreground by remember {
        mutableStateOf(normalizeCoverValue(initial.foregroundColor, "foreground", initialDark))
    }
    var highlight by remember {
        mutableStateOf(normalizeCoverValue(initial.highlightColor, "highlight", initialDark))
    }
    var highlightThickness by remember { mutableStateOf(initial.highlightThickness) }
    var readaloudMode by remember { mutableStateOf(initial.readaloudHighlightMode) }
    var readaloudFade by remember { mutableStateOf(initial.readaloudHighlightFade) }
    var coverStrengthBackground by remember { mutableStateOf(initial.coverStrengthBackground) }
    var coverStrengthForeground by remember { mutableStateOf(initial.coverStrengthForeground) }
    var coverStrengthHighlight by remember { mutableStateOf(initial.coverStrengthHighlight) }
    var readaloudItalic by remember { mutableStateOf(initial.readaloudTextItalic) }
    var readaloudBold by remember { mutableStateOf(initial.readaloudTextBold) }
    var readaloudUnderlineStyle by remember { mutableStateOf(initial.readaloudUnderlineStyle) }
    var userMode by remember { mutableStateOf(initial.userHighlightMode) }
    var userColors by remember {
        mutableStateOf(List(6) { initial.userHighlightColors.getOrElse(it) { "#FFFFFF" } })
    }
    var userLabels by remember {
        mutableStateOf(List(6) { initial.userHighlightLabels.getOrElse(it) { "" } })
    }
    var customCSS by remember { mutableStateOf(initial.customCSS.orEmpty()) }
    var tab by remember { mutableIntStateOf(initialTab) }
    var previewUserIndex by remember { mutableIntStateOf(0) }
    val editorDark = appearance == "dark" || (appearance == "any" && isDarkTheme)

    val valid = (isBuiltInEdit || name.isNotBlank()) &&
        (isCoverValue(background) || parseHexColor(background) != null) &&
        (isCoverValue(foreground) || parseHexColor(foreground) != null) &&
        (isCoverValue(highlight) || parseHexColor(highlight) != null) &&
        userColors.all { parseHexColor(it) != null }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Text(
                        when {
                            isBuiltInEdit -> initial.name
                            existingId == null -> "New Theme"
                            else -> "Edit Theme"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                    )
                    TextButton(
                        enabled = valid,
                        onClick = {
                            val json = JSONObject().apply {
                                existingId?.let { put("id", it) }
                                put("name", if (isBuiltInEdit) initial.name else name.trim())
                                put(
                                    "appearance",
                                    if (isBuiltInEdit) initial.appearance else appearance,
                                )
                                put("backgroundColor", background.trim())
                                put("foregroundColor", foreground.trim())
                                put("highlightColor", highlight.trim())
                                put("highlightThickness", highlightThickness)
                                put("readaloudHighlightMode", readaloudMode)
                                put("userHighlightMode", userMode)
                                put("userHighlightColors", JSONArray(userColors.map { it.trim() }))
                                put("userHighlightLabels", JSONArray(userLabels))
                                put("customCSS", customCSS.trim())
                                put("readaloudHighlightFade", readaloudFade)
                                put("coverStrengthBackground", coverStrengthBackground)
                                put("coverStrengthForeground", coverStrengthForeground)
                                put("coverStrengthHighlight", coverStrengthHighlight)
                                put("readaloudTextItalic", readaloudItalic)
                                put("readaloudTextBold", readaloudBold)
                                put("readaloudUnderlineStyle", readaloudUnderlineStyle)
                            }.toString()
                            onSave(json)
                        },
                    ) {
                        Text("Save")
                    }
                }
                ThemePreviewCard(
                    background = background,
                    foreground = foreground,
                    readaloudColor = highlight,
                    readaloudMode = readaloudMode,
                    readaloudThickness = highlightThickness.toFloat(),
                    readaloudFade = readaloudFade.toFloat(),
                    readaloudItalic = readaloudItalic,
                    readaloudBold = readaloudBold,
                    readaloudUnderlineStyle = readaloudUnderlineStyle,
                    userColor = userColors.getOrElse(previewUserIndex) { "#FFFFFF" },
                    userMode = userMode,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
                )
                TabRow(selectedTabIndex = tab) {
                    listOf("Theme", "Readaloud", "Highlights", "Advanced")
                        .forEachIndexed { index, label ->
                            Tab(
                                selected = tab == index,
                                onClick = { tab = index },
                                text = { Text(label, maxLines = 1) },
                            )
                        }
                }
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp, vertical = 16.dp)
                        .navigationBarsPadding(),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    when (tab) {
                        0 -> {
                            if (isBuiltInEdit) {
                                Text(
                                    "This built-in theme stays available in its " +
                                        "appearance mode. Restore the stock look anytime " +
                                        "with Reset to Stock in Manage Themes.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            } else {
                                OutlinedTextField(
                                    value = name,
                                    onValueChange = { name = it },
                                    label = { Text("Theme Name") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                ChipRow(
                                    label = "Show In",
                                    options = listOf(
                                        "any" to "Light & Dark",
                                        "light" to "Light Only",
                                        "dark" to "Dark Only",
                                    ),
                                    selected = appearance,
                                    onSelect = { appearance = it },
                                )
                            }
                            ThemeColorRow(
                                label = "Background",
                                value = background,
                                onChange = { background = it },
                                role = "background",
                                dark = editorDark,
                            )
                            ThemeColorRow(
                                label = "Text",
                                value = foreground,
                                onChange = { foreground = it },
                                role = "foreground",
                                dark = editorDark,
                            )
                            if (onDelete != null) {
                                Spacer(modifier = Modifier.padding(top = 8.dp))
                                TextButton(onClick = onDelete) {
                                    Text("Delete Theme", color = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                        1 -> {
                            ChipRow(
                                label = "Style",
                                options = highlightModeOptions,
                                selected = readaloudMode,
                                onSelect = { readaloudMode = it },
                            )
                            SettingsSectionHeader("Highlight Color")
                            ThemeColorRow(
                                label = "Highlight",
                                value = highlight,
                                onChange = { highlight = it },
                                role = "highlight",
                                dark = editorDark,
                            )
                            // Mirrors ThemeEditorView.readaloudSection.
                            when (readaloudMode) {
                                "text" -> {
                                    SettingSwitch(
                                        label = "Italic",
                                        checked = readaloudItalic,
                                        onToggle = { readaloudItalic = it },
                                    )
                                    SettingSwitch(
                                        label = "Bold",
                                        checked = readaloudBold,
                                        onToggle = { readaloudBold = it },
                                    )
                                }
                                "underline" -> ChipRow(
                                    label = "Underline Style",
                                    options = listOf(
                                        "solid" to "Single",
                                        "double" to "Double",
                                        "squiggle" to "Squiggle",
                                    ),
                                    selected = readaloudUnderlineStyle,
                                    onSelect = { readaloudUnderlineStyle = it },
                                )
                                else -> {
                                    SettingSlider(
                                        label = "Highlight Transparency",
                                        value = readaloudFade,
                                        range = 0f..0.9f,
                                        format = { "${(it * 100).roundToInt()}%" },
                                        onPreview = { readaloudFade = roundTo(it, 2) },
                                        onCommit = { readaloudFade = roundTo(it, 2) },
                                    )
                                    Text(
                                        "Fades the highlight block into the page.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    SettingSlider(
                                        label = "Line Height",
                                        value = highlightThickness,
                                        range = 0.6f..4f,
                                        format = { String.format("%.1fx", it) },
                                        onPreview = { highlightThickness = roundTo(it, 1) },
                                        onCommit = { highlightThickness = roundTo(it, 1) },
                                    )
                                }
                            }
                        }
                        2 -> {
                            ChipRow(
                                label = "Style",
                                options = highlightModeOptions,
                                selected = userMode,
                                onSelect = { userMode = it },
                            )
                            userColors.forEachIndexed { index, colorValue ->
                                UserHighlightRow(
                                    label = userLabels[index],
                                    color = colorValue,
                                    onLabelChange = { updated ->
                                        userLabels = userLabels.toMutableList()
                                            .also { it[index] = updated }
                                    },
                                    onColorChange = { updated ->
                                        previewUserIndex = index
                                        userColors = userColors.toMutableList()
                                            .also { it[index] = updated }
                                    },
                                    onExpand = { previewUserIndex = index },
                                )
                            }
                        }
                        else -> {
                            SettingsSectionHeader("Custom CSS")
                            OutlinedTextField(
                                value = customCSS,
                                onValueChange = { customCSS = it },
                                minLines = 4,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                    Spacer(modifier = Modifier.padding(bottom = 12.dp))
                }
            }
        }
    }
}

internal const val COVER_COLOR_TOKEN = "cover"

private const val FALLBACK_COVER_HUE = 201.6f

internal fun coverComponents(value: String?): Pair<Float, Float>? {
    if (value == null) return null
    val prefix = "$COVER_COLOR_TOKEN:"
    if (!value.lowercase().startsWith(prefix)) return null
    val parts = value.substring(prefix.length).split(",")
    if (parts.size != 2) return null
    val saturation = parts[0].toFloatOrNull() ?: return null
    val brightness = parts[1].toFloatOrNull() ?: return null
    return saturation.coerceIn(0f, 1f) to brightness.coerceIn(0f, 1f)
}

internal fun isCoverValue(value: String?): Boolean =
    value.equals(COVER_COLOR_TOKEN, ignoreCase = true) || coverComponents(value) != null

internal fun coverValueString(saturation: Float, brightness: Float): String {
    val s = (saturation.coerceIn(0f, 1f) * 1000).roundToInt() / 1000.0
    val b = (brightness.coerceIn(0f, 1f) * 1000).roundToInt() / 1000.0
    return "$COVER_COLOR_TOKEN:$s,$b"
}

internal fun defaultCoverComponents(role: String, dark: Boolean): Pair<Float, Float> = when {
    role == "background" && dark -> 0.25f to 0.10f
    role == "background" -> 0.02f to 0.98f
    role == "foreground" && dark -> 0.05f to 0.95f
    role == "foreground" -> 1.0f to 0.25f
    dark -> 0.35f to 1.0f
    else -> 1.0f to 0.65f
}

internal fun stockThemeValue(role: String, dark: Boolean): String = when (role) {
    "background" -> if (dark) "#1A1A1A" else "#FFFFFF"
    "foreground" -> if (dark) "#EEEEEE" else "#000000"
    else -> if (dark) "#E63513" else "#AE1917"
}

@Composable
internal fun resolveThemeColorPreview(value: String?): Color? {
    coverComponents(value)?.let { (s, b) ->
        return Color.hsv(LocalCoverHue.current ?: FALLBACK_COVER_HUE, s, b)
    }
    return parseHexColor(value)
}

private fun normalizeCoverValue(value: String, role: String, dark: Boolean): String {
    if (!value.equals(COVER_COLOR_TOKEN, ignoreCase = true)) return value
    val (s, b) = defaultCoverComponents(role, dark)
    return coverValueString(s, b)
}

@Composable
private fun SliderWithReset(
    onReset: () -> Unit,
    slider: @Composable () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(modifier = Modifier.weight(1f)) { slider() }
        Icon(
            Icons.Filled.Refresh,
            contentDescription = "Reset",
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .size(18.dp)
                .clickable { onReset() },
        )
    }
}

@Composable
private fun ThemeColorRow(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    role: String,
    dark: Boolean,
) {
    var showPicker by remember { mutableStateOf(false) }
    val usesCoverHue = isCoverValue(value)
    val coverHue = LocalCoverHue.current ?: FALLBACK_COVER_HUE
    var hue by remember { mutableFloatStateOf(coverHue) }
    var saturation by remember { mutableFloatStateOf(0f) }
    var brightness by remember { mutableFloatStateOf(1f) }
    var lastCommitted by remember { mutableStateOf<String?>(null) }

    fun resetComponents(): Triple<Float, Float, Float> {
        if (usesCoverHue) {
            val (s, b) = defaultCoverComponents(role, dark)
            return Triple(coverHue, s, b)
        }
        val stock = stockThemeValue(role, dark)
        coverComponents(stock)?.let { (s, b) -> return Triple(coverHue, s, b) }
        val color = parseHexColor(stock) ?: return Triple(hue, saturation, brightness)
        val hsv = FloatArray(3)
        android.graphics.Color.colorToHSV(color.toArgb(), hsv)
        return Triple(hsv[0], hsv[1], hsv[2])
    }

    fun adopt(raw: String) {
        coverComponents(raw)?.let { (s, b) ->
            saturation = s
            brightness = b
            hue = coverHue
            return
        }
        if (raw.equals(COVER_COLOR_TOKEN, ignoreCase = true)) {
            val (s, b) = defaultCoverComponents(role, dark)
            saturation = s
            brightness = b
            hue = coverHue
            return
        }
        val color = parseHexColor(raw) ?: return
        val hsv = FloatArray(3)
        android.graphics.Color.colorToHSV(color.toArgb(), hsv)
        if (hsv[1] > 0f || hsv[0] > 0f) hue = hsv[0]
        saturation = hsv[1]
        brightness = hsv[2]
    }

    LaunchedEffect(value) {
        if (value != lastCommitted) adopt(value)
    }

    val displayHue = (if (usesCoverHue) coverHue else hue).coerceIn(0f, 360f)
    val resolvedHex = colorToHex(Color.hsv(displayHue, saturation, brightness))

    fun commit() {
        val committed = if (usesCoverHue) {
            coverValueString(saturation, brightness)
        } else {
            colorToHex(Color.hsv(hue.coerceIn(0f, 360f), saturation, brightness))
        }
        lastCommitted = committed
        onChange(committed)
    }

    val clipboard = LocalClipboardManager.current

    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(
                1.dp,
                MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
                RoundedCornerShape(12.dp),
            )
            .padding(12.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.weight(1f),
            )
            Text(
                resolvedHex.uppercase(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .clickable { clipboard.setText(AnnotatedString(resolvedHex.uppercase())) }
                    .padding(end = 12.dp),
            )
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .background(parseHexColor(resolvedHex) ?: Color.Transparent, CircleShape)
                    .border(1.dp, Color.Gray.copy(alpha = 0.5f), CircleShape)
                    .clickable { showPicker = !showPicker },
            )
        }
        SettingSwitch(
            label = "Derive hue from cover",
            checked = usesCoverHue,
            onToggle = { enabled ->
                if (enabled) {
                    if (saturation < 0.02f) {
                        val (s, b) = defaultCoverComponents(role, dark)
                        saturation = s
                        brightness = b
                    }
                    onChange(coverValueString(saturation, brightness))
                } else {
                    hue = coverHue
                    onChange(colorToHex(Color.hsv(coverHue, saturation, brightness)))
                }
            },
        )
        if (!usesCoverHue) {
            Text(
                "Hue: ${(hue / 360f * 100).roundToInt()}%",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            SliderWithReset(
                onReset = {
                    hue = resetComponents().first
                    commit()
                },
            ) {
                GradientTrackSlider(
                    value = hue / 360f,
                    colors = (0..360 step 60).map { Color.hsv(it.toFloat(), 1f, 1f) },
                    onChange = {
                        hue = it * 360f
                        commit()
                    },
                )
            }
        }
        Text(
            "Saturation: ${(saturation * 100).roundToInt()}%",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        SliderWithReset(
            onReset = {
                saturation = resetComponents().second
                commit()
            },
        ) {
            GradientTrackSlider(
                value = saturation,
                colors = listOf(
                    Color.hsv(displayHue, 0f, brightness),
                    Color.hsv(displayHue, 1f, brightness),
                ),
                onChange = {
                    saturation = it
                    commit()
                },
            )
        }
        Text(
            "Brightness: ${(brightness * 100).roundToInt()}%",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        SliderWithReset(
            onReset = {
                brightness = resetComponents().third
                commit()
            },
        ) {
            GradientTrackSlider(
                value = brightness,
                colors = listOf(Color.Black, Color.hsv(displayHue, saturation, 1f)),
                onChange = {
                    brightness = it
                    commit()
                },
            )
        }
        AnimatedVisibility(visible = showPicker) {
            InlineColorPicker(
                value = resolvedHex,
                onChange = onChange,
                modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
            )
        }
    }
}

@Composable
private fun UserHighlightRow(
    label: String,
    color: String,
    onLabelChange: (String) -> Unit,
    onColorChange: (String) -> Unit,
    onExpand: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(parseHexColor(color) ?: Color.Transparent, CircleShape)
                    .border(1.dp, Color.Gray.copy(alpha = 0.5f), CircleShape)
                    .clickable {
                        expanded = !expanded
                        if (expanded) onExpand()
                    },
            )
            OutlinedTextField(
                value = label,
                onValueChange = onLabelChange,
                label = { Text("Label") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
        }
        AnimatedVisibility(visible = expanded) {
            InlineColorPicker(
                value = color,
                onChange = onColorChange,
                modifier = Modifier.padding(top = 8.dp, bottom = 8.dp),
            )
        }
    }
}
