package dev.smoores.storyteller.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.QuickEditFields
import dev.smoores.storyteller.model.QuickEditResult
import kotlinx.coroutines.launch

// Android's take on the iOS Quick Edit mode: the same field set edited in a sheet,
// saved through the shared multipart book-update path. Only changed fields are sent.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun QuickEditSheet(
    book: Book,
    save: suspend (Book, QuickEditFields) -> QuickEditResult,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val originalSeries = book.series.firstOrNull()
    val originalPosition = originalSeries?.position?.let { position ->
        if (position % 1.0 == 0.0) position.toInt().toString() else position.toString()
    } ?: ""

    var title by remember(book.id) { mutableStateOf(book.title) }
    var subtitle by remember(book.id) { mutableStateOf(book.subtitle ?: "") }
    var authors by remember(book.id) { mutableStateOf(book.authorNames.joinToString(", ")) }
    var narrators by remember(book.id) { mutableStateOf(book.narrators.joinToString(", ")) }
    var seriesName by remember(book.id) { mutableStateOf(originalSeries?.name ?: "") }
    var seriesPosition by remember(book.id) { mutableStateOf(originalPosition) }
    var publicationDate by remember(book.id) { mutableStateOf(book.publicationYear) }
    var tags by remember(book.id) { mutableStateOf(book.tags.joinToString(", ")) }
    var description by remember(book.id) { mutableStateOf(book.description ?: "") }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var errorField by remember { mutableStateOf<String?>(null) }

    fun changedFields(): QuickEditFields = QuickEditFields(
        title = title.takeIf { it != book.title },
        subtitle = subtitle.takeIf { it != (book.subtitle ?: "") },
        description = description.takeIf { it != (book.description ?: "") },
        authors = authors.takeIf { it != book.authorNames.joinToString(", ") },
        narrators = narrators.takeIf { it != book.narrators.joinToString(", ") },
        seriesName = seriesName.takeIf {
            it != (originalSeries?.name ?: "") || seriesPosition != originalPosition
        },
        seriesPosition = seriesPosition.takeIf {
            seriesName != (originalSeries?.name ?: "") || it != originalPosition
        },
        publicationDate = publicationDate.takeIf { it != book.publicationYear },
        tags = tags.takeIf { it != book.tags.joinToString(", ") },
    )

    val isDirty = changedFields() != QuickEditFields()

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
                "Quick Edit",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )

            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Title") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = subtitle,
                onValueChange = { subtitle = it },
                label = { Text("Subtitle") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = authors,
                onValueChange = { authors = it },
                label = { Text("Authors (comma-separated)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = narrators,
                onValueChange = { narrators = it },
                label = { Text("Narrators (comma-separated)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = seriesName,
                    onValueChange = { seriesName = it },
                    label = { Text("Series") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = seriesPosition,
                    onValueChange = { seriesPosition = it },
                    label = { Text("#") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.width(88.dp),
                )
            }
            OutlinedTextField(
                value = publicationDate,
                onValueChange = { publicationDate = it },
                label = { Text("Published") },
                singleLine = true,
                isError = errorField == "publicationDate",
                supportingText = {
                    if (errorField == "publicationDate") {
                        Text(
                            errorMessage ?: "Enter a year (2020) or a date (2020-01-15)",
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = tags,
                onValueChange = { tags = it },
                label = { Text("Tags (comma-separated)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Description") },
                minLines = 4,
                maxLines = 10,
                modifier = Modifier.fillMaxWidth(),
            )

            if (errorField == null) {
                errorMessage?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (isSaving) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                }
                TextButton(onClick = onDismiss) { Text("Cancel") }
                Button(
                    enabled = isDirty && !isSaving,
                    onClick = {
                        scope.launch {
                            isSaving = true
                            errorMessage = null
                            errorField = null
                            val result = runCatching { save(book, changedFields()) }
                                .getOrElse {
                                    QuickEditResult(
                                        outcome = "failed",
                                        field = null,
                                        message = "The changes could not be saved.",
                                    )
                                }
                            isSaving = false
                            when (result.outcome) {
                                "saved" -> onDismiss()
                                "invalid" -> {
                                    errorField = result.field
                                    errorMessage = result.message
                                }
                                else -> errorMessage = result.message
                                    ?: "The changes could not be saved."
                            }
                        }
                    },
                ) { Text("Save") }
            }
        }
    }
}
