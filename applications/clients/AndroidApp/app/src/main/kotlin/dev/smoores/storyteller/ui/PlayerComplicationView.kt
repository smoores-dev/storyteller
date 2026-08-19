package dev.smoores.storyteller.ui

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.automirrored.filled.RotateLeft
import androidx.compose.material.icons.automirrored.filled.RotateRight
import androidx.compose.material.icons.automirrored.filled.Toc
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.Battery0Bar
import androidx.compose.material.icons.filled.Battery2Bar
import androidx.compose.material.icons.filled.Battery3Bar
import androidx.compose.material.icons.filled.Battery5Bar
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FormatSize
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.ScreenLockRotation
import androidx.compose.material.icons.filled.ScreenRotation
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.SportsScore
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.ViewDay
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.PlayerComplication
import dev.smoores.storyteller.model.SlotRef
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

// Kotlin mirror of MiniPlayerDisplayModel in PlayerComplicationView.swift.
internal data class PlayerDisplayModel(
    val bookTitle: String? = null,
    val chapterTitle: String? = null,
    val authorName: String? = null,
    val cover: ImageBitmap? = null,
    val isPlaying: Boolean = false,
    val playbackRate: Double = 1.0,
    val chapterProgress: Double = 0.0,
    val chapterElapsedSeconds: Double? = null,
    val chapterTotalSeconds: Double? = null,
    val bookTimeRemaining: Double? = null,
    val bookFraction: Double? = null,
    val currentPage: Int? = null,
    val totalPages: Int? = null,
    val chapterIndex: Int? = null,
    val chapterCount: Int? = null,
    val sleepTimerRemaining: Double? = null,
    val sleepTimerEndOfChapter: Boolean = false,
    val sessionStartMillis: Long? = null,
    val hasAudioNarration: Boolean = false,
    val isScrollingMode: Boolean = false,
    val freeBrowseMode: String = "never",
) {
    val chapterTimeRemaining: Double?
        get() {
            val elapsed = chapterElapsedSeconds ?: return null
            val total = chapterTotalSeconds ?: return null
            if (playbackRate <= 0) return null
            return (total - elapsed).coerceAtLeast(0.0) / playbackRate
        }

    val chapterLength: Double?
        get() {
            val total = chapterTotalSeconds ?: return null
            if (playbackRate <= 0) return null
            return total / playbackRate
        }

    companion object {
        val sample: PlayerDisplayModel
            get() = PlayerDisplayModel(
                bookTitle = "The Wind in the Willows",
                chapterTitle = "Chapter 4: Mr. Badger",
                authorName = "Kenneth Grahame",
                cover = null,
                isPlaying = false,
                playbackRate = 1.0,
                chapterProgress = 0.42,
                chapterElapsedSeconds = 312.0,
                chapterTotalSeconds = 745.0,
                bookTimeRemaining = 4.5 * 3600,
                bookFraction = 0.42,
                currentPage = 118,
                totalPages = 284,
                chapterIndex = 3,
                chapterCount = 12,
                sleepTimerRemaining = 18.0 * 60,
                sessionStartMillis = System.currentTimeMillis() - 23L * 60 * 1000,
                hasAudioNarration = true,
            )
    }
}

// Kotlin mirror of MiniPlayerActions; onSeek null disables the scrub bar.
// Chapters open a sheet on Android, so onOpenChapters replaces onChapterSelected.
internal data class PlayerActions(
    val onPlayPause: () -> Unit = {},
    val onSkipBackward: () -> Unit = {},
    val onSkipForward: () -> Unit = {},
    val onRateChange: (Double) -> Unit = {},
    val onSeek: ((Double) -> Unit)? = null,
    val onLeadingTap: () -> Unit = {},
    val onOpenChapters: () -> Unit = {},
    val onOpenBookmarks: () -> Unit = {},
    val onOpenReadingTimeline: () -> Unit = {},
    val onOpenImageGallery: () -> Unit = {},
    val onOpenSearch: () -> Unit = {},
    val onOpenTextSettings: () -> Unit = {},
    val onOpenSleepTimer: () -> Unit = {},
    val onToggleMirror: () -> Unit = {},
    val onToggleScrollingMode: () -> Unit = {},
    val onToggleFreeBrowse: () -> Unit = {},
    val onToggleOrientationLock: () -> Unit = {},
) {
    companion object {
        val noop = PlayerActions()
    }
}

// Kotlin mirror of PlayerComplicationStyle.
internal sealed class ComplicationStyle {
    data class MiniRow(val compact: Boolean) : ComplicationStyle()
    data object ScrubRow : ComplicationStyle()
    data object StatBand : ComplicationStyle()
    data class Dock(val transparency: Double) : ComplicationStyle()
    data object PickerThumb : ComplicationStyle()
    data class MenuBar(val tint: Color) : ComplicationStyle()

    val controlSize: Dp
        get() = when (this) {
            is MiniRow -> 34.dp
            is Dock -> 36.dp
            is MenuBar -> 44.dp
            else -> 30.dp
        }

    val controlGlyphSize: Dp
        get() = when (this) {
            is Dock -> 16.dp
            is MenuBar -> 20.dp
            else -> 17.dp
        }

    fun controlColor(contentColor: Color): Color = when (this) {
        is Dock -> Color.Gray.copy(alpha = transparency.toFloat())
        is MenuBar -> tint
        else -> contentColor
    }

    fun statColor(contentColor: Color): Color = when (this) {
        is Dock -> Color.Gray.copy(alpha = transparency.toFloat())
        is MenuBar -> tint.copy(alpha = 0.75f)
        else -> contentColor.copy(alpha = 0.6f)
    }
}

@Composable
private fun statTextStyle(style: ComplicationStyle): TextStyle = when (style) {
    is ComplicationStyle.MiniRow -> MaterialTheme.typography.bodySmall
    else -> MaterialTheme.typography.labelSmall
}.copy(fontFeatureSettings = "tnum")

// Kotlin mirror of slotEditable in PlayerComplicationView.swift. Non-null
// editing makes the slot a dashed tappable target and blocks its own controls.
@Composable
internal fun Modifier.slotEditable(ref: SlotRef, editing: MutableState<SlotRef?>?): Modifier {
    if (editing == null) return this
    val isSelected = editing.value == ref
    val primary = MaterialTheme.colorScheme.primary
    val borderColor = if (isSelected) primary else MaterialTheme.colorScheme.outline
    val fillColor = if (isSelected) primary.copy(alpha = 0.15f) else Color.Transparent
    return this
        .pointerInput(ref, editing) {
            // Consuming in the Initial pass keeps the slot's own controls inert
            // while editing; releasing anywhere selects the slot.
            awaitEachGesture {
                awaitFirstDown(pass = PointerEventPass.Initial).consume()
                while (true) {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    event.changes.forEach { it.consume() }
                    if (event.changes.all { !it.pressed }) {
                        editing.value = ref
                        break
                    }
                }
            }
        }
        .background(fillColor, RoundedCornerShape(8.dp))
        .drawBehind {
            val strokeWidth = 1.5.dp.toPx()
            val inset = strokeWidth / 2
            drawRoundRect(
                color = borderColor,
                topLeft = Offset(inset, inset),
                size = Size(size.width - strokeWidth, size.height - strokeWidth),
                cornerRadius = CornerRadius(8.dp.toPx()),
                style = Stroke(
                    width = strokeWidth,
                    pathEffect = PathEffect.dashPathEffect(
                        floatArrayOf(4.dp.toPx(), 3.dp.toPx()),
                        0f,
                    ),
                ),
            )
        }
        .padding(3.dp)
        .sizeIn(minWidth = 26.dp, minHeight = 22.dp)
}

// Kotlin mirror of PlayerComplicationView.swift. Pure function of its inputs so
// the live chrome and the Customize preview cards share one renderer.
@Composable
internal fun PlayerComplicationView(
    complication: PlayerComplication,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    style: ComplicationStyle,
    editingPreview: Boolean = false,
    iconTrailing: Boolean = false,
    textOnlySlot: Boolean = false,
    isOrientationLocked: Boolean = false,
    contentColor: Color = LocalContentColor.current,
) {
    when (complication) {
        PlayerComplication.NONE -> EmptyPlaceholder(textOnlySlot, contentColor)
        PlayerComplication.PLAY_PAUSE ->
            PlayPauseButton(style, display, actions, editingPreview, contentColor)
        PlayerComplication.SKIP_BACKWARD -> SkipButton(
            icon = Icons.AutoMirrored.Filled.RotateLeft,
            contentDescription = "Skip back",
            style = style,
            onClick = actions.onSkipBackward,
            contentColor = contentColor,
        )
        PlayerComplication.SKIP_FORWARD -> SkipButton(
            icon = Icons.AutoMirrored.Filled.RotateRight,
            contentDescription = "Skip forward",
            style = style,
            onClick = actions.onSkipForward,
            contentColor = contentColor,
        )
        PlayerComplication.PLAYBACK_SPEED ->
            SpeedControl(style, display, actions, editingPreview, contentColor)
        PlayerComplication.SCRUB_BAR -> ScrubBarGlyph(contentColor)
        PlayerComplication.STAT_PERCENT -> Stat(
            Icons.AutoMirrored.Filled.MenuBook, percentText(display),
            style, iconTrailing, contentColor,
        )
        PlayerComplication.STAT_PAGE -> Stat(
            Icons.Filled.Bookmark, pageText(display),
            style, iconTrailing, contentColor,
        )
        PlayerComplication.STAT_TIME_IN_BOOK -> Stat(
            Icons.AutoMirrored.Filled.MenuBook, formatTimeHoursMinutes(display.bookTimeRemaining),
            style, iconTrailing, contentColor,
        )
        PlayerComplication.STAT_TIME_IN_CHAPTER -> Stat(
            Icons.Filled.Bookmark, formatTimeMinutesSeconds(display.chapterTimeRemaining),
            style, iconTrailing, contentColor,
        )
        PlayerComplication.STAT_PAGES_LEFT -> Stat(
            Icons.Filled.Description, pagesLeftText(display),
            style, iconTrailing, contentColor,
        )
        PlayerComplication.STAT_CHAPTER_OF -> Stat(
            Icons.AutoMirrored.Filled.List, chapterOfText(display),
            style, iconTrailing, contentColor,
        )
        PlayerComplication.STAT_CHAPTER_PERCENT -> Stat(
            Icons.Filled.BookmarkBorder, chapterPercentText(display),
            style, iconTrailing, contentColor,
        )
        PlayerComplication.STAT_CHAPTER_ELAPSED -> Stat(
            Icons.Filled.Bookmark, formatTimeMinutesSeconds(display.chapterElapsedSeconds),
            style, iconTrailing, contentColor,
        )
        PlayerComplication.STAT_CHAPTER_LENGTH -> Stat(
            Icons.Filled.HourglassEmpty, formatTimeMinutesSeconds(display.chapterLength),
            style, iconTrailing, contentColor,
        )
        PlayerComplication.STAT_SLEEP_TIMER -> Stat(
            Icons.Filled.Bedtime, formatTimeMinutesSeconds(display.sleepTimerRemaining),
            style, iconTrailing, contentColor,
        )
        PlayerComplication.STAT_FINISH_TIME -> TickingStat(
            Icons.Filled.SportsScore, style, iconTrailing, contentColor,
        ) { now -> finishTimeText(display, now) }
        PlayerComplication.STAT_SESSION_TIME -> TickingStat(
            Icons.Filled.Timer, style, iconTrailing, contentColor,
        ) { now -> sessionTimeText(display, now) }
        PlayerComplication.STAT_CLOCK -> TickingStat(
            Icons.Filled.Schedule, style, iconTrailing, contentColor,
        ) { now -> shortTimeText(now) }
        PlayerComplication.STAT_BATTERY -> {
            val battery = rememberBatteryState()
            Stat(
                batteryIcon(battery.level, battery.charging), batteryText(battery.level),
                style, iconTrailing, contentColor,
            )
        }
        PlayerComplication.CHAPTERS -> ControlButton(
            Icons.AutoMirrored.Filled.Toc, "Chapters", style, actions.onOpenChapters, contentColor,
        )
        PlayerComplication.BOOKMARKS -> ControlButton(
            Icons.Filled.BookmarkBorder, "Bookmarks", style, actions.onOpenBookmarks, contentColor,
        )
        PlayerComplication.READING_TIMELINE -> ControlButton(
            Icons.Filled.History, "Reading timeline", style,
            actions.onOpenReadingTimeline, contentColor,
        )
        PlayerComplication.IMAGE_GALLERY -> ControlButton(
            Icons.Filled.PhotoLibrary, "Images", style,
            actions.onOpenImageGallery, contentColor,
        )
        PlayerComplication.SEARCH -> ControlButton(
            Icons.Filled.Search, "Search", style, actions.onOpenSearch, contentColor,
        )
        PlayerComplication.TEXT_SETTINGS -> ControlButton(
            Icons.Filled.FormatSize, "Text settings", style,
            actions.onOpenTextSettings, contentColor,
        )
        PlayerComplication.SLEEP_TIMER ->
            SleepTimerControl(style, display, actions, contentColor)
        PlayerComplication.TITLE_BLOCK -> TitleBlockThumb(contentColor)
        PlayerComplication.MIRROR -> ControlButton(
            Icons.Filled.SwapHoriz, "Swap hands", style, actions.onToggleMirror, contentColor,
        )
        PlayerComplication.SCROLL_MODE -> ControlButton(
            // No scroll-parchment glyph in material icons; pages vs a vertical
            // scroll column stand in for scroll/scroll.fill.
            if (display.isScrollingMode) Icons.Filled.ViewDay else Icons.Filled.AutoStories,
            "Page or scroll mode", style, actions.onToggleScrollingMode, contentColor,
        )
        PlayerComplication.FREE_BROWSE_LOCK ->
            FreeBrowseLockButton(style, display, actions, contentColor)
        PlayerComplication.ORIENTATION_LOCK ->
            OrientationLockButton(style, isOrientationLocked, actions, contentColor)
    }
}

// A wide, short box in the text-only rows so the shape itself says a readout
// goes here rather than a button.
@Composable
private fun EmptyPlaceholder(textOnlySlot: Boolean, contentColor: Color) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.size(
            width = if (textOnlySlot) 52.dp else 26.dp,
            height = if (textOnlySlot) 16.dp else 22.dp,
        ),
    ) {
        Icon(
            Icons.Filled.Add,
            contentDescription = null,
            tint = contentColor.copy(alpha = 0.4f),
            modifier = Modifier.size(12.dp),
        )
    }
}

@Composable
private fun PlayPauseButton(
    style: ComplicationStyle,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    editingPreview: Boolean,
    contentColor: Color,
) {
    val icon = if (display.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow
    val description = if (display.isPlaying) "Pause" else "Play"
    val (diameter, glyph, circled) = when (style) {
        // The editing preview is narrower than the real card, so the full-size
        // circle would spill out of its slot box.
        is ComplicationStyle.MiniRow -> when {
            editingPreview -> Triple(36.dp, 20.dp, true)
            style.compact -> Triple(48.dp, 26.dp, true)
            else -> Triple(54.dp, 30.dp, true)
        }
        ComplicationStyle.ScrubRow -> Triple(34.dp, 20.dp, false)
        is ComplicationStyle.Dock -> Triple(44.dp, 22.dp, false)
        is ComplicationStyle.MenuBar -> Triple(44.dp, 22.dp, false)
        ComplicationStyle.StatBand, ComplicationStyle.PickerThumb -> Triple(32.dp, 18.dp, true)
    }
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .clip(CircleShape)
            .then(
                if (circled) {
                    Modifier.background(contentColor.copy(alpha = 0.1f), CircleShape)
                } else {
                    Modifier
                }
            )
            .clickable(onClick = actions.onPlayPause)
            .size(diameter),
    ) {
        Icon(
            icon,
            contentDescription = description,
            tint = style.controlColor(contentColor),
            modifier = Modifier.size(glyph),
        )
    }
}

@Composable
private fun SkipButton(
    icon: ImageVector,
    contentDescription: String,
    style: ComplicationStyle,
    onClick: () -> Unit,
    contentColor: Color,
) {
    val (box, glyph) = when (style) {
        is ComplicationStyle.MiniRow, ComplicationStyle.ScrubRow -> 34.dp to 20.dp
        is ComplicationStyle.Dock -> 36.dp to 18.dp
        is ComplicationStyle.MenuBar -> 44.dp to 20.dp
        ComplicationStyle.StatBand, ComplicationStyle.PickerThumb -> 30.dp to 16.dp
    }
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .size(box),
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            tint = style.controlColor(contentColor),
            modifier = Modifier.size(glyph),
        )
    }
}

@Composable
private fun ControlButton(
    icon: ImageVector,
    contentDescription: String,
    style: ComplicationStyle,
    onClick: () -> Unit,
    contentColor: Color,
    tintOverride: Color? = null,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .size(style.controlSize),
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            tint = tintOverride ?: style.controlColor(contentColor),
            modifier = Modifier.size(style.controlGlyphSize),
        )
    }
}

@Composable
private fun SpeedControl(
    style: ComplicationStyle,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    editingPreview: Boolean,
    contentColor: Color,
) {
    var showSpeed by remember { mutableStateOf(false) }
    when (style) {
        is ComplicationStyle.MiniRow -> {
            val buttonSize = if (style.compact) 32.dp else 36.dp
            Box(contentAlignment = Alignment.Center) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .clip(CircleShape)
                        .clickable { showSpeed = true }
                        .size(buttonSize),
                ) {
                    Icon(
                        Icons.Filled.Speed,
                        contentDescription = "Playback speed",
                        tint = contentColor,
                        modifier = Modifier.size(if (style.compact) 20.dp else 24.dp),
                    )
                }
                if (!editingPreview) {
                    Text(
                        formatPlaybackRate(display.playbackRate),
                        style = MaterialTheme.typography.labelSmall,
                        color = contentColor.copy(alpha = 0.7f),
                        maxLines = 1,
                        // Rides below the button without growing its frame,
                        // like the iOS compactLabel overlay.
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .offset(y = 14.dp),
                    )
                }
            }
        }
        is ComplicationStyle.MenuBar -> Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .clip(CircleShape)
                .clickable { showSpeed = true }
                .size(44.dp),
        ) {
            Text(
                formatPlaybackRate(display.playbackRate),
                style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                fontWeight = FontWeight.Medium,
                color = style.tint,
                maxLines = 1,
            )
        }
        ComplicationStyle.PickerThumb -> Row(
            horizontalArrangement = Arrangement.spacedBy(3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.Speed,
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size(16.dp),
            )
            Text(
                String.format(Locale.US, "%.1fx", display.playbackRate),
                style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum"),
                color = contentColor,
            )
        }
        else -> ControlButton(
            Icons.Filled.Speed, "Playback speed", style, { showSpeed = true }, contentColor,
        )
    }
    if (showSpeed) {
        PlaybackSpeedDialog(
            currentRate = display.playbackRate,
            dismiss = { showSpeed = false },
            select = {
                showSpeed = false
                actions.onRateChange(it)
            },
        )
    }
}

// The real card draws the title block itself; this stands in for it in the
// picker, where only a swatch is needed.
@Composable
private fun TitleBlockThumb(contentColor: Color) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(18.dp)
                .background(contentColor.copy(alpha = 0.3f), RoundedCornerShape(3.dp)),
        )
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Box(
                Modifier
                    .size(width = 34.dp, height = 4.dp)
                    .background(contentColor.copy(alpha = 0.6f), CircleShape),
            )
            Box(
                Modifier
                    .size(width = 22.dp, height = 3.dp)
                    .background(contentColor.copy(alpha = 0.5f), CircleShape),
            )
        }
    }
}

@Composable
private fun ScrubBarGlyph(contentColor: Color) {
    val accent = MaterialTheme.colorScheme.primary
    Row(
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.height(22.dp),
    ) {
        Box(
            Modifier
                .size(width = 16.dp, height = 4.dp)
                .background(accent.copy(alpha = 0.8f), CircleShape),
        )
        Box(
            Modifier
                .size(9.dp)
                .background(contentColor.copy(alpha = 0.7f), CircleShape),
        )
        Box(
            Modifier
                .size(width = 20.dp, height = 4.dp)
                .background(contentColor.copy(alpha = 0.4f), CircleShape),
        )
    }
}

// Matches the top bar: while a timer runs the glyph fills in and the remaining
// time rides alongside it.
@Composable
private fun SleepTimerControl(
    style: ComplicationStyle,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    contentColor: Color,
) {
    val running = display.sleepTimerRemaining != null || display.sleepTimerEndOfChapter
    val color = if (running) MaterialTheme.colorScheme.primary else style.controlColor(contentColor)
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = actions.onOpenSleepTimer)
            .sizeIn(minWidth = style.controlSize, minHeight = style.controlSize),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (running) Icons.Filled.Bedtime else Icons.Outlined.Bedtime,
                contentDescription = "Sleep timer",
                tint = color,
                modifier = Modifier.size(style.controlGlyphSize),
            )
            val remaining = display.sleepTimerRemaining
            if (remaining != null) {
                Text(
                    formatTimeMinutesSeconds(remaining),
                    style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum"),
                    color = color,
                    maxLines = 1,
                )
            } else if (display.sleepTimerEndOfChapter) {
                Text(
                    "End Ch.",
                    style = MaterialTheme.typography.labelSmall,
                    color = color,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun FreeBrowseLockButton(
    style: ComplicationStyle,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    contentColor: Color,
) {
    val browsing = display.freeBrowseMode == "always"
    val accent = MaterialTheme.colorScheme.primary
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .clip(CircleShape)
            .clickable(onClick = actions.onToggleFreeBrowse)
            .size(style.controlSize),
    ) {
        Icon(
            Icons.Filled.Link,
            contentDescription = "Free browse lock",
            tint = if (browsing) accent else style.controlColor(contentColor),
            modifier = Modifier.size(style.controlGlyphSize),
        )
        if (browsing) {
            Box(
                Modifier
                    .rotate(-45f)
                    .size(width = style.controlGlyphSize + 6.dp, height = 1.8.dp)
                    .background(accent, CircleShape),
            )
        }
    }
}

// Session-only state; the caller owns it (Activity.requestedOrientation).
@Composable
private fun OrientationLockButton(
    style: ComplicationStyle,
    isOrientationLocked: Boolean,
    actions: PlayerActions,
    contentColor: Color,
) {
    ControlButton(
        icon = if (isOrientationLocked) {
            Icons.Filled.ScreenLockRotation
        } else {
            Icons.Filled.ScreenRotation
        },
        contentDescription = "Orientation lock",
        style = style,
        onClick = actions.onToggleOrientationLock,
        contentColor = contentColor,
        tintOverride = if (isOrientationLocked) MaterialTheme.colorScheme.primary else null,
    )
}

@Composable
private fun Stat(
    icon: ImageVector,
    text: String,
    style: ComplicationStyle,
    iconTrailing: Boolean,
    contentColor: Color,
) {
    val color = style.statColor(contentColor)
    val textStyle = statTextStyle(style)
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!iconTrailing) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.width(14.dp))
        }
        Text(text, style = textStyle, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (iconTrailing) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.width(14.dp))
        }
    }
}

@Composable
private fun TickingStat(
    icon: ImageVector,
    style: ComplicationStyle,
    iconTrailing: Boolean,
    contentColor: Color,
    text: (Long) -> String,
) {
    val now = rememberTickingNowMillis()
    Stat(icon, text(now), style, iconTrailing, contentColor)
}

// 30s cadence matching the iOS TimelineView(.periodic(by: 30)).
@Composable
private fun rememberTickingNowMillis(): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000L)
            now = System.currentTimeMillis()
        }
    }
    return now
}

private data class BatteryState(val level: Float, val charging: Boolean)

@Composable
private fun rememberBatteryState(): BatteryState {
    val context = LocalContext.current
    var level by remember { mutableFloatStateOf(-1f) }
    var charging by remember { mutableStateOf(false) }
    DisposableEffect(context) {
        fun read(intent: Intent?) {
            intent ?: return
            val raw = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            level = if (raw >= 0 && scale > 0) raw.toFloat() / scale else -1f
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL
        }

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(receiverContext: Context?, intent: Intent?) = read(intent)
        }
        read(context.registerReceiver(receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED)))
        onDispose { context.unregisterReceiver(receiver) }
    }
    return BatteryState(level, charging)
}

private fun batteryText(level: Float): String =
    if (level < 0) "--%" else "${(level * 100).roundToInt()}%"

private fun batteryIcon(level: Float, charging: Boolean): ImageVector = when {
    charging -> Icons.Filled.BatteryChargingFull
    level < 0.15f -> Icons.Filled.Battery0Bar
    level < 0.4f -> Icons.Filled.Battery2Bar
    level < 0.65f -> Icons.Filled.Battery3Bar
    level < 0.9f -> Icons.Filled.Battery5Bar
    else -> Icons.Filled.BatteryFull
}

private fun percentText(display: PlayerDisplayModel): String {
    val fraction = display.bookFraction ?: return "--%"
    return "${(fraction.coerceIn(0.0, 1.0) * 100).roundToInt()}%"
}

private fun pageText(display: PlayerDisplayModel): String {
    val current = display.currentPage
    val total = display.totalPages
    if (current == null || total == null || total <= 0) return "Page - of -"
    return "Page $current of $total"
}

private fun pagesLeftText(display: PlayerDisplayModel): String {
    val current = display.currentPage
    val total = display.totalPages
    if (current == null || total == null || total <= 0) return "- left"
    val left = (total - current).coerceAtLeast(0)
    return if (left == 1) "1 pg. left" else "$left pgs. left"
}

private fun chapterOfText(display: PlayerDisplayModel): String {
    val index = display.chapterIndex
    val count = display.chapterCount
    if (index == null || count == null || count <= 0) return "ch. - / -"
    return "ch. ${index + 1} / $count"
}

private fun chapterPercentText(display: PlayerDisplayModel): String =
    "${(display.chapterProgress.coerceIn(0.0, 1.0) * 100).roundToInt()}% of ch."

private fun finishTimeText(display: PlayerDisplayModel, nowMillis: Long): String {
    val remaining = display.bookTimeRemaining
    if (remaining == null || remaining <= 0) return "--:--"
    val finishMillis = nowMillis + (remaining / max(display.playbackRate, 0.1) * 1000).toLong()
    return shortTimeText(finishMillis)
}

private fun sessionTimeText(display: PlayerDisplayModel, nowMillis: Long): String {
    val start = display.sessionStartMillis ?: return "-- read"
    val minutes = ((nowMillis - start).coerceAtLeast(0L) / 60_000L).toInt()
    if (minutes < 60) return "${minutes}m read"
    return "${minutes / 60}h${minutes % 60}m read"
}

private fun shortTimeText(millis: Long): String =
    DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(millis))
