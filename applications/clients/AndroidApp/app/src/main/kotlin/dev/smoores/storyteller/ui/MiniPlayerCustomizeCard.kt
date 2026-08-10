package dev.smoores.storyteller.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.DockCustomization
import dev.smoores.storyteller.model.MiniPlayerCustomization
import dev.smoores.storyteller.model.MiniPlayerSize
import dev.smoores.storyteller.model.PlayerComplication
import dev.smoores.storyteller.model.SlotLayout
import dev.smoores.storyteller.model.SlotRef
import dev.smoores.storyteller.model.SlotRegion
import kotlin.math.roundToInt

// Port of Customize/MiniPlayerCustomizeCard.swift.
@Composable
internal fun MiniPlayerCustomizeCard(
    miniPlayer: MiniPlayerCustomization,
    dock: DockCustomization,
    alwaysShowMiniPlayer: Boolean,
    hasAudioNarration: Boolean,
    isScrollingMode: Boolean,
    freeBrowseMode: String,
    isOrientationLocked: Boolean,
    backgroundColor: Color,
    foregroundColor: Color,
    onUpdateMiniPlayer: (MiniPlayerCustomization) -> Unit,
    onUpdateAlwaysShow: (Boolean) -> Unit,
    onToggleScrollingMode: () -> Unit,
    onToggleFreeBrowse: () -> Unit,
    onToggleOrientationLock: () -> Unit,
    onReset: () -> Unit,
    onDone: () -> Unit,
) {
    val selectedSlot = remember { mutableStateOf<SlotRef?>(null) }
    var showLeadingPicker by remember { mutableStateOf(false) }
    val display = PlayerDisplayModel.sample.copy(hasAudioNarration = hasAudioNarration)

    CustomizeCardContainer(title = "Miniplayer", onDone = onDone, onReset = onReset) {
        Column(Modifier.fillMaxSize()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp)
                    .padding(top = 4.dp),
            ) {
                SizeDetentSlider(
                    size = miniPlayer.size,
                    onSelect = { onUpdateMiniPlayer(miniPlayer.copy(size = it)) },
                    modifier = Modifier.height(150.dp),
                )
                MiniPlayerPreviewFrame(
                    backgroundColor = backgroundColor,
                    foregroundColor = foregroundColor,
                    modifier = Modifier.weight(1f).height(240.dp),
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Box(
                            Modifier
                                .padding(top = MiniPlayerMetrics.grabberTopPadding)
                                .size(width = 36.dp, height = 5.dp)
                                .background(
                                    foregroundColor.copy(alpha = 0.5f),
                                    RoundedCornerShape(2.5.dp),
                                ),
                        )
                        MiniPlayerCardContent(
                            config = miniPlayer,
                            display = display,
                            actions = PlayerActions.noop,
                            editing = selectedSlot,
                            contentColor = foregroundColor,
                            backgroundColor = backgroundColor,
                            isOrientationLocked = isOrientationLocked,
                        )
                        MiniPlayerStatBand(
                            config = miniPlayer,
                            display = display,
                            actions = PlayerActions.noop,
                            editing = selectedSlot,
                            contentColor = foregroundColor,
                            isOrientationLocked = isOrientationLocked,
                            modifier = Modifier.padding(top = 10.dp, bottom = 12.dp),
                        )
                    }
                }
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
                    "Tap an outlined element above to choose what appears there. " +
                        "Drag the slider to change the card size.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SettingSwitch(
                    label = "Always Show",
                    checked = alwaysShowMiniPlayer,
                    onToggle = onUpdateAlwaysShow,
                )
                Text(
                    "Keeps the miniplayer on screen and holds space for it, so the page " +
                        "never runs underneath. With it off the miniplayer stays hidden " +
                        "until you tap the page, then floats over the text.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                HorizontalDivider()

                ProgressIndicatorSection(
                    toggleTitle = "Show with Miniplayer",
                    enabled = miniPlayer.progressIndicator,
                    scope = miniPlayer.progressScope,
                    thickness = miniPlayer.progressThickness,
                    onChange = { enabled, scope, thickness ->
                        onUpdateMiniPlayer(
                            miniPlayer.copy(
                                progressIndicator = enabled,
                                progressScope = scope,
                                progressThickness = thickness,
                            ),
                        )
                    },
                )
            }

            CustomizePreviewDock(
                widget = CustomizePreviewWidget.MINI_PLAYER,
                miniPlayer = miniPlayer,
                dock = dock,
                alwaysShowMiniPlayer = alwaysShowMiniPlayer,
                backgroundColor = backgroundColor,
                foregroundColor = foregroundColor,
                isScrollingMode = isScrollingMode,
                freeBrowseMode = freeBrowseMode,
                isOrientationLocked = isOrientationLocked,
                onToggleCycleShowingSecond = {
                    onUpdateMiniPlayer(
                        miniPlayer.copy(cycleShowingSecond = !miniPlayer.cycleShowingSecond),
                    )
                },
                onToggleMirror = {
                    onUpdateMiniPlayer(miniPlayer.copy(mirrored = !miniPlayer.mirrored))
                },
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
            current = miniPlayer.slotComplication(editingSlot),
            display = display,
            hasAudioNarration = hasAudioNarration,
            onSelect = { ref, complication ->
                onUpdateMiniPlayer(miniPlayer.withSlot(ref, complication))
            },
            onConfigureTitleBlock = if (SlotLayout.isMiniRow(editingSlot.region)) {
                { showLeadingPicker = true }
            } else {
                null
            },
            onDismiss = { selectedSlot.value = null },
        )
    }

    if (showLeadingPicker) {
        LeadingStylePickerSheet(
            leadingStyle = miniPlayer.leadingStyle,
            cycleFirst = miniPlayer.cycleFirst,
            cycleSecond = miniPlayer.cycleSecond,
            cycleShowingSecond = miniPlayer.cycleShowingSecond,
            display = display,
            hasAudioNarration = hasAudioNarration,
            onUpdate = { leadingStyle, cycleFirst, cycleSecond, cycleShowingSecond ->
                onUpdateMiniPlayer(
                    miniPlayer.copy(
                        leadingStyle = leadingStyle,
                        cycleFirst = cycleFirst,
                        cycleSecond = cycleSecond,
                        cycleShowingSecond = cycleShowingSecond,
                    ),
                )
            },
            onDismiss = { showLeadingPicker = false },
        )
    }
}

private fun MiniPlayerCustomization.regionSlots(region: SlotRegion): List<PlayerComplication>? =
    when (region) {
        SlotRegion.MINI_CONTENT_ROW -> contentRowSlots
        SlotRegion.MINI_STAT_BAND -> statSlots
        SlotRegion.MINI_SCRUB_ROW -> scrubRowSlots
        SlotRegion.MINI_EXTRA_ROW -> extraSlots
        else -> null
    }

internal fun MiniPlayerCustomization.slotComplication(ref: SlotRef): PlayerComplication {
    val slots = regionSlots(ref.region) ?: return PlayerComplication.NONE
    return SlotLayout.padded(slots, ref.region)
        .getOrElse(ref.index) { PlayerComplication.NONE }
}

internal fun MiniPlayerCustomization.withSlot(
    ref: SlotRef,
    complication: PlayerComplication,
): MiniPlayerCustomization {
    val slots = regionSlots(ref.region) ?: return this
    val updated = SlotLayout.padded(slots, ref.region).toMutableList()
    if (ref.index !in updated.indices) return this
    updated[ref.index] = complication
    return when (ref.region) {
        SlotRegion.MINI_CONTENT_ROW -> copy(contentRowSlots = updated)
        SlotRegion.MINI_STAT_BAND -> copy(statSlots = updated)
        SlotRegion.MINI_SCRUB_ROW -> copy(scrubRowSlots = updated)
        SlotRegion.MINI_EXTRA_ROW -> copy(extraSlots = updated)
        else -> this
    }
}

private val sizeDetentOrder = listOf(
    MiniPlayerSize.LARGE,
    MiniPlayerSize.REGULAR,
    MiniPlayerSize.COMPACT,
)

private fun sizeDetentLabel(size: MiniPlayerSize): String = when (size) {
    MiniPlayerSize.COMPACT -> "S"
    MiniPlayerSize.REGULAR -> "M"
    MiniPlayerSize.LARGE -> "L"
}

// Port of Customize/SizeDetentSlider.swift.
@Composable
internal fun SizeDetentSlider(
    size: MiniPlayerSize,
    onSelect: (MiniPlayerSize) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    val currentSize by rememberUpdatedState(size)
    val select by rememberUpdatedState<(MiniPlayerSize) -> Unit>(
        newValue = { detent ->
            if (detent != currentSize) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onSelect(detent)
            }
        },
    )
    val trackInset = 12.dp
    val selectedIndex = sizeDetentOrder.indexOf(size).takeIf { it >= 0 } ?: 2

    BoxWithConstraints(modifier.width(56.dp)) {
        val span = (maxHeight - trackInset * 2).coerceAtLeast(1.dp)
        val step = span / (sizeDetentOrder.size - 1)
        val centerX = maxWidth / 2
        val thumbOffset by animateDpAsState(
            targetValue = trackInset + step * selectedIndex - 11.dp,
            animationSpec = spring(
                dampingRatio = 0.8f,
                stiffness = Spring.StiffnessMediumLow,
            ),
            label = "sizeDetentThumb",
        )

        Box(
            Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    awaitEachGesture {
                        val insetPx = trackInset.toPx()
                        val stepPx = (this.size.height - insetPx * 2)
                            .coerceAtLeast(1f) / (sizeDetentOrder.size - 1)
                        fun selectAt(y: Float) {
                            val index = ((y - insetPx) / stepPx).roundToInt()
                                .coerceIn(0, sizeDetentOrder.size - 1)
                            select(sizeDetentOrder[index])
                        }
                        selectAt(awaitFirstDown().position.y)
                        while (true) {
                            val event = awaitPointerEvent()
                            event.changes.forEach { change ->
                                if (change.pressed) selectAt(change.position.y)
                            }
                            if (event.changes.all { !it.pressed }) break
                        }
                    }
                },
        )

        Box(
            Modifier
                .align(Alignment.TopCenter)
                .fillMaxHeight()
                .padding(vertical = trackInset)
                .width(4.dp)
                .background(
                    MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.25f),
                    CircleShape,
                ),
        )

        Box(
            Modifier
                .offset(x = centerX - 19.dp, y = thumbOffset)
                .size(22.dp)
                .background(MaterialTheme.colorScheme.primary, CircleShape),
        )

        sizeDetentOrder.forEachIndexed { index, detent ->
            val selected = detent == size
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier
                    .offset(x = centerX + 2.dp, y = trackInset + step * index - 9.dp)
                    .clickable { select(detent) },
            ) {
                Box(
                    Modifier
                        .size(10.dp)
                        .background(
                            if (selected) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                            },
                            CircleShape,
                        ),
                )
                Text(
                    sizeDetentLabel(detent),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                    color = if (selected) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }
    }
}
