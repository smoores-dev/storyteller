package dev.smoores.storyteller.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.DockCustomization
import dev.smoores.storyteller.model.MiniPlayerCustomization
import dev.smoores.storyteller.model.PlayerComplication
import dev.smoores.storyteller.model.SlotLayout
import dev.smoores.storyteller.model.SlotRef
import dev.smoores.storyteller.model.SlotRegion
import kotlin.math.roundToInt

// Port of Customize/DockCustomizeCard.swift.
@Composable
internal fun DockCustomizeCard(
    dock: DockCustomization,
    miniPlayer: MiniPlayerCustomization,
    alwaysShowMiniPlayer: Boolean,
    hasAudioNarration: Boolean,
    isScrollingMode: Boolean,
    freeBrowseMode: String,
    isOrientationLocked: Boolean,
    backgroundColor: Color,
    foregroundColor: Color,
    onUpdateDock: (DockCustomization) -> Unit,
    onToggleCycleShowingSecond: () -> Unit,
    onToggleMirror: () -> Unit,
    onToggleScrollingMode: () -> Unit,
    onToggleFreeBrowse: () -> Unit,
    onToggleOrientationLock: () -> Unit,
    onReset: () -> Unit,
    onDone: () -> Unit,
) {
    val selectedSlot = remember { mutableStateOf<SlotRef?>(null) }
    val display = PlayerDisplayModel.sample.copy(hasAudioNarration = hasAudioNarration)

    CustomizeCardContainer(title = "Dock", onDone = onDone, onReset = onReset) {
        Column(Modifier.fillMaxSize()) {
            MiniPlayerPreviewFrame(
                backgroundColor = backgroundColor,
                foregroundColor = foregroundColor,
                chromeOnCard = false,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(210.dp)
                    .padding(horizontal = 10.dp)
                    .padding(top = 4.dp),
            ) {
                ReaderDock(
                    leadingSlots = dock.leadingSlots,
                    trailingSlots = dock.trailingSlots,
                    centerSlots = dock.centerSlots,
                    transparency = dock.transparency,
                    display = display,
                    actions = PlayerActions.noop,
                    backgroundColor = backgroundColor,
                    contentColor = foregroundColor,
                    positionAtTop = false,
                    mirrored = miniPlayer.mirrored,
                    editing = selectedSlot,
                    isOrientationLocked = isOrientationLocked,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .padding(top = 12.dp, bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "Tap an outlined element above to choose what appears at that " +
                        "position. Set a slot to Empty to hide it.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Column {
                    Text(
                        "Opacity: ${(dock.transparency * 100).roundToInt()}%",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Slider(
                        value = dock.transparency.toFloat(),
                        onValueChange = {
                            onUpdateDock(dock.copy(transparency = roundTo(it, 2)))
                        },
                        valueRange = 0.1f..1f,
                        steps = 17,
                    )
                }
                Text(
                    "Opacity sets how solid the dock looks over the page.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                HorizontalDivider()

                ProgressIndicatorSection(
                    toggleTitle = "Show with Dock",
                    enabled = dock.progressIndicator,
                    scope = dock.progressScope,
                    thickness = dock.progressThickness,
                    onChange = { enabled, scope, thickness ->
                        onUpdateDock(
                            dock.copy(
                                progressIndicator = enabled,
                                progressScope = scope,
                                progressThickness = thickness,
                            ),
                        )
                    },
                )
            }

            CustomizePreviewDock(
                widget = CustomizePreviewWidget.DOCK,
                miniPlayer = miniPlayer,
                dock = dock,
                alwaysShowMiniPlayer = alwaysShowMiniPlayer,
                backgroundColor = backgroundColor,
                foregroundColor = foregroundColor,
                isScrollingMode = isScrollingMode,
                freeBrowseMode = freeBrowseMode,
                isOrientationLocked = isOrientationLocked,
                onToggleCycleShowingSecond = onToggleCycleShowingSecond,
                onToggleMirror = onToggleMirror,
                onToggleScrollingMode = onToggleScrollingMode,
                onToggleFreeBrowse = onToggleFreeBrowse,
                onToggleOrientationLock = onToggleOrientationLock,
            )
        }
    }

    val editingSlot = selectedSlot.value
    if (editingSlot != null) {
        ComplicationPickerSheet(
            slot = editingSlot,
            current = dock.slotComplication(editingSlot),
            display = display,
            hasAudioNarration = hasAudioNarration,
            onSelect = { ref, complication -> onUpdateDock(dock.withSlot(ref, complication)) },
            onDismiss = { selectedSlot.value = null },
        )
    }
}

private fun DockCustomization.regionSlots(region: SlotRegion): List<PlayerComplication>? =
    when (region) {
        SlotRegion.DOCK_LEADING -> leadingSlots
        SlotRegion.DOCK_TRAILING -> trailingSlots
        SlotRegion.DOCK_CENTER -> centerSlots
        else -> null
    }

internal fun DockCustomization.slotComplication(ref: SlotRef): PlayerComplication {
    val slots = regionSlots(ref.region) ?: return PlayerComplication.NONE
    return SlotLayout.padded(slots, ref.region)
        .getOrElse(ref.index) { PlayerComplication.NONE }
}

// ReaderDock already swaps regions when mirrored, so the ref names the setting.
internal fun DockCustomization.withSlot(
    ref: SlotRef,
    complication: PlayerComplication,
): DockCustomization {
    val slots = regionSlots(ref.region) ?: return this
    val updated = SlotLayout.padded(slots, ref.region).toMutableList()
    if (ref.index !in updated.indices) return this
    updated[ref.index] = complication
    return when (ref.region) {
        SlotRegion.DOCK_LEADING -> copy(leadingSlots = updated)
        SlotRegion.DOCK_TRAILING -> copy(trailingSlots = updated)
        SlotRegion.DOCK_CENTER -> copy(centerSlots = updated)
        else -> this
    }
}
