package dev.smoores.storyteller.ui

import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.StarHalf
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Pentagon
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.RatingContext
import dev.smoores.storyteller.model.RatingDimensionInfo
import dev.smoores.storyteller.model.RatingDraft
import dev.smoores.storyteller.model.RatingSaveResult
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

// Kotlin port of Kit's RadarGeometry and the display-side rating helpers. The
// tri-state save semantics stay in Swift behind the saveBookRating bridge call.
internal object RatingMath {
    const val SCORE_MAXIMUM = 5.0
    private const val RADAR_DEAD_ZONE = 8.0

    fun snapToHalf(value: Double): Double =
        (value.coerceIn(0.0, SCORE_MAXIMUM) * 2).roundToInt() / 2.0

    fun format(value: Double): String {
        var formatted = "%.2f".format(value)
        while (formatted.contains(".") && formatted.endsWith("0")) {
            formatted = formatted.dropLast(1)
        }
        if (formatted.endsWith(".")) formatted = formatted.dropLast(1)
        return formatted
    }

    fun average(scores: Map<String, Double>?): Double? {
        val valid = scores?.values?.filter { it.isFinite() && it in 0.0..SCORE_MAXIMUM }
        if (valid.isNullOrEmpty()) return null
        return (valid.sum() / valid.size * 100).roundToInt() / 100.0
    }

    fun isManualOverride(rating: Double?, average: Double?): Boolean {
        if (rating == null || average == null) return false
        return abs(rating - average) > 0.01
    }

    fun seedScores(dimensions: List<RatingDimensionInfo>, from: Double?): Map<String, Double> {
        val seed = snapToHalf(from ?: 0.0)
        return dimensions.associate { it.id to seed }
    }

    fun axisAngle(index: Int, count: Int): Double =
        -PI / 2 + index * (2 * PI / count)

    fun point(center: Offset, radius: Float, angle: Double): Offset = Offset(
        center.x + radius * cos(angle).toFloat(),
        center.y + radius * sin(angle).toFloat(),
    )

    fun nearestAxis(location: Offset, center: Offset, count: Int): Int? {
        if (count <= 0) return null
        val dx = (location.x - center.x).toDouble()
        val dy = (location.y - center.y).toDouble()
        if (sqrt(dx * dx + dy * dy) <= RADAR_DEAD_ZONE) return null
        val angle = atan2(dy, dx)
        var best = 0
        var bestDelta = Double.MAX_VALUE
        for (index in 0 until count) {
            var delta = abs(angle - axisAngle(index, count))
            delta = minOf(delta, 2 * PI - delta)
            if (delta < bestDelta) {
                bestDelta = delta
                best = index
            }
        }
        return best
    }

    fun valueAt(
        location: Offset,
        center: Offset,
        axisIndex: Int,
        count: Int,
        outerRadius: Float,
        step: Double = 1.0,
    ): Double {
        val angle = axisAngle(axisIndex, count)
        val projection = (location.x - center.x) * cos(angle) +
            (location.y - center.y) * sin(angle)
        val raw = projection / outerRadius * SCORE_MAXIMUM
        val snapped = (raw / step).roundToInt() * step
        return snapped.coerceIn(0.0, SCORE_MAXIMUM)
    }
}

@Composable
internal fun InteractiveRatingStars(
    value: Double?,
    starSize: Dp,
    spacing: Dp,
    fillColor: Color,
    emptyColor: Color,
    onCommit: ((Double) -> Unit)? = null,
) {
    var previewValue by remember { mutableStateOf<Double?>(null) }
    LaunchedEffect(value) { previewValue = null }
    val displayValue = previewValue ?: value?.let(RatingMath::snapToHalf) ?: 0.0

    fun starValue(x: Float, width: Float): Double {
        if (width <= 0f) return 0.0
        return RatingMath.snapToHalf((x / width * 5).toDouble())
    }

    Row(
        horizontalArrangement = Arrangement.spacedBy(spacing),
        verticalAlignment = Alignment.CenterVertically,
        modifier = if (onCommit == null) {
            Modifier
        } else {
            Modifier
                .pointerInput(Unit) {
                    detectTapGestures { offset ->
                        val committed = starValue(offset.x, size.width.toFloat())
                        previewValue = committed
                        onCommit(committed)
                    }
                }
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { offset ->
                            previewValue = starValue(offset.x, size.width.toFloat())
                        },
                        onDrag = { change, _ ->
                            change.consume()
                            previewValue = starValue(change.position.x, size.width.toFloat())
                        },
                        onDragEnd = {
                            previewValue?.let(onCommit)
                        },
                    )
                }
        },
    ) {
        repeat(5) { index ->
            val filled = displayValue >= index + 1
            val half = !filled && displayValue >= index + 0.5
            Box(Modifier.size(starSize)) {
                Icon(
                    Icons.Filled.Star,
                    contentDescription = null,
                    tint = emptyColor,
                    modifier = Modifier.size(starSize),
                )
                if (filled || half) {
                    Icon(
                        if (filled) Icons.Filled.Star else Icons.AutoMirrored.Filled.StarHalf,
                        contentDescription = null,
                        tint = fillColor,
                        modifier = Modifier.size(starSize),
                    )
                }
            }
        }
    }
}

@Composable
internal fun RatingRadarChart(
    dimensions: List<RatingDimensionInfo>,
    scores: Map<String, Double>,
    accent: Color,
    onScoreChange: ((String, Double) -> Unit)? = null,
) {
    if (dimensions.size < 3) return
    val outerRadius = 98.dp
    val labelPadding = 42.dp
    val side = (outerRadius + labelPadding) * 2
    val density = LocalDensity.current
    val outerRadiusPx = with(density) { outerRadius.toPx() }
    val sidePx = with(density) { side.toPx() }
    val center = Offset(sidePx / 2, sidePx / 2)
    val gridColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.16f)

    fun apply(location: Offset) {
        if (onScoreChange == null) return
        val axis = RatingMath.nearestAxis(location, center, dimensions.size) ?: return
        onScoreChange(
            dimensions[axis].id,
            RatingMath.valueAt(location, center, axis, dimensions.size, outerRadiusPx),
        )
    }

    Box(
        Modifier
            .size(side)
            .pointerInput(dimensions, onScoreChange != null) {
                if (onScoreChange != null) {
                    detectDragGestures(
                        onDragStart = ::apply,
                        onDrag = { change, _ ->
                            change.consume()
                            apply(change.position)
                        },
                    )
                }
            }
            .pointerInput(dimensions, onScoreChange != null) {
                if (onScoreChange != null) {
                    detectTapGestures(onTap = ::apply)
                }
            },
    ) {
        androidx.compose.foundation.Canvas(Modifier.size(side)) {
            fun polygon(radius: (Int) -> Float): Path {
                val path = Path()
                dimensions.indices.forEach { index ->
                    val point = RatingMath.point(
                        center,
                        radius(index),
                        RatingMath.axisAngle(index, dimensions.size),
                    )
                    if (index == 0) path.moveTo(point.x, point.y) else path.lineTo(point.x, point.y)
                }
                path.close()
                return path
            }

            for (ring in 1..5) {
                val radius = outerRadiusPx * ring / 5
                drawPath(
                    polygon { radius },
                    color = gridColor,
                    style = Stroke(width = (if (ring == 5) 1.2.dp else 0.6.dp).toPx()),
                )
            }
            dimensions.indices.forEach { index ->
                val end = RatingMath.point(
                    center,
                    outerRadiusPx,
                    RatingMath.axisAngle(index, dimensions.size),
                )
                drawLine(gridColor, center, end, strokeWidth = 0.6.dp.toPx())
            }

            fun score(index: Int): Double = scores[dimensions[index].id] ?: 0.0
            val valuePath = polygon { index ->
                outerRadiusPx * (score(index) / RatingMath.SCORE_MAXIMUM).toFloat()
            }
            drawPath(valuePath, color = accent.copy(alpha = 0.45f))
            drawPath(valuePath, color = accent, style = Stroke(width = 2.dp.toPx()))

            if (onScoreChange != null) {
                val handleRadius = 7.dp.toPx()
                dimensions.indices.forEach { index ->
                    val point = RatingMath.point(
                        center,
                        outerRadiusPx * (score(index) / RatingMath.SCORE_MAXIMUM).toFloat(),
                        RatingMath.axisAngle(index, dimensions.size),
                    )
                    drawCircle(accent, radius = handleRadius, center = point)
                }
            }
        }
        dimensions.forEachIndexed { index, dimension ->
            val point = RatingMath.point(
                center,
                outerRadiusPx + with(density) { 24.dp.toPx() },
                RatingMath.axisAngle(index, dimensions.size),
            )
            val labelWidth = 84.dp
            val labelHeight = 34.dp
            Column(
                Modifier
                    .size(labelWidth, labelHeight)
                    .offset {
                        IntOffset(
                            (point.x - with(density) { labelWidth.toPx() } / 2).roundToInt(),
                            (point.y - with(density) { labelHeight.toPx() } / 2).roundToInt(),
                        )
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    dimension.label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    textAlign = TextAlign.Center,
                )
                Text(
                    RatingMath.format(scores[dimension.id] ?: 0.0),
                    style = MaterialTheme.typography.labelSmall,
                    color = accent,
                    maxLines = 1,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RatingEditorSheet(
    book: Book,
    context: RatingContext,
    accent: Color,
    saveRating: suspend (Book, RatingDraft) -> RatingSaveResult,
    removeRating: suspend (Book) -> RatingSaveResult,
    onSaved: (RatingSaveResult) -> Unit,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val storedReview = remember(context) {
        context.record?.review?.trim()?.takeIf { it.isNotEmpty() }
    }
    val storedDimensions = remember(context) {
        context.record?.dimensions?.takeIf { it.isNotEmpty() }
    }

    var draftStars by remember(context) { mutableStateOf(context.record?.rating) }
    var starsEdited by remember(context) { mutableStateOf(false) }
    var useAverageChosen by remember(context) { mutableStateOf(false) }
    var draftScores by remember(context) {
        mutableStateOf(
            context.dimensions.associate { it.id to (storedDimensions?.get(it.id) ?: 0.0) },
        )
    }
    var hasDimensions by remember(context) { mutableStateOf(storedDimensions != null) }
    var dimensionsEdited by remember(context) { mutableStateOf(false) }
    var draftReview by remember(context) { mutableStateOf(storedReview ?: "") }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val draftAverage = if (hasDimensions) RatingMath.average(draftScores) else null
    val displayedStars = when {
        starsEdited -> draftStars
        useAverageChosen -> draftAverage
        else -> context.record?.rating
    }
    val showsUseAverage = draftAverage != null &&
        RatingMath.isManualOverride(displayedStars, draftAverage)
    val reviewChanged = draftReview.trim() != (storedReview ?: "")
    val isDirty = starsEdited || useAverageChosen || dimensionsEdited || reviewChanged

    fun finishWith(result: RatingSaveResult) {
        when (result.outcome) {
            "unchanged" -> onDismiss()
            "saved", "cleared" -> {
                onSaved(result)
                onDismiss()
            }
            else -> errorMessage = result.message ?: "The rating could not be saved."
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp)
                .padding(bottom = 18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "User Rating & Review",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                if (isSaving) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Box {
                    var menuExpanded by remember { mutableStateOf(false) }
                    IconButton(onClick = { menuExpanded = true }) {
                        Icon(
                            Icons.Default.MoreHoriz,
                            contentDescription = "Rating options",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text("Remove Rating", color = MaterialTheme.colorScheme.error) },
                            leadingIcon = {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.error,
                                )
                            },
                            enabled = context.record != null && !isSaving,
                            onClick = {
                                menuExpanded = false
                                scope.launch {
                                    isSaving = true
                                    val result = runCatching { removeRating(book) }
                                        .getOrElse {
                                            RatingSaveResult(
                                                outcome = "failed",
                                                record = null,
                                                message = "Could not remove the rating.",
                                            )
                                        }
                                    isSaving = false
                                    finishWith(result)
                                }
                            },
                        )
                    }
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                InteractiveRatingStars(
                    value = displayedStars,
                    starSize = 28.dp,
                    spacing = 6.dp,
                    fillColor = accent,
                    emptyColor = accent.copy(alpha = 0.3f),
                    onCommit = { value ->
                        draftStars = value
                        starsEdited = true
                        useAverageChosen = false
                    },
                )
                displayedStars?.let {
                    Text(
                        RatingMath.format(it),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Fixed-height slot so the radar below never shifts mid-drag.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.height(20.dp),
            ) {
                if (showsUseAverage && draftAverage != null) {
                    Text(
                        "Detailed average is ${RatingMath.format(draftAverage)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        "Use Average",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Medium,
                        color = accent,
                        modifier = Modifier
                            .padding(horizontal = 2.dp)
                            .let { modifier ->
                                modifier.pointerInput(Unit) {
                                    detectTapGestures {
                                        starsEdited = false
                                        useAverageChosen = true
                                    }
                                }
                            },
                    )
                }
            }

            if (hasDimensions) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Detailed Rating",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(
                            onClick = {
                                hasDimensions = false
                                dimensionsEdited = true
                                useAverageChosen = false
                            },
                        ) {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = "Remove detailed rating",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        RatingRadarChart(
                            dimensions = context.dimensions,
                            scores = draftScores,
                            accent = accent,
                            onScoreChange = { id, value ->
                                draftScores = draftScores + (id to value)
                                dimensionsEdited = true
                                useAverageChosen = false
                            },
                        )
                    }
                }
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.pointerInput(Unit) {
                        detectTapGestures {
                            draftScores = RatingMath.seedScores(context.dimensions, displayedStars)
                            hasDimensions = true
                            dimensionsEdited = true
                        }
                    },
                ) {
                    Icon(
                        Icons.Outlined.Pentagon,
                        contentDescription = null,
                        tint = accent,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        "Add Detailed Rating",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = accent,
                    )
                }
            }

            OutlinedTextField(
                value = draftReview,
                onValueChange = { draftReview = it },
                label = { Text("Review") },
                placeholder = { Text("Write a review...") },
                minLines = 4,
                maxLines = 8,
                modifier = Modifier.fillMaxWidth(),
            )

            errorMessage?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                modifier = Modifier.fillMaxWidth(),
            ) {
                TextButton(onClick = onDismiss) { Text("Cancel") }
                Button(
                    enabled = isDirty && !isSaving,
                    onClick = {
                        scope.launch {
                            isSaving = true
                            val draft = RatingDraft(
                                starsEdited = starsEdited && !useAverageChosen,
                                stars = draftStars,
                                sendDimensions = dimensionsEdited || useAverageChosen,
                                dimensions = if (hasDimensions) draftScores else null,
                                reviewChanged = reviewChanged,
                                review = draftReview.trim(),
                            )
                            val result = runCatching { saveRating(book, draft) }
                                .getOrElse {
                                    RatingSaveResult(
                                        outcome = "failed",
                                        record = null,
                                        message = "The rating could not be saved.",
                                    )
                                }
                            isSaving = false
                            finishWith(result)
                        }
                    },
                ) { Text("Save") }
            }
            Spacer(Modifier.heightIn(min = 6.dp))
        }
    }
}
