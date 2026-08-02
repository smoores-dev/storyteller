package dev.smoores.storyteller.ui

import android.graphics.Bitmap
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CollectionsBookmark
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.Book

// Android's equivalent of the iOS More-tab category browsers. Books and
// Downloaded map onto the existing tabs; these cover the grouped views.
internal enum class LibraryCategoryKind(val label: String) {
    Series("Series"),
    Authors("Authors"),
    Narrators("Narrators"),
    Tags("Tags"),
    Collections("Collections"),
    Years("Publication Years"),
    Ratings("Ratings");

    val icon: ImageVector
        get() = when (this) {
            Series -> Icons.AutoMirrored.Filled.MenuBook
            Authors -> Icons.Filled.People
            Narrators -> Icons.Filled.Mic
            Tags -> Icons.Filled.Tag
            Collections -> Icons.Filled.CollectionsBookmark
            Years -> Icons.Filled.CalendarMonth
            Ratings -> Icons.Filled.Star
        }

    fun groupValues(book: Book): List<String> = when (this) {
        Series -> book.series.map { it.name }
        Authors -> book.authorNames
        Narrators -> book.narrators.ifEmpty { listOf(UNKNOWN_NARRATOR) }
        Tags -> book.tags
        Collections -> book.collections
        Years -> listOf(book.publicationYear.ifEmpty { UNKNOWN_VALUE })
        Ratings -> listOf(ratingFilterLabel(book.ratingFilterValue()))
    }

    fun sortedGroupNames(names: Set<String>): List<String> = when (this) {
        Years -> names.sortedWith(
            compareByDescending<String> { it != UNKNOWN_VALUE }.thenByDescending { it },
        )
        Ratings -> names.sortedWith(
            compareByDescending { name ->
                name.substringBefore(" ").toIntOrNull() ?: -1
            },
        )
        else -> names.sortedWith(String.CASE_INSENSITIVE_ORDER)
    }

    fun booksIn(group: String, books: List<Book>): List<Book> {
        val matching = books.filter { group in groupValues(it) }
        return if (this == Series) {
            matching.sortedWith(
                compareBy<Book> {
                    it.series.firstOrNull { entry -> entry.name == group }?.position
                        ?: Double.MAX_VALUE
                }.thenBy { book -> book.sortTitle.lowercase() },
            )
        } else {
            matching.sortedBy { it.sortTitle.lowercase() }
        }
    }
}

internal data class CategoryGroup(val name: String, val count: Int)

@Composable
internal fun CategoryBrowserScreen(
    kind: LibraryCategoryKind,
    group: String?,
    books: List<Book>,
    select: (Book) -> Unit,
    selectGroup: (String) -> Unit,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    modifier: Modifier = Modifier,
) {
    if (group != null) {
        val groupBooks = remember(books, kind, group) { kind.booksIn(group, books) }
        Box(modifier.fillMaxSize()) {
            BookGrid(
                books = groupBooks,
                select = select,
                coverRevision = coverRevision,
                cover = cover,
                cachedCover = cachedCover,
            )
        }
        return
    }

    val groups = remember(books, kind) {
        val counts = mutableMapOf<String, Int>()
        books.forEach { book ->
            kind.groupValues(book).toSet().forEach { name ->
                counts[name] = (counts[name] ?: 0) + 1
            }
        }
        kind.sortedGroupNames(counts.keys).map { CategoryGroup(it, counts.getValue(it)) }
    }

    if (groups.isEmpty()) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Nothing here yet", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "Books with ${kind.label.lowercase()} metadata will appear here.",
                    modifier = Modifier.padding(top = 8.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        return
    }

    LazyColumn(modifier.fillMaxSize()) {
        items(groups, key = CategoryGroup::name) { entry ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { selectGroup(entry.name) }
                    .padding(horizontal = 20.dp, vertical = 14.dp),
            ) {
                Icon(
                    kind.icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
                Spacer(modifier = Modifier.width(16.dp))
                Text(
                    entry.name,
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    "${entry.count}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
