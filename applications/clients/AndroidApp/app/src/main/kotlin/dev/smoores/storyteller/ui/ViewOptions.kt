package dev.smoores.storyteller.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
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
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.Book

// Kotlin port of Kit's ShowOnItemField selection rules; the per-book display values
// arrive precomputed in the library snapshot's showOnItem map.
internal enum class ShowOnItemField(
    val raw: String,
    val label: String,
    val compact: Boolean = false,
) {
    Auto("auto", "Auto (Sort Field)"),
    None("none", "None"),
    Authors("authors", "Authors"),
    Narrators("narrators", "Narrators"),
    Series("series", "Series"),
    SeriesPosition("seriesPosition", "Series Position"),
    PageCount("pageCount", "Pages", compact = true),
    Duration("duration", "Duration", compact = true),
    FileSize("fileSize", "File Size", compact = true),
    PublicationYear("publicationYear", "Pub Year", compact = true),
    Rating("rating", "User Rating", compact = true),
    Status("status", "Status"),
    AddedDate("addedDate", "Date Added"),
    Tags("tags", "Tags");

    companion object {
        val explicitFields: List<ShowOnItemField> =
            entries.filter { it != Auto && it != None }

        fun fromRaw(raw: String): ShowOnItemField? =
            entries.firstOrNull { it.raw == raw.trim() }
    }
}

internal object ShowOnItem {
    fun decodeSelection(raw: String): List<ShowOnItemField> {
        val fields = raw.split(",").mapNotNull(ShowOnItemField::fromRaw)
        if (fields.isEmpty() || ShowOnItemField.Auto in fields) {
            return listOf(ShowOnItemField.Auto)
        }
        if (ShowOnItemField.None in fields) return listOf(ShowOnItemField.None)
        return fields.distinct()
    }

    fun encodeSelection(selection: List<ShowOnItemField>): String =
        selection.joinToString(",") { it.raw }

    fun toggling(
        field: ShowOnItemField,
        selection: List<ShowOnItemField>,
    ): List<ShowOnItemField> = when (field) {
        ShowOnItemField.Auto -> listOf(ShowOnItemField.Auto)
        ShowOnItemField.None -> listOf(ShowOnItemField.None)
        else -> {
            val explicit = selection
                .filter { it != ShowOnItemField.Auto && it != ShowOnItemField.None }
                .toMutableList()
            if (!explicit.remove(field)) explicit.add(field)
            explicit.ifEmpty { listOf(ShowOnItemField.Auto) }
        }
    }

    // Each field on its own line, except consecutive compact fields which pair two to
    // a line. Null means the sort-adaptive auto line; empty means no line at all.
    fun displayRows(selection: List<ShowOnItemField>): List<List<ShowOnItemField>>? {
        if (selection.isEmpty() || ShowOnItemField.Auto in selection) return null
        if (ShowOnItemField.None in selection) return emptyList()
        val rows = mutableListOf<MutableList<ShowOnItemField>>()
        for (field in selection) {
            val last = rows.lastOrNull()
            if (field.compact && last != null && last.size < 2 && last.all { it.compact }) {
                last.add(field)
            } else {
                rows.add(mutableListOf(field))
            }
        }
        return rows
    }

    // Empty values render as an em dash so every card keeps the same line count.
    fun rowText(row: List<ShowOnItemField>, book: Book): String =
        row.joinToString(" \u00B7 ") { field ->
            book.showOnItem[field.raw].orEmpty().ifEmpty { "\u2014" }
        }

    fun selectionSummary(selection: List<ShowOnItemField>): String {
        if (selection.isEmpty() || ShowOnItemField.Auto in selection) {
            return ShowOnItemField.Auto.label
        }
        if (ShowOnItemField.None in selection) return ShowOnItemField.None.label
        return selection.joinToString(", ") { it.label }
    }
}

internal enum class GridSpacing(val raw: String, val label: String, val points: Int) {
    Compact("compact", "Compact", 8),
    Cozy("cozy", "Cozy", 16),
    Spacious("spacious", "Spacious", 24);

    companion object {
        fun fromRaw(raw: String): GridSpacing = entries.firstOrNull { it.raw == raw } ?: Cozy
    }
}

internal enum class CoverStyle(val raw: String, val label: String) {
    Auto("auto", "Storyteller"),
    Ebook("ebook", "Ebook"),
    Audio("audio", "Audiobook");

    companion object {
        fun fromRaw(raw: String): CoverStyle = entries.firstOrNull { it.raw == raw } ?: Auto
    }
}

internal data class LibraryViewOptions(
    val coverStyle: String = "auto",
    val coverSize: Float = 0.5f,
    val gridSpacing: String = "cozy",
    val showReadaloudBadge: Boolean = true,
    val showProgressBadge: Boolean = false,
    val showOnItem: String = "auto",
) {
    val spacing: GridSpacing get() = GridSpacing.fromRaw(gridSpacing)
    val style: CoverStyle get() = CoverStyle.fromRaw(coverStyle)
    val showOnItemSelection: List<ShowOnItemField> get() = ShowOnItem.decodeSelection(showOnItem)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ViewOptionsSheet(
    options: LibraryViewOptions,
    showsShowOnItem: Boolean,
    onChange: (LibraryViewOptions) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "View Options",
                style = MaterialTheme.typography.titleMedium,
            )

            Text("Cover Style", style = MaterialTheme.typography.bodyLarge)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                CoverStyle.entries.forEachIndexed { index, style ->
                    SegmentedButton(
                        selected = options.style == style,
                        onClick = { onChange(options.copy(coverStyle = style.raw)) },
                        shape = SegmentedButtonDefaults.itemShape(
                            index = index,
                            count = CoverStyle.entries.size,
                        ),
                    ) { Text(style.label) }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Cover Size",
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.weight(1f),
                )
            }
            Slider(
                value = options.coverSize,
                onValueChange = { onChange(options.copy(coverSize = it)) },
                valueRange = 0f..1f,
            )

            Text("Spacing", style = MaterialTheme.typography.bodyLarge)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                GridSpacing.entries.forEachIndexed { index, spacing ->
                    SegmentedButton(
                        selected = options.spacing == spacing,
                        onClick = { onChange(options.copy(gridSpacing = spacing.raw)) },
                        shape = SegmentedButtonDefaults.itemShape(
                            index = index,
                            count = GridSpacing.entries.size,
                        ),
                    ) { Text(spacing.label) }
                }
            }

            HorizontalDivider()

            OptionSwitchRow(
                label = "Readaloud Badge",
                checked = options.showReadaloudBadge,
                onCheckedChange = { onChange(options.copy(showReadaloudBadge = it)) },
            )
            OptionSwitchRow(
                label = "Progress Badge",
                checked = options.showProgressBadge,
                onCheckedChange = { onChange(options.copy(showProgressBadge = it)) },
            )

            if (showsShowOnItem) {
                HorizontalDivider()
                val selection = options.showOnItemSelection
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Show on Item", style = MaterialTheme.typography.bodyLarge)
                        Text(
                            ShowOnItem.selectionSummary(selection),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    var menuOpen by remember { mutableStateOf(false) }
                    TextButton(onClick = { menuOpen = true }) { Text("Choose") }
                    DropdownMenu(
                        expanded = menuOpen,
                        onDismissRequest = { menuOpen = false },
                    ) {
                        (listOf(ShowOnItemField.Auto, ShowOnItemField.None) +
                            ShowOnItemField.explicitFields).forEach { field ->
                            DropdownMenuItem(
                                text = { Text(field.label) },
                                trailingIcon = {
                                    if (field in selection) {
                                        Icon(
                                            Icons.Filled.Check,
                                            contentDescription = "Selected",
                                        )
                                    }
                                },
                                onClick = {
                                    onChange(
                                        options.copy(
                                            showOnItem = ShowOnItem.encodeSelection(
                                                ShowOnItem.toggling(field, selection),
                                            ),
                                        ),
                                    )
                                },
                            )
                        }
                    }
                }
            }

            HorizontalDivider()
            TextButton(onClick = { onChange(LibraryViewOptions()) }) {
                Text("Reset to Defaults")
            }
        }
    }
}

@Composable
private fun OptionSwitchRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
