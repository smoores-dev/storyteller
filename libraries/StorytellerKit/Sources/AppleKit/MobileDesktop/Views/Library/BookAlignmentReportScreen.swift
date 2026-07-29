#if os(iOS) || os(macOS)
import SwiftUI

enum AlignmentOverridesAssembly {
    // PATCH replaces stored overrides wholesale, so every save sends the full state;
    // the top-level maps stay present even when empty so clearing the last toggle
    // still wipes what the server has.
    static func assemble(
        markedOkChapters: [String: Bool],
        excludedChapters: [String: Bool],
        intendedUnalignedChapters: [String: Bool],
        excludedAudioFiles: [String: Bool],
    ) -> AlignmentOverrides {
        var chapters: [String: AlignmentOverrides.ChapterOverride] = [:]
        for (href, isOn) in markedOkChapters where isOn {
            chapters[href, default: AlignmentOverrides.ChapterOverride()].markedOk = true
        }
        for (href, isOn) in excludedChapters where isOn {
            chapters[href, default: AlignmentOverrides.ChapterOverride()].excludeFromScore = true
        }
        let unalignedChapters = intendedUnalignedChapters
            .filter(\.value)
            .mapValues { _ in AlignmentOverrides.UnalignedChapterOverride(intended: true) }
        let audioFiles = excludedAudioFiles
            .filter(\.value)
            .mapValues { _ in AlignmentOverrides.AudioFileOverride(excluded: true) }
        return AlignmentOverrides(
            chapters: chapters,
            unalignedChapters: unalignedChapters,
            audioFiles: audioFiles,
        )
    }
}

@MainActor
@Observable
final class BookAlignmentReportModel {
    private(set) var report: BookAlignmentReport?
    private(set) var isLoading = false
    private(set) var loadCompleted = false
    private(set) var isSaving = false
    var errorMessage: String?

    private(set) var chapterMarkedOk: [String: Bool] = [:]
    private(set) var chapterExcludedFromScore: [String: Bool] = [:]
    private(set) var unalignedChapterIntended: [String: Bool] = [:]
    private(set) var audioFileExcluded: [String: Bool] = [:]

    private var bookID: BookID?
    private var pendingSave = false
    private var saveLoopRunning = false

    func load(bookID: BookID) async {
        guard self.bookID != bookID else { return }
        self.bookID = bookID
        isLoading = true
        loadCompleted = false
        report = nil
        errorMessage = nil
        let fetched = await BookServiceActor.shared.fetchAlignmentReport(for: bookID)
        guard self.bookID == bookID else { return }
        report = fetched
        syncRowState(from: fetched)
        isLoading = false
        loadCompleted = true
    }

    func setMarkedOk(_ value: Bool, chapterHref: String) {
        chapterMarkedOk[chapterHref] = value
        scheduleSave()
    }

    func setExcludedFromScore(_ value: Bool, chapterHref: String) {
        chapterExcludedFromScore[chapterHref] = value
        scheduleSave()
    }

    func setIntended(_ value: Bool, unalignedChapterHref: String) {
        unalignedChapterIntended[unalignedChapterHref] = value
        scheduleSave()
    }

    func setExcluded(_ value: Bool, audioFilepath: String) {
        audioFileExcluded[audioFilepath] = value
        scheduleSave()
    }

    func assembleOverrides() -> AlignmentOverrides {
        AlignmentOverridesAssembly.assemble(
            markedOkChapters: chapterMarkedOk,
            excludedChapters: chapterExcludedFromScore,
            intendedUnalignedChapters: unalignedChapterIntended,
            excludedAudioFiles: audioFileExcluded,
        )
    }

    private func syncRowState(from report: BookAlignmentReport?) {
        chapterMarkedOk = [:]
        chapterExcludedFromScore = [:]
        unalignedChapterIntended = [:]
        audioFileExcluded = [:]
        guard let report else { return }
        for chapter in report.chapters {
            chapterMarkedOk[chapter.href] = chapter.markedOk
            chapterExcludedFromScore[chapter.href] = chapter.excludedFromScore
        }
        for chapter in report.unalignedChapters {
            unalignedChapterIntended[chapter.href] = chapter.intended
        }
        for audioFile in report.unalignedAudioFiles {
            audioFileExcluded[audioFile.filepath] = audioFile.excluded
        }
    }

    private func scheduleSave() {
        pendingSave = true
        guard !saveLoopRunning else { return }
        saveLoopRunning = true
        Task { await drainSaves() }
    }

    private func drainSaves() async {
        defer { saveLoopRunning = false }
        guard let bookID else {
            pendingSave = false
            return
        }
        while pendingSave {
            pendingSave = false
            try? await Task.sleep(for: .milliseconds(350))
            if pendingSave { continue }
            isSaving = true
            let succeeded = await BookServiceActor.shared.updateAlignmentOverrides(
                for: bookID,
                overrides: assembleOverrides(),
            )
            guard succeeded else {
                errorMessage = "Could not save changes to the server."
                isSaving = false
                continue
            }
            errorMessage = nil
            if pendingSave {
                isSaving = false
                continue
            }
            let refreshed = await BookServiceActor.shared.fetchAlignmentReport(for: bookID)
            if let refreshed, !pendingSave {
                report = refreshed
                syncRowState(from: refreshed)
            }
            isSaving = false
        }
    }
}

struct BookAlignmentReportScreen: View {
    let book: BookMetadata

    @State private var model = BookAlignmentReportModel()
    @State private var flaggedOnly = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            content
        }
        #if os(macOS)
        .frame(minWidth: 760, idealWidth: 920, minHeight: 520, idealHeight: 780)
        #endif
        .task(id: book.id) {
            await model.load(bookID: book.id)
            flaggedOnly = model.report?.chapters.contains(where: \.flagged) ?? false
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text("Alignment Report")
                    .font(.headline)
                Text(model.report?.bookTitle ?? book.title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            if model.isSaving {
                ProgressView()
                    .controlSize(.small)
            }
            Button("Done") {
                dismiss()
            }
            .keyboardShortcut(.defaultAction)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private var content: some View {
        if let report = model.report {
            reportList(report)
        } else if model.isLoading || !model.loadCompleted {
            ProgressView("Loading report…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ContentUnavailableView {
                Label("No alignment report", systemImage: "checkmark.seal")
            } description: {
                Text(
                    "This book has no alignment report, or the server does not support alignment quality."
                )
            }
        }
    }

    private func reportList(_ report: BookAlignmentReport) -> some View {
        List {
            Section {
                summaryHeader(report)
            }
            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            chaptersSection(report)
            if !report.unalignedChapters.isEmpty {
                Section("Unaligned Chapters") {
                    ForEach(report.unalignedChapters, id: \.href) { chapter in
                        unalignedChapterRow(chapter)
                    }
                }
            }
            if !report.unalignedAudioFiles.isEmpty {
                Section("Unaligned Audio") {
                    ForEach(report.unalignedAudioFiles, id: \.filepath) { audioFile in
                        unalignedAudioRow(audioFile)
                    }
                }
            }
        }
        #if os(macOS)
        .listStyle(.inset)
        #endif
    }

    private func chaptersSection(_ report: BookAlignmentReport) -> some View {
        let flaggedCount = report.chapters.count(where: \.flagged)
        let visibleChapters =
            flaggedOnly && flaggedCount > 0
            ? report.chapters.filter(\.flagged) : report.chapters
        return Section {
            ForEach(visibleChapters, id: \.href) { chapter in
                AlignmentChapterRow(
                    chapter: chapter,
                    markedOk: model.chapterMarkedOk[chapter.href] ?? chapter.markedOk,
                    excludedFromScore: model.chapterExcludedFromScore[chapter.href]
                        ?? chapter.excludedFromScore,
                    onToggleMarkedOk: { value in
                        model.setMarkedOk(value, chapterHref: chapter.href)
                    },
                    onToggleExcluded: { value in
                        model.setExcludedFromScore(value, chapterHref: chapter.href)
                    },
                )
            }
        } header: {
            HStack {
                Text("Chapters (\(visibleChapters.count) of \(report.chapters.count))")
                Spacer()
                if flaggedCount > 0 {
                    Toggle("Flagged Only", isOn: $flaggedOnly)
                        .font(.caption)
                        .toggleStyle(.switch)
                        .controlSize(.mini)
                        .fixedSize()
                }
            }
        }
    }

    private func summaryHeader(_ report: BookAlignmentReport) -> some View {
        let summary = report.summary
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                GradePill(grade: summary.grade)
                if let score = summary.score {
                    Text("\(score)%")
                        .font(.title3.weight(.semibold))
                        .monospacedDigit()
                }
                Spacer()
                if let created = formattedCreatedAt(report.createdAt) {
                    Text(created)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 108), alignment: .leading)],
                alignment: .leading,
                spacing: 8,
            ) {
                statCell(value: "\(summary.chapters)", label: "Chapters")
                statCell(value: "\(summary.missingSentences)", label: "Missing sentences")
                statCell(value: "\(summary.mutedChapters)", label: "Muted chapters")
                statCell(value: "\(summary.failedChapters)", label: "Failed chapters")
                statCell(value: "\(summary.unalignedAudio)", label: "Unaligned audio")
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(
                    "Audio aligned: \(formatDuration(report.alignedAudioDuration)) of \(formatDuration(report.totalAudioDuration))"
                )
                Text(
                    "Sentences aligned: \(report.alignedSentences) of \(report.totalSentences)"
                )
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .monospacedDigit()
        }
        .padding(.vertical, 4)
    }

    private func statCell(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value)
                .font(.callout.weight(.semibold))
                .monospacedDigit()
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func unalignedChapterRow(_ chapter: AlignmentUnalignedChapter) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(chapter.label)
                    .font(.callout)
                    .lineLimit(1)
                Spacer()
                Toggle(
                    "Intended",
                    isOn: Binding(
                        get: {
                            model.unalignedChapterIntended[chapter.href] ?? chapter.intended
                        },
                        set: { model.setIntended($0, unalignedChapterHref: chapter.href) },
                    ),
                )
                .font(.caption)
                .fixedSize()
            }
            Text(chapter.reason)
                .font(.caption)
                .foregroundStyle(.secondary)
            if let preview = chapter.preview, !preview.isEmpty {
                Text(preview)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
        }
        .padding(.vertical, 2)
    }

    private func unalignedAudioRow(_ audioFile: AlignmentUnalignedAudioFile) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(audioFile.title ?? audioFile.filepath)
                        .font(.callout)
                        .lineLimit(1)
                    if audioFile.title != nil {
                        Text(audioFile.filepath)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                    }
                }
                Spacer()
                if let duration = audioFile.duration {
                    Text(formatDuration(duration))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                Toggle(
                    "Excluded",
                    isOn: Binding(
                        get: {
                            model.audioFileExcluded[audioFile.filepath] ?? audioFile.excluded
                        },
                        set: { model.setExcluded($0, audioFilepath: audioFile.filepath) },
                    ),
                )
                .font(.caption)
                .fixedSize()
            }
            if let transcription = audioFile.transcription, !transcription.isEmpty {
                Text(transcription)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
        }
        .padding(.vertical, 2)
    }

    private func formattedCreatedAt(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        let isoWithFraction = ISO8601DateFormatter()
        isoWithFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let iso = ISO8601DateFormatter()
        guard let date = isoWithFraction.date(from: raw) ?? iso.date(from: raw) else {
            return raw
        }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

private func formatDuration(_ seconds: Double) -> String {
    guard seconds > 0 else { return "0m" }
    return BookMetadata.formatDuration(seconds: Int(seconds.rounded()))
}

private struct AlignmentChapterRow: View {
    let chapter: AlignmentReportChapter
    let markedOk: Bool
    let excludedFromScore: Bool
    let onToggleMarkedOk: (Bool) -> Void
    let onToggleExcluded: (Bool) -> Void

    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            expandedContexts
        } label: {
            rowLabel
        }
        .contextMenu {
            overrideToggles
        }
        #if os(iOS)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(markedOk ? "Unmark OK" : "Mark OK") {
                onToggleMarkedOk(!markedOk)
            }
            .tint(.green)
            Button(excludedFromScore ? "Include" : "Exclude") {
                onToggleExcluded(!excludedFromScore)
            }
            .tint(.orange)
        }
        #endif
    }

    @ViewBuilder
    private var overrideToggles: some View {
        Toggle(
            "Mark OK",
            isOn: Binding(get: { markedOk }, set: { onToggleMarkedOk($0) }),
        )
        Toggle(
            "Exclude from score",
            isOn: Binding(get: { excludedFromScore }, set: { onToggleExcluded($0) }),
        )
    }

    private var audioDuration: Double {
        chapter.audioFiles.reduce(0) { $0 + ($1.duration ?? 0) }
    }

    private var rowLabel: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Text(chapter.label)
                    .font(.callout)
                    .lineLimit(1)
                if markedOk {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
                if excludedFromScore {
                    Image(systemName: "minus.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
                Spacer(minLength: 6)
                if audioDuration > 0 {
                    Text(formatDuration(audioDuration))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                if chapter.delta != 0 {
                    Text("\(chapter.delta > 0 ? "+" : "")\(chapter.delta)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                Text("\(chapter.alignedSentenceCount)/\(chapter.chapterSentenceCount)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                Menu {
                    overrideToggles
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                #if os(macOS)
                .menuStyle(.borderlessButton)
                #endif
                .menuIndicator(.hidden)
                .fixedSize()
            }
            HStack(spacing: 6) {
                CoverageBar(coverage: chapter.coverage)
                ForEach(Array(chapter.flags.enumerated()), id: \.offset) { _, flag in
                    AlignmentFlagChip(flag: flag)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private var expandedContexts: some View {
        let first = MatchContextCard(
            title: "First Match",
            ebook: chapter.firstMatchedSentenceContext,
            transcript: chapter.transcriptionContext,
        )
        let last = MatchContextCard(
            title: "Last Match",
            ebook: chapter.lastMatchedSentenceContext,
            transcript: chapter.endTranscriptionContext,
        )
        return Group {
            #if os(macOS)
            HStack(alignment: .top, spacing: 10) {
                first
                last
            }
            #else
            VStack(alignment: .leading, spacing: 10) {
                first
                last
            }
            #endif
        }
        .padding(.vertical, 4)
    }
}

private struct MatchContextCard: View {
    let title: String
    let ebook: AlignmentSentenceContext?
    let transcript: AlignmentTranscriptionContext?

    private var transcriptText: String {
        [transcript?.before, transcript?.after]
            .compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
    }

    var body: some View {
        let highlighted = MatchHighlight(
            matched: ebook?.matchedSentence ?? "",
            transcript: transcriptText,
        )
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.quaternary.opacity(0.5))
            VStack(alignment: .leading, spacing: 4) {
                Label("Ebook", systemImage: "book")
                    .font(.caption2.weight(.medium))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                ebookText(highlighted)
                    .font(.caption)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            Divider()
            VStack(alignment: .leading, spacing: 4) {
                Label("Transcript", systemImage: "headphones")
                    .font(.caption2.weight(.medium))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(highlighted.transcript)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 6))
        .overlay {
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(.separator, lineWidth: 1)
        }
    }

    private func ebookText(_ highlighted: MatchHighlight) -> Text {
        var text = Text("")
        if let prev = ebook?.prevSentence, !prev.isEmpty {
            text = text + Text("\(prev) ").foregroundStyle(.tertiary)
        }
        text = text + Text(highlighted.ebook)
        if let next = ebook?.nextSentence, !next.isEmpty {
            text = text + Text(" \(next)").foregroundStyle(.tertiary)
        }
        return text
    }
}

// Rebuilds both texts from whitespace tokens (like the web) and highlights the longest
// shared word run in each so the eye can pair the ebook sentence with the transcript.
private struct MatchHighlight {
    let ebook: AttributedString
    let transcript: AttributedString

    init(matched: String, transcript transcriptRaw: String) {
        let ebookTokens = AlignmentMatchOverlap.tokenize(matched)
        let transcriptTokens = AlignmentMatchOverlap.tokenize(transcriptRaw)
        let run = AlignmentMatchOverlap.longestCommonRun(ebookTokens, transcriptTokens)
        ebook = Self.joined(
            ebookTokens,
            highlighting: run.map { $0.aStart..<($0.aStart + $0.length) },
        )
        transcript = Self.joined(
            transcriptTokens,
            highlighting: run.map { $0.bStart..<($0.bStart + $0.length) },
        )
    }

    private static func joined(
        _ tokens: [String],
        highlighting range: Range<Int>?,
    ) -> AttributedString {
        var result = AttributedString()
        for (index, token) in tokens.enumerated() {
            var piece = AttributedString(token)
            if let range, range.contains(index) {
                piece.backgroundColor = .yellow.opacity(0.35)
            }
            result += piece
            if index < tokens.count - 1 {
                var space = AttributedString(" ")
                if let range, range.contains(index), range.contains(index + 1) {
                    space.backgroundColor = .yellow.opacity(0.35)
                }
                result += space
            }
        }
        return result
    }
}

private struct CoverageBar: View {
    let coverage: Double?

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.secondary.opacity(0.2))
                if let coverage {
                    Capsule()
                        .fill(tint)
                        .frame(width: max(4, proxy.size.width * min(max(coverage, 0), 1)))
                }
            }
        }
        .frame(height: 5)
        .frame(maxWidth: .infinity)
    }

    private var tint: Color {
        guard let coverage else { return .secondary }
        if coverage >= 0.98 { return .green }
        if coverage >= 0.9 { return .orange }
        return .red
    }
}

private struct AlignmentFlagChip: View {
    let flag: AlignmentReportFlag

    var body: some View {
        Text(flag.label)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .foregroundStyle(color)
            .background(color.opacity(0.14), in: Capsule())
            .lineLimit(1)
    }

    private var color: Color {
        switch flag.tone {
            case "poor": .red
            case "moderate": .orange
            case "good": .green
            default: .secondary
        }
    }
}

#endif
