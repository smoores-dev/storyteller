package dev.smoores.storyteller.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import dev.smoores.storyteller.model.ReadingVisit
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle as JavaTextStyle
import java.util.Locale
import kotlin.math.roundToInt

internal enum class TimelinePeriod(val pillLabel: String, val title: String) {
    SESSION("Session", "This session"),
    WEEK("Week", "This week"),
    MONTH("Month", "This month"),
    YEAR("Year", "This year"),
    ALL("All", "All time"),
}

private data class DayGroup(val day: LocalDate, val visits: List<ReadingVisit>)

private data class ChartBucket(
    val label: String,
    val minutes: Double,
    val range: LongRange,
)

private val zone: ZoneId get() = ZoneId.systemDefault()

private fun ReadingVisit.startDay(): LocalDate =
    Instant.ofEpochMilli(startedAt.toLong()).atZone(zone).toLocalDate()

@Composable
internal fun ReadingTimelineScreen(
    visits: List<ReadingVisit>,
    loading: Boolean,
    palette: CoverBackgroundPalette,
    sessionStartMillis: Long?,
    onResume: (ReadingVisit) -> Unit,
    onClear: (List<String>) -> Unit,
    onDismiss: () -> Unit,
) {
    var period by remember { mutableStateOf(TimelinePeriod.WEEK) }
    var selectedRange by remember { mutableStateOf<LongRange?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    var confirmClearAll by remember { mutableStateOf(false) }
    var confirmClearShown by remember { mutableStateOf(false) }
    var expandedVisits by remember(visits) {
        mutableStateOf(setOfNotNull(visits.maxByOrNull { it.startedAt }?.id))
    }

    val ink = MaterialTheme.colorScheme.onSurface
    val subtleInk = MaterialTheme.colorScheme.onSurfaceVariant
    val accent = palette.ratingAccent
    val paper = palette.contentBackground
    val hairline = palette.cardBorder

    val filtered = remember(visits, period, sessionStartMillis) {
        filterVisits(visits, period, sessionStartMillis)
    }
    val shown = remember(filtered, selectedRange) {
        selectedRange?.let { range ->
            filtered.filter { it.startedAt.toLong() in range }
        } ?: filtered
    }
    val groups = remember(shown) {
        shown.groupBy { it.startDay() }
            .map { (day, dayVisits) ->
                DayGroup(day, dayVisits.sortedByDescending { it.startedAt })
            }
            .sortedByDescending { it.day }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(color = paper, contentColor = ink, modifier = Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .background(palette.surface)
                            .statusBarsPadding()
                            .padding(horizontal = 24.dp)
                            .padding(top = 18.dp, bottom = 22.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                EditorialEyebrow("Where you've been")
                                Text(period.title, style = editorialTitle(34), color = ink)
                            }
                            Spacer(Modifier.weight(1f))
                            Column(horizontalAlignment = Alignment.End) {
                                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                    Box {
                                        CircleAction(
                                            icon = Icons.Filled.MoreHoriz,
                                            contentDescription = "Timeline options",
                                            tint = subtleInk,
                                            border = hairline,
                                            onClick = { menuOpen = true },
                                        )
                                        DropdownMenu(
                                            expanded = menuOpen,
                                            onDismissRequest = { menuOpen = false },
                                        ) {
                                            DropdownMenuItem(
                                                text = { Text("Clear Shown Items") },
                                                onClick = {
                                                    menuOpen = false
                                                    confirmClearShown = true
                                                },
                                            )
                                            DropdownMenuItem(
                                                text = { Text("Clear Timeline") },
                                                onClick = {
                                                    menuOpen = false
                                                    confirmClearAll = true
                                                },
                                            )
                                        }
                                    }
                                    CircleAction(
                                        icon = Icons.Filled.Close,
                                        contentDescription = "Close",
                                        tint = ink,
                                        border = hairline,
                                        onClick = onDismiss,
                                    )
                                }
                                Spacer(Modifier.height(10.dp))
                                Text(
                                    minutesTotalText(filtered),
                                    style = editorialTitle(32),
                                    color = accent,
                                )
                                EditorialEyebrow("Minutes read")
                            }
                        }

                        PeriodPills(
                            period = period,
                            available = TimelinePeriod.entries.filter {
                                it != TimelinePeriod.SESSION || sessionStartMillis != null
                            },
                            ink = ink,
                            paper = paper,
                            hairline = hairline,
                            onSelect = {
                                period = it
                                selectedRange = null
                            },
                        )

                        if (period != TimelinePeriod.SESSION) {
                            TimelineChart(
                                buckets = chartBuckets(filtered, period),
                                selectedRange = selectedRange,
                                accent = accent,
                                barFill = palette.accentTrack,
                                hairline = hairline,
                                subtleInk = subtleInk,
                                onSelect = { range ->
                                    selectedRange = if (selectedRange == range) null else range
                                },
                            )
                        }
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(hairline))
                }

                if (loading) {
                    item {
                        Box(Modifier.fillMaxWidth().padding(top = 80.dp), Alignment.Center) {
                            CircularProgressIndicator(color = accent)
                        }
                    }
                } else if (shown.isEmpty()) {
                    item {
                        EmptyState(
                            filteredToRange = selectedRange != null,
                            ink = ink,
                            subtleInk = subtleInk,
                        )
                    }
                } else {
                    groups.forEach { group ->
                        item(key = "day-${group.day}") {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 24.dp)
                                    .padding(top = 22.dp, bottom = 14.dp),
                                verticalAlignment = Alignment.Bottom,
                            ) {
                                EditorialEyebrow(dayLabel(group.day))
                                Spacer(Modifier.weight(1f))
                                Text(
                                    dayMinutesText(group.visits),
                                    style = MaterialTheme.typography.bodyLarge.copy(
                                        fontFamily = FontFamily.Serif,
                                    ),
                                    color = accent,
                                )
                            }
                        }
                        items(group.visits, key = { it.id }) { visit ->
                            VisitRow(
                                visit = visit,
                                expanded = visit.id in expandedVisits,
                                palette = palette,
                                ink = ink,
                                subtleInk = subtleInk,
                                onToggle = {
                                    expandedVisits = if (visit.id in expandedVisits) {
                                        expandedVisits - visit.id
                                    } else {
                                        expandedVisits + visit.id
                                    }
                                },
                                onResume = { onResume(visit) },
                            )
                        }
                    }
                    item { Spacer(Modifier.height(40.dp)) }
                }
            }
        }
    }

    if (confirmClearAll) {
        ConfirmDialog(
            title = "Clear Reading Timeline?",
            message = "This removes the reading history for this book from this device.",
            dismiss = { confirmClearAll = false },
            confirm = {
                confirmClearAll = false
                onClear(emptyList())
            },
        )
    }
    if (confirmClearShown) {
        ConfirmDialog(
            title = "Clear Shown Items?",
            message = "This removes only the sessions currently shown in the list.",
            dismiss = { confirmClearShown = false },
            confirm = {
                confirmClearShown = false
                onClear(shown.map { it.id })
            },
        )
    }
}

@Composable
private fun CircleAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    tint: Color,
    border: Color,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(30.dp)
            .border(1.dp, border, CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription, tint = tint, modifier = Modifier.size(15.dp))
    }
}

@Composable
private fun PeriodPills(
    period: TimelinePeriod,
    available: List<TimelinePeriod>,
    ink: Color,
    paper: Color,
    hairline: Color,
    onSelect: (TimelinePeriod) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        available.forEach { candidate ->
            val selected = candidate == period
            Box(
                Modifier
                    .background(
                        if (selected) ink else Color.Transparent,
                        RoundedCornerShape(50),
                    )
                    .border(
                        1.dp,
                        if (selected) Color.Transparent else hairline,
                        RoundedCornerShape(50),
                    )
                    .clickable { onSelect(candidate) }
                    .padding(horizontal = 17.dp, vertical = 9.dp),
            ) {
                Text(
                    candidate.pillLabel,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontWeight = FontWeight.Medium,
                    ),
                    color = if (selected) paper else ink,
                )
            }
        }
    }
}

@Composable
private fun TimelineChart(
    buckets: List<ChartBucket>,
    selectedRange: LongRange?,
    accent: Color,
    barFill: Color,
    hairline: Color,
    subtleInk: Color,
    onSelect: (LongRange) -> Unit,
) {
    if (buckets.isEmpty()) return
    val maxMinutes = maxOf(buckets.maxOf { it.minutes }, 1.0)
    Row(
        Modifier.fillMaxWidth().height(110.dp).padding(top = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        buckets.forEach { bucket ->
            val selected = selectedRange == bucket.range
            Column(
                Modifier
                    .weight(1f)
                    .clickable { onSelect(bucket.range) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Bottom,
            ) {
                val barHeight = if (bucket.minutes > 0) {
                    maxOf((bucket.minutes / maxMinutes * 86).toInt(), 6).dp
                } else {
                    2.dp
                }
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(barHeight)
                        .background(
                            when {
                                selected -> accent
                                bucket.minutes > 0 -> barFill
                                else -> hairline
                            },
                            RoundedCornerShape(4.dp),
                        ),
                )
                Spacer(Modifier.height(7.dp))
                Text(
                    bucket.label,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontSize = 10.sp,
                        letterSpacing = eyebrowLetterSpacing,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    ),
                    color = if (selected) accent else subtleInk,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun VisitRow(
    visit: ReadingVisit,
    expanded: Boolean,
    palette: CoverBackgroundPalette,
    ink: Color,
    subtleInk: Color,
    onToggle: () -> Unit,
    onResume: () -> Unit,
) {
    val accent = palette.ratingAccent
    val quote = visit.endText?.split(Regex("\\s+"))?.filter(String::isNotBlank)?.joinToString(" ")
        ?.takeIf(String::isNotBlank)
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min).padding(horizontal = 24.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            Modifier.width(52.dp),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                railTime(visit.startedAt.toLong()),
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontWeight = FontWeight.SemiBold,
                    fontFeatureSettings = "tnum",
                ),
                color = ink,
            )
            shortDurationText(visit)?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontFeatureSettings = "tnum",
                    ),
                    color = subtleInk,
                )
            }
        }

        Box(Modifier.width(36.dp).fillMaxHeight(), contentAlignment = Alignment.TopCenter) {
            Box(Modifier.width(2.dp).fillMaxHeight().background(palette.cardBorder))
            Box(
                Modifier
                    .padding(top = 4.dp)
                    .size(12.dp)
                    .background(sourceColor(visit.source, palette), CircleShape)
                    .border(2.dp, palette.contentBackground, CircleShape),
            )
        }

        Column(
            Modifier
                .weight(1f)
                .padding(bottom = 18.dp)
                .background(palette.cardBackground, RoundedCornerShape(18.dp))
                .clickable(enabled = quote != null, onClick = onToggle)
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(
                    Modifier
                        .width(4.dp)
                        .height(46.dp)
                        .background(sourceColor(visit.source, palette), RoundedCornerShape(2.dp)),
                )
                Column(
                    Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        cardTitle(visit),
                        style = editorialTitle(20),
                        color = ink,
                        maxLines = 2,
                    )
                    cardSubtitle(visit)?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = subtleInk,
                            maxLines = 1,
                        )
                    }
                    Row(
                        Modifier.padding(top = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            stoppedLine(visit),
                            style = MaterialTheme.typography.labelSmall.copy(
                                letterSpacing = eyebrowLetterSpacing,
                            ),
                            color = subtleInk,
                            maxLines = 1,
                        )
                        if (quote != null && !expanded) {
                            Icon(
                                Icons.Filled.FormatQuote,
                                contentDescription = null,
                                tint = subtleInk,
                                modifier = Modifier.size(13.dp),
                            )
                        }
                    }
                }
                Box(
                    Modifier
                        .padding(top = 4.dp)
                        .border(1.dp, accent.copy(alpha = 0.45f), RoundedCornerShape(50))
                        .clickable(onClick = onResume)
                        .padding(horizontal = 18.dp, vertical = 8.dp),
                ) {
                    Text(
                        "Resume",
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontWeight = FontWeight.Medium,
                        ),
                        color = accent,
                    )
                }
            }

            if (expanded && quote != null) {
                Text(
                    quotedDisplay(quote),
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontFamily = FontFamily.Serif,
                        fontStyle = FontStyle.Italic,
                    ),
                    color = ink.copy(alpha = 0.75f),
                )
            }
        }
    }
}

@Composable
private fun EmptyState(filteredToRange: Boolean, ink: Color, subtleInk: Color) {
    Column(
        Modifier.fillMaxWidth().padding(top = 60.dp, start = 40.dp, end = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        EditorialEyebrow(if (filteredToRange) "No reading here" else "Nothing here yet")
        Text(
            if (filteredToRange) {
                "No reading sessions in this stretch. Tap the bar again to see everything."
            } else {
                "Your reading sessions will appear here as you read. " +
                    "Tap one to jump back to that spot."
            },
            style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Serif),
            color = ink.copy(alpha = 0.8f),
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ConfirmDialog(
    title: String,
    message: String,
    dismiss: () -> Unit,
    confirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = { TextButton(onClick = confirm) { Text("Clear") } },
        dismissButton = { TextButton(onClick = dismiss) { Text("Cancel") } },
    )
}

private fun sourceColor(source: String, palette: CoverBackgroundPalette): Color = when (source) {
    "readaloud" -> Color(0xFF9A87C4)
    "audiobook" -> Color(0xFF7FA98F)
    "otherDevice" -> Color(0xFF878078)
    else -> palette.ratingAccent
}

private fun filterVisits(
    visits: List<ReadingVisit>,
    period: TimelinePeriod,
    sessionStartMillis: Long?,
): List<ReadingVisit> {
    val today = LocalDate.now(zone)
    return visits.filter { visit ->
        val day = visit.startDay()
        when (period) {
            TimelinePeriod.SESSION ->
                sessionStartMillis != null && visit.endedAt >= sessionStartMillis
            TimelinePeriod.WEEK -> day >= startOfWeek(today) && day < startOfWeek(today).plusDays(7)
            TimelinePeriod.MONTH -> day.year == today.year && day.month == today.month
            TimelinePeriod.YEAR -> day.year == today.year
            TimelinePeriod.ALL -> true
        }
    }
}

private fun startOfWeek(day: LocalDate): LocalDate =
    day.minusDays((day.dayOfWeek.value % 7).toLong())

private fun dayRange(day: LocalDate): LongRange {
    val start = day.atStartOfDay(zone).toInstant().toEpochMilli()
    val end = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
    return start until end
}

private fun chartBuckets(
    visits: List<ReadingVisit>,
    period: TimelinePeriod,
): List<ChartBucket> {
    val today = LocalDate.now(zone)
    fun bucket(label: String, range: LongRange) = ChartBucket(
        label = label,
        minutes = visits.filter { it.startedAt.toLong() in range }
            .sumOf { it.durationSeconds / 60 },
        range = range,
    )
    return when (period) {
        TimelinePeriod.SESSION -> emptyList()
        TimelinePeriod.WEEK -> (0..6).map { offset ->
            val day = startOfWeek(today).plusDays(offset.toLong())
            bucket(
                day.dayOfWeek.getDisplayName(JavaTextStyle.NARROW, Locale.getDefault())
                    .uppercase(),
                dayRange(day),
            )
        }
        TimelinePeriod.MONTH -> {
            val first = today.withDayOfMonth(1)
            (0 until today.lengthOfMonth()).map { offset ->
                val day = first.plusDays(offset.toLong())
                bucket(if (offset % 7 == 0) "${offset + 1}" else "", dayRange(day))
            }
        }
        TimelinePeriod.YEAR -> (1..12).map { month ->
            val first = LocalDate.of(today.year, month, 1)
            val start = first.atStartOfDay(zone).toInstant().toEpochMilli()
            val end = first.plusMonths(1).atStartOfDay(zone).toInstant().toEpochMilli()
            bucket(
                first.month.getDisplayName(JavaTextStyle.NARROW, Locale.getDefault()).uppercase(),
                start until end,
            )
        }
        TimelinePeriod.ALL -> {
            val years = visits.map { it.startDay().year }.distinct().sorted()
            val firstYear = years.firstOrNull() ?: return emptyList()
            (firstYear..maxOf(today.year, firstYear)).toList().takeLast(12).map { year ->
                val first = LocalDate.of(year, 1, 1)
                val start = first.atStartOfDay(zone).toInstant().toEpochMilli()
                val end = first.plusYears(1).atStartOfDay(zone).toInstant().toEpochMilli()
                bucket("'%02d".format(year % 100), start until end)
            }
        }
    }
}

private fun minutesTotalText(visits: List<ReadingVisit>): String {
    val seconds = visits.sumOf { it.durationSeconds }
    val total = (seconds / 60).toInt()
    if (total < 1) return if (seconds > 0) "<1m" else "0m"
    return "${total}m"
}

private fun dayMinutesText(visits: List<ReadingVisit>): String {
    val total = (visits.sumOf { it.durationSeconds } / 60).toInt()
    if (total < 1) return "under a min"
    return "$total min"
}

private fun dayLabel(day: LocalDate): String {
    val formatted = day.format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.getDefault()))
        .uppercase()
    val today = LocalDate.now(zone)
    return when (day) {
        today -> "TODAY \u00B7 $formatted"
        today.minusDays(1) -> "YESTERDAY \u00B7 $formatted"
        else -> formatted
    }
}

private fun railTime(millis: Long): String {
    val time = Instant.ofEpochMilli(millis).atZone(zone).toLocalTime()
    return "%02d:%02d".format(time.hour, time.minute)
}

private fun shortDurationText(visit: ReadingVisit): String? {
    val minutes = (visit.durationSeconds / 60).toInt()
    return when {
        minutes < 1 -> null
        minutes < 60 -> "${minutes}m"
        else -> "${minutes / 60}h${minutes % 60}m"
    }
}

private fun splitPlacePercent(description: String): Pair<String, String>? {
    val index = description.lastIndexOf(", ")
    if (index < 0) return null
    val suffix = description.substring(index + 2)
    if (!suffix.endsWith("%") || !suffix.dropLast(1).all(Char::isDigit)) return null
    return description.substring(0, index) to suffix
}

private fun cardTitle(visit: ReadingVisit): String {
    splitPlacePercent(visit.endDescription)?.let { return it.first }
    visit.chapterTitle?.takeIf(String::isNotBlank)?.let { return it }
    visit.endProgression?.let { return "${(it * 100).roundToInt()}%" }
    if (visit.endDescription.isNotBlank() && visit.endDescription != "Unknown Chapter") {
        return visit.endDescription
    }
    return "Reading session"
}

private fun cardSubtitle(visit: ReadingVisit): String? {
    val parts = buildList {
        splitPlacePercent(visit.startDescription)?.first
            ?.takeIf { it != cardTitle(visit) }
            ?.let { add("From $it") }
        val start = visit.startProgression
        val end = visit.endProgression
        if (start != null && end != null) {
            val startPct = (start * 100).roundToInt()
            val endPct = (end * 100).roundToInt()
            if (startPct != endPct) add("$startPct% \u2192 $endPct%")
        }
        when (visit.source) {
            "audiobook" -> add("Listening")
            "otherDevice" -> add("Another device")
        }
    }
    return parts.takeIf { it.isNotEmpty() }?.joinToString(" \u00B7 ")
}

private fun stoppedLine(visit: ReadingVisit): String {
    val time = railTime(visit.endedAt.toLong())
    val progression = visit.endProgression
    if (progression != null && !cardTitle(visit).contains("%")) {
        return "STOPPED $time \u00B7 ${(progression * 100).roundToInt()}%"
    }
    return "STOPPED $time"
}

private fun quotedDisplay(quote: String): String {
    val marks = setOf('\u201C', '\u201D', '"', '\u2018', '\u2019')
    if (quote.firstOrNull() in marks) return quote
    return "\u201C$quote\u201D"
}

@Composable
internal fun TimelineBreadcrumbs(
    backDescription: String?,
    forwardDescription: String?,
    contentColor: Color,
    backgroundColor: Color,
    onBack: () -> Unit,
    onForward: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        backDescription?.let {
            BreadcrumbPill(
                icon = Icons.AutoMirrored.Filled.Undo,
                text = if (it.isBlank()) "Back" else "Back to $it",
                contentColor = contentColor,
                backgroundColor = backgroundColor,
                onClick = onBack,
                onDismiss = onDismiss,
            )
        }
        forwardDescription?.let {
            BreadcrumbPill(
                icon = Icons.AutoMirrored.Filled.Redo,
                text = if (it.isBlank()) "Forward" else "Forward to $it",
                contentColor = contentColor,
                backgroundColor = backgroundColor,
                onClick = onForward,
                onDismiss = onDismiss,
            )
        }
    }
}

@Composable
private fun BreadcrumbPill(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String,
    contentColor: Color,
    backgroundColor: Color,
    onClick: () -> Unit,
    onDismiss: () -> Unit,
) {
    Row(
        Modifier
            .widthIn(max = 240.dp)
            .background(backgroundColor, RoundedCornerShape(50))
            .border(1.dp, contentColor.copy(alpha = 0.25f), RoundedCornerShape(50)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier
                .weight(1f, fill = false)
                .clickable(onClick = onClick)
                .padding(start = 12.dp, end = 6.dp, top = 8.dp, bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = contentColor, modifier = Modifier.size(16.dp))
            Text(
                text,
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                color = contentColor,
                maxLines = 1,
            )
        }
        Box(
            Modifier
                .clickable(onClick = onDismiss)
                .padding(start = 4.dp, end = 10.dp, top = 8.dp, bottom = 8.dp),
        ) {
            Icon(
                Icons.Filled.Close,
                contentDescription = "Dismiss",
                tint = contentColor.copy(alpha = 0.6f),
                modifier = Modifier.size(12.dp),
            )
        }
    }
}
