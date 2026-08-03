package dev.smoores.storyteller.ui

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.AlignmentOverrideState
import dev.smoores.storyteller.model.AlignmentReportChapter
import dev.smoores.storyteller.model.AlignmentSentenceContext
import dev.smoores.storyteller.model.AlignmentTranscriptionContext
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.BookAlignmentReport
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.drop

// Kotlin port of Kit's AlignmentGradeScale ordering and coloring.
internal object AlignmentGrades {
    private val orderedGrades = listOf("A+", "A", "A-", "B", "B-", "C", "D", "F")

    // Unknown grades rank 0 so worst-first ordering surfaces them.
    fun rank(grade: String): Int {
        val index = orderedGrades.indexOf(grade)
        return if (index == -1) 0 else orderedGrades.size - index
    }

    fun orderedFacets(counts: Map<String, Int>): List<Pair<String, Int>> {
        val known = orderedGrades.mapNotNull { grade ->
            counts[grade]?.takeIf { it > 0 }?.let { grade to it }
        }
        val extras = counts
            .filterKeys { it !in orderedGrades }
            .filterValues { it > 0 }
            .toList()
            .sortedBy { it.first }
        return known + extras
    }

    fun worstFirst(books: List<Book>): List<Book> = books
        .filter { it.alignmentSummary != null }
        .sortedWith(
            compareBy<Book> { rank(it.alignmentSummary?.grade ?: "") }
                .thenBy { it.sortTitle.lowercase() },
        )

    fun color(grade: String): Color = when (grade.firstOrNull()) {
        'A' -> Color(0xff4caf50)
        'B' -> Color(0xffffc107)
        'C', 'D' -> Color(0xffff9800)
        'F' -> Color(0xfff44336)
        else -> Color(0xff9e9e9e)
    }
}

// Kotlin port of Kit's AlignmentMatchOverlap: longest common contiguous run of
// normalized word tokens, used to highlight the overlap between ebook and transcript.
internal object AlignmentMatch {
    data class TokenRun(val aStart: Int, val bStart: Int, val length: Int)

    fun tokenize(text: String): List<String> =
        text.split(Regex("\\s+")).filter { it.isNotEmpty() }

    private fun normalize(token: String): String =
        token.lowercase().filter { it.isLetterOrDigit() }

    fun longestCommonRun(a: List<String>, b: List<String>): TokenRun? {
        val na = a.map(::normalize)
        val nb = b.map(::normalize)
        if (na.isEmpty() || nb.isEmpty()) return null
        var best = TokenRun(0, 0, 0)
        var prevRow = IntArray(nb.size + 1)
        for (i in 1..na.size) {
            val curRow = IntArray(nb.size + 1)
            for (j in 1..nb.size) {
                if (na[i - 1].isNotEmpty() && na[i - 1] == nb[j - 1]) {
                    val run = prevRow[j - 1] + 1
                    curRow[j] = run
                    if (run > best.length) best = TokenRun(i - run, j - run, run)
                }
            }
            prevRow = curRow
        }
        return best.takeIf { it.length >= 2 }
    }

    fun highlighted(
        tokens: List<String>,
        range: IntRange?,
        highlight: Color,
    ): AnnotatedString = buildAnnotatedString {
        tokens.forEachIndexed { index, token ->
            if (index > 0) append(" ")
            if (range != null && index in range) {
                withStyle(SpanStyle(background = highlight)) { append(token) }
            } else {
                append(token)
            }
        }
    }
}

internal fun grade(book: Book): String = book.alignmentSummary?.grade ?: ""

@Composable
internal fun GradePill(grade: String) {
    val color = AlignmentGrades.color(grade)
    Text(
        grade,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Bold,
        color = color,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.16f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
internal fun BookReportsScreen(
    books: List<Book>,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    loadReport: suspend (Book) -> BookAlignmentReport,
    saveOverrides: suspend (Book, AlignmentOverrideState) -> Boolean,
    modifier: Modifier = Modifier,
) {
    var searchText by remember { mutableStateOf("") }
    var gradeFilter by remember { mutableStateOf<String?>(null) }
    var reportBook by remember { mutableStateOf<Book?>(null) }

    val graded = remember(books) { AlignmentGrades.worstFirst(books) }
    val facets = remember(graded) {
        AlignmentGrades.orderedFacets(graded.groupingBy(::grade).eachCount())
    }
    val visible = graded.filter { book ->
        (gradeFilter == null || grade(book) == gradeFilter) &&
            (searchText.isBlank() || book.title.contains(searchText.trim(), ignoreCase = true))
    }

    reportBook?.let { book ->
        BookAlignmentReportScreen(
            book = book,
            loadReport = loadReport,
            saveOverrides = saveOverrides,
            navigateBack = { reportBook = null },
            modifier = modifier,
        )
        return
    }

    Column(modifier.fillMaxSize()) {
        OutlinedTextField(
            value = searchText,
            onValueChange = { searchText = it },
            label = { Text("Search reports") },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 4.dp),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = gradeFilter == null,
                onClick = { gradeFilter = null },
                label = { Text("All Graded (${graded.size})") },
            )
            facets.forEach { (facetGrade, count) ->
                FilterChip(
                    selected = gradeFilter == facetGrade,
                    onClick = {
                        gradeFilter = if (gradeFilter == facetGrade) null else facetGrade
                    },
                    label = { Text("$facetGrade ($count)") },
                    leadingIcon = {
                        Box(
                            Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(AlignmentGrades.color(facetGrade)),
                        )
                    },
                )
            }
        }
        if (visible.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    "No alignment reports",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn {
                items(visible, key = Book::id) { book ->
                    BookReportRow(
                        book = book,
                        coverRevision = coverRevision,
                        cover = cover,
                        cachedCover = cachedCover,
                        open = { reportBook = book },
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun BookReportRow(
    book: Book,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> Bitmap?,
    cachedCover: (Book, Boolean) -> Bitmap?,
    open: () -> Unit,
) {
    val summary = book.alignmentSummary ?: return
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = open)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        BookCover(
            book = book,
            width = 96,
            height = 144,
            revision = coverRevision,
            load = cover,
            cached = cachedCover,
            modifier = Modifier.width(44.dp).height(60.dp),
            showsPanel = false,
            layersMedia = false,
            showsReadaloudBadge = false,
        )
        Column(Modifier.weight(1f)) {
            Text(
                book.title,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
            )
            if (book.authors.isNotBlank()) {
                Text(
                    book.authors,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
            Text(
                buildList {
                    if (summary.missingSentences > 0) add("${summary.missingSentences} missing")
                    if (summary.mutedChapters > 0) add("${summary.mutedChapters} muted")
                    summary.score?.let { add("$it%") }
                }.joinToString(" \u00B7 "),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        GradePill(summary.grade)
        Icon(
            Icons.Default.ChevronRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@OptIn(FlowPreview::class)
@Composable
internal fun BookAlignmentReportScreen(
    book: Book,
    loadReport: suspend (Book) -> BookAlignmentReport,
    saveOverrides: suspend (Book, AlignmentOverrideState) -> Boolean,
    navigateBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var report by remember(book.id) { mutableStateOf<BookAlignmentReport?>(null) }
    var loadFailed by remember(book.id) { mutableStateOf(false) }
    var markedOk by remember(book.id) { mutableStateOf(mapOf<String, Boolean>()) }
    var excluded by remember(book.id) { mutableStateOf(mapOf<String, Boolean>()) }
    var intended by remember(book.id) { mutableStateOf(mapOf<String, Boolean>()) }
    var audioExcluded by remember(book.id) { mutableStateOf(mapOf<String, Boolean>()) }
    var overrideRevision by remember(book.id) { mutableStateOf(0) }
    var isSaving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    var flaggedOnly by remember(book.id) { mutableStateOf(false) }

    LaunchedEffect(book.id) {
        val loaded = runCatching { loadReport(book) }.getOrNull()
        if (loaded == null) {
            loadFailed = true
            return@LaunchedEffect
        }
        report = loaded
        markedOk = loaded.chapters.associate { it.href to it.markedOk }
        excluded = loaded.chapters.associate { it.href to it.excludedFromScore }
        intended = loaded.unalignedChapters.associate { it.href to it.intended }
        audioExcluded = loaded.unalignedAudioFiles.associate { it.filepath to it.excluded }
        flaggedOnly = loaded.chapters.any { it.flagged }
    }

    // Debounced autosave matching the iOS 350 ms save loop; refetch after each save
    // so recomputed scores come back.
    LaunchedEffect(book.id) {
        snapshotFlow { overrideRevision }
            .drop(1)
            .debounce(350)
            .collect {
                isSaving = true
                saveError = null
                val success = runCatching {
                    saveOverrides(
                        book,
                        AlignmentOverrideState(
                            markedOkChapters = markedOk,
                            excludedChapters = excluded,
                            intendedUnalignedChapters = intended,
                            excludedAudioFiles = audioExcluded,
                        ),
                    )
                }.getOrDefault(false)
                if (success) {
                    runCatching { loadReport(book) }.getOrNull()?.let { report = it }
                } else {
                    saveError = "Could not save changes to the server."
                }
                isSaving = false
            }
    }

    Column(
        modifier
            .fillMaxSize()
            .padding(horizontal = 12.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
        ) {
            Text(
                book.title,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            if (isSaving) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
            }
            Text(
                "Done",
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .padding(start = 12.dp)
                    .clickable(onClick = navigateBack),
            )
        }
        val current = report
        when {
            loadFailed -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    "The alignment report could not be loaded.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            current == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { SummaryCard(current, saveError) }
                item {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        val chapterTotal = current.chapters.size
                        val shown = current.chapters.count { !flaggedOnly || it.flagged }
                        Text(
                            "Chapters ($shown of $chapterTotal)",
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            "Flagged Only",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Switch(
                            checked = flaggedOnly,
                            onCheckedChange = { flaggedOnly = it },
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
                items(
                    current.chapters.filter { !flaggedOnly || it.flagged },
                    key = AlignmentReportChapter::href,
                ) { chapter ->
                    ChapterRow(
                        chapter = chapter,
                        markedOk = markedOk[chapter.href] == true,
                        excludedFromScore = excluded[chapter.href] == true,
                        setMarkedOk = {
                            markedOk = markedOk + (chapter.href to it)
                            overrideRevision += 1
                        },
                        setExcluded = {
                            excluded = excluded + (chapter.href to it)
                            overrideRevision += 1
                        },
                    )
                }
                if (current.unalignedChapters.isNotEmpty()) {
                    item {
                        Text(
                            "Unaligned Chapters",
                            style = MaterialTheme.typography.titleSmall,
                        )
                    }
                    items(
                        current.unalignedChapters,
                        key = { "unaligned-${it.href}" },
                    ) { chapter ->
                        Column(Modifier.fillMaxWidth()) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        chapter.label,
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                    Text(
                                        chapter.reason,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    chapter.preview?.takeIf { it.isNotBlank() }?.let {
                                        Text(
                                            it,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 2,
                                        )
                                    }
                                }
                                Text(
                                    "Intended",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Switch(
                                    checked = intended[chapter.href] == true,
                                    onCheckedChange = {
                                        intended = intended + (chapter.href to it)
                                        overrideRevision += 1
                                    },
                                    modifier = Modifier.padding(start = 8.dp),
                                )
                            }
                        }
                    }
                }
                if (current.unalignedAudioFiles.isNotEmpty()) {
                    item {
                        Text(
                            "Unaligned Audio",
                            style = MaterialTheme.typography.titleSmall,
                        )
                    }
                    items(
                        current.unalignedAudioFiles,
                        key = { "audio-${it.filepath}" },
                    ) { file ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    file.title ?: file.filepath,
                                    style = MaterialTheme.typography.bodyMedium,
                                    maxLines = 1,
                                )
                                buildList {
                                    file.duration?.let { add(formatDuration(it)) }
                                    file.transcription?.takeIf { it.isNotBlank() }
                                        ?.let { add(it) }
                                }.joinToString(" \u00B7 ").takeIf { it.isNotEmpty() }?.let {
                                    Text(
                                        it,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 2,
                                    )
                                }
                            }
                            Text(
                                "Excluded",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Switch(
                                checked = audioExcluded[file.filepath] == true,
                                onCheckedChange = {
                                    audioExcluded = audioExcluded + (file.filepath to it)
                                    overrideRevision += 1
                                },
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryCard(report: BookAlignmentReport, saveError: String?) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        tonalElevation = 2.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                GradePill(report.summary.grade)
                report.summary.score?.let {
                    Text("$it%", style = MaterialTheme.typography.titleMedium)
                }
                Spacer(Modifier.weight(1f))
                report.createdAt?.let {
                    Text(
                        it.take(10),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Stat("Chapters", report.summary.chapters.toString())
                Stat("Missing", report.summary.missingSentences.toString())
                Stat("Muted", report.summary.mutedChapters.toString())
                Stat("Failed", report.summary.failedChapters.toString())
                Stat("Unaligned", report.summary.unalignedAudio.toString())
            }
            Text(
                "Audio aligned ${formatDuration(report.alignedAudioDuration)} of " +
                    "${formatDuration(report.totalAudioDuration)} · Sentences aligned " +
                    "${report.alignedSentences} of ${report.totalSentences}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            saveError?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun Stat(label: String, value: String) {
    Column {
        Text(value, style = MaterialTheme.typography.titleSmall)
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ChapterRow(
    chapter: AlignmentReportChapter,
    markedOk: Boolean,
    excludedFromScore: Boolean,
    setMarkedOk: (Boolean) -> Unit,
    setExcluded: (Boolean) -> Unit,
) {
    var expanded by remember(chapter.href) { mutableStateOf(false) }
    Surface(
        shape = RoundedCornerShape(10.dp),
        tonalElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { expanded = !expanded },
            ) {
                Icon(
                    if (expanded) Icons.Default.ExpandMore else Icons.Default.ChevronRight,
                    contentDescription = if (expanded) "Collapse" else "Expand",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    chapter.label,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = 4.dp),
                )
                if (markedOk) {
                    Text(
                        "OK",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xff4caf50),
                        modifier = Modifier.padding(end = 6.dp),
                    )
                }
                if (excludedFromScore) {
                    Text(
                        "Muted",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(end = 6.dp),
                    )
                }
                Text(
                    "${chapter.alignedSentenceCount}/${chapter.chapterSentenceCount}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            chapter.coverage?.let { coverage ->
                CoverageBar(coverage)
            }
            if (chapter.flags.isNotEmpty()) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                ) {
                    chapter.flags.forEach { flag ->
                        val tone = when (flag.tone) {
                            "poor" -> MaterialTheme.colorScheme.error
                            "moderate" -> Color(0xffff9800)
                            else -> Color(0xff4caf50)
                        }
                        Text(
                            flag.label,
                            style = MaterialTheme.typography.labelSmall,
                            color = tone,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(tone.copy(alpha = 0.14f))
                                .padding(horizontal = 7.dp, vertical = 2.dp),
                        )
                    }
                }
            }
            if (expanded) {
                MatchContextCard(
                    title = "First Match",
                    ebook = chapter.firstMatchedSentenceContext,
                    transcript = chapter.transcriptionContext,
                )
                MatchContextCard(
                    title = "Last Match",
                    ebook = chapter.lastMatchedSentenceContext,
                    transcript = chapter.endTranscriptionContext,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Mark OK",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(checked = markedOk, onCheckedChange = setMarkedOk)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Exclude from score",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(checked = excludedFromScore, onCheckedChange = setExcluded)
                }
            }
        }
    }
}

@Composable
private fun CoverageBar(coverage: Double) {
    val fraction = coverage.coerceIn(0.0, 1.0).toFloat()
    val color = when {
        fraction >= 0.98f -> Color(0xff4caf50)
        fraction >= 0.90f -> Color(0xffff9800)
        else -> Color(0xfff44336)
    }
    Box(
        Modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Box(
            Modifier
                .fillMaxWidth(fraction)
                .height(4.dp)
                .background(color),
        )
    }
}

@Composable
private fun MatchContextCard(
    title: String,
    ebook: AlignmentSentenceContext?,
    transcript: AlignmentTranscriptionContext?,
) {
    if (ebook == null && transcript == null) return
    val transcriptText = listOfNotNull(transcript?.before, transcript?.after)
        .joinToString(" ")
        .trim()
    val matched = ebook?.matchedSentence ?: ""
    val ebookTokens = AlignmentMatch.tokenize(matched)
    val transcriptTokens = AlignmentMatch.tokenize(transcriptText)
    val run = AlignmentMatch.longestCommonRun(ebookTokens, transcriptTokens)
    val highlight = Color(0xffffeb3b).copy(alpha = 0.45f)

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            title,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (ebookTokens.isNotEmpty()) {
            Text("Ebook", style = MaterialTheme.typography.labelSmall)
            Text(
                buildAnnotatedString {
                    ebook?.prevSentence?.takeIf { it.isNotEmpty() }?.let {
                        withStyle(
                            SpanStyle(color = MaterialTheme.colorScheme.onSurfaceVariant),
                        ) { append("$it ") }
                    }
                    append(
                        AlignmentMatch.highlighted(
                            ebookTokens,
                            run?.let { it.aStart until it.aStart + it.length },
                            highlight,
                        ),
                    )
                    ebook?.nextSentence?.takeIf { it.isNotEmpty() }?.let {
                        withStyle(
                            SpanStyle(color = MaterialTheme.colorScheme.onSurfaceVariant),
                        ) { append(" $it") }
                    }
                },
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (transcriptTokens.isNotEmpty()) {
            Text("Transcript", style = MaterialTheme.typography.labelSmall)
            Text(
                AlignmentMatch.highlighted(
                    transcriptTokens,
                    run?.let { it.bStart until it.bStart + it.length },
                    highlight,
                ),
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

internal fun formatDuration(seconds: Double): String {
    val total = seconds.toInt()
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    return if (hours > 0) "${hours}h ${minutes}m" else "${minutes}m"
}
