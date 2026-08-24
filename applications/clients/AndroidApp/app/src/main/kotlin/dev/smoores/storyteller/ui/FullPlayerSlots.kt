package dev.smoores.storyteller.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.FormatSize
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Speed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.PlayerComplication
import dev.smoores.storyteller.model.SlotLayout
import dev.smoores.storyteller.model.SlotRef
import dev.smoores.storyteller.model.SlotRegion
import kotlin.math.roundToInt

// Reader-context actions are null on the standalone audiobook player, which
// hides those slots there.
internal data class FullPlayerControlCallbacks(
    val onSpeed: () -> Unit = {},
    val onChapters: () -> Unit = {},
    val onVolume: () -> Unit = {},
    val onSleepTimer: () -> Unit = {},
    val onBookmarks: (() -> Unit)? = null,
    val onReadingTimeline: (() -> Unit)? = null,
    val onImageGallery: (() -> Unit)? = null,
    val onSearch: (() -> Unit)? = null,
    val onTextSettings: (() -> Unit)? = null,
)

@Composable
internal fun FullPlayerStatSlots(
    slots: List<PlayerComplication>,
    display: PlayerDisplayModel,
    tint: Color,
    hasAudio: Boolean = true,
    editing: MutableState<SlotRef?>? = null,
    modifier: Modifier = Modifier,
) {
    val padded = SlotLayout.padded(slots, SlotRegion.FULL_PLAYER_STATS)
    fun visible(slot: PlayerComplication) = editing != null ||
        (slot != PlayerComplication.NONE && (hasAudio || !slot.requiresAudio))
    val columns = 3
    val rows = padded.indices.chunked(columns).filter { row -> row.any { visible(padded[it]) } }
    if (rows.isEmpty()) return
    val spacing = if (editing != null) 8.dp else 6.dp

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(spacing)) {
        rows.forEach { row ->
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                row.forEach { index ->
                    val column = index % columns
                    Box(
                        Modifier.weight(1f),
                        contentAlignment = when (column) {
                            0 -> Alignment.CenterStart
                            columns - 1 -> Alignment.CenterEnd
                            else -> Alignment.Center
                        },
                    ) {
                        if (visible(padded[index])) {
                            StatSlot(
                                padded[index],
                                index,
                                display,
                                tint,
                                iconTrailing = column == columns - 1,
                                editing,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatSlot(
    slot: PlayerComplication,
    index: Int,
    display: PlayerDisplayModel,
    tint: Color,
    iconTrailing: Boolean,
    editing: MutableState<SlotRef?>?,
) {
    Box(
        Modifier.then(
            if (editing != null) {
                Modifier.slotEditable(SlotRef(SlotRegion.FULL_PLAYER_STATS, index), editing)
            } else {
                Modifier
            }
        ),
    ) {
        PlayerComplicationView(
            complication = slot,
            display = display,
            actions = PlayerActions.noop,
            style = ComplicationStyle.FullPlayer(tint),
            iconTrailing = iconTrailing,
            contentColor = tint,
        )
    }
}

@Composable
internal fun FullPlayerControlRow(
    slots: List<PlayerComplication>,
    display: PlayerDisplayModel,
    palette: CoverBackgroundPalette,
    sleepLabel: String,
    sleepActive: Boolean,
    callbacks: FullPlayerControlCallbacks,
    hasAudio: Boolean = true,
    editing: MutableState<SlotRef?>? = null,
    modifier: Modifier = Modifier,
) {
    val padded = SlotLayout.padded(slots, SlotRegion.FULL_PLAYER_CONTROLS)
    Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.Top,
    ) {
        padded.forEachIndexed { index, slot ->
            if (editing == null) {
                if (slot == PlayerComplication.NONE) return@forEachIndexed
                if (!hasAudio && slot.requiresAudio) return@forEachIndexed
            }
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .weight(1f)
                    .then(
                        if (editing != null) {
                            Modifier.slotEditable(
                                SlotRef(SlotRegion.FULL_PLAYER_CONTROLS, index),
                                editing,
                            )
                        } else {
                            Modifier
                        }
                    ),
            ) {
                ControlSlot(
                    slot = slot,
                    display = display,
                    palette = palette,
                    sleepLabel = sleepLabel,
                    sleepActive = sleepActive,
                    callbacks = callbacks,
                    modifier = Modifier,
                )
            }
        }
    }
}

@Composable
private fun ControlSlot(
    slot: PlayerComplication,
    display: PlayerDisplayModel,
    palette: CoverBackgroundPalette,
    sleepLabel: String,
    sleepActive: Boolean,
    callbacks: FullPlayerControlCallbacks,
    modifier: Modifier,
) {
    when (slot) {
        PlayerComplication.PLAYBACK_SPEED -> SecondaryControl(
            icon = Icons.Filled.Speed,
            label = formatPlaybackRate(display.playbackRate),
            contentDescription = "Playback speed",
            onClick = callbacks.onSpeed,
            palette = palette,
            modifier = modifier,
        )
        PlayerComplication.CHAPTERS -> SecondaryControl(
            icon = Icons.AutoMirrored.Filled.List,
            label = "Chapters",
            contentDescription = "Chapters",
            onClick = callbacks.onChapters,
            palette = palette,
            modifier = modifier,
        )
        PlayerComplication.VOLUME -> SecondaryControl(
            icon = volumeIcon(display.volume),
            label = "${(display.volume * 100).roundToInt()}%",
            contentDescription = "Volume",
            onClick = callbacks.onVolume,
            palette = palette,
            modifier = modifier,
        )
        PlayerComplication.SLEEP_TIMER -> SecondaryControl(
            icon = Icons.Filled.Bedtime,
            label = sleepLabel,
            contentDescription = "Sleep timer",
            onClick = callbacks.onSleepTimer,
            palette = palette,
            active = sleepActive,
            modifier = modifier,
        )
        PlayerComplication.BOOKMARKS -> callbacks.onBookmarks?.let {
            SecondaryControl(
                icon = Icons.Filled.BookmarkBorder,
                label = "Bookmarks",
                contentDescription = "Bookmarks",
                onClick = it,
                palette = palette,
                modifier = modifier,
            )
        }
        PlayerComplication.READING_TIMELINE -> callbacks.onReadingTimeline?.let {
            SecondaryControl(
                icon = Icons.Filled.History,
                label = "Timeline",
                contentDescription = "Reading timeline",
                onClick = it,
                palette = palette,
                modifier = modifier,
            )
        }
        PlayerComplication.IMAGE_GALLERY -> callbacks.onImageGallery?.let {
            SecondaryControl(
                icon = Icons.Filled.PhotoLibrary,
                label = "Images",
                contentDescription = "Images",
                onClick = it,
                palette = palette,
                modifier = modifier,
            )
        }
        PlayerComplication.SEARCH -> callbacks.onSearch?.let {
            SecondaryControl(
                icon = Icons.Filled.Search,
                label = "Search",
                contentDescription = "Search",
                onClick = it,
                palette = palette,
                modifier = modifier,
            )
        }
        PlayerComplication.TEXT_SETTINGS -> callbacks.onTextSettings?.let {
            SecondaryControl(
                icon = Icons.Filled.FormatSize,
                label = "Text",
                contentDescription = "Text settings",
                onClick = it,
                palette = palette,
                modifier = modifier,
            )
        }
        else -> Box(modifier, contentAlignment = Alignment.Center) {
            PlayerComplicationView(
                complication = slot,
                display = display,
                actions = PlayerActions.noop,
                style = ComplicationStyle.FullPlayer(palette.ratingAccent),
            )
        }
    }
}
