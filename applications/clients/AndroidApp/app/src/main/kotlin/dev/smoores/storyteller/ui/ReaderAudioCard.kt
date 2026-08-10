package dev.smoores.storyteller.ui

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.Velocity
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.automirrored.filled.RotateLeft
import androidx.compose.material.icons.automirrored.filled.RotateRight
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.MiniPlayerCustomization
import dev.smoores.storyteller.model.MiniPlayerSize
import dev.smoores.storyteller.model.PlayerComplication
import dev.smoores.storyteller.model.ReaderState
import dev.smoores.storyteller.model.hasActiveComplication
import kotlin.math.roundToInt

private val DragThreshold = 40.dp
private const val FlingVelocity = 500f

// Single source of truth with ReaderScreen's webview inset arithmetic; heights
// come from MiniPlayerMetrics so the drawn card and the reserved space agree.
internal fun readerAudioCardCompactHeight(
    config: MiniPlayerCustomization,
    hasAudioNarration: Boolean,
    navInset: Dp,
): Dp {
    val size = if (hasAudioNarration) config.size else MiniPlayerSize.COMPACT
    val showStats = hasAudioNarration && config.statSlots.hasActiveComplication
    return MiniPlayerMetrics.compactHeight(size, showStats) +
        MiniPlayerMetrics.bottomBandHeight(
            showStats,
            navInset,
            PlayerComplication.PLAYBACK_SPEED in config.contentRowSlots,
        )
}

/**
 * Reader playback card with the two detents of the iOS DraggableAudioCard: a
 * compact bar pinned above the navigation bar, and a full-screen player that a
 * drag up (or a tap on the bar) reveals.
 */
@Composable
internal fun ReaderAudioCard(
    visible: Boolean,
    book: Book,
    readerState: ReaderState?,
    chapterLabel: String?,
    config: MiniPlayerCustomization,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    isOrientationLocked: Boolean,
    backgroundColor: Color,
    contentColor: Color,
    readerControl: (String, Double, String) -> Unit,
    onShowChapters: () -> Unit,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    modifier: Modifier = Modifier,
) {
    var expanded by remember(book.id) { mutableStateOf(false) }
    var dragOffsetPx by remember(book.id) { mutableFloatStateOf(0f) }
    var dragging by remember(book.id) { mutableStateOf(false) }
    val density = LocalDensity.current
    val dragThresholdPx = with(density) { DragThreshold.toPx() }

    fun settleDrag(velocity: Float) {
        dragging = false
        val up = dragOffsetPx < -dragThresholdPx || velocity < -FlingVelocity
        val down = dragOffsetPx > dragThresholdPx || velocity > FlingVelocity
        expanded = when {
            expanded && down -> false
            !expanded && up -> true
            else -> expanded
        }
        dragOffsetPx = 0f
    }

    // Collapses the card with whatever downward drag the inner scroll leaves
    // unconsumed, so a swipe down works anywhere, not just on the handle.
    val nestedScrollConnection = remember(book.id) {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                if (!expanded || source != NestedScrollSource.UserInput) return Offset.Zero
                if (dragOffsetPx > 0f && available.y < 0f) {
                    val take = maxOf(available.y, -dragOffsetPx)
                    dragOffsetPx += take
                    return Offset(0f, take)
                }
                return Offset.Zero
            }

            override fun onPostScroll(
                consumed: Offset,
                available: Offset,
                source: NestedScrollSource,
            ): Offset {
                if (!expanded || source != NestedScrollSource.UserInput) return Offset.Zero
                if (available.y > 0f) {
                    dragging = true
                    dragOffsetPx += available.y
                    return Offset(0f, available.y)
                }
                return Offset.Zero
            }

            override suspend fun onPreFling(available: Velocity): Velocity {
                if (expanded && (dragging || dragOffsetPx != 0f)) {
                    val velocity = available.y
                    settleDrag(velocity)
                    return available
                }
                return Velocity.Zero
            }
        }
    }

    LaunchedEffect(visible) {
        if (!visible) {
            expanded = false
            dragOffsetPx = 0f
        }
    }

    BoxWithConstraints(modifier) {
        val fullHeight = maxHeight
        val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        val compactHeight = readerAudioCardCompactHeight(
            config,
            display.hasAudioNarration,
            navInset,
        )
        val hasStatBand = display.hasAudioNarration && config.statSlots.hasActiveComplication
        val target = if (expanded) fullHeight else compactHeight
        val settled by animateDpAsState(
            targetValue = target,
            animationSpec = spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow),
            label = "readerAudioCardHeight",
        )
        val height = if (dragging) {
            (target - with(density) { dragOffsetPx.toDp() })
                .coerceIn(compactHeight, fullHeight)
        } else {
            settled
        }

        AnimatedVisibility(
            visible = visible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter),
        ) {
            Surface(
                color = contentColor.copy(alpha = 0.08f).compositeOver(backgroundColor),
                contentColor = contentColor,
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
                tonalElevation = 3.dp,
                shadowElevation = 6.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(height)
                    .nestedScroll(nestedScrollConnection)
                    .draggable(
                        orientation = Orientation.Vertical,
                        state = rememberDraggableState { dragOffsetPx += it },
                        onDragStarted = { dragging = true },
                        onDragStopped = { velocity -> settleDrag(velocity) },
                    ),
            ) {
                Box(Modifier.fillMaxSize()) {
                    if (expanded) {
                        ExpandedPlayer(
                            book = book,
                            readerState = readerState,
                            chapterLabel = chapterLabel,
                            readerControl = readerControl,
                            onCollapse = { expanded = false },
                            onShowChapters = onShowChapters,
                            coverRevision = coverRevision,
                            cover = cover,
                            cachedCover = cachedCover,
                        )
                    } else {
                        Box(
                            Modifier
                                .fillMaxSize()
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                ) { expanded = true },
                        )
                        Column(Modifier.fillMaxSize()) {
                            MiniPlayerCardContent(
                                config = config,
                                display = display,
                                actions = actions,
                                onExpandTap = { expanded = true },
                                contentColor = contentColor,
                                backgroundColor = backgroundColor,
                                isOrientationLocked = isOrientationLocked,
                            )
                            Box(Modifier.fillMaxWidth().weight(1f)) {
                                if (hasStatBand) {
                                    MiniPlayerStatBand(
                                        config = config,
                                        display = display,
                                        actions = actions,
                                        contentColor = contentColor,
                                        isOrientationLocked = isOrientationLocked,
                                        modifier = Modifier.align(Alignment.BottomCenter),
                                    )
                                }
                            }
                        }
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .padding(top = MiniPlayerMetrics.grabberTopPadding),
                            contentAlignment = Alignment.TopCenter,
                        ) {
                            DragHandle()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DragHandle(modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(width = 36.dp, height = 4.dp)
            .background(LocalContentColor.current.copy(alpha = 0.4f), CircleShape),
    )
}

@Composable
private fun ExpandedPlayer(
    book: Book,
    readerState: ReaderState?,
    chapterLabel: String?,
    readerControl: (String, Double, String) -> Unit,
    onCollapse: () -> Unit,
    onShowChapters: () -> Unit,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
) {
    var showSpeed by remember { mutableStateOf(false) }
    var showVolume by remember { mutableStateOf(false) }
    var showSleepTimer by remember { mutableStateOf(false) }
    var scrubbed by remember { mutableStateOf<Float?>(null) }

    val rate = (readerState?.playbackRate ?: 1.0).coerceAtLeast(0.01)
    val volume = readerState?.volume ?: 1.0
    val chapterTotal = readerState?.chapterTotalSeconds ?: 0.0
    val elapsed = scrubbed?.let { chapterTotal * it }
        ?: readerState?.chapterElapsedSeconds
        ?: 0.0

    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Outside the scroll so a downward drag here reaches the card's draggable.
        Box(Modifier.fillMaxWidth().padding(top = 8.dp, start = 24.dp, end = 24.dp)) {
            DragHandle(Modifier.align(Alignment.Center))
            IconButton(onClick = onCollapse, modifier = Modifier.align(Alignment.CenterEnd)) {
                Icon(Icons.Filled.KeyboardArrowDown, contentDescription = "Collapse player")
            }
        }

        BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
            val minContentHeight = maxHeight
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp),
            ) {
                Column(
                    Modifier.fillMaxWidth().heightIn(min = minContentHeight),
                    verticalArrangement = Arrangement.SpaceEvenly,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    BookCover(
                        book = book,
                        width = 640,
                        height = 640,
                        revision = coverRevision,
                        load = cover,
                        cached = cachedCover,
                        modifier = Modifier.size(220.dp),
                        artworkScale = 1f,
                        showsPanel = false,
                        layersMedia = false,
                        showsReadaloudBadge = false,
                    )

                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            readerState?.title?.takeIf(String::isNotBlank) ?: book.title,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.SemiBold,
                            textAlign = TextAlign.Center,
                            maxLines = 2,
                        )
                        val author = readerState?.author?.takeIf(String::isNotBlank) ?: book.authors
                        if (author.isNotBlank()) {
                            Text(
                                author,
                                style = MaterialTheme.typography.titleMedium,
                                textAlign = TextAlign.Center,
                                maxLines = 1,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
                        chapterLabel?.takeIf { it.isNotBlank() }?.let {
                            Text(
                                it,
                                style = MaterialTheme.typography.titleSmall,
                                textAlign = TextAlign.Center,
                                maxLines = 2,
                                modifier = Modifier.padding(top = 12.dp),
                            )
                        }
                    }

                    Column(Modifier.fillMaxWidth()) {
                        Slider(
                            value = (scrubbed ?: (readerState?.chapterFraction ?: 0.0).toFloat())
                                .coerceIn(0f, 1f),
                            onValueChange = { scrubbed = it },
                            onValueChangeFinished = {
                                scrubbed?.let { readerControl("seekToFraction", it.toDouble(), "") }
                                scrubbed = null
                            },
                            valueRange = 0f..1f,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(
                                formatPlaybackTime(elapsed / rate),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            Text(
                                "\u2212${formatPlaybackTime((chapterTotal - elapsed) / rate)}",
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            Text(
                                formatPlaybackTime(chapterTotal / rate),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }

                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(
                            12.dp,
                            Alignment.CenterHorizontally,
                        ),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedIconButton(
                            onClick = { readerControl("prevChapter", 0.0, "") },
                            modifier = Modifier.size(44.dp),
                            shape = CircleShape,
                        ) {
                            Icon(
                                Icons.Filled.SkipPrevious,
                                contentDescription = "Restart or previous chapter",
                                modifier = Modifier.size(22.dp),
                            )
                        }
                        OutlinedIconButton(
                            onClick = { readerControl("prevSentence", 0.0, "") },
                            modifier = Modifier.size(54.dp),
                            shape = CircleShape,
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.RotateLeft,
                                contentDescription = "Previous sentence",
                                modifier = Modifier.size(28.dp),
                            )
                        }
                        FilledIconButton(
                            onClick = { readerControl("togglePlayPause", 0.0, "") },
                            modifier = Modifier.size(72.dp),
                            shape = CircleShape,
                        ) {
                            Icon(
                                imageVector = if (readerState?.isPlaying == true) {
                                    Icons.Filled.Pause
                                } else {
                                    Icons.Filled.PlayArrow
                                },
                                contentDescription = if (readerState?.isPlaying == true) {
                                    "Pause"
                                } else {
                                    "Play"
                                },
                                modifier = Modifier.size(34.dp),
                            )
                        }
                        OutlinedIconButton(
                            onClick = { readerControl("nextSentence", 0.0, "") },
                            modifier = Modifier.size(54.dp),
                            shape = CircleShape,
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.RotateRight,
                                contentDescription = "Next sentence",
                                modifier = Modifier.size(28.dp),
                            )
                        }
                        OutlinedIconButton(
                            onClick = { readerControl("nextChapter", 0.0, "") },
                            modifier = Modifier.size(44.dp),
                            shape = CircleShape,
                        ) {
                            Icon(
                                Icons.Filled.SkipNext,
                                contentDescription = "Next chapter",
                                modifier = Modifier.size(22.dp),
                            )
                        }
                    }

                    ExpandedStats(readerState)
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.Top,
        ) {
            SecondaryControl(
                icon = Icons.Filled.Speed,
                label = formatPlaybackRate(rate),
                contentDescription = "Playback speed",
                onClick = { showSpeed = true },
                modifier = Modifier.weight(1f),
            )
            SecondaryControl(
                icon = Icons.AutoMirrored.Filled.List,
                label = "Chapters",
                contentDescription = "Chapters",
                onClick = onShowChapters,
                modifier = Modifier.weight(1f),
            )
            SecondaryControl(
                icon = volumeIcon(volume),
                label = "${(volume * 100).roundToInt()}%",
                contentDescription = "Volume",
                onClick = { showVolume = true },
                modifier = Modifier.weight(1f),
            )
            SecondaryControl(
                icon = Icons.Filled.Bedtime,
                label = sleepTimerLabel(readerState),
                contentDescription = "Sleep timer",
                onClick = {
                    if (readerState?.sleepTimerActive == true) {
                        readerControl("cancelSleepTimer", 0.0, "")
                    } else {
                        showSleepTimer = true
                    }
                },
                modifier = Modifier.weight(1f),
            )
        }
    }

    if (showSpeed) {
        PlaybackSpeedDialog(
            currentRate = rate,
            dismiss = { showSpeed = false },
            select = {
                showSpeed = false
                readerControl("setRate", it, "")
            },
        )
    }
    if (showVolume) {
        VolumeDialog(
            currentVolume = volume,
            dismiss = { showVolume = false },
            select = {
                showVolume = false
                readerControl("setVolume", it, "")
            },
        )
    }
    if (showSleepTimer) {
        SleepTimerDialog(
            dismiss = { showSleepTimer = false },
            selectDuration = {
                showSleepTimer = false
                readerControl("startSleepTimer", it, "duration")
            },
            selectEndOfChapter = {
                showSleepTimer = false
                readerControl("startSleepTimer", 0.0, "endOfChapter")
            },
        )
    }
}

@Composable
private fun ExpandedStats(readerState: ReaderState?) {
    val bookFraction = readerState?.bookFraction
    val currentPage = readerState?.chapterCurrentPage
    val totalPages = readerState?.chapterTotalPages
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (bookFraction != null) {
                ExpandedStat(
                    text = "${(bookFraction.coerceIn(0.0, 1.0) * 100).roundToInt()}%",
                    icon = Icons.AutoMirrored.Filled.MenuBook,
                    iconLeading = true,
                )
            }
            if (currentPage != null && totalPages != null && totalPages > 0) {
                ExpandedStat(
                    text = "Page $currentPage of $totalPages",
                    icon = Icons.Filled.Bookmark,
                    iconLeading = true,
                )
            }
        }
        Column(
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            ExpandedStat(
                text = formatTimeHoursMinutes(readerState?.bookTimeRemaining),
                icon = Icons.AutoMirrored.Filled.MenuBook,
                iconLeading = false,
            )
            ExpandedStat(
                text = formatTimeMinutesSeconds(readerState?.chapterTimeRemaining),
                icon = Icons.Filled.Bookmark,
                iconLeading = false,
            )
        }
    }
}

@Composable
private fun ExpandedStat(text: String, icon: ImageVector, iconLeading: Boolean) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (iconLeading) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
        }
        Text(text, style = MaterialTheme.typography.bodyMedium)
        if (!iconLeading) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
        }
    }
}

private fun sleepTimerLabel(state: ReaderState?): String = when {
    state?.sleepTimerActive != true -> "Sleep"
    state.sleepTimerType == "endOfChapter" -> "End Ch."
    else -> state.sleepTimerRemaining?.let(::formatPlaybackTime) ?: "Sleep"
}
