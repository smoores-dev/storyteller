package dev.smoores.storyteller.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.BulkActionOptions
import dev.smoores.storyteller.model.NamedUuid
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

internal val creatorRoleLabels = mapOf(
    "aut" to "Authors",
    "nrt" to "Narrators",
    "trl" to "Translators",
)

private sealed interface BulkMenuPage {
    data object Status : BulkMenuPage
    data object AddCollection : BulkMenuPage
    data object RemoveCollection : BulkMenuPage
    data object RemoveTags : BulkMenuPage
    data object AddCreators : BulkMenuPage
    data object RemoveCreatorRoles : BulkMenuPage
    data class RemoveCreators(val role: String) : BulkMenuPage
}

private data class PendingNameEntry(val title: String, val role: String?)

// Floating bar shown while the grid has a multi-selection, mirroring the iOS
// BulkSelectionBar: status, collections, tags, creators, and delete actions with
// inline progress and error feedback.
@Composable
internal fun BulkSelectionBar(
    selectedBooks: List<Book>,
    allSelected: Boolean,
    selectAll: () -> Unit,
    deselectAll: () -> Unit,
    clear: () -> Unit,
    loadOptions: suspend (List<Book>) -> BulkActionOptions,
    runAction: suspend (BulkActionRequest) -> Boolean,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var options by remember { mutableStateOf(BulkActionOptions()) }
    var isRunning by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    var menuPage by remember { mutableStateOf<BulkMenuPage?>(null) }
    var nameEntry by remember { mutableStateOf<PendingNameEntry?>(null) }
    var confirmingDelete by remember { mutableStateOf(false) }

    val selectionKey = selectedBooks.map { it.id }.toSet()
    LaunchedEffect(selectionKey) {
        options = runCatching { loadOptions(selectedBooks) }.getOrDefault(BulkActionOptions())
    }

    fun run(failureMessage: String, request: BulkActionRequest, onSuccess: () -> Unit = {}) {
        if (isRunning) return
        scope.launch {
            isRunning = true
            errorMessage = null
            val success = runCatching { runAction(request) }.getOrDefault(false)
            isRunning = false
            if (success) {
                onSuccess()
            } else {
                errorMessage = failureMessage
                delay(4000)
                if (errorMessage == failureMessage) errorMessage = null
            }
        }
    }

    val sourceID = options.singleServerSourceID
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(50),
        tonalElevation = 6.dp,
        shadowElevation = 8.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                "${selectedBooks.size} selected",
                style = MaterialTheme.typography.labelLarge,
            )
            TextButton(onClick = { if (allSelected) deselectAll() else selectAll() }) {
                Text(if (allSelected) "Deselect All" else "Select All")
            }
            if (isRunning) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
            } else {
                errorMessage?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.error,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.widthIn(max = 160.dp),
                    )
                }
            }
            Box {
                IconButton(
                    onClick = {
                        menuPage = null
                        menuOpen = true
                    },
                    enabled = selectedBooks.isNotEmpty() && !isRunning,
                ) {
                    Icon(Icons.Default.MoreHoriz, contentDescription = "Actions")
                }
                DropdownMenu(
                    expanded = menuOpen,
                    onDismissRequest = { menuOpen = false },
                ) {
                    BulkActionsMenu(
                        page = menuPage,
                        setPage = { menuPage = it },
                        options = options,
                        onSetStatus = { status ->
                            menuOpen = false
                            run("Could not set status", BulkActionRequest(
                                action = "setStatus",
                                books = selectedBooks,
                                sourceID = sourceID,
                                statusUUID = status.uuid,
                                statusName = status.name,
                            ))
                        },
                        onAddToCollection = { collection ->
                            menuOpen = false
                            collection.uuid?.let { uuid ->
                                run("Could not add to ${collection.name}", BulkActionRequest(
                                    action = "addToCollections",
                                    books = selectedBooks,
                                    sourceID = sourceID,
                                    uuids = listOf(uuid),
                                ))
                            }
                        },
                        onRemoveFromCollection = { collection ->
                            menuOpen = false
                            collection.uuid?.let { uuid ->
                                run("Could not remove from ${collection.name}", BulkActionRequest(
                                    action = "removeFromCollections",
                                    books = selectedBooks,
                                    sourceID = sourceID,
                                    uuids = listOf(uuid),
                                ))
                            }
                        },
                        onAddTags = {
                            menuOpen = false
                            nameEntry = PendingNameEntry("Add Tags", role = null)
                        },
                        onRemoveTag = { tag ->
                            menuOpen = false
                            tag.uuid?.let { uuid ->
                                run("Could not remove tag ${tag.name}", BulkActionRequest(
                                    action = "removeTags",
                                    books = selectedBooks,
                                    sourceID = sourceID,
                                    uuids = listOf(uuid),
                                ))
                            }
                        },
                        onAddCreators = { role ->
                            menuOpen = false
                            nameEntry = PendingNameEntry(
                                "Add ${creatorRoleLabels[role] ?: role}",
                                role = role,
                            )
                        },
                        onRemoveCreator = { role, creator ->
                            menuOpen = false
                            creator.uuid?.let { uuid ->
                                run("Could not remove ${creator.name}", BulkActionRequest(
                                    action = "removeCreators",
                                    books = selectedBooks,
                                    sourceID = sourceID,
                                    uuids = listOf(uuid),
                                    role = role,
                                ))
                            }
                        },
                        onDelete = {
                            menuOpen = false
                            confirmingDelete = true
                        },
                    )
                }
            }
            IconButton(onClick = clear) {
                Icon(
                    Icons.Default.Cancel,
                    contentDescription = "Clear selection",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    nameEntry?.let { entry ->
        BulkNameEntryDialog(
            title = entry.title,
            onDismiss = { nameEntry = null },
            onSubmit = { names ->
                nameEntry = null
                if (names.isEmpty()) return@BulkNameEntryDialog
                if (entry.role == null) {
                    run("Could not add tags", BulkActionRequest(
                        action = "addTags",
                        books = selectedBooks,
                        names = names,
                    ))
                } else {
                    val label = creatorRoleLabels[entry.role]?.lowercase() ?: "creators"
                    run("Could not add $label", BulkActionRequest(
                        action = "addCreators",
                        books = selectedBooks,
                        sourceID = sourceID,
                        names = names,
                        role = entry.role,
                    ))
                }
            },
        )
    }

    if (confirmingDelete) {
        var preventReImport by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text("Delete ${selectedBooks.size} books from the server?") },
            text = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = preventReImport,
                        onCheckedChange = { preventReImport = it },
                    )
                    Text("Prevent re-import")
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    run(
                        "Could not delete books",
                        BulkActionRequest(
                            action = "delete",
                            books = selectedBooks,
                            preventReImport = preventReImport,
                        ),
                        onSuccess = clear,
                    )
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = false }) { Text("Cancel") }
            },
        )
    }
}

internal data class BulkActionRequest(
    val action: String,
    val books: List<Book>,
    val sourceID: String? = null,
    val names: List<String>? = null,
    val uuids: List<String>? = null,
    val role: String? = null,
    val statusUUID: String? = null,
    val statusName: String? = null,
    val preventReImport: Boolean? = null,
)

@Composable
private fun BulkActionsMenu(
    page: BulkMenuPage?,
    setPage: (BulkMenuPage?) -> Unit,
    options: BulkActionOptions,
    onSetStatus: (NamedUuid) -> Unit,
    onAddToCollection: (NamedUuid) -> Unit,
    onRemoveFromCollection: (NamedUuid) -> Unit,
    onAddTags: () -> Unit,
    onRemoveTag: (NamedUuid) -> Unit,
    onAddCreators: (String) -> Unit,
    onRemoveCreator: (String, NamedUuid) -> Unit,
    onDelete: () -> Unit,
) {
    if (options.singleServerSourceID == null) {
        DropdownMenuItem(
            text = { Text("Bulk actions need books from a single Storyteller server") },
            enabled = false,
            onClick = {},
        )
        return
    }

    @Composable
    fun backRow(title: String) {
        DropdownMenuItem(
            text = { Text(title) },
            leadingIcon = {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            },
            onClick = { setPage(null) },
        )
        HorizontalDivider()
    }

    when (val current = page) {
        null -> {
            if (options.statuses.isNotEmpty()) {
                DropdownMenuItem(
                    text = { Text("Set Status") },
                    onClick = { setPage(BulkMenuPage.Status) },
                )
            }
            if (options.collections.isNotEmpty()) {
                DropdownMenuItem(
                    text = { Text("Add to Collection") },
                    onClick = { setPage(BulkMenuPage.AddCollection) },
                )
            }
            if (options.removableCollections.isNotEmpty()) {
                DropdownMenuItem(
                    text = { Text("Remove from Collection") },
                    onClick = { setPage(BulkMenuPage.RemoveCollection) },
                )
            }
            DropdownMenuItem(text = { Text("Add Tags...") }, onClick = onAddTags)
            if (options.removableTags.isNotEmpty()) {
                DropdownMenuItem(
                    text = { Text("Remove Tags") },
                    onClick = { setPage(BulkMenuPage.RemoveTags) },
                )
            }
            DropdownMenuItem(
                text = { Text("Add Creators") },
                onClick = { setPage(BulkMenuPage.AddCreators) },
            )
            if (options.removableCreators.values.any { it.isNotEmpty() }) {
                DropdownMenuItem(
                    text = { Text("Remove Creators") },
                    onClick = { setPage(BulkMenuPage.RemoveCreatorRoles) },
                )
            }
            HorizontalDivider()
            DropdownMenuItem(
                text = {
                    Text("Delete from Server...", color = MaterialTheme.colorScheme.error)
                },
                onClick = onDelete,
            )
        }
        BulkMenuPage.Status -> {
            backRow("Set Status")
            options.statuses.forEach { status ->
                DropdownMenuItem(text = { Text(status.name) }, onClick = { onSetStatus(status) })
            }
        }
        BulkMenuPage.AddCollection -> {
            backRow("Add to Collection")
            options.collections.forEach { collection ->
                DropdownMenuItem(
                    text = { Text(collection.name) },
                    onClick = { onAddToCollection(collection) },
                )
            }
        }
        BulkMenuPage.RemoveCollection -> {
            backRow("Remove from Collection")
            options.removableCollections.forEach { collection ->
                DropdownMenuItem(
                    text = { Text(collection.name) },
                    onClick = { onRemoveFromCollection(collection) },
                )
            }
        }
        BulkMenuPage.RemoveTags -> {
            backRow("Remove Tags")
            options.removableTags.forEach { tag ->
                DropdownMenuItem(text = { Text(tag.name) }, onClick = { onRemoveTag(tag) })
            }
        }
        BulkMenuPage.AddCreators -> {
            backRow("Add Creators")
            creatorRoleLabels.forEach { (role, label) ->
                DropdownMenuItem(
                    text = { Text("$label...") },
                    onClick = { onAddCreators(role) },
                )
            }
        }
        BulkMenuPage.RemoveCreatorRoles -> {
            backRow("Remove Creators")
            options.removableCreators
                .filterValues { it.isNotEmpty() }
                .forEach { (role, _) ->
                    DropdownMenuItem(
                        text = { Text(creatorRoleLabels[role] ?: role) },
                        onClick = { setPage(BulkMenuPage.RemoveCreators(role)) },
                    )
                }
        }
        is BulkMenuPage.RemoveCreators -> {
            backRow(creatorRoleLabels[current.role] ?: current.role)
            options.removableCreators[current.role].orEmpty().forEach { creator ->
                DropdownMenuItem(
                    text = { Text(creator.name) },
                    onClick = { onRemoveCreator(current.role, creator) },
                )
            }
        }
    }
}

@Composable
private fun BulkNameEntryDialog(
    title: String,
    onDismiss: () -> Unit,
    onSubmit: (List<String>) -> Unit,
) {
    var text by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text("Comma-separated names") },
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = {
                onSubmit(
                    text.split(",").map(String::trim).filter(String::isNotEmpty),
                )
            }) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
