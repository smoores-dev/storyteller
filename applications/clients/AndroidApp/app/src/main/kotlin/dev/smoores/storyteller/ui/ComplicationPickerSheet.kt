package dev.smoores.storyteller.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.MiniPlayerCycleBlock
import dev.smoores.storyteller.model.MiniPlayerCycleComponent
import dev.smoores.storyteller.model.MiniPlayerLeadingStyle
import dev.smoores.storyteller.model.PlayerComplication
import dev.smoores.storyteller.model.SlotLayout
import dev.smoores.storyteller.model.SlotRef
import kotlin.math.min

// Kotlin port of the iOS ComplicationPickerSheet. The picker offers every
// complication the region allows; audio-only ones are gated where they render.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ComplicationPickerSheet(
    slot: SlotRef,
    current: PlayerComplication,
    display: PlayerDisplayModel,
    hasAudioNarration: Boolean,
    onSelect: (SlotRef, PlayerComplication) -> Unit,
    onConfigureTitleBlock: (() -> Unit)? = null,
    onDismiss: () -> Unit,
) {
    val sections = listOf(
        null to listOf(PlayerComplication.NONE),
        "Playback" to SlotLayout.playbackControls(slot.region),
        "Reader Controls" to SlotLayout.readerControls(slot.region),
        "Stats" to SlotLayout.statComplications(slot.region),
    ).filter { it.second.isNotEmpty() }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxHeight(0.6f)
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            item {
                Text(
                    "Complication",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
            }

            if (current == PlayerComplication.TITLE_BLOCK && onConfigureTitleBlock != null) {
                item {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onDismiss()
                                onConfigureTitleBlock()
                            }
                            .padding(vertical = 12.dp),
                    ) {
                        Icon(Icons.Filled.Tune, contentDescription = null)
                        Spacer(Modifier.width(12.dp))
                        Text("Title Block Options", style = MaterialTheme.typography.bodyMedium)
                        Spacer(Modifier.weight(1f))
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        "Pick the cover and the two lines this block shows.",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            sections.forEach { (title, options) ->
                if (title != null) {
                    item { SettingsSectionHeader(title) }
                }
                items(options.size, key = { "$title-${options[it].rawValue}" }) { index ->
                    val complication = options[index]
                    ComplicationPickerRow(
                        complication = complication,
                        display = display,
                        isSelected = complication == current,
                        onClick = {
                            onSelect(slot, complication)
                            onDismiss()
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ComplicationPickerRow(
    complication: PlayerComplication,
    display: PlayerDisplayModel,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp),
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(width = 68.dp, height = 36.dp)
                .background(
                    MaterialTheme.colorScheme.surfaceVariant,
                    RoundedCornerShape(8.dp),
                )
                .border(
                    1.dp,
                    MaterialTheme.colorScheme.outlineVariant,
                    RoundedCornerShape(8.dp),
                ),
        ) {
            if (complication == PlayerComplication.NONE) {
                DashedCircle()
            } else {
                PlayerComplicationView(
                    complication = complication,
                    display = display,
                    actions = PlayerActions.noop,
                    style = ComplicationStyle.PickerThumb,
                    editingPreview = true,
                )
            }
        }
        Text(
            complication.displayName,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (isSelected) {
            Icon(
                Icons.Filled.Check,
                contentDescription = "Selected",
                tint = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun DashedCircle() {
    val color = MaterialTheme.colorScheme.onSurfaceVariant
    Box(
        modifier = Modifier
            .size(18.dp)
            .drawBehind {
                val stroke = 1.5.dp.toPx()
                drawCircle(
                    color = color,
                    radius = min(size.width, size.height) / 2 - stroke / 2,
                    center = Offset(size.width / 2, size.height / 2),
                    style = Stroke(
                        width = stroke,
                        pathEffect = PathEffect.dashPathEffect(
                            floatArrayOf(3.dp.toPx(), 3.dp.toPx()),
                            0f,
                        ),
                    ),
                )
            },
    )
}

// Kotlin port of the iOS LeadingStylePickerSheet.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun LeadingStylePickerSheet(
    leadingStyle: MiniPlayerLeadingStyle,
    cycleFirst: MiniPlayerCycleBlock,
    cycleSecond: MiniPlayerCycleBlock,
    cycleShowingSecond: Boolean,
    display: PlayerDisplayModel,
    hasAudioNarration: Boolean,
    onUpdate: (
        leadingStyle: MiniPlayerLeadingStyle,
        cycleFirst: MiniPlayerCycleBlock,
        cycleSecond: MiniPlayerCycleBlock,
        cycleShowingSecond: Boolean,
    ) -> Unit,
    onDismiss: () -> Unit,
) {
    var editingSecondCycle by remember { mutableStateOf(cycleShowingSecond) }
    val isCycling = leadingStyle == MiniPlayerLeadingStyle.CYCLE
    val editingSecond = isCycling && editingSecondCycle
    val block = if (editingSecond) cycleSecond else cycleFirst
    val writeBlock: (MiniPlayerCycleBlock) -> Unit = { updated ->
        if (editingSecond) {
            onUpdate(leadingStyle, cycleFirst, updated, cycleShowingSecond)
        } else {
            onUpdate(leadingStyle, updated, cycleSecond, cycleShowingSecond)
        }
    }
    val components = MiniPlayerCycleComponent.entries.filter {
        hasAudioNarration || !it.requiresAudio
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxHeight(0.6f)
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text("Title Block", style = MaterialTheme.typography.titleMedium)
            }
            item {
                LeadingStyleRow(
                    title = "One View",
                    subtitle = "Tap expands the full player",
                    isSelected = leadingStyle == MiniPlayerLeadingStyle.SINGLE,
                    onClick = {
                        onUpdate(
                            MiniPlayerLeadingStyle.SINGLE,
                            cycleFirst,
                            cycleSecond,
                            cycleShowingSecond,
                        )
                    },
                )
            }
            item {
                LeadingStyleRow(
                    title = "Two Views",
                    subtitle = "Tap flips between two custom views",
                    isSelected = isCycling,
                    onClick = {
                        onUpdate(
                            MiniPlayerLeadingStyle.CYCLE,
                            cycleFirst,
                            cycleSecond,
                            cycleShowingSecond,
                        )
                    },
                )
            }

            item { SettingsSectionHeader(if (isCycling) "Views" else "View") }

            if (isCycling) {
                item {
                    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                        listOf(false to "First View", true to "Second View")
                            .forEachIndexed { index, (second, label) ->
                                SegmentedButton(
                                    selected = editingSecondCycle == second,
                                    onClick = {
                                        editingSecondCycle = second
                                        onUpdate(leadingStyle, cycleFirst, cycleSecond, second)
                                    },
                                    shape = SegmentedButtonDefaults.itemShape(index, 2),
                                ) {
                                    Text(label)
                                }
                            }
                    }
                }
            }

            item { CyclePreview(block, display) }

            item {
                SettingSwitch(
                    label = "Show Cover",
                    checked = block.showCover,
                    onToggle = { writeBlock(block.copy(showCover = it)) },
                )
            }

            item {
                CycleComponentPicker(
                    label = "Line 1",
                    selected = block.line1,
                    options = components,
                    onSelect = { writeBlock(block.copy(line1 = it)) },
                )
            }
            item {
                CycleComponentPicker(
                    label = "Line 2",
                    selected = block.line2,
                    options = components,
                    onSelect = { writeBlock(block.copy(line2 = it)) },
                )
            }

            item {
                Text(
                    if (isCycling) {
                        "Each view builds from the pieces you pick here. " +
                            "Tapping the block in the reader flips between the two views."
                    } else {
                        "The view builds from the pieces you pick here."
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun LeadingStyleRow(
    title: String,
    subtitle: String,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            Text(
                subtitle,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (isSelected) {
            Icon(
                Icons.Filled.Check,
                contentDescription = "Selected",
                tint = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun CyclePreview(block: MiniPlayerCycleBlock, display: PlayerDisplayModel) {
    val sample = PlayerDisplayModel.sample.copy(
        hasAudioNarration = display.hasAudioNarration,
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .background(
                MaterialTheme.colorScheme.surfaceVariant,
                RoundedCornerShape(10.dp),
            )
            .padding(10.dp),
    ) {
        if (block.showCover) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(40.dp)
                    .background(
                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.2f),
                        RoundedCornerShape(6.dp),
                    ),
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.MenuBook,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            if (block.line1 != MiniPlayerCycleComponent.NONE) {
                Text(
                    cycleComponentDisplayText(block.line1, sample),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (block.line2 != MiniPlayerCycleComponent.NONE) {
                Text(
                    cycleComponentDisplayText(block.line2, sample),
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontFeatureSettings = "tnum",
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun CycleComponentPicker(
    label: String,
    selected: MiniPlayerCycleComponent,
    options: List<MiniPlayerCycleComponent>,
    onSelect: (MiniPlayerCycleComponent) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        Box {
            TextButton(onClick = { expanded = true }) {
                Text(selected.displayName)
                Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                options.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option.displayName) },
                        trailingIcon = {
                            if (option == selected) {
                                Icon(Icons.Filled.Check, contentDescription = "Selected")
                            }
                        },
                        onClick = {
                            expanded = false
                            onSelect(option)
                        },
                    )
                }
            }
        }
    }
}
