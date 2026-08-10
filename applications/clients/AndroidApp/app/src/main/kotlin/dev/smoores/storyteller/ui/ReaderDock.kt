package dev.smoores.storyteller.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.PlayerComplication
import dev.smoores.storyteller.model.SlotRef
import dev.smoores.storyteller.model.SlotRegion

// Port of EbookDockIos.swift. Fixed band heights so
// toggling individual items never resizes the fitted webview.
internal object DockMetrics {
    // Deliberately the established Android constants (ReaderChrome.kt), not the
    // iOS 44/30.
    val controlsContentHeight = 56.dp
    val statsContentHeight = 34.dp

    // The webview may run right up to the dock content. Only the content box
    // and the padding below it stay clear.
    fun reservedBottomInset(withPlaybackControls: Boolean): Dp =
        (if (withPlaybackControls) controlsContentHeight else statsContentHeight) + 22.dp
}

// Kotlin mirror of EbookDockIos: leading stack, centered controls, trailing
// stack, composed from complication slots. Pure function of its inputs.
@Composable
internal fun ReaderDock(
    leadingSlots: List<PlayerComplication>,
    trailingSlots: List<PlayerComplication>,
    centerSlots: List<PlayerComplication>,
    transparency: Double,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    backgroundColor: Color,
    contentColor: Color,
    positionAtTop: Boolean,
    mirrored: Boolean = false,
    editing: MutableState<SlotRef?>? = null,
    isOrientationLocked: Boolean = false,
    modifier: Modifier = Modifier,
) {
    // Swapping hands moves the whole band across, stats included; the regions
    // swap too so tapping a mirrored slot edits the right setting.
    val leftSlots = if (mirrored) trailingSlots else leadingSlots
    val rightSlots = if (mirrored) leadingSlots else trailingSlots
    val leftRegion = if (mirrored) SlotRegion.DOCK_TRAILING else SlotRegion.DOCK_LEADING
    val rightRegion = if (mirrored) SlotRegion.DOCK_LEADING else SlotRegion.DOCK_TRAILING

    fun isVisible(comp: PlayerComplication): Boolean = when {
        editing != null -> true
        comp == PlayerComplication.NONE -> false
        else -> display.hasAudioNarration || !comp.requiresAudio
    }

    val visibleLeading = leftSlots.mapIndexed { index, comp -> index to comp }
        .filter { isVisible(it.second) }
    val visibleTrailing = rightSlots.mapIndexed { index, comp -> index to comp }
        .filter { isVisible(it.second) }
    val centerEntries = centerSlots.mapIndexed { index, comp -> index to comp }
        .filter { isVisible(it.second) }
    val visibleCenter = if (mirrored) {
        mirroredRowEntries(centerEntries) { it.second }
    } else {
        centerEntries
    }

    val hasStats = visibleLeading.isNotEmpty() || visibleTrailing.isNotEmpty()
    val hasPlaybackControls = visibleCenter.isNotEmpty()
    val hasContent = hasStats || hasPlaybackControls
    val style = ComplicationStyle.Dock(transparency)

    if (positionAtTop) {
        // Side stacks only; the miniplayer owns the bottom edge.
        Surface(
            color = if (hasStats) backgroundColor else Color.Transparent,
            modifier = modifier,
        ) {
            Row(
                verticalAlignment = Alignment.Top,
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 38.dp, vertical = 8.dp),
            ) {
                if (visibleLeading.isNotEmpty()) {
                    DockSlotStack(
                        visibleLeading, leftRegion, trailing = false,
                        style, display, actions, editing, isOrientationLocked, contentColor,
                    )
                }
                Spacer(Modifier.weight(1f))
                if (visibleTrailing.isNotEmpty()) {
                    DockSlotStack(
                        visibleTrailing, rightRegion, trailing = true,
                        style, display, actions, editing, isOrientationLocked, contentColor,
                    )
                }
            }
        }
    } else {
        Surface(
            color = if (hasContent) backgroundColor else Color.Transparent,
            modifier = modifier,
        ) {
            // Equal-flex side columns keep the transport controls truly
            // centered while guaranteeing the stats never slide under them.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 22.dp)
                    .height(
                        if (hasPlaybackControls) {
                            DockMetrics.controlsContentHeight
                        } else {
                            DockMetrics.statsContentHeight
                        }
                    ),
            ) {
                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    if (visibleLeading.isNotEmpty()) {
                        DockSlotStack(
                            visibleLeading, leftRegion, trailing = false,
                            style, display, actions, editing, isOrientationLocked, contentColor,
                        )
                    }
                }
                if (hasPlaybackControls) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        visibleCenter.forEach { (index, comp) ->
                            Box(
                                Modifier.slotEditable(
                                    SlotRef(SlotRegion.DOCK_CENTER, index),
                                    editing,
                                ),
                            ) {
                                PlayerComplicationView(
                                    complication = comp,
                                    display = display,
                                    actions = actions,
                                    style = style,
                                    editingPreview = editing != null,
                                    isOrientationLocked = isOrientationLocked,
                                    contentColor = contentColor,
                                )
                            }
                        }
                    }
                }
                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                    if (visibleTrailing.isNotEmpty()) {
                        DockSlotStack(
                            visibleTrailing, rightRegion, trailing = true,
                            style, display, actions, editing, isOrientationLocked, contentColor,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DockSlotStack(
    entries: List<Pair<Int, PlayerComplication>>,
    region: SlotRegion,
    trailing: Boolean,
    style: ComplicationStyle,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    editing: MutableState<SlotRef?>?,
    isOrientationLocked: Boolean,
    contentColor: Color,
) {
    Column(
        horizontalAlignment = if (trailing) Alignment.End else Alignment.Start,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        entries.forEach { (index, comp) ->
            Box(Modifier.slotEditable(SlotRef(region, index), editing)) {
                PlayerComplicationView(
                    complication = comp,
                    display = display,
                    actions = actions,
                    style = style,
                    editingPreview = editing != null,
                    iconTrailing = trailing,
                    isOrientationLocked = isOrientationLocked,
                    contentColor = contentColor,
                )
            }
        }
    }
}

// Port of ProgressIndicatorLine in CustomizeCard.swift: the shared progress
// line for dock, miniplayer, and previews. Draws only; no hit testing.
@Composable
internal fun DockProgressLine(
    progress: Double,
    thickness: Dp,
    color: Color = Color.Gray.copy(alpha = 0.65f),
    modifier: Modifier = Modifier,
) {
    Box(modifier.fillMaxWidth().height(thickness)) {
        Box(
            Modifier
                .fillMaxWidth(progress.coerceIn(0.0, 1.0).toFloat())
                .height(thickness)
                .background(color),
        )
    }
}
