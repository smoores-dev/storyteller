package dev.smoores.storyteller.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
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
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.ReaderTheme
import kotlinx.coroutines.delay
import kotlin.math.min
import kotlin.math.roundToInt

// Port of Customize/ReadaloudHighlightCard.swift.
@Composable
internal fun ReadaloudHighlightCard(
    hasAudioNarration: Boolean,
    experimentalSettings: Boolean,
    activeTheme: ReaderTheme,
    dimOthers: Boolean,
    dimAmount: Double,
    highlightVisibility: String,
    doubleTapPlay: String,
    freeBrowseMode: String,
    playbackSpeed: Double,
    automaticRewindEnabled: Boolean,
    automaticRewindAfterInterruption: Double,
    automaticRewindAfterBreak: Double,
    onUpdateFocus: (Boolean, Double) -> Unit,
    onUpdateModes: (String, String, String) -> Unit,
    onUpdateRewind: (Boolean, Double, Double) -> Unit,
    onUpdatePlaybackSpeed: (Double) -> Unit,
    onEditThemeReadaloud: () -> Unit,
    onReset: () -> Unit,
    onDone: () -> Unit,
) {
    LaunchedEffect(experimentalSettings, highlightVisibility) {
        if (!experimentalSettings && highlightVisibility != "paused") {
            onUpdateModes("paused", doubleTapPlay, freeBrowseMode)
        }
    }

    CustomizeCardContainer(title = "Readaloud", onDone = onDone, onReset = onReset) {
        Column {
            CustomizePreviewLabel()

            ReadaloudPreviewPane(
                theme = activeTheme,
                dimOthers = dimOthers,
                dimAmount = dimAmount,
                highlightVisibility = highlightVisibility,
                doubleTapPlay = doubleTapPlay,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )

            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SettingsSectionHeader("Style")
                TextButton(
                    onClick = onEditThemeReadaloud,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Filled.Brush, contentDescription = null)
                    Spacer(modifier = Modifier.size(8.dp))
                    Text("Edit Readaloud Style...")
                    Spacer(modifier = Modifier.weight(1f))
                }
                CardFooterText(
                    "Highlight color, style, and thickness belong to the theme. " +
                        "This opens \"${activeTheme.name}\" with the readaloud section.",
                )

                HorizontalDivider()

                SettingsSectionHeader("Focus")
                SettingSwitch(
                    label = "Auto-dim on Play",
                    checked = dimOthers,
                    onToggle = { onUpdateFocus(it, dimAmount) },
                )
                if (dimOthers) {
                    SettingSlider(
                        label = "Dim Amount",
                        value = dimAmount,
                        range = 0.1f..0.9f,
                        format = { "${(it * 100).roundToInt()}%" },
                        onPreview = { onUpdateFocus(dimOthers, roundTo(it, 2)) },
                        onCommit = { onUpdateFocus(dimOthers, roundTo(it, 2)) },
                    )
                }

                if (experimentalSettings) {
                    HorizontalDivider()
                    SettingsSectionHeader("Position Highlight")
                    SegmentedRow(
                        caption = "Show Highlight",
                        options = listOf(
                            "paused" to "Paused",
                            "always" to "Always",
                            "playing" to "Playing",
                        ),
                        selected = highlightVisibility,
                        description = { value ->
                            when (value) {
                                "always" ->
                                    "Highlight stays on pause and re-marks after page turns."
                                "playing" -> "Highlight clears whenever audio stops."
                                else ->
                                    "Highlight stays on pause and clears when you turn the page."
                            }
                        },
                        onSelect = { onUpdateModes(it, doubleTapPlay, freeBrowseMode) },
                    )
                }

                HorizontalDivider()
                SettingsSectionHeader("Playback")
                if (hasAudioNarration) {
                    SegmentedRow(
                        caption = "Play Audio on Double Tap",
                        options = listOf(
                            "never" to "Never",
                            "headphones" to "Headphones",
                            "always" to "Always",
                        ),
                        selected = doubleTapPlay,
                        description = { value ->
                            when (value) {
                                "always" -> "Double tap moves the playhead and starts audio."
                                "never" ->
                                    "Double tap moves the playhead without starting audio."
                                else ->
                                    "Double tap starts audio only with headphones connected."
                            }
                        },
                        onSelect = { onUpdateModes(highlightVisibility, it, freeBrowseMode) },
                    )
                    // "always" is reachable only through the dock Free Browse lock control.
                    SegmentedRow(
                        caption = "Free Browse",
                        options = listOf("never" to "Never", "paused" to "Paused"),
                        selected = freeBrowseMode,
                        description = { value ->
                            when (value) {
                                "paused" ->
                                    "While paused, page turns leave the playhead behind."
                                "always" ->
                                    "Page turns never move the playhead; audio plays on. " +
                                        "Set by the dock Free Browse lock control."
                                else -> "Page turns move the playhead with you."
                            }
                        },
                        onSelect = { onUpdateModes(highlightVisibility, doubleTapPlay, it) },
                    )
                }
                SettingSlider(
                    label = "Readaloud Speed",
                    value = playbackSpeed,
                    range = 0.5f..3f,
                    format = { String.format("%.2fx", it) },
                    onPreview = { onUpdatePlaybackSpeed(roundTo(it, 2)) },
                    onCommit = { onUpdatePlaybackSpeed(roundTo(it, 2)) },
                )

                HorizontalDivider()
                SettingsSectionHeader("Automatic Rewind")
                SettingSwitch(
                    label = "Automatic Rewind",
                    checked = automaticRewindEnabled,
                    onToggle = {
                        onUpdateRewind(
                            it,
                            automaticRewindAfterInterruption,
                            automaticRewindAfterBreak,
                        )
                    },
                )
                if (automaticRewindEnabled) {
                    SettingSlider(
                        label = "After Interruption",
                        value = automaticRewindAfterInterruption,
                        range = 0f..30f,
                        format = { "${it.roundToInt()}s" },
                        onPreview = {
                            onUpdateRewind(
                                automaticRewindEnabled,
                                it.roundToInt().toDouble(),
                                automaticRewindAfterBreak,
                            )
                        },
                        onCommit = {
                            onUpdateRewind(
                                automaticRewindEnabled,
                                it.roundToInt().toDouble(),
                                automaticRewindAfterBreak,
                            )
                        },
                    )
                    SettingSlider(
                        label = "After Long Break",
                        value = automaticRewindAfterBreak,
                        range = 0f..30f,
                        format = { "${it.roundToInt()}s" },
                        onPreview = {
                            onUpdateRewind(
                                automaticRewindEnabled,
                                automaticRewindAfterInterruption,
                                it.roundToInt().toDouble(),
                            )
                        },
                        onCommit = {
                            onUpdateRewind(
                                automaticRewindEnabled,
                                automaticRewindAfterInterruption,
                                it.roundToInt().toDouble(),
                            )
                        },
                    )
                }
                CardFooterText(
                    "Resuming steps back a few seconds. A pause longer than five minutes " +
                        "counts as a break; shorter pauses and interruptions (calls, " +
                        "navigation, voice assistants) use the other amount. Applies to " +
                        "readaloud and audiobooks, including Android Auto.",
                )
            }
        }
    }
}

@Composable
private fun CardFooterText(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SegmentedRow(
    caption: String,
    options: List<Pair<String, String>>,
    selected: String,
    description: (String) -> String,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            caption,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            options.forEachIndexed { index, (value, label) ->
                SegmentedButton(
                    selected = selected == value,
                    onClick = { onSelect(value) },
                    shape = SegmentedButtonDefaults.itemShape(index, options.size),
                ) {
                    Text(label, maxLines = 1)
                }
            }
        }
        Text(
            description(selected),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private val readaloudSampleSentences = listOf(
    "The Mole had been working very hard all the morning. ",
    "Spring was moving in the air above and in the earth below. ",
    "It was small wonder that he suddenly flung down his brush. ",
    "Something up above was calling him imperiously. ",
)

// Walks the highlight through the sample while the pane's own play button is on,
// rendering the active theme's readaloud style the way the reader does.
@Composable
private fun ReadaloudPreviewPane(
    theme: ReaderTheme,
    dimOthers: Boolean,
    dimAmount: Double,
    highlightVisibility: String,
    doubleTapPlay: String,
    modifier: Modifier = Modifier,
) {
    var activeIndex by remember { mutableIntStateOf(1) }
    var isPlaying by remember { mutableStateOf(false) }

    LaunchedEffect(isPlaying) {
        while (isPlaying) {
            delay(1500)
            activeIndex = (activeIndex + 1) % readaloudSampleSentences.size
        }
    }

    val background = parseHexColor(theme.backgroundColor) ?: Color.White
    val foreground = parseHexColor(theme.foregroundColor) ?: Color.Black
    val highlight = parseHexColor(theme.highlightColor) ?: Color.Yellow
    val highlightVisible = isPlaying || highlightVisibility != "playing"
    val dimmedForeground = foreground.copy(
        alpha = maxOf(0.05f, 1f - dimAmount.toFloat()),
    )

    Surface(
        color = background,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)),
        modifier = modifier.fillMaxWidth(),
    ) {
        Box {
            Column(
                modifier = Modifier.padding(14.dp).padding(bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                readaloudSampleSentences.forEachIndexed { index, sentence ->
                    val active = index == activeIndex && highlightVisible
                    ReadaloudSampleSentence(
                        sentence = sentence,
                        active = active,
                        theme = theme,
                        highlight = highlight,
                        foreground = if (!active && isPlaying && dimOthers) {
                            dimmedForeground
                        } else {
                            foreground
                        },
                        modifier = Modifier.clickable {
                            activeIndex = index
                            if (!isPlaying && doubleTapPlay != "never") isPlaying = true
                        },
                    )
                }
            }
            Text(
                "Tap a sentence to try it",
                style = MaterialTheme.typography.labelSmall,
                color = foreground.copy(alpha = 0.45f),
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(horizontal = 14.dp, vertical = 6.dp),
            )
            IconButton(
                onClick = { isPlaying = !isPlaying },
                modifier = Modifier.align(Alignment.BottomEnd).padding(4.dp),
            ) {
                Icon(
                    if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = if (isPlaying) "Pause preview" else "Play preview",
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun ReadaloudSampleSentence(
    sentence: String,
    active: Boolean,
    theme: ReaderTheme,
    highlight: Color,
    foreground: Color,
    modifier: Modifier = Modifier,
) {
    val mode = theme.readaloudHighlightMode
    val underlineStyle = theme.readaloudUnderlineStyle
    val decorated = active && mode == "underline" && underlineStyle != "solid"
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }

    val span = when {
        !active -> SpanStyle(color = foreground)
        mode == "text" -> SpanStyle(
            color = highlight,
            fontStyle = if (theme.readaloudTextItalic) FontStyle.Italic else null,
            fontWeight = if (theme.readaloudTextBold) FontWeight.Bold else null,
        )
        mode == "underline" -> SpanStyle(
            color = foreground,
            textDecoration = if (underlineStyle == "solid") TextDecoration.Underline else null,
        )
        else -> SpanStyle(
            color = foreground,
            background = highlight.copy(
                alpha = (1.0 - theme.readaloudHighlightFade).toFloat().coerceIn(0f, 1f),
            ),
        )
    }

    Text(
        buildAnnotatedString { withStyle(span) { append(sentence) } },
        style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Serif),
        onTextLayout = { layout = it },
        modifier = modifier
            .fillMaxWidth()
            .drawBehind {
                if (!decorated) return@drawBehind
                layout?.let { drawUnderlineDecoration(it, highlight, underlineStyle) }
            },
    )
}

// Mirrors UnderlineDecorationRenderer in ThemePreviewCard.swift.
private fun DrawScope.drawUnderlineDecoration(
    layout: TextLayoutResult,
    color: Color,
    style: String,
) {
    val gap = 2.5.dp.toPx()
    val amplitude = 2.dp.toPx()
    for (line in 0 until layout.lineCount) {
        val left = layout.getLineLeft(line)
        val right = layout.getLineRight(line)
        if (right <= left) continue
        val y = layout.getLineBaseline(line) + gap
        val path = Path()
        if (style == "double") {
            path.moveTo(left, y - gap)
            path.lineTo(right, y - gap)
            path.moveTo(left, y)
            path.lineTo(right, y)
            drawPath(path, color, style = Stroke(width = 1.dp.toPx()))
        } else {
            var x = left
            var up = true
            path.moveTo(x, y)
            while (x < right) {
                x = min(x + gap, right)
                path.lineTo(x, if (up) y - amplitude else y)
                up = !up
            }
            drawPath(path, color, style = Stroke(width = 1.2f.dp.toPx()))
        }
    }
}
