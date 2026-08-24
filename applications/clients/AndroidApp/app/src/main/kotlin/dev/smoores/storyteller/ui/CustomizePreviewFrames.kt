package dev.smoores.storyteller.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.DockCustomization
import dev.smoores.storyteller.model.MiniPlayerCustomization
import dev.smoores.storyteller.model.MiniPlayerLeadingStyle
import dev.smoores.storyteller.model.MiniPlayerProgressScope
import dev.smoores.storyteller.model.hasActiveComplication

// Port of MiniPlayerPreviewFrame.swift. The preview strip is inside a card, not
// at the real screen edge, so a fixed stand-in replaces the safe area inset.
private val PreviewSafeAreaBottom = 12.dp

private val MiniPlayerBezel = RoundedCornerShape(
    topStart = 8.dp,
    bottomStart = 38.dp,
    bottomEnd = 38.dp,
    topEnd = 8.dp,
)

private val MenuBarBezel = RoundedCornerShape(
    topStart = 38.dp,
    bottomStart = 8.dp,
    bottomEnd = 8.dp,
    topEnd = 38.dp,
)

@Composable
internal fun MiniPlayerPreviewFrame(
    backgroundColor: Color,
    foregroundColor: Color,
    chromeOnCard: Boolean = true,
    modifier: Modifier = Modifier,
    chrome: @Composable () -> Unit,
) {
    PreviewFrameBox(
        backgroundColor = backgroundColor,
        bezel = MiniPlayerBezel,
        modifier = modifier,
    ) {
        FakePage(
            foregroundColor = foregroundColor,
            lineCount = 14,
            modifier = Modifier.align(Alignment.TopStart).padding(top = 18.dp),
        )
        Box(Modifier.align(Alignment.BottomCenter)) {
            if (chromeOnCard) {
                PreviewChromeCard(backgroundColor, foregroundColor) { chrome() }
            } else {
                chrome()
            }
        }
    }
}

// Top-half mirror of MiniPlayerPreviewFrame (MenuBarPreviewFrame on iOS).
@Composable
internal fun MenuBarPreviewFrame(
    backgroundColor: Color,
    foregroundColor: Color,
    modifier: Modifier = Modifier,
    bar: @Composable () -> Unit,
) {
    PreviewFrameBox(
        backgroundColor = backgroundColor,
        bezel = MenuBarBezel,
        modifier = modifier,
    ) {
        FakePage(
            foregroundColor = foregroundColor,
            lineCount = 12,
            modifier = Modifier.align(Alignment.BottomStart).padding(bottom = 18.dp),
        )
        Box(Modifier.align(Alignment.TopCenter)) { bar() }
    }
}

@Composable
private fun PreviewFrameBox(
    backgroundColor: Color,
    bezel: RoundedCornerShape,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .padding(horizontal = 4.dp)
            .clip(bezel)
            .background(backgroundColor)
            .border(4.dp, LocalContentColor.current.copy(alpha = 0.25f), bezel),
        content = content,
    )
}

@Composable
private fun FakePage(
    foregroundColor: Color,
    lineCount: Int,
    modifier: Modifier = Modifier,
) {
    val lineColor = foregroundColor.copy(alpha = 0.35f)
    Column(
        verticalArrangement = Arrangement.spacedBy(7.dp),
        modifier = modifier.fillMaxWidth().padding(horizontal = 22.dp),
    ) {
        repeat(lineCount) { line ->
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(end = fakeLineTrailingPadding(line))
                    .height(6.dp)
                    .background(lineColor, RoundedCornerShape(2.dp)),
            )
        }
    }
}

private fun fakeLineTrailingPadding(line: Int): Dp = when (line % 5) {
    0 -> 0.dp
    1 -> 12.dp
    2 -> 4.dp
    3 -> 40.dp
    else -> 8.dp
}

// The GlassEffectModifier stand-in: same tinted Surface idiom ReaderAudioCard
// uses for the real card.
@Composable
private fun PreviewChromeCard(
    backgroundColor: Color,
    foregroundColor: Color,
    content: @Composable () -> Unit,
) {
    Surface(
        color = foregroundColor.copy(alpha = 0.08f).compositeOver(backgroundColor),
        contentColor = foregroundColor,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        tonalElevation = 3.dp,
        shadowElevation = 6.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        content()
    }
}

internal enum class CustomizePreviewWidget {
    MINI_PLAYER,
    DOCK,
}

// Port of CustomizePreviewDock in MiniPlayerPreviewFrame.swift: a live,
// interactive simulation of the reader's bottom edge pinned below the options.
// Demo playback state is local; the five toggle callbacks are the real settings
// mutations.
@Composable
internal fun CustomizePreviewDock(
    widget: CustomizePreviewWidget,
    miniPlayer: MiniPlayerCustomization,
    dock: DockCustomization,
    alwaysShowMiniPlayer: Boolean,
    backgroundColor: Color,
    foregroundColor: Color,
    isScrollingMode: Boolean,
    freeBrowseMode: String,
    isOrientationLocked: Boolean = false,
    onToggleCycleShowingSecond: () -> Unit = {},
    onToggleMirror: () -> Unit = {},
    onToggleScrollingMode: () -> Unit = {},
    onToggleFreeBrowse: () -> Unit = {},
    onToggleOrientationLock: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    var demoPlaying by remember { mutableStateOf(false) }
    var demoRate by remember { mutableDoubleStateOf(1.0) }
    var demoProgress by remember { mutableDoubleStateOf(0.42) }

    val demoDisplay = PlayerDisplayModel.sample.copy(
        isPlaying = demoPlaying,
        playbackRate = demoRate,
        chapterProgress = demoProgress,
        bookFraction = 0.73,
        isScrollingMode = isScrollingMode,
        freeBrowseMode = freeBrowseMode,
    )

    val demoActions = PlayerActions(
        onPlayPause = { demoPlaying = !demoPlaying },
        onSkipBackward = { demoProgress = (demoProgress - 0.05).coerceAtLeast(0.0) },
        onSkipForward = { demoProgress = (demoProgress + 0.05).coerceAtMost(1.0) },
        onRateChange = { demoRate = it },
        onSeek = { demoProgress = it.coerceIn(0.0, 1.0) },
        onLeadingTap = {
            if (miniPlayer.leadingStyle == MiniPlayerLeadingStyle.CYCLE) {
                onToggleCycleShowingSecond()
            }
        },
        onToggleMirror = onToggleMirror,
        onToggleScrollingMode = onToggleScrollingMode,
        onToggleFreeBrowse = onToggleFreeBrowse,
        onToggleOrientationLock = onToggleOrientationLock,
    )

    val hasStatBand = miniPlayer.statSlots.hasActiveComplication
    val hasDockControls = dock.centerSlots.hasActiveComplication
    val hasDockContent =
        (dock.leadingSlots + dock.trailingSlots + dock.centerSlots).hasActiveComplication

    val cardBandHeight = MiniPlayerMetrics.bottomBandHeight(
        showStats = hasStatBand,
        navInset = PreviewSafeAreaBottom,
    )
    val cardInset = MiniPlayerMetrics.compactHeight(
        size = miniPlayer.size,
        showStats = hasStatBand,
    ) + cardBandHeight
    val dockInset = if (hasDockContent) {
        DockMetrics.reservedBottomInset(withPlaybackControls = hasDockControls) + 8.dp
    } else {
        PreviewSafeAreaBottom
    }
    // No blank page above the widget; a floating miniplayer gets a sliver so the
    // preview reads as overlapping the page rather than reserving space.
    val floatGap = if (widget == CustomizePreviewWidget.MINI_PLAYER && !alwaysShowMiniPlayer) {
        8.dp
    } else {
        0.dp
    }
    val stripHeight = maxOf(
        when (widget) {
            CustomizePreviewWidget.MINI_PLAYER -> cardInset + floatGap
            CustomizePreviewWidget.DOCK -> dockInset
        },
        48.dp,
    )

    val progressEnabled = when (widget) {
        CustomizePreviewWidget.MINI_PLAYER -> miniPlayer.progressIndicator
        CustomizePreviewWidget.DOCK -> dock.progressIndicator
    }
    val progressScope = when (widget) {
        CustomizePreviewWidget.MINI_PLAYER -> miniPlayer.progressScope
        CustomizePreviewWidget.DOCK -> dock.progressScope
    }
    val progressThickness = when (widget) {
        CustomizePreviewWidget.MINI_PLAYER -> miniPlayer.progressThickness
        CustomizePreviewWidget.DOCK -> dock.progressThickness
    }
    val progressValue = if (progressScope == MiniPlayerProgressScope.BOOK) {
        demoDisplay.bookFraction ?: 0.0
    } else {
        demoProgress
    }

    Column(modifier.fillMaxWidth()) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        CustomizePreviewLabel()

        Box(
            Modifier
                .fillMaxWidth()
                .height(stripHeight)
                .background(backgroundColor),
        ) {
            when (widget) {
                CustomizePreviewWidget.MINI_PLAYER -> PreviewChromeCard(
                    backgroundColor = backgroundColor,
                    foregroundColor = foregroundColor,
                ) {
                    Box(Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth()) {
                            MiniPlayerCardContent(
                                config = miniPlayer,
                                display = demoDisplay,
                                actions = demoActions,
                                contentColor = foregroundColor,
                                backgroundColor = backgroundColor,
                                isOrientationLocked = isOrientationLocked,
                            )
                            Box(Modifier.fillMaxWidth().height(cardBandHeight)) {
                                if (hasStatBand) {
                                    MiniPlayerStatBand(
                                        config = miniPlayer,
                                        display = demoDisplay,
                                        actions = demoActions,
                                        contentColor = foregroundColor,
                                        isOrientationLocked = isOrientationLocked,
                                        modifier = Modifier
                                            .align(Alignment.BottomCenter)
                                            .padding(
                                                bottom = MiniPlayerMetrics.statBandInset(
                                                    PreviewSafeAreaBottom,
                                                ),
                                            ),
                                    )
                                }
                            }
                        }
                        Box(
                            Modifier
                                .align(Alignment.TopCenter)
                                .padding(top = MiniPlayerMetrics.grabberTopPadding)
                                .size(width = 36.dp, height = 5.dp)
                                .background(
                                    foregroundColor.copy(alpha = 0.5f),
                                    RoundedCornerShape(2.5.dp),
                                ),
                        )
                    }
                }

                CustomizePreviewWidget.DOCK -> if (hasDockContent) {
                    ReaderDock(
                        leadingSlots = dock.leadingSlots,
                        trailingSlots = dock.trailingSlots,
                        centerSlots = dock.centerSlots,
                        transparency = dock.transparency,
                        display = demoDisplay,
                        actions = demoActions,
                        backgroundColor = backgroundColor,
                        contentColor = foregroundColor,
                        positionAtTop = false,
                        mirrored = miniPlayer.mirrored,
                        isOrientationLocked = isOrientationLocked,
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth(),
                    )
                }
            }

            if (progressEnabled) {
                DockProgressLine(
                    progress = progressValue,
                    thickness = progressThickness.dp,
                    modifier = Modifier.align(Alignment.BottomCenter),
                )
            }
        }
    }
}
