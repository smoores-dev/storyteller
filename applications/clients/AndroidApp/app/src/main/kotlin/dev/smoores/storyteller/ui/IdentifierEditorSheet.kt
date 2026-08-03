package dev.smoores.storyteller.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.RemoveCircle
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.IdentifierContext
import dev.smoores.storyteller.model.IdentifierRow
import dev.smoores.storyteller.model.IdentifierType
import kotlinx.coroutines.launch

private val scopeLabels = mapOf(
    "book" to "Book",
    "ebook" to "Ebook",
    "audiobook" to "Audiobook",
    "readaloud" to "Readaloud",
)

private data class EditorRow(
    val key: Int,
    val typeUuid: String?,
    val value: String,
    val scope: String,
    val formatUuid: String?,
)

// Port of the iOS IdentifierEditorSheet. PUT replaces the whole identifier set, so
// loaded rows are carried through unless the user removes them.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun IdentifierEditorSheet(
    book: Book,
    context: IdentifierContext,
    save: suspend (Book, List<IdentifierRow>) -> Boolean,
    createType: suspend (String, String, String) -> IdentifierType,
    onSaved: () -> Unit,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var nextKey by remember(context) { mutableStateOf(context.rows.size) }
    var rows by remember(context) {
        mutableStateOf(
            context.rows.mapIndexed { index, row ->
                EditorRow(index, row.typeUuid, row.value, row.scope, row.formatUuid)
            },
        )
    }
    var types by remember(context) { mutableStateOf(context.types) }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var creatingTypeForKey by remember { mutableStateOf<Int?>(null) }
    var newTypeName by remember { mutableStateOf("") }
    var newTypeTemplate by remember { mutableStateOf("") }
    var isSubmittingType by remember { mutableStateOf(false) }

    val canSave = !isSaving && rows.all { it.typeUuid != null || it.value.isBlank() }

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
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Identifiers",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )

            if (rows.isEmpty()) {
                Text(
                    "No identifiers",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            rows.forEach { row ->
                IdentifierEditorRow(
                    row = row,
                    types = types,
                    scopes = if (row.scope in context.scopes) {
                        context.scopes
                    } else {
                        context.scopes + row.scope
                    },
                    update = { updated ->
                        rows = rows.map { if (it.key == updated.key) updated else it }
                    },
                    remove = { rows = rows.filter { it.key != row.key } },
                    requestNewType = {
                        creatingTypeForKey = row.key
                        newTypeName = ""
                        newTypeTemplate = ""
                    },
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                TextButton(onClick = {
                    rows = rows + EditorRow(nextKey, types.firstOrNull()?.uuid, "", "book", null)
                    nextKey += 1
                }) {
                    Icon(
                        Icons.Default.AddCircleOutline,
                        contentDescription = null,
                        modifier = Modifier.padding(end = 6.dp),
                    )
                    Text("Add Identifier")
                }
            }
            Text(
                "An identifier can apply to the whole book or to one of its formats.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            creatingTypeForKey?.let { pendingKey ->
                HorizontalDivider()
                Text(
                    "New Identifier Type",
                    style = MaterialTheme.typography.titleSmall,
                )
                OutlinedTextField(
                    value = newTypeName,
                    onValueChange = { newTypeName = it },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = newTypeTemplate,
                    onValueChange = { newTypeTemplate = it },
                    label = { Text("URL template (optional), e.g. https://example.com/{value}") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (isSubmittingType) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp,
                            modifier = Modifier.width(18.dp),
                        )
                    }
                    TextButton(onClick = { creatingTypeForKey = null }) { Text("Cancel") }
                    TextButton(
                        enabled = !isSubmittingType && newTypeName.isNotBlank(),
                        onClick = {
                            scope.launch {
                                isSubmittingType = true
                                val created = runCatching {
                                    createType(book.id.sourceID, newTypeName, newTypeTemplate)
                                }.getOrNull()
                                isSubmittingType = false
                                if (created == null) {
                                    errorMessage = "Could not create the identifier type."
                                    return@launch
                                }
                                types = (types + created).sortedBy {
                                    it.displayName.lowercase()
                                }
                                rows = rows.map {
                                    if (it.key == pendingKey) {
                                        it.copy(typeUuid = created.uuid)
                                    } else {
                                        it
                                    }
                                }
                                creatingTypeForKey = null
                                errorMessage = null
                            }
                        },
                    ) { Text("Create Type") }
                }
            }

            errorMessage?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                modifier = Modifier.fillMaxWidth(),
            ) {
                TextButton(onClick = onDismiss) { Text("Cancel") }
                Button(
                    enabled = canSave,
                    onClick = {
                        scope.launch {
                            isSaving = true
                            errorMessage = null
                            val payload = rows.map {
                                IdentifierRow(it.typeUuid, it.value, it.scope, it.formatUuid)
                            }
                            val success = runCatching { save(book, payload) }.getOrDefault(false)
                            isSaving = false
                            if (success) {
                                onSaved()
                                onDismiss()
                            } else {
                                errorMessage = "Could not save identifiers."
                            }
                        }
                    },
                ) { Text(if (isSaving) "Saving" else "Save") }
            }
        }
    }
}

@Composable
private fun IdentifierEditorRow(
    row: EditorRow,
    types: List<IdentifierType>,
    scopes: List<String>,
    update: (EditorRow) -> Unit,
    remove: () -> Unit,
    requestNewType: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            EditorDropdown(
                label = types.firstOrNull { it.uuid == row.typeUuid }?.displayName ?: "Type",
                modifier = Modifier.weight(1f),
            ) { close ->
                types.forEach { type ->
                    DropdownMenuItem(
                        text = { Text(type.displayName) },
                        onClick = {
                            close()
                            update(row.copy(typeUuid = type.uuid))
                        },
                    )
                }
                HorizontalDivider()
                DropdownMenuItem(
                    text = { Text("New Type...") },
                    onClick = {
                        close()
                        requestNewType()
                    },
                )
            }
            EditorDropdown(
                label = scopeLabels[row.scope] ?: row.scope,
                modifier = Modifier.weight(0.8f),
            ) { close ->
                scopes.forEach { scope ->
                    DropdownMenuItem(
                        text = { Text(scopeLabels[scope] ?: scope) },
                        onClick = {
                            close()
                            // The bridge resolves the concrete format uuid for the
                            // chosen scope at save time.
                            update(row.copy(scope = scope, formatUuid = null))
                        },
                    )
                }
            }
            IconButton(onClick = remove) {
                Icon(
                    Icons.Default.RemoveCircle,
                    contentDescription = "Remove identifier",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        OutlinedTextField(
            value = row.value,
            onValueChange = { update(row.copy(value = it)) },
            label = { Text("Value") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun EditorDropdown(
    label: String,
    modifier: Modifier = Modifier,
    content: @Composable (close: () -> Unit) -> Unit,
) {
    Box(modifier) {
        var expanded by remember { mutableStateOf(false) }
        TextButton(onClick = { expanded = true }) {
            Text(label, maxLines = 1)
            Icon(Icons.Default.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            content { expanded = false }
        }
    }
}
