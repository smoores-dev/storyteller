package dev.smoores.storyteller.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import dev.smoores.storyteller.model.MiniPlayerProgressScope
import kotlin.math.roundToInt

// Port of Customize/CustomizeCard.swift.
internal enum class CustomizeCard {
    TEXT_LAYOUT,
    READALOUD,
    MENU_BAR,
    MINIPLAYER,
    DOCK,
    THEME,
}

@Composable
internal fun CustomizeCardContainer(
    title: String,
    onDone: () -> Unit,
    onReset: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    var confirmingReset by remember { mutableStateOf(false) }

    Dialog(
        onDismissRequest = onDone,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (onReset != null) {
                        TextButton(onClick = { confirmingReset = true }) { Text("Reset") }
                    } else {
                        Spacer(modifier = Modifier.width(80.dp))
                    }
                    Text(
                        title,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                    )
                    TextButton(onClick = onDone) { Text("Done") }
                }
                content()
            }
        }
    }

    if (confirmingReset && onReset != null) {
        AlertDialog(
            onDismissRequest = { confirmingReset = false },
            title = { Text("Reset $title to defaults?") },
            text = { Text("Only the settings on this page change.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmingReset = false
                        onReset()
                    },
                ) {
                    Text("Reset $title", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmingReset = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
internal fun CustomizePreviewLabel() {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            "Preview:",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ProgressIndicatorSection(
    toggleTitle: String,
    enabled: Boolean,
    scope: MiniPlayerProgressScope,
    thickness: Double,
    onChange: (Boolean, MiniPlayerProgressScope, Double) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SettingsSectionHeader("Progress Indicator")
        SettingSwitch(
            label = toggleTitle,
            checked = enabled,
            onToggle = { onChange(it, scope, thickness) },
        )
        if (enabled) {
            Column {
                Text(
                    "Shows Progress In",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    val options = listOf(
                        MiniPlayerProgressScope.CHAPTER to "Chapter",
                        MiniPlayerProgressScope.BOOK to "Book",
                    )
                    options.forEachIndexed { index, (value, label) ->
                        SegmentedButton(
                            selected = scope == value,
                            onClick = { onChange(enabled, value, thickness) },
                            shape = SegmentedButtonDefaults.itemShape(index, options.size),
                        ) {
                            Text(label)
                        }
                    }
                }
            }
            SettingSlider(
                label = "Thickness",
                value = thickness,
                range = 1f..8f,
                format = { "${it.roundToInt()}pt" },
                onPreview = { onChange(enabled, scope, it.roundToInt().toDouble()) },
                onCommit = { onChange(enabled, scope, it.roundToInt().toDouble()) },
            )
        }
        Text(
            "Small line indicator at very bottom of screen to show how far you " +
                "are in chapter or book.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
