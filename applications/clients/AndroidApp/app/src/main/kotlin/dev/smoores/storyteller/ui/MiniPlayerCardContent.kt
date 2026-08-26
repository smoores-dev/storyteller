package dev.smoores.storyteller.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.smoores.storyteller.model.MiniPlayerCustomization
import dev.smoores.storyteller.model.MiniPlayerCycleComponent
import dev.smoores.storyteller.model.MiniPlayerLeadingStyle
import dev.smoores.storyteller.model.MiniPlayerSize
import dev.smoores.storyteller.model.PlayerComplication
import dev.smoores.storyteller.model.SlotLayout
import dev.smoores.storyteller.model.SlotRef
import dev.smoores.storyteller.model.SlotRegion
import dev.smoores.storyteller.model.hasActiveComplication
import kotlin.math.roundToInt

// Kotlin mirror of MiniPlayerMetrics in MiniPlayerCardContent.swift; dp values
// track the iOS pt values 1:1.
internal object MiniPlayerMetrics {
    val scrubRowTopPadding = 16.dp
    val scrubRowHeight = 46.dp
    val scrubControlHeight = 30.dp
    val extraRowTopPadding = 6.dp
    val extraRowHeight = 30.dp
    val statBandHeight = 38.dp
    val grabberTopPadding = 6.dp

    fun contentRowHeight(showStats: Boolean): Dp = if (showStats) 48.dp else 54.dp

    // Compact has no scrub row above it, so the content row itself has to clear
    // the grabber; the gap below the grabber matches the taller sizes.
    fun contentRowTopPadding(size: MiniPlayerSize, showStats: Boolean): Dp =
        if (size == MiniPlayerSize.COMPACT) {
            if (showStats) 16.dp else 18.dp
        } else {
            4.dp
        }

    fun compactHeight(size: MiniPlayerSize, showStats: Boolean): Dp {
        var height = contentRowTopPadding(size, showStats) + contentRowHeight(showStats)
        if (size != MiniPlayerSize.COMPACT) {
            height += scrubRowTopPadding + scrubRowHeight
        }
        if (size == MiniPlayerSize.LARGE) {
            height += extraRowTopPadding + extraRowHeight
        }
        return height
    }

    // PlayerComplicationView rides the playback-rate label below the speed
    // button without growing its frame, so something has to hold that space.
    val rateLabelOverhang = 14.dp

    // The strip below the card content. Unlike the iOS home indicator, the
    // Android gesture bar is opaque enough to cover text, so the stat row and
    // rate label stack above the inset rather than sharing it. The band's own
    // 8dp bottom padding already clears the bar, so eat that much of the inset.
    fun statBandInset(navInset: Dp): Dp = (navInset - 8.dp).coerceAtLeast(0.dp)

    fun bottomBandHeight(showStats: Boolean, navInset: Dp, showsRateLabel: Boolean = false): Dp =
        if (showStats) {
            statBandInset(navInset) + statBandHeight
        } else {
            statBandInset(navInset) + if (showsRateLabel) rateLabelOverhang else 0.dp
        }
}

// Mirrors a row, except skip back/forward keep their relative order when both
// land in the same row.
internal fun <T> mirroredRowEntries(
    entries: List<T>,
    comp: (T) -> PlayerComplication,
): List<T> {
    val reversed = entries.reversed().toMutableList()
    val origBack = entries.indexOfFirst { comp(it) == PlayerComplication.SKIP_BACKWARD }
    val origForward = entries.indexOfFirst { comp(it) == PlayerComplication.SKIP_FORWARD }
    val newBack = reversed.indexOfFirst { comp(it) == PlayerComplication.SKIP_BACKWARD }
    val newForward = reversed.indexOfFirst { comp(it) == PlayerComplication.SKIP_FORWARD }
    if (origBack < 0 || origForward < 0 || newBack < 0 || newForward < 0) return reversed
    if ((origBack < origForward) != (newBack < newForward)) {
        val swap = reversed[newBack]
        reversed[newBack] = reversed[newForward]
        reversed[newForward] = swap
    }
    return reversed
}

// Kotlin mirror of MiniPlayerCardContent.swift: the rows of the compact card
// above the bottom band. Pure function of its inputs.
@Composable
internal fun MiniPlayerCardContent(
    config: MiniPlayerCustomization,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    editing: MutableState<SlotRef?>? = null,
    onExpandTap: (() -> Unit)? = null,
    contentColor: Color = LocalContentColor.current,
    backgroundColor: Color = Color.Transparent,
    isOrientationLocked: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val effectiveSize = if (display.hasAudioNarration) config.size else MiniPlayerSize.COMPACT
    val hasStatBand = display.hasAudioNarration && config.statSlots.hasActiveComplication

    Column(modifier.fillMaxWidth()) {
        if (effectiveSize != MiniPlayerSize.COMPACT) {
            MiniPlayerSlotRow(
                config = config,
                slots = config.scrubRowSlots,
                region = SlotRegion.MINI_SCRUB_ROW,
                style = ComplicationStyle.ScrubRow,
                display = display,
                actions = actions,
                editing = editing,
                spacing = 8.dp,
                onExpandTap = onExpandTap,
                contentColor = contentColor,
                isOrientationLocked = isOrientationLocked,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = MiniPlayerMetrics.scrubRowTopPadding)
                    .height(MiniPlayerMetrics.scrubRowHeight)
                    .padding(horizontal = 16.dp),
            )
        }

        MiniPlayerSlotRow(
            config = config,
            slots = config.contentRowSlots,
            region = SlotRegion.MINI_CONTENT_ROW,
            style = ComplicationStyle.MiniRow(compact = hasStatBand),
            display = display,
            actions = actions,
            editing = editing,
            spacing = if (editing == null) 15.dp else 8.dp,
            onExpandTap = onExpandTap,
            contentColor = contentColor,
            isOrientationLocked = isOrientationLocked,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = MiniPlayerMetrics.contentRowTopPadding(effectiveSize, hasStatBand))
                .height(MiniPlayerMetrics.contentRowHeight(hasStatBand))
                .padding(horizontal = 16.dp),
        )

        if (effectiveSize == MiniPlayerSize.LARGE) {
            MiniPlayerSlotRow(
                config = config,
                slots = config.extraSlots,
                region = SlotRegion.MINI_EXTRA_ROW,
                style = ComplicationStyle.StatBand,
                display = display,
                actions = actions,
                editing = editing,
                spacing = 0.dp,
                onExpandTap = onExpandTap,
                contentColor = contentColor,
                isOrientationLocked = isOrientationLocked,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = MiniPlayerMetrics.extraRowTopPadding)
                    .height(MiniPlayerMetrics.extraRowHeight)
                    .padding(horizontal = 16.dp),
            )
        }
    }
}

// Kotlin mirror of MiniPlayerSlotRow: every slot holds any complication; the
// scrub bar and title block take whatever width is left over, and mirroring
// just walks the row backwards.
@Composable
internal fun MiniPlayerSlotRow(
    config: MiniPlayerCustomization,
    slots: List<PlayerComplication>,
    region: SlotRegion,
    style: ComplicationStyle,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    editing: MutableState<SlotRef?>? = null,
    spacing: Dp = 8.dp,
    onExpandTap: (() -> Unit)? = null,
    contentColor: Color = LocalContentColor.current,
    isOrientationLocked: Boolean = false,
    modifier: Modifier = Modifier,
) {
    fun isHidden(comp: PlayerComplication): Boolean =
        (comp == PlayerComplication.NONE && editing == null) ||
            (comp.requiresAudio && !display.hasAudioNarration)

    val all = slots.mapIndexed { index, comp -> index to comp }.filter { !isHidden(it.second) }
    val entries = if (config.mirrored) mirroredRowEntries(all) { it.second } else all
    val hasExpanding = entries.any { it.second.isExpanding }
    val hasScrubBar = entries.any { it.second == PlayerComplication.SCRUB_BAR }
    val compactBlock = style !is ComplicationStyle.MiniRow

    Row(
        verticalAlignment = if (hasScrubBar) Alignment.Top else Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(spacing),
        modifier = modifier,
    ) {
        entries.forEachIndexed { position, entry ->
            val (index, comp) = entry
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .then(
                        // No expanding widget means the slots share the width
                        // equally; otherwise only the expanding one grows.
                        if (comp.isExpanding || !hasExpanding) {
                            Modifier.weight(1f)
                        } else {
                            Modifier
                        }
                    )
                    .then(
                        if (hasScrubBar &&
                            comp != PlayerComplication.SCRUB_BAR &&
                            comp != PlayerComplication.TITLE_BLOCK
                        ) {
                            Modifier.height(MiniPlayerMetrics.scrubControlHeight)
                        } else {
                            Modifier
                        }
                    )
                    .slotEditable(SlotRef(region, index), editing),
            ) {
                when (comp) {
                    PlayerComplication.SCRUB_BAR -> ScrubBarSlot(
                        display = display,
                        actions = actions,
                        editing = editing != null,
                        contentColor = contentColor,
                    )
                    PlayerComplication.TITLE_BLOCK -> TitleBlockSlot(
                        config = config,
                        display = display,
                        actions = actions,
                        editing = editing != null,
                        compactBlock = compactBlock,
                        trailing = entries.size > 1 && position == entries.size - 1,
                        onExpandTap = onExpandTap,
                        contentColor = contentColor,
                    )
                    else -> PlayerComplicationView(
                        complication = comp,
                        display = display,
                        actions = actions,
                        style = style,
                        editingPreview = editing != null,
                        // Stat icons ride the outer edge of the row.
                        iconTrailing = position >= entries.size / 2.0,
                        textOnlySlot = SlotLayout.isTextOnly(region),
                        isOrientationLocked = isOrientationLocked,
                        contentColor = contentColor,
                    )
                }
            }
        }
    }
}

@Composable
private fun ScrubBarSlot(
    display: PlayerDisplayModel,
    actions: PlayerActions,
    editing: Boolean,
    contentColor: Color,
) {
    val onSeek = actions.onSeek
    val labelStyle = TextStyle(fontSize = 10.sp, fontWeight = FontWeight.Medium)
        .copy(fontFeatureSettings = "tnum")
    // Remaining time is rate-scaled everywhere else, so the elapsed side is
    // scaled to match rather than reporting a raw playhead.
    val scrubElapsed = display.chapterElapsedSeconds
        ?.takeIf { display.playbackRate > 0 }
        ?.div(display.playbackRate)

    Column(Modifier.fillMaxWidth()) {
        Slider(
            value = display.chapterProgress.toFloat().coerceIn(0f, 1f),
            onValueChange = { value -> onSeek?.invoke(value.coerceIn(0f, 1f).toDouble()) },
            valueRange = 0f..1f,
            enabled = !editing && onSeek != null,
            modifier = Modifier
                .fillMaxWidth()
                .height(MiniPlayerMetrics.scrubControlHeight),
        )
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 2.dp),
        ) {
            Text(
                formatTimeClock(scrubElapsed),
                style = labelStyle,
                color = contentColor.copy(alpha = 0.6f),
                maxLines = 1,
            )
            Text(
                "-${formatTimeClock(display.chapterTimeRemaining)}",
                style = labelStyle,
                color = contentColor.copy(alpha = 0.6f),
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun TitleBlockSlot(
    config: MiniPlayerCustomization,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    editing: Boolean,
    compactBlock: Boolean,
    trailing: Boolean,
    onExpandTap: (() -> Unit)?,
    contentColor: Color,
) {
    val activeCycle = if (config.leadingStyle == MiniPlayerLeadingStyle.CYCLE &&
        config.cycleShowingSecond
    ) {
        config.cycleSecond
    } else {
        config.cycleFirst
    }
    val line1Style = when {
        compactBlock -> MaterialTheme.typography.labelSmall
        !editing -> editorialTitle(16)
        else -> editorialTitle(14)
    }
    val line2Style = (
        when {
            compactBlock -> MaterialTheme.typography.labelSmall
            !editing -> MaterialTheme.typography.bodySmall
            else -> MaterialTheme.typography.labelSmall
        }
        ).copy(fontFeatureSettings = "tnum")

    Row(
        horizontalArrangement = Arrangement.spacedBy(if (compactBlock) 8.dp else 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) {
                if (config.leadingStyle == MiniPlayerLeadingStyle.CYCLE) {
                    actions.onLeadingTap()
                } else {
                    onExpandTap?.invoke()
                }
            },
    ) {
        if (trailing) Spacer(Modifier.weight(1f))
        if (activeCycle.showCover && !trailing) {
            CoverThumb(display.cover, compactBlock, contentColor)
        }
        Column(
            horizontalAlignment = if (trailing) Alignment.End else Alignment.Start,
            verticalArrangement = Arrangement.spacedBy(if (compactBlock) 0.dp else 2.dp),
        ) {
            if (activeCycle.line1 != MiniPlayerCycleComponent.NONE) {
                Text(
                    cycleComponentDisplayText(activeCycle.line1, display),
                    style = line1Style,
                    fontWeight = FontWeight.Medium,
                    color = contentColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (activeCycle.line2 != MiniPlayerCycleComponent.NONE) {
                Text(
                    cycleComponentDisplayText(activeCycle.line2, display),
                    style = line2Style,
                    color = contentColor.copy(alpha = 0.6f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (activeCycle.showCover && trailing) {
            CoverThumb(display.cover, compactBlock, contentColor)
        }
        if (!trailing) Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun CoverThumb(cover: ImageBitmap?, compactBlock: Boolean, contentColor: Color) {
    val coverSize = if (compactBlock) 24.dp else 40.dp
    if (cover != null) {
        Image(
            bitmap = cover,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(coverSize)
                .clip(RoundedCornerShape(6.dp)),
        )
    } else {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(coverSize)
                .background(contentColor.copy(alpha = 0.2f), RoundedCornerShape(6.dp)),
        ) {
            Icon(
                Icons.AutoMirrored.Filled.MenuBook,
                contentDescription = null,
                tint = contentColor.copy(alpha = 0.6f),
                modifier = Modifier.size(if (compactBlock) 12.dp else 20.dp),
            )
        }
    }
}

// Kotlin mirror of cycleComponentDisplayText in MiniPlayerCardContent.swift.
internal fun cycleComponentDisplayText(
    component: MiniPlayerCycleComponent,
    display: PlayerDisplayModel,
): String = when (component) {
    MiniPlayerCycleComponent.NONE -> ""
    MiniPlayerCycleComponent.BOOK_TITLE -> display.bookTitle ?: ""
    MiniPlayerCycleComponent.CHAPTER_TITLE -> display.chapterTitle ?: display.bookTitle ?: ""
    MiniPlayerCycleComponent.AUTHOR -> display.authorName ?: ""
    MiniPlayerCycleComponent.STAT_PAGE -> {
        val current = display.currentPage
        val total = display.totalPages
        if (current != null && total != null && total > 0) {
            "pg. $current / $total"
        } else {
            "pg. - / -"
        }
    }
    MiniPlayerCycleComponent.STAT_PERCENT -> {
        val fraction = display.bookFraction
        if (fraction != null) {
            "${(fraction.coerceIn(0.0, 1.0) * 100).roundToInt()}% of book"
        } else {
            "--%"
        }
    }
    MiniPlayerCycleComponent.STAT_TIME_IN_CHAPTER ->
        "${formatTimeMinutesSeconds(display.chapterTimeRemaining)} left in chapter"
    MiniPlayerCycleComponent.STAT_TIME_IN_BOOK ->
        "${formatTimeHoursMinutes(display.bookTimeRemaining)} left in book"
}

// Kotlin mirror of MiniPlayerStatBand in MiniPlayerCardContent.swift.
@Composable
internal fun MiniPlayerStatBand(
    config: MiniPlayerCustomization,
    display: PlayerDisplayModel,
    actions: PlayerActions,
    editing: MutableState<SlotRef?>? = null,
    contentColor: Color = LocalContentColor.current,
    isOrientationLocked: Boolean = false,
    modifier: Modifier = Modifier,
) {
    MiniPlayerSlotRow(
        config = config,
        slots = config.statSlots,
        region = SlotRegion.MINI_STAT_BAND,
        style = ComplicationStyle.StatBand,
        display = display,
        actions = actions,
        editing = editing,
        spacing = 0.dp,
        contentColor = contentColor,
        isOrientationLocked = isOrientationLocked,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .padding(bottom = 8.dp),
    )
}
