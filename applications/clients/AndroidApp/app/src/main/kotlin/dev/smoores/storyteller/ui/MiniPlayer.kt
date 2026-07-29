package dev.smoores.storyteller.ui

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 12.dp)
            .padding(bottom = 8.dp),
    ) {
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
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
                    style = MaterialTheme.typography.titleSmall,
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
                Icon(
                    imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = if (isPlaying) "Pause" else "Play",
                )
            }
            IconButton(onClick = onClose) {
                Icon(Icons.Filled.Close, contentDescription = "Stop and close")
            }
        }
        }
    }
}

// Matches the 50pt compact height of the iOS DraggableAudioCard.
internal val ReaderMiniPlayerHeight = 50.dp

// Compact state of ReaderAudioCard, which supplies the surface behind it so
// both states share one background while dragging.
@Composable
internal fun ReaderMiniPlayer(
    book: Book,
    chapterLabel: String?,
    isPlaying: Boolean,
    playbackRate: Double,
    onTogglePlay: () -> Unit,
    onRateChange: (Double) -> Unit,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    modifier: Modifier = Modifier,
) {
    var showSpeed by remember { mutableStateOf(false) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .height(ReaderMiniPlayerHeight),
    ) {
        BookCover(
            book = book,
            width = 120,
            height = 120,
            revision = coverRevision,
            load = cover,
            cached = cachedCover,
            modifier = Modifier.size(40.dp),
            artworkScale = 1f,
            showsPanel = false,
            layersMedia = false,
            showsReadaloudBadge = false,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 10.dp),
        ) {
            Text(
                book.title,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
            )
            chapterLabel?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                )
            }
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .clickable { showSpeed = true }
                .size(width = 44.dp, height = 44.dp),
        ) {
            Icon(
                Icons.Filled.Speed,
                contentDescription = "Playback speed",
                modifier = Modifier.size(20.dp),
            )
            Text(
                formatPlaybackRate(playbackRate),
                style = MaterialTheme.typography.labelSmall,
            )
        }
        Spacer(Modifier.width(8.dp))
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(LocalContentColor.current.copy(alpha = 0.1f))
                .clickable(onClick = onTogglePlay),
        ) {
            Icon(
                imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = if (isPlaying) "Pause" else "Play",
                modifier = Modifier.size(24.dp),
            )
        }
    }
    if (showSpeed) {
        PlaybackSpeedDialog(
            currentRate = playbackRate,
            dismiss = { showSpeed = false },
            select = {
                showSpeed = false
                onRateChange(it)
            },
        )
    }
}
