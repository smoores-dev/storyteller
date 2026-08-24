package dev.smoores.storyteller.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBackIos
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.MenuBarCustomization
import dev.smoores.storyteller.model.PlayerComplication
import dev.smoores.storyteller.model.SlotLayout
import dev.smoores.storyteller.model.SlotRef
import dev.smoores.storyteller.model.SlotRegion

// Port of Customize/MenuBarCustomizeCard.swift.
@Composable
internal fun MenuBarCustomizeCard(
    menuBar: MenuBarCustomization,
    hasAudioNarration: Boolean,
    backgroundColor: Color,
    foregroundColor: Color,
    onUpdateMenuBar: (MenuBarCustomization) -> Unit,
    onReset: () -> Unit,
    onDone: () -> Unit,
) {
    val selectedSlot = remember { mutableStateOf<SlotRef?>(null) }
    val display = PlayerDisplayModel.sample.copy(hasAudioNarration = hasAudioNarration)
    val dimmed = foregroundColor.copy(alpha = 0.4f)

    CustomizeCardContainer(title = "Menu Bar", onDone = onDone, onReset = onReset) {
        Column(Modifier.fillMaxSize()) {
            MenuBarPreviewFrame(
                backgroundColor = backgroundColor,
                foregroundColor = foregroundColor,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(150.dp)
                    .padding(horizontal = 10.dp)
                    .padding(top = 4.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .background(backgroundColor)
                        .padding(horizontal = 20.dp)
                        .padding(top = 10.dp),
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.size(width = 24.dp, height = 34.dp),
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBackIos,
                            contentDescription = null,
                            tint = dimmed,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        SlotLayout.padded(menuBar.slots, SlotRegion.MENU_BAR)
                            .forEachIndexed { index, complication ->
                                Box(
                                    Modifier.slotEditable(
                                        SlotRef(SlotRegion.MENU_BAR, index),
                                        selectedSlot,
                                    ),
                                ) {
                                    PlayerComplicationView(
                                        complication = complication,
                                        display = display,
                                        actions = PlayerActions.noop,
                                        style = ComplicationStyle.PickerThumb,
                                        editingPreview = true,
                                        contentColor = foregroundColor,
                                    )
                                }
                            }
                    }
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.size(width = 24.dp, height = 34.dp),
                    ) {
                        Icon(
                            Icons.Filled.Tune,
                            contentDescription = null,
                            tint = dimmed,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(top = 12.dp),
            ) {
                Text(
                    "Tap an outlined slot above to choose what appears at that position. " +
                        "Set a slot to Empty to hide it. The back button and this " +
                        "customize menu always stay.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    val editingSlot = selectedSlot.value
    if (editingSlot != null) {
        ComplicationPickerSheet(
            slot = editingSlot,
            current = menuBar.slotComplication(editingSlot),
            display = display,
            hasAudioNarration = hasAudioNarration,
            onSelect = { ref, complication ->
                onUpdateMenuBar(menuBar.withSlot(ref, complication))
            },
            onDismiss = { selectedSlot.value = null },
        )
    }
}

internal fun MenuBarCustomization.slotComplication(ref: SlotRef): PlayerComplication {
    if (ref.region != SlotRegion.MENU_BAR) return PlayerComplication.NONE
    return SlotLayout.padded(slots, SlotRegion.MENU_BAR)
        .getOrElse(ref.index) { PlayerComplication.NONE }
}

internal fun MenuBarCustomization.withSlot(
    ref: SlotRef,
    complication: PlayerComplication,
): MenuBarCustomization {
    if (ref.region != SlotRegion.MENU_BAR) return this
    val updated = SlotLayout.padded(slots, SlotRegion.MENU_BAR).toMutableList()
    if (ref.index !in updated.indices) return this
    updated[ref.index] = complication
    return copy(slots = updated)
}
