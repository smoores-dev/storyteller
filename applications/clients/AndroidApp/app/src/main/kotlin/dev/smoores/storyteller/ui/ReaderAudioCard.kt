package dev.smoores.storyteller.ui

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.calculateTargetValue
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.rememberSplineBasedDecay
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
import androidx.compose.foundation.layout.statusBars
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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.MiniPlayerCustomization
import dev.smoores.storyteller.model.MiniPlayerSize
import dev.smoores.storyteller.model.PlayerComplication
import dev.smoores.storyteller.model.ReaderState
import dev.smoores.storyteller.model.hasActiveComplication
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

private val MenuBarHeight = 48.dp
private val SettleSpring = spring<Float>(
    dampingRatio = 0.86f,
    stiffness = Spring.StiffnessMediumLow,
)

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

/** Reader playback card, the Compose port of the iOS DraggableAudioCard. */
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
    palette: CoverBackgroundPalette,
    readerControl: (String, Double, String) -> Unit,
    onShowChapters: () -> Unit,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val decay = rememberSplineBasedDecay<Float>()
    val expansion = remember(book.id) { Animatable(0f) }
    var rawExpansion by remember(book.id) { mutableFloatStateOf(0f) }
    var dragBase by remember(book.id) { mutableFloatStateOf(0f) }

    fun damped(raw: Float): Float = when {
        raw < 0f -> raw * 0.15f
        raw > 1f -> 1f + (raw - 1f) * 0.15f
        else -> raw
    }

    suspend fun settle(expanded: Boolean) {
        rawExpansion = if (expanded) 1f else 0f
        expansion.animateTo(rawExpansion, SettleSpring)
    }

    LaunchedEffect(visible) {
        if (!visible) {
            rawExpansion = 0f
            expansion.snapTo(0f)
        }
    }

    BoxWithConstraints(modifier) {
        val screenHeight = maxHeight
        val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        val statusInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
        val compactTotal = readerAudioCardCompactHeight(
            config,
            display.hasAudioNarration,
            navInset,
        )
        val hasStatBand = display.hasAudioNarration && config.statSlots.hasActiveComplication
        val expandedTarget =
            (screenHeight - statusInset - MenuBarHeight).coerceAtLeast(compactTotal + 1.dp)
        val span = expandedTarget - compactTotal
        val spanPx = with(density) { span.toPx() }

        val progress = expansion.value
        val currentHeight = compactTotal + span * progress.coerceIn(-0.05f, 1.15f)
        val compactOpacity = 1f - (progress / 0.35f).coerceIn(0f, 1f)
        val fullOpacity = ((progress - 0.1f) / 0.5f).coerceIn(0f, 1f)

        fun dragTo(delta: Float) {
            rawExpansion -= delta / spanPx
            scope.launch { expansion.snapTo(damped(rawExpansion)) }
        }

        // Collapses the card with whatever downward drag the inner scroll leaves
        // unconsumed, so a swipe down works anywhere, not just on the handle.
        val nestedScrollConnection = remember(spanPx) {
            object : NestedScrollConnection {
                override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                    if (source != NestedScrollSource.UserInput) return Offset.Zero
                    if (expansion.value < 1f && available.y < 0f) {
                        val take = maxOf(available.y, -(1f - expansion.value) * spanPx)
                        dragTo(take)
                        return Offset(0f, take)
                    }
                    return Offset.Zero
                }

                override fun onPostScroll(
                    consumed: Offset,
                    available: Offset,
                    source: NestedScrollSource,
                ): Offset {
                    if (source != NestedScrollSource.UserInput) return Offset.Zero
                    if (available.y > 0f && expansion.value > 0f) {
                        dragBase = 1f
                        dragTo(available.y)
                        return Offset(0f, available.y)
                    }
                    return Offset.Zero
                }

                override suspend fun onPreFling(available: Velocity): Velocity {
                    if (expansion.value >= 1f) return Velocity.Zero
                    val projected = expansion.value -
                        decay.calculateTargetValue(0f, available.y) / spanPx
                    settle(projected > 0.75f)
                    return available
                }
            }
        }

        AnimatedVisibility(
            visible = visible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter),
        ) {
            Surface(
                color = palette.surface,
                contentColor = contentColor,
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
                shadowElevation = 6.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(currentHeight)
                    .nestedScroll(nestedScrollConnection)
                    .draggable(
                        orientation = Orientation.Vertical,
                        state = rememberDraggableState { dragTo(it) },
                        onDragStarted = {
                            rawExpansion = expansion.value.coerceIn(0f, 1f)
                            dragBase = rawExpansion
                        },
                        onDragStopped = { velocity ->
                            val projected = expansion.value -
                                decay.calculateTargetValue(0f, velocity) / spanPx
                            settle(
                                if (dragBase > 0.5f) projected > 0.75f else projected > 0.25f,
                            )
                        },
                    ),
            ) {
                Box(Modifier.fillMaxSize()) {
                    if (progress > 0.02f) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(expandedTarget)
                                .alpha(fullOpacity),
                        ) {
                            ExpandedPlayer(
                                book = book,
                                readerState = readerState,
                                chapterLabel = chapterLabel,
                                palette = palette,
                                readerControl = readerControl,
                                onCollapse = { scope.launch { settle(false) } },
                                onShowChapters = onShowChapters,
                                coverRevision = coverRevision,
                                cover = cover,
                                cachedCover = cachedCover,
                            )
                        }
                    }

                    if (progress < 0.985f) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(compactTotal)
                                .alpha(compactOpacity),
                        ) {
                            Box(
                                Modifier
                                    .fillMaxSize()
                                    .clickable(
                                        interactionSource = remember { MutableInteractionSource() },
                                        indication = null,
                                    ) { scope.launch { settle(true) } },
                            )
                            Column(Modifier.fillMaxSize()) {
                                MiniPlayerCardContent(
                                    config = config,
                                    display = display,
                                    actions = actions,
                                    onExpandTap = { scope.launch { settle(true) } },
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
    palette: CoverBackgroundPalette,
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
    val accent = palette.ratingAccent
    val ink = MaterialTheme.colorScheme.onSurface
    val subtleInk = MaterialTheme.colorScheme.onSurfaceVariant

    Column(
        Modifier
            .fillMaxSize()
            .navigationBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Outside the scroll so a downward drag here reaches the card's draggable.
        Box(Modifier.fillMaxWidth().padding(top = 8.dp, start = 24.dp, end = 24.dp)) {
            DragHandle(Modifier.align(Alignment.Center))
            IconButton(onClick = onCollapse, modifier = Modifier.align(Alignment.CenterEnd)) {
                Icon(
                    Icons.Filled.KeyboardArrowDown,
                    contentDescription = "Collapse player",
                    tint = subtleInk,
                )
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
                            style = editorialTitle(26),
                            color = ink,
                            textAlign = TextAlign.Center,
                            maxLines = 2,
                        )
                        chapterLabel?.takeIf { it.isNotBlank() }?.let {
                            Text(
                                it,
                                style = MaterialTheme.typography.titleSmall,
                                color = subtleInk,
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
                            colors = SliderDefaults.colors(
                                thumbColor = accent,
                                activeTrackColor = accent,
                                inactiveTrackColor = palette.accentTrack,
                            ),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                formatPlaybackTime(elapsed / rate),
                                style = MaterialTheme.typography.bodyMedium,
                                color = subtleInk,
                            )
                            Text(
                                "−${formatPlaybackTime((chapterTotal - elapsed) / rate)}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = subtleInk,
                            )
                            Text(
                                formatPlaybackTime(chapterTotal / rate),
                                style = MaterialTheme.typography.bodyMedium,
                                color = subtleInk,
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
                        TransportButton(
                            icon = Icons.Filled.SkipPrevious,
                            contentDescription = "Restart or previous chapter",
                            size = 44.dp,
                            iconSize = 22.dp,
                            palette = palette,
                            onClick = { readerControl("prevChapter", 0.0, "") },
                        )
                        TransportButton(
                            icon = Icons.AutoMirrored.Filled.RotateLeft,
                            contentDescription = "Previous sentence",
                            size = 54.dp,
                            iconSize = 28.dp,
                            palette = palette,
                            onClick = { readerControl("prevSentence", 0.0, "") },
                        )
                        TransportButton(
                            icon = if (readerState?.isPlaying == true) {
                                Icons.Filled.Pause
                            } else {
                                Icons.Filled.PlayArrow
                            },
                            contentDescription = if (readerState?.isPlaying == true) {
                                "Pause"
                            } else {
                                "Play"
                            },
                            size = 72.dp,
                            iconSize = 34.dp,
                            palette = palette,
                            primary = true,
                            onClick = { readerControl("togglePlayPause", 0.0, "") },
                        )
                        TransportButton(
                            icon = Icons.AutoMirrored.Filled.RotateRight,
                            contentDescription = "Next sentence",
                            size = 54.dp,
                            iconSize = 28.dp,
                            palette = palette,
                            onClick = { readerControl("nextSentence", 0.0, "") },
                        )
                        TransportButton(
                            icon = Icons.Filled.SkipNext,
                            contentDescription = "Next chapter",
                            size = 44.dp,
                            iconSize = 22.dp,
                            palette = palette,
                            onClick = { readerControl("nextChapter", 0.0, "") },
                        )
                    }

                    ExpandedStats(readerState, subtleInk)
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
                palette = palette,
                modifier = Modifier.weight(1f),
            )
            SecondaryControl(
                icon = Icons.AutoMirrored.Filled.List,
                label = "Chapters",
                contentDescription = "Chapters",
                onClick = onShowChapters,
                palette = palette,
                modifier = Modifier.weight(1f),
            )
            SecondaryControl(
                icon = volumeIcon(volume),
                label = "${(volume * 100).roundToInt()}%",
                contentDescription = "Volume",
                onClick = { showVolume = true },
                palette = palette,
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
                palette = palette,
                active = readerState?.sleepTimerActive == true,
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
private fun ExpandedStats(readerState: ReaderState?, color: Color) {
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
                    color = color,
                )
            }
            if (currentPage != null && totalPages != null && totalPages > 0) {
                ExpandedStat(
                    text = "Page $currentPage of $totalPages",
                    icon = Icons.Filled.Bookmark,
                    iconLeading = true,
                    color = color,
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
                color = color,
            )
            ExpandedStat(
                text = formatTimeMinutesSeconds(readerState?.chapterTimeRemaining),
                icon = Icons.Filled.Bookmark,
                iconLeading = false,
                color = color,
            )
        }
    }
}

@Composable
private fun ExpandedStat(
    text: String,
    icon: ImageVector,
    iconLeading: Boolean,
    color: Color,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (iconLeading) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
        }
        Text(text, style = MaterialTheme.typography.bodyMedium, color = color)
        if (!iconLeading) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
        }
    }
}

private fun sleepTimerLabel(state: ReaderState?): String = when {
    state?.sleepTimerActive != true -> "Sleep"
    state.sleepTimerType == "endOfChapter" -> "End Ch."
    else -> state.sleepTimerRemaining?.let(::formatPlaybackTime) ?: "Sleep"
}
