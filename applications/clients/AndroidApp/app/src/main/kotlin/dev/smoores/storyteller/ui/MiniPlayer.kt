package dev.smoores.storyteller.ui

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.Book

// Matches the iOS GlobalMiniPlayerBar: cover, title/subtitle, play/pause, close.
// Shown over the library while a book keeps playing after leaving its player.
@Composable
internal fun GlobalMiniPlayerBar(
    book: Book?,
    title: String,
    subtitle: String?,
    isPlaying: Boolean,
    onTogglePlay: () -> Unit,
    onOpen: () -> Unit,
    onClose: () -> Unit,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    modifier: Modifier = Modifier,
) {
    val darkTheme = isSystemInDarkTheme()
    val coverSource by produceState<Bitmap?>(
        initialValue = book?.let { cachedCover(it, true) ?: cachedCover(it, false) },
        book?.id,
        coverRevision,
    ) {
        val target = book ?: return@produceState
        value = cover(target, true, 240, 240) ?: cover(target, false, 240, 240)
    }
    val palette = remember(coverSource, darkTheme, CoverColorSettings.key) {
        coverBackgroundPalette(coverSource, darkTheme)
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 12.dp)
            .padding(bottom = 8.dp),
    ) {
        Surface(
            color = palette.surface.copy(alpha = 0.92f),
            tonalElevation = 4.dp,
            shadowElevation = 8.dp,
            shape = RoundedCornerShape(20.dp),
        ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp),
        ) {
            if (book != null) {
                BookCover(
                    book = book,
                    width = 120,
                    height = 120,
                    revision = coverRevision,
                    load = cover,
                    cached = cachedCover,
                    modifier = Modifier.size(40.dp).clickable(onClick = onOpen),
                    artworkScale = 1f,
                    showsPanel = false,
                    layersMedia = false,
                    showsReadaloudBadge = false,
                )
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 10.dp)
                    .clickable(onClick = onOpen),
            ) {
                Text(
                    title,
                    style = editorialTitle(15),
                    maxLines = 1,
                )
                subtitle?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
            }
            IconButton(onClick = onTogglePlay) {
                Box(
                    Modifier.size(40.dp).background(palette.ratingAccent, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = if (isPlaying) "Pause" else "Play",
                        tint = palette.contentBackground,
                    )
                }
            }
            IconButton(onClick = onClose) {
                Icon(Icons.Filled.Close, contentDescription = "Stop and close")
            }
        }
        }
    }
}

