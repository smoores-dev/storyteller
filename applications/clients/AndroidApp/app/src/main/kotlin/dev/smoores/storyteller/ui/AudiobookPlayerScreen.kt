package dev.smoores.storyteller.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.VolumeDown
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import dev.smoores.storyteller.model.AudiobookChapter
import dev.smoores.storyteller.model.AudiobookPlayerState
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.FullPlayerCustomization
import dev.smoores.storyteller.model.PlayerComplication
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

@Composable
internal fun AudiobookPlayerScreen(
    book: Book,
    state: AudiobookPlayerState?,
    loading: Boolean,
    player: Player,
    modifier: Modifier,
    togglePlayPause: () -> Unit,
    skipBackward: () -> Unit,
    skipForward: () -> Unit,
    previousChapter: () -> Unit,
    nextChapter: () -> Unit,
    seekChapter: (Double) -> Unit,
    selectChapter: (String) -> Unit,
    setPlaybackRate: (Double) -> Unit,
    setVolume: (Double) -> Unit,
    startSleepTimer: (Double) -> Unit,
    startEndOfChapterSleepTimer: () -> Unit,
    cancelSleepTimer: () -> Unit,
    acceptServerPosition: () -> Unit,
    declineServerPosition: () -> Unit,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    loadFullPlayerCustomization: suspend () -> FullPlayerCustomization = {
        FullPlayerCustomization()
    },
) {
    var artwork by remember(player) { mutableStateOf(player.mediaMetadata.artworkData) }
    val fullPlayer by produceState(FullPlayerCustomization(), book.id) {
        value = runCatching { loadFullPlayerCustomization() }
            .getOrDefault(FullPlayerCustomization())
    }
    var scrubbedProgress by remember(book.id) { mutableStateOf<Double?>(null) }
    var pendingSeekProgress by remember(book.id) { mutableStateOf<Double?>(null) }
    var showSpeed by remember { mutableStateOf(false) }
    var showVolume by remember { mutableStateOf(false) }
    var showChapters by remember { mutableStateOf(false) }
    var showSleepTimer by remember { mutableStateOf(false) }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) {
                artwork = mediaMetadata.artworkData
            }
        }
        player.addListener(listener)
        artwork = player.mediaMetadata.artworkData
        onDispose { player.removeListener(listener) }
    }

    LaunchedEffect(state, pendingSeekProgress) {
        val pending = pendingSeekProgress ?: return@LaunchedEffect
        if (state == null ||
            abs(state.chapterElapsed - pending * state.chapterDuration) < 3.0
        ) {
            pendingSeekProgress = null
        }
    }
    LaunchedEffect(pendingSeekProgress) {
        if (pendingSeekProgress != null) {
            delay(1_500)
            pendingSeekProgress = null
        }
    }

    state?.pendingServerPosition?.let { position ->
        AlertDialog(
            onDismissRequest = declineServerPosition,
            title = { Text("Server Has Newer Position") },
            text = {
                val location = listOfNotNull(
                    position.title,
                    position.totalProgression?.let { "${(it * 100).roundToInt()}%" },
                ).joinToString(", ")
                Text(
                    "Another device has synced a more recent reading position" +
                        if (location.isBlank()) "." else " ($location).",
                )
            },
            confirmButton = {
                TextButton(onClick = acceptServerPosition) { Text("Go to New Position") }
            },
            dismissButton = {
                TextButton(onClick = declineServerPosition) { Text("Stay Here") }
            },
        )
    }

    if (showSpeed && state != null) {
        PlaybackSpeedDialog(
            currentRate = state.playbackRate,
            dismiss = { showSpeed = false },
            select = {
                showSpeed = false
                setPlaybackRate(it)
            },
        )
    }
    if (showChapters && state != null) {
        ChaptersDialog(
            chapters = state.chapters,
            currentChapterID = state.currentChapterID,
            dismiss = { showChapters = false },
            select = {
                showChapters = false
                selectChapter(it)
            },
        )
    }
    if (showVolume && state != null) {
        VolumeDialog(
            currentVolume = state.volume,
            dismiss = { showVolume = false },
            select = {
                showVolume = false
                setVolume(it)
            },
        )
    }
    if (showSleepTimer) {
        SleepTimerDialog(
            dismiss = { showSleepTimer = false },
            selectDuration = {
                showSleepTimer = false
                startSleepTimer(it)
            },
            selectEndOfChapter = {
                showSleepTimer = false
                startEndOfChapterSleepTimer()
            },
        )
    }

    val darkTheme = isSystemInDarkTheme()
    val coverBitmap = remember(artwork) {
        artwork?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
    }
    val palette = rememberCoverBackgroundPalette(coverBitmap, darkTheme, book = book, audio = true)

    Box(
        modifier.fillMaxSize().background(palette.playerGradient),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            Modifier
                .widthIn(max = 600.dp)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            SwappablePlayerCover(
                book = book,
                coverRevision = coverRevision,
                cover = cover,
                cachedCover = cachedCover,
                modifier = Modifier
                    .widthIn(max = 400.dp)
                    .fillMaxWidth()
                    .aspectRatio(1f),
            )
            Spacer(Modifier.height(20.dp))
            Text(
                state?.title ?: book.title,
                style = editorialTitle(26),
                textAlign = TextAlign.Center,
            )

            if (loading || state == null) {
                CircularProgressIndicator(Modifier.padding(top = 32.dp))
                Text("Preparing audiobook…", modifier = Modifier.padding(top = 12.dp))
            } else {
                PlayerControls(
                    state = state,
                    palette = palette,
                    statSlots = fullPlayer.statSlots,
                    scrubbedProgress = scrubbedProgress ?: pendingSeekProgress,
                    updateScrubbedProgress = { scrubbedProgress = it },
                    finishScrubbing = {
                        scrubbedProgress?.let {
                            pendingSeekProgress = it
                            seekChapter(it)
                        }
                        scrubbedProgress = null
                    },
                    togglePlayPause = togglePlayPause,
                    skipBackward = skipBackward,
                    skipForward = skipForward,
                    previousChapter = previousChapter,
                    nextChapter = nextChapter,
                )

                FullPlayerControlRow(
                    slots = fullPlayer.controlSlots,
                    display = audiobookDisplayModel(state),
                    palette = palette,
                    sleepLabel = sleepTimerLabel(state),
                    sleepActive = state.sleepTimerMode != null,
                    callbacks = FullPlayerControlCallbacks(
                        onSpeed = { showSpeed = true },
                        onChapters = { showChapters = true },
                        onVolume = { showVolume = true },
                        onSleepTimer = {
                            if (state.sleepTimerMode == null) {
                                showSleepTimer = true
                            } else {
                                cancelSleepTimer()
                            }
                        },
                    ),
                    modifier = Modifier.padding(top = 24.dp),
                )
            }
        }
    }
}

private fun audiobookDisplayModel(
    state: AudiobookPlayerState,
    elapsedOverride: Double? = null,
): PlayerDisplayModel {
    val playbackRate = state.playbackRate.coerceAtLeast(0.01)
    return PlayerDisplayModel(
        bookTitle = state.title,
        chapterTitle = state.currentChapterIndex
            ?.let { state.chapters.getOrNull(it)?.title },
        isPlaying = state.isPlaying,
        playbackRate = state.playbackRate,
        volume = state.volume,
        chapterProgress = state.chapterProgress.coerceIn(0.0, 1.0),
        chapterElapsedSeconds = elapsedOverride ?: state.chapterElapsed,
        chapterTotalSeconds = state.chapterDuration,
        bookTimeRemaining = (state.duration - state.currentTime).coerceAtLeast(0.0) /
            playbackRate,
        bookFraction = state.bookProgress,
        chapterIndex = state.currentChapterIndex,
        chapterCount = state.chapters.size,
        sleepTimerRemaining = state.sleepTimerRemaining
            ?.takeIf { state.sleepTimerMode == "duration" },
        sleepTimerEndOfChapter = state.sleepTimerMode == "endOfChapter",
        hasAudioNarration = true,
    )
}

@Composable
private fun PlayerControls(
    state: AudiobookPlayerState,
    palette: CoverBackgroundPalette,
    statSlots: List<PlayerComplication>,
    scrubbedProgress: Double?,
    updateScrubbedProgress: (Double) -> Unit,
    finishScrubbing: () -> Unit,
    togglePlayPause: () -> Unit,
    skipBackward: () -> Unit,
    skipForward: () -> Unit,
    previousChapter: () -> Unit,
    nextChapter: () -> Unit,
) {
    val chapter = state.currentChapterIndex?.let { state.chapters.getOrNull(it) }
    Text(
        chapter?.title ?: "Unknown Chapter",
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(top = 16.dp),
    )

    val progress = scrubbedProgress ?: state.chapterProgress.coerceIn(0.0, 1.0)
    Slider(
        value = progress.toFloat(),
        onValueChange = { updateScrubbedProgress(it.toDouble()) },
        onValueChangeFinished = finishScrubbing,
        valueRange = 0f..1f,
        colors = SliderDefaults.colors(
            thumbColor = palette.controlTint,
            activeTrackColor = palette.controlTint,
            inactiveTrackColor = palette.controlTint.copy(alpha = 0.3f),
        ),
        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
    )
    val displayedElapsed = if (scrubbedProgress == null) {
        state.chapterElapsed
    } else {
        state.chapterDuration * scrubbedProgress
    }
    val playbackRate = state.playbackRate.coerceAtLeast(0.01)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(
            formatPlaybackTime(displayedElapsed / playbackRate),
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            "−${formatPlaybackTime((state.chapterDuration - displayedElapsed) / playbackRate)}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            formatPlaybackTime(state.chapterDuration / playbackRate),
            style = MaterialTheme.typography.bodyMedium,
        )
    }

    Row(
        Modifier.fillMaxWidth().padding(top = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TransportButton(
            icon = Icons.Filled.SkipPrevious,
            contentDescription = "Restart or previous chapter",
            size = 44.dp,
            iconSize = 22.dp,
            palette = palette,
            onClick = previousChapter,
        )
        TransportButton(
            icon = Icons.Filled.Replay,
            contentDescription = "Back 15 seconds",
            size = 54.dp,
            iconSize = 30.dp,
            palette = palette,
            onClick = skipBackward,
        )
        TransportButton(
            icon = if (state.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
            contentDescription = if (state.isPlaying) "Pause" else "Play",
            size = 72.dp,
            iconSize = 34.dp,
            palette = palette,
            onClick = togglePlayPause,
            primary = true,
        )
        TransportButton(
            icon = Icons.Filled.Replay,
            contentDescription = "Forward 15 seconds",
            size = 54.dp,
            iconSize = 30.dp,
            palette = palette,
            onClick = skipForward,
            mirrored = true,
        )
        TransportButton(
            icon = Icons.Filled.SkipNext,
            contentDescription = "Next chapter",
            size = 44.dp,
            iconSize = 22.dp,
            palette = palette,
            onClick = nextChapter,
        )
    }

    FullPlayerStatSlots(
        slots = statSlots,
        display = audiobookDisplayModel(state, elapsedOverride = displayedElapsed),
        tint = LocalContentColor.current,
        modifier = Modifier.padding(top = 20.dp),
    )
}

@Composable
internal fun SecondaryControl(
    icon: ImageVector,
    label: String,
    contentDescription: String,
    onClick: () -> Unit,
    palette: CoverBackgroundPalette,
    modifier: Modifier = Modifier,
    active: Boolean = false,
) {
    val accent = palette.controlTint
    Column(
        modifier = modifier
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Surface(
            modifier = Modifier.size(52.dp),
            shape = RoundedCornerShape(14.dp),
            color = accent.copy(alpha = if (active) 0.3f else 0.12f),
        ) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription, tint = accent, modifier = Modifier.size(26.dp))
            }
        }
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = accent.copy(alpha = 0.7f),
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
internal fun TransportButton(
    icon: ImageVector,
    contentDescription: String,
    size: Dp,
    iconSize: Dp,
    palette: CoverBackgroundPalette,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    mirrored: Boolean = false,
) {
    val accent = palette.controlTint
    Surface(
        onClick = onClick,
        modifier = modifier.size(size),
        shape = CircleShape,
        color = if (primary) accent else Color.Transparent,
        contentColor = if (primary) palette.contentBackground else accent,
    ) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Icon(
                icon,
                contentDescription,
                modifier = Modifier
                    .size(iconSize)
                    .graphicsLayer { if (mirrored) scaleX = -1f },
            )
        }
    }
}

@Composable
internal fun PlaybackSpeedDialog(
    currentRate: Double,
    dismiss: () -> Unit,
    select: (Double) -> Unit,
) {
    var rate by remember(currentRate) { mutableStateOf(snapPlaybackRate(currentRate)) }
    var editing by remember { mutableStateOf(false) }
    var editText by remember { mutableStateOf("") }

    fun commitEdit() {
        editText.toDoubleOrNull()?.let { rate = snapPlaybackRate(it) }
        editing = false
    }

    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text("Playback Speed") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedIconButton(
                        onClick = {
                            editing = false
                            rate = snapPlaybackRate(rate - 0.1)
                        },
                        modifier = Modifier.size(40.dp),
                        shape = CircleShape,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Remove,
                            contentDescription = "Decrease speed",
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Box(Modifier.widthIn(min = 96.dp), contentAlignment = Alignment.Center) {
                        if (editing) {
                            val focusRequester = remember { FocusRequester() }
                            OutlinedTextField(
                                value = editText,
                                onValueChange = { editText = it },
                                modifier = Modifier
                                    .widthIn(max = 96.dp)
                                    .focusRequester(focusRequester),
                                textStyle = MaterialTheme.typography.headlineSmall.copy(
                                    textAlign = TextAlign.Center,
                                ),
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Decimal,
                                    imeAction = ImeAction.Done,
                                ),
                                keyboardActions = KeyboardActions(onDone = { commitEdit() }),
                            )
                            LaunchedEffect(Unit) { focusRequester.requestFocus() }
                        } else {
                            Text(
                                formatPlaybackRate(rate),
                                style = MaterialTheme.typography.headlineSmall,
                            )
                        }
                    }
                    OutlinedIconButton(
                        onClick = {
                            editing = false
                            rate = snapPlaybackRate(rate + 0.1)
                        },
                        modifier = Modifier.size(40.dp),
                        shape = CircleShape,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Add,
                            contentDescription = "Increase speed",
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
                Slider(
                    value = rate.toFloat(),
                    onValueChange = {
                        editing = false
                        rate = (it * 20).roundToInt() / 20.0
                    },
                    valueRange = 0.5f..3f,
                    steps = 49,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val chosen = if (editing) {
                        editText.toDoubleOrNull()?.let(::snapPlaybackRate) ?: rate
                    } else {
                        rate
                    }
                    select(chosen)
                },
            ) { Text("Done") }
        },
        dismissButton = {
            Row {
                if (!editing) {
                    TextButton(
                        onClick = {
                            editText = String.format(Locale.US, "%.2f", rate)
                                .trimEnd('0')
                                .trimEnd('.')
                            editing = true
                        },
                    ) { Text("Custom") }
                }
                TextButton(onClick = dismiss) { Text("Cancel") }
            }
        },
    )
}

// Android Auto's speed badges are generated on the 0.05 grid from 0.5x to 3x;
// staying on that grid keeps the badge numerically exact.
internal fun snapPlaybackRate(rate: Double): Double =
    ((rate * 20).roundToInt() / 20.0).coerceIn(0.5, 3.0)

@Composable
internal fun VolumeDialog(
    currentVolume: Double,
    dismiss: () -> Unit,
    select: (Double) -> Unit,
) {
    var volume by remember(currentVolume) { mutableStateOf(currentVolume.coerceIn(0.0, 1.0)) }
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text("Volume") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("${(volume * 100).roundToInt()}%", style = MaterialTheme.typography.headlineSmall)
                Slider(
                    value = volume.toFloat(),
                    onValueChange = { volume = it.toDouble() },
                    valueRange = 0f..1f,
                )
            }
        },
        confirmButton = { TextButton(onClick = { select(volume) }) { Text("Done") } },
        dismissButton = { TextButton(onClick = dismiss) { Text("Cancel") } },
    )
}

@Composable
private fun ChaptersDialog(
    chapters: List<AudiobookChapter>,
    currentChapterID: String?,
    dismiss: () -> Unit,
    select: (String) -> Unit,
) {
    val currentChapterIndex = chapters.indexOfFirst { it.id == currentChapterID }
    val listState = rememberLazyListState(
        initialFirstVisibleItemIndex = currentChapterIndex.coerceAtLeast(0),
    )
    LaunchedEffect(currentChapterIndex) {
        if (currentChapterIndex >= 0) {
            listState.scrollToItem(currentChapterIndex)
        }
    }

    Dialog(onDismissRequest = dismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth().heightIn(max = 560.dp),
        ) {
            Column(Modifier.padding(vertical = 16.dp)) {
                Text(
                    "Chapters",
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
                )
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f, fill = false),
                ) {
                    items(chapters, key = AudiobookChapter::id) { chapter ->
                        TextButton(
                            onClick = { select(chapter.id) },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                                Text(
                                    chapter.title,
                                    fontWeight = if (chapter.id == currentChapterID) {
                                        FontWeight.Bold
                                    } else {
                                        FontWeight.Normal
                                    },
                                )
                                Text(
                                    formatPlaybackTime(chapter.duration),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        HorizontalDivider()
                    }
                }
                TextButton(onClick = dismiss, modifier = Modifier.align(Alignment.End)) {
                    Text("Close")
                }
            }
        }
    }
}

@Composable
internal fun SleepTimerDialog(
    dismiss: () -> Unit,
    selectDuration: (Double) -> Unit,
    selectEndOfChapter: () -> Unit,
) {
    val options = listOf(
        "10 minutes" to 10 * 60.0,
        "15 minutes" to 15 * 60.0,
        "30 minutes" to 30 * 60.0,
        "1 hour" to 60 * 60.0,
    )
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text("Sleep Timer") },
        text = {
            Column {
                options.forEach { (label, seconds) ->
                    TextButton(
                        onClick = { selectDuration(seconds) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(label, modifier = Modifier.fillMaxWidth())
                    }
                }
                HorizontalDivider()
                TextButton(
                    onClick = selectEndOfChapter,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("At End of Chapter", modifier = Modifier.fillMaxWidth())
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = dismiss) { Text("Cancel") } },
    )
}

private fun sleepTimerLabel(state: AudiobookPlayerState): String = when (state.sleepTimerMode) {
    "endOfChapter" -> "End Ch."
    "duration" -> state.sleepTimerRemaining?.let(::formatPlaybackTime) ?: "Sleep"
    else -> "Sleep"
}

internal fun volumeIcon(volume: Double): ImageVector = when {
    volume <= 0 -> Icons.AutoMirrored.Filled.VolumeOff
    volume < 0.5 -> Icons.AutoMirrored.Filled.VolumeDown
    else -> Icons.AutoMirrored.Filled.VolumeUp
}

internal fun formatPlaybackRate(rate: Double): String =
    if (rate == rate.roundToInt().toDouble()) {
        "${rate.roundToInt()}x"
    } else {
        "${String.format(Locale.US, "%.2f", rate).trimEnd('0')}x"
    }

internal fun formatPlaybackTime(seconds: Double): String {
    val totalSeconds = seconds.takeIf(Double::isFinite)?.coerceAtLeast(0.0)?.roundToInt() ?: 0
    val hours = totalSeconds / 3_600
    val minutes = totalSeconds % 3_600 / 60
    val remainder = totalSeconds % 60
    return if (hours > 0) {
        String.format(Locale.US, "%d:%02d:%02d", hours, minutes, remainder)
    } else {
        String.format(Locale.US, "%d:%02d", minutes, remainder)
    }
}

