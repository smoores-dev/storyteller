package dev.smoores.storyteller.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.RotateLeft
import androidx.compose.material.icons.automirrored.filled.RotateRight
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.FullPlayerCustomization
import dev.smoores.storyteller.model.PlayerComplication
import dev.smoores.storyteller.model.SlotLayout
import dev.smoores.storyteller.model.SlotRef
import dev.smoores.storyteller.model.SlotRegion
import kotlin.math.roundToInt

// Port of Customize/FullPlayerCustomizeCard.swift.
@Composable
internal fun FullPlayerCustomizeCard(
    fullPlayer: FullPlayerCustomization,
    hasAudioNarration: Boolean,
    palette: CoverBackgroundPalette,
    backgroundColor: Color,
    foregroundColor: Color,
    onUpdateFullPlayer: (FullPlayerCustomization) -> Unit,
    onReset: () -> Unit,
    onDone: () -> Unit,
) {
    val selectedSlot = remember { mutableStateOf<SlotRef?>(null) }
    var demoRate by remember { mutableDoubleStateOf(1.0) }
    var demoVolume by remember { mutableDoubleStateOf(1.0) }
    var demoSleepRemaining by remember { mutableStateOf<Double?>(null) }
    var demoSleepEndOfChapter by remember { mutableStateOf(false) }
    var showSpeed by remember { mutableStateOf(false) }
    var showVolume by remember { mutableStateOf(false) }
    var showSleepTimer by remember { mutableStateOf(false) }

    val sampleDisplay = PlayerDisplayModel.sample.copy(hasAudioNarration = hasAudioNarration)
    val demoDisplay = sampleDisplay.copy(
        playbackRate = demoRate,
        volume = demoVolume,
        sleepTimerRemaining = demoSleepRemaining,
        sleepTimerEndOfChapter = demoSleepEndOfChapter,
    )
    val demoSleepActive = demoSleepRemaining != null || demoSleepEndOfChapter
    val editingCallbacks = FullPlayerControlCallbacks(
        onBookmarks = {},
        onReadingTimeline = {},
        onImageGallery = {},
        onSearch = {},
        onTextSettings = {},
    )
    val demoCallbacks = FullPlayerControlCallbacks(
        onSpeed = { showSpeed = true },
        onChapters = {},
        onVolume = { showVolume = true },
        onSleepTimer = {
            if (demoSleepActive) {
                demoSleepRemaining = null
                demoSleepEndOfChapter = false
            } else {
                showSleepTimer = true
            }
        },
        onBookmarks = {},
        onReadingTimeline = {},
        onImageGallery = {},
        onSearch = {},
        onTextSettings = {},
    )
    val demoSleepLabel = when {
        demoSleepEndOfChapter -> "End Ch."
        demoSleepRemaining != null -> formatPlaybackTime(demoSleepRemaining ?: 0.0)
        else -> "Sleep"
    }

    CustomizeCardContainer(title = "Full Player", onDone = onDone, onReset = onReset) {
        Column(Modifier.fillMaxSize()) {
            Column(
                verticalArrangement = Arrangement.spacedBy(18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp)
                    .padding(top = 4.dp)
                    .background(backgroundColor, RoundedCornerShape(16.dp))
                    .border(
                        2.dp,
                        foregroundColor.copy(alpha = 0.2f),
                        RoundedCornerShape(16.dp),
                    )
                    .padding(horizontal = 18.dp, vertical = 14.dp),
            ) {
                FakeTransportRow(foregroundColor.copy(alpha = 0.4f))

                FullPlayerStatSlots(
                    slots = fullPlayer.statSlots,
                    display = sampleDisplay,
                    tint = foregroundColor.copy(alpha = 0.7f),
                    editing = selectedSlot,
                )

                FullPlayerControlRow(
                    slots = fullPlayer.controlSlots,
                    display = sampleDisplay,
                    palette = palette,
                    sleepLabel = "Sleep",
                    sleepActive = false,
                    callbacks = editingCallbacks,
                    editing = selectedSlot,
                )
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .padding(top = 12.dp, bottom = 12.dp),
            ) {
                Text(
                    "Tap an outlined slot to choose what appears there. " +
                        "Set a slot to Empty to hide it.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            CustomizePreviewLabel()
            Column(
                verticalArrangement = Arrangement.spacedBy(20.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .background(backgroundColor)
                    .padding(horizontal = 20.dp)
                    .padding(top = 18.dp, bottom = 22.dp),
            ) {
                FullPlayerStatSlots(
                    slots = fullPlayer.statSlots,
                    display = demoDisplay,
                    tint = foregroundColor.copy(alpha = 0.7f),
                    hasAudio = hasAudioNarration,
                )

                FullPlayerControlRow(
                    slots = fullPlayer.controlSlots,
                    display = demoDisplay,
                    palette = palette,
                    sleepLabel = demoSleepLabel,
                    sleepActive = demoSleepActive,
                    callbacks = demoCallbacks,
                    hasAudio = hasAudioNarration,
                )
            }
        }
    }

    if (showSpeed) {
        PlaybackSpeedDialog(
            currentRate = demoRate,
            dismiss = { showSpeed = false },
            select = {
                showSpeed = false
                demoRate = it
            },
        )
    }
    if (showVolume) {
        VolumeDialog(
            currentVolume = demoVolume,
            dismiss = { showVolume = false },
            select = {
                showVolume = false
                demoVolume = it
            },
        )
    }
    if (showSleepTimer) {
        SleepTimerDialog(
            dismiss = { showSleepTimer = false },
            selectDuration = {
                showSleepTimer = false
                demoSleepRemaining = it
                demoSleepEndOfChapter = false
            },
            selectEndOfChapter = {
                showSleepTimer = false
                demoSleepRemaining = null
                demoSleepEndOfChapter = true
            },
        )
    }

    val editingSlot = selectedSlot.value
    if (editingSlot != null) {
        ComplicationPickerSheet(
            slot = editingSlot,
            current = fullPlayer.slotComplication(editingSlot),
            display = sampleDisplay,
            hasAudioNarration = hasAudioNarration,
            onSelect = { ref, complication ->
                onUpdateFullPlayer(fullPlayer.withSlot(ref, complication))
            },
            onDismiss = { selectedSlot.value = null },
        )
    }
}

@Composable
private fun FakeTransportRow(color: Color) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FakeTransportGlyph(Icons.Filled.SkipPrevious, color)
        FakeTransportGlyph(Icons.AutoMirrored.Filled.RotateLeft, color)
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(40.dp)
                .background(color.copy(alpha = 0.15f), CircleShape),
        ) {
            Icon(
                Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(22.dp),
            )
        }
        FakeTransportGlyph(Icons.AutoMirrored.Filled.RotateRight, color)
        FakeTransportGlyph(Icons.Filled.SkipNext, color)
    }
}

@Composable
private fun FakeTransportGlyph(icon: ImageVector, color: Color) {
    Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
}

internal fun FullPlayerCustomization.slotComplication(ref: SlotRef): PlayerComplication =
    when (ref.region) {
        SlotRegion.FULL_PLAYER_STATS ->
            SlotLayout.padded(statSlots, ref.region)
                .getOrElse(ref.index) { PlayerComplication.NONE }
        SlotRegion.FULL_PLAYER_CONTROLS ->
            SlotLayout.padded(controlSlots, ref.region)
                .getOrElse(ref.index) { PlayerComplication.NONE }
        else -> PlayerComplication.NONE
    }

internal fun FullPlayerCustomization.withSlot(
    ref: SlotRef,
    complication: PlayerComplication,
): FullPlayerCustomization = when (ref.region) {
    SlotRegion.FULL_PLAYER_STATS -> {
        val updated = SlotLayout.padded(statSlots, ref.region).toMutableList()
        if (ref.index !in updated.indices) {
            this
        } else {
            updated[ref.index] = complication
            copy(statSlots = updated)
        }
    }
    SlotRegion.FULL_PLAYER_CONTROLS -> {
        val updated = SlotLayout.padded(controlSlots, ref.region).toMutableList()
        if (ref.index !in updated.indices) {
            this
        } else {
            updated[ref.index] = complication
            copy(controlSlots = updated)
        }
    }
    else -> this
}
