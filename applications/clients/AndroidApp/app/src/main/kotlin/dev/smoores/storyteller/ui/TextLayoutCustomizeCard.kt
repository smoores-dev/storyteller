package dev.smoores.storyteller.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.FormatAlignLeft
import androidx.compose.material.icons.automirrored.filled.FormatAlignRight
import androidx.compose.material.icons.automirrored.filled.FormatIndentIncrease
import androidx.compose.material.icons.filled.Abc
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.FormatAlignJustify
import androidx.compose.material.icons.filled.FormatLineSpacing
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.SpaceBar
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.ParagraphStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextIndent
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.smoores.storyteller.model.ReaderDisplaySettings
import dev.smoores.storyteller.model.ReaderTheme
import kotlin.math.roundToInt

// Mirrors CustomFontsActor.bundledFamilies (Literata first, rest sorted).
private val bundledFontFamilies = listOf(
    "Literata",
    "Atkinson Hyperlegible",
    "Charis",
    "Open Sans",
    "OpenDyslexic",
    "Ysabeau Infant",
)

// Legacy CSS generics kept so values stored before the bundled fonts still show.
private val legacyFontFamilies = listOf(
    "System Default" to "System Default",
    "serif" to "Serif",
    "sans-serif" to "Sans",
    "monospace" to "Mono",
)

// Port of EbookPlayerSettings.swift; Manage Fonts is iOS-only for now.
@Composable
internal fun TextLayoutCustomizeCard(
    settings: ReaderDisplaySettings,
    themes: List<ReaderTheme>,
    selectedLightThemeId: String?,
    selectedDarkThemeId: String?,
    onPreview: (ReaderDisplaySettings) -> Unit,
    onCommit: (ReaderDisplaySettings) -> Unit,
    onSelectLightTheme: (String) -> Unit,
    onSelectDarkTheme: (String) -> Unit,
    onManageThemes: () -> Unit,
    onReset: () -> Unit,
    onDone: () -> Unit,
    activeThemeBackground: Color,
    activeThemeForeground: Color,
) {
    CustomizeCardContainer(title = "Text & Layout", onDone = onDone, onReset = onReset) {
        Column {
            CustomizePreviewLabel()

            TextSettingsPreviewPane(
                settings = settings,
                background = activeThemeBackground,
                foreground = activeThemeForeground,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )

            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SettingsSectionHeader("Font")
                SettingSlider(
                    label = "Font Size",
                    value = settings.fontSize,
                    range = 8f..60f,
                    format = { "${it.roundToInt()}pt" },
                    onPreview = {
                        onPreview(settings.copy(fontSize = it.roundToInt().toDouble()))
                    },
                    onCommit = {
                        onCommit(settings.copy(fontSize = it.roundToInt().toDouble()))
                    },
                )
                FontFamilyPicker(
                    selected = settings.fontFamily,
                    onSelect = { onCommit(settings.copy(fontFamily = it)) },
                )

                HorizontalDivider()

                SettingsSectionHeader("Alignment and Spacing")
                TextAlignmentPicker(
                    selected = settings.textAlignment,
                    onSelect = { onCommit(settings.copy(textAlignment = it)) },
                )
                SettingSlider(
                    label = "Margins (Left/Right)",
                    value = settings.marginLeftRight,
                    range = 0f..30f,
                    format = { "${it.roundToInt()}%" },
                    onPreview = {
                        onPreview(settings.copy(marginLeftRight = it.roundToInt().toDouble()))
                    },
                    onCommit = {
                        onCommit(settings.copy(marginLeftRight = it.roundToInt().toDouble()))
                    },
                )
                SettingSlider(
                    label = "Margin (Top)",
                    value = settings.marginTop,
                    range = 0f..30f,
                    format = { "${it.roundToInt()}%" },
                    onPreview = {
                        onPreview(settings.copy(marginTop = it.roundToInt().toDouble()))
                    },
                    onCommit = {
                        onCommit(settings.copy(marginTop = it.roundToInt().toDouble()))
                    },
                )
                SettingSlider(
                    label = "Margin (Bottom)",
                    value = settings.marginBottom,
                    range = 0f..30f,
                    format = { "${it.roundToInt()}%" },
                    onPreview = {
                        onPreview(settings.copy(marginBottom = it.roundToInt().toDouble()))
                    },
                    onCommit = {
                        onCommit(settings.copy(marginBottom = it.roundToInt().toDouble()))
                    },
                )
                SettingSlider(
                    label = "Paragraph Spacing",
                    value = settings.paragraphSpacing,
                    range = 0f..2f,
                    format = {
                        if (it == 0f) "Book Default" else String.format("%.1fem", it)
                    },
                    onPreview = { onPreview(settings.copy(paragraphSpacing = roundTo(it, 1))) },
                    onCommit = { onCommit(settings.copy(paragraphSpacing = roundTo(it, 1))) },
                    icon = Icons.AutoMirrored.Filled.FormatIndentIncrease,
                )
                SettingSwitch(
                    label = "First Line Indent",
                    checked = settings.firstLineIndent,
                    onToggle = { onCommit(settings.copy(firstLineIndent = it)) },
                )
                SettingSlider(
                    label = "Line Spacing",
                    value = settings.lineSpacing,
                    range = 1f..2.5f,
                    format = { String.format("%.1f", it) },
                    onPreview = { onPreview(settings.copy(lineSpacing = roundTo(it, 1))) },
                    onCommit = { onCommit(settings.copy(lineSpacing = roundTo(it, 1))) },
                    icon = Icons.Filled.FormatLineSpacing,
                )
                SettingSlider(
                    label = "Word Spacing",
                    value = settings.wordSpacing,
                    range = -0.5f..2f,
                    format = { String.format("%.1fem", it) },
                    onPreview = { onPreview(settings.copy(wordSpacing = roundTo(it, 1))) },
                    onCommit = { onCommit(settings.copy(wordSpacing = roundTo(it, 1))) },
                    icon = Icons.Filled.SpaceBar,
                )
                SettingSlider(
                    label = "Letter Spacing",
                    value = settings.letterSpacing,
                    range = -0.1f..0.5f,
                    format = { String.format("%.2fem", it) },
                    onPreview = { onPreview(settings.copy(letterSpacing = roundTo(it, 2))) },
                    onCommit = { onCommit(settings.copy(letterSpacing = roundTo(it, 2))) },
                    icon = Icons.Filled.Abc,
                )
                SectionFooterText(
                    "Margins are how far the text sits from the edges of the screen. " +
                        "Raise the bottom margin to keep text clear of a tall miniplayer. " +
                        "Word and letter spacing add extra room on top of what the font " +
                        "provides. Paragraph spacing above zero replaces the book's own " +
                        "paragraph gaps.",
                )

                HorizontalDivider()

                SettingsSectionHeader("Page Animations")
                SettingSwitch(
                    label = "Scrolling Mode",
                    checked = settings.scrollingMode,
                    onToggle = { onCommit(settings.copy(scrollingMode = it)) },
                )
                SettingSwitch(
                    label = "Single Column",
                    checked = settings.singleColumnMode || settings.scrollingMode,
                    enabled = !settings.scrollingMode,
                    onToggle = { onCommit(settings.copy(singleColumnMode = it)) },
                )
                SettingSwitch(
                    label = "Margin Tap to Turn Pages",
                    checked = settings.enableMarginClickNavigation,
                    onToggle = { onCommit(settings.copy(enableMarginClickNavigation = it)) },
                )
                SectionFooterText(
                    "Scrolling Mode reads the book as one continuous scroll instead of " +
                        "pages, always in a single column. Single Column keeps one column " +
                        "of text on screens wide enough for two. Margin Tap turns the page " +
                        "when you tap near the left or right edge of the screen.",
                )

                HorizontalDivider()

                SettingsSectionHeader("Themes")
                CardThemePickerRow(
                    label = "Light Mode Theme",
                    themes = themes.filter { it.availableForLight() },
                    selectedId = selectedLightThemeId,
                    onSelect = onSelectLightTheme,
                )
                CardThemePickerRow(
                    label = "Dark Mode Theme",
                    themes = themes.filter { it.availableForDark() },
                    selectedId = selectedDarkThemeId,
                    onSelect = onSelectDarkTheme,
                )
                TextButton(onClick = onManageThemes) {
                    Icon(Icons.Filled.Palette, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Manage Themes...")
                }
            }
        }
    }
}

@Composable
private fun SectionFooterText(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun FontFamilyPicker(
    selected: String,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val known = bundledFontFamilies + legacyFontFamilies.map { it.first }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Font", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Box {
            TextButton(onClick = { expanded = true }) {
                Text(selected)
                Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                bundledFontFamilies.forEach { family ->
                    FontMenuItem(family, family, selected) {
                        expanded = false
                        onSelect(family)
                    }
                }
                HorizontalDivider()
                legacyFontFamilies.forEach { (value, label) ->
                    FontMenuItem(value, label, selected) {
                        expanded = false
                        onSelect(value)
                    }
                }
                if (selected !in known) {
                    FontMenuItem(selected, selected, selected) {
                        expanded = false
                        onSelect(selected)
                    }
                }
            }
        }
    }
}

@Composable
private fun FontMenuItem(
    value: String,
    label: String,
    selected: String,
    onClick: () -> Unit,
) {
    DropdownMenuItem(
        text = { Text(label) },
        trailingIcon = {
            if (value == selected) {
                Icon(Icons.Filled.Check, contentDescription = "Selected")
            }
        },
        onClick = onClick,
    )
}

@Composable
private fun TextAlignmentPicker(
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

@Composable
private fun CardThemePickerRow(
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
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
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

private const val kTextPreviewSample =
    "The Mole had been working very hard all the morning, spring-cleaning " +
        "his little home. Spring was moving in the air above and in the earth " +
        "below, calling him imperiously; and small wonder that he suddenly " +
        "flung down his brush and said \"Bother!\""

private const val kTextPreviewSampleSecond =
    "Something up above was calling him imperiously, and he made for the " +
        "steep little tunnel which answered in his case to the gravelled " +
        "carriage-drive owned by animals whose residences are nearer to the " +
        "sun and air."

// Bundled families have no Compose font resources here, so serif stands in for
// them; the webview is the real renderer and this pane is only indicative.
private fun previewFontFamily(family: String): FontFamily = when (family) {
    "sans-serif", "Open Sans", "Atkinson Hyperlegible", "OpenDyslexic" -> FontFamily.SansSerif
    "monospace" -> FontFamily.Monospace
    else -> FontFamily.Serif
}

// Compose has no word-spacing attribute; widen the spaces instead, as iOS does
// with kerning.
private fun previewSample(
    settings: ReaderDisplaySettings,
    sample: String,
): AnnotatedString =
    buildAnnotatedString {
        if (settings.firstLineIndent) {
            pushStyle(
                ParagraphStyle(
                    textIndent = TextIndent(
                        firstLine = (1.4 * settings.fontSize).toFloat().sp,
                    ),
                ),
            )
        }
        append(sample)
        val wordKern = (settings.wordSpacing * settings.fontSize).toFloat()
        if (wordKern == 0f) return@buildAnnotatedString
        val letterKern = (settings.letterSpacing * settings.fontSize).toFloat()
        sample.forEachIndexed { index, character ->
            if (character == ' ') {
                addStyle(
                    SpanStyle(letterSpacing = (letterKern + wordKern).sp),
                    index,
                    index + 1,
                )
            }
        }
    }

@Composable
private fun TextSettingsPreviewPane(
    settings: ReaderDisplaySettings,
    background: Color,
    foreground: Color,
    modifier: Modifier = Modifier,
) {
    val fontSize = settings.fontSize.toFloat()
    val extraLineSpacing = maxOf(0.0, (settings.lineSpacing - 1.2) * settings.fontSize)
    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .height(170.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(background)
            .border(
                1.dp,
                MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
                RoundedCornerShape(14.dp),
            ),
    ) {
        val horizontal = maxWidth * (settings.marginLeftRight.toFloat() / 100f)
        val top = 10.dp + maxHeight * (settings.marginTop.toFloat() / 100f)
        val paragraphGap =
            if (settings.paragraphSpacing > 0) settings.paragraphSpacing else 1.0
        Column(
            modifier = Modifier.padding(
                start = horizontal,
                end = horizontal,
                top = top,
                bottom = maxHeight * (settings.marginBottom.toFloat() / 100f),
            ),
            verticalArrangement = Arrangement.spacedBy(
                (paragraphGap * settings.fontSize).toFloat().dp,
            ),
        ) {
            listOf(kTextPreviewSample, kTextPreviewSampleSecond).forEach { sample ->
                Text(
                    previewSample(settings, sample),
                    color = foreground,
                    fontSize = fontSize.sp,
                    lineHeight = (fontSize + extraLineSpacing.toFloat()).sp,
                    fontFamily = previewFontFamily(settings.fontFamily),
                    letterSpacing = (settings.letterSpacing * settings.fontSize).toFloat().sp,
                    textAlign = when (settings.textAlignment) {
                        "right" -> TextAlign.Right
                        "justify" -> TextAlign.Justify
                        else -> TextAlign.Left
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
