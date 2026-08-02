#if os(iOS) || os(macOS)
import SwiftUI

#if os(macOS)
import AppKit
#endif

public enum ReadingMode: Equatable, Sendable {
    case ebook
    case audiobook
    case readaloud
}

public struct ReadingSidebarView: View {
    public struct Model: Equatable {
        public var title: String
        public var author: String
        public var chapterTitle: String
        public var coverArt: Image?
        public var ebookCoverArt: Image?
        public var chapterDuration: TimeInterval
        public var totalRemaining: TimeInterval
        public var playbackRate: Double
        public var volume: Double
        public var isPlaying: Bool
        public var sleepTimerActive: Bool
        public var sleepTimerRemaining: TimeInterval?
        public var sleepTimerType: SleepTimerType?

        public init(
            title: String,
            author: String,
            chapterTitle: String,
            coverArt: Image?,
            ebookCoverArt: Image? = nil,
            chapterDuration: TimeInterval,
            totalRemaining: TimeInterval,
            playbackRate: Double,
            volume: Double = 1.0,
            isPlaying: Bool,
            sleepTimerActive: Bool = false,
            sleepTimerRemaining: TimeInterval? = nil,
            sleepTimerType: SleepTimerType? = nil,
        ) {
            self.title = title
            self.author = author
            self.chapterTitle = chapterTitle
            self.coverArt = coverArt
            self.ebookCoverArt = ebookCoverArt
            self.chapterDuration = chapterDuration
            self.totalRemaining = totalRemaining
            self.playbackRate = playbackRate
            self.volume = volume
            self.isPlaying = isPlaying
            self.sleepTimerActive = sleepTimerActive
            self.sleepTimerRemaining = sleepTimerRemaining
            self.sleepTimerType = sleepTimerType
        }
    }

    private let bookData: PlayerBookData?
    private let model: Model
    private let mode: ReadingMode
    private let foregroundColor: Color?
    private let progressData: ProgressData?
    @Binding private var chapterProgress: Double
    private let chapters: [ChapterItem]
    private let onChapterSelected: (ChapterItem) -> Void
    private let onProgressSeek: ((Double) -> Void)?
    private let seekWhileDragging: Bool

    @State private var showVolumePopover = false
    @State private var showSleepTimerPopover = false
    @State private var currentPlayerHeight: CGFloat = 800
    @State private var isDraggingSlider = false
    @State private var draggedSliderValue: Double = 0.0
    @State private var seekDebounceUntil: Date?
    @AppStorage("showEbookCoverInAudioView") private var showEbookCover = false

    private let onPrevChapter: () -> Void
    private let onSkipBackward: () -> Void
    private let onPlayPause: () -> Void
    private let onSkipForward: () -> Void
    private let onNextChapter: () -> Void
    private let onPlaybackRateChange: (Double) -> Void
    private let onVolumeChange: (Double) -> Void
    private let onSleepTimerStart: (TimeInterval?, SleepTimerType) -> Void
    private let onSleepTimerCancel: () -> Void

    public init(
        bookData: PlayerBookData?,
        model: Model,
        mode: ReadingMode = .readaloud,
        foregroundColor: Color? = nil,
        chapterProgress: Binding<Double>,
        chapters: [ChapterItem] = [],
        progressData: ProgressData? = nil,
        onChapterSelected: @escaping (ChapterItem) -> Void = { _ in },
        onPrevChapter: @escaping () -> Void = {},
        onSkipBackward: @escaping () -> Void = {},
        onPlayPause: @escaping () -> Void = {},
        onSkipForward: @escaping () -> Void = {},
        onNextChapter: @escaping () -> Void = {},
        onPlaybackRateChange: @escaping (Double) -> Void = { _ in },
        onVolumeChange: @escaping (Double) -> Void = { _ in },
        onSleepTimerStart: @escaping (TimeInterval?, SleepTimerType) -> Void = { _, _ in },
        onSleepTimerCancel: @escaping () -> Void = {},
        onProgressSeek: ((Double) -> Void)? = nil,
        seekWhileDragging: Bool = true,
    ) {
        self.bookData = bookData
        self.model = model
        self.mode = mode
        self.foregroundColor = foregroundColor
        self.progressData = progressData
        _chapterProgress = chapterProgress
        self.chapters = chapters
        self.onChapterSelected = onChapterSelected
        self.onPrevChapter = onPrevChapter
        self.onSkipBackward = onSkipBackward
        self.onPlayPause = onPlayPause
        self.onSkipForward = onSkipForward
        self.onNextChapter = onNextChapter
        self.onPlaybackRateChange = onPlaybackRateChange
        self.onVolumeChange = onVolumeChange
        self.onSleepTimerStart = onSleepTimerStart
        self.onSleepTimerCancel = onSleepTimerCancel
        self.onProgressSeek = onProgressSeek
        self.seekWhileDragging = seekWhileDragging
    }

    public var body: some View {
        VStack(spacing: 28) {
            metadataSection
            progressSection
            if mode != .ebook {
                transportControls
            }
            statsSection
            secondaryControls
        }
        .padding(.top, 2)
        .padding(.bottom, 25)
        .frame(minHeight: 400)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(backgroundColor)
        .onGeometryChange(for: CGFloat.self) { proxy in
            proxy.size.height
        } action: { height in
            currentPlayerHeight = height
            debugLog("[ReadingSidebarView] Height changed to \(height)")
        }
    }

    private var coverScale: CGFloat? {
        let upperThreshold: CGFloat = 800
        let lowerThreshold: CGFloat = 450

        if currentPlayerHeight >= upperThreshold {
            return 1.0
        } else if currentPlayerHeight <= lowerThreshold {
            return nil
        } else {
            let range = upperThreshold - lowerThreshold
            let position = currentPlayerHeight - lowerThreshold
            let fraction = position / range
            return 0.15 + (0.85 * fraction)
        }
    }

    private var isSquareCover: Bool {
        bookData?.metadata.hasAvailableAudiobook == true
    }

    private var displayedCover: Image? {
        if showEbookCover, let ebookCover = model.ebookCoverArt {
            return ebookCover
        }
        return model.coverArt ?? model.ebookCoverArt
    }

    private var canToggleCover: Bool {
        model.coverArt != nil && model.ebookCoverArt != nil
    }

    private var metadataSection: some View {
        VStack(spacing: 12) {
            if let coverArt = displayedCover, let scale = coverScale {
                let cornerRadius = max(8.0, 12.0 * scale)
                let coverView = Group {
                    if isSquareCover && !showEbookCover {
                        coverArt
                            .resizable()
                            .aspectRatio(1, contentMode: .fit)
                            .clipShape(
                                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            )
                            .shadow(radius: 8)
                            .frame(maxWidth: .infinity, alignment: .center)
                    } else if isSquareCover && showEbookCover {
                        Color.clear
                            .aspectRatio(1, contentMode: .fit)
                            .frame(maxWidth: .infinity)
                            .overlay {
                                coverArt
                                    .resizable()
                                    .aspectRatio(contentMode: .fit)
                                    .clipShape(
                                        RoundedRectangle(
                                            cornerRadius: cornerRadius,
                                            style: .continuous,
                                        )
                                    )
                                    .shadow(radius: 8)
                            }
                    } else {
                        coverArt
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 180 * scale, height: 180 * scale)
                            .clipShape(
                                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            )
                            .shadow(radius: 8 * scale)
                    }
                }

                if canToggleCover {
                    coverView
                        .contentShape(Rectangle())
                        .onTapGesture {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                showEbookCover.toggle()
                            }
                        }
                } else {
                    coverView
                }
            }

            VStack(spacing: 8) {
                Text(model.title)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(primaryColor)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)

                Text(model.author)
                    .font(.headline)
                    .foregroundStyle(secondaryColor)
                    .multilineTextAlignment(.center)

                Text(model.chapterTitle)
                    .font(.subheadline)
                    .foregroundStyle(secondaryColor)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 20)
    }

    private var progressSection: some View {
        let sliderBinding = Binding(
            get: {
                if isDraggingSlider {
                    return draggedSliderValue
                }

                if let debounceUntil = seekDebounceUntil, Date() < debounceUntil {
                    return draggedSliderValue
                }

                return min(max(chapterProgress, 0), 1)
            },
            set: { newValue in
                let clampedValue = min(max(newValue, 0), 1)
                isDraggingSlider = true
                draggedSliderValue = clampedValue
                if seekWhileDragging {
                    onProgressSeek?(clampedValue)
                }
            },
        )

        let chapterElapsedRaw =
            normalizedSeconds(progressData?.chapterCurrentSecondsAudio) ?? elapsedTime
        let baseChapterTotalRaw =
            normalizedSeconds(progressData?.chapterTotalSecondsAudio) ?? model.chapterDuration
        let chapterTotalRaw = max(baseChapterTotalRaw, chapterElapsedRaw)

        let rate = max(model.playbackRate, 0.01)
        let chapterElapsed = chapterElapsedRaw / rate
        let chapterTotal = chapterTotalRaw / rate
        let rawRemaining = max(chapterTotal - chapterElapsed, 0)
        let chapterRemainingAtRate = timeRemaining(
            atRate: model.playbackRate,
            total: chapterTotalRaw,
            elapsed: chapterElapsedRaw,
        )

        return VStack(alignment: .leading, spacing: 16) {
            Slider(
                value: sliderBinding,
                in: 0...1,
                onEditingChanged: { editing in
                    isDraggingSlider = editing
                    if editing {
                        seekDebounceUntil = nil
                        draggedSliderValue = min(max(chapterProgress, 0), 1)
                    } else {
                        seekDebounceUntil = Date().addingTimeInterval(0.5)
                        if !seekWhileDragging {
                            onProgressSeek?(draggedSliderValue)
                        }
                    }
                },
            )
            .tint(primaryColor)

            HStack {
                Text(formatOptionalTime(chapterElapsed))
                Spacer()
                Text(
                    "-\(formatOptionalTime(chapterRemainingAtRate ?? rawRemaining)) (\(playbackRateDescription))"
                )
                .font(.footnote)
                .foregroundStyle(secondaryColor)
                Spacer()
                Text(formatOptionalTime(chapterTotal))
            }
            .font(.footnote.monospacedDigit())
            .foregroundStyle(secondaryColor)
        }
        .padding(.horizontal, 20)
    }

    private var transportControls: some View {
        HStack(spacing: 8) {
            Button(action: onPrevChapter) {
                Image(systemName: "backward.end.fill")
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
                    .background(
                        Circle()
                            .stroke(secondaryColor.opacity(0.3), lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
            .help("Restart chapter / Previous chapter")

            Button(action: onSkipBackward) {
                Image(systemName: "arrow.counterclockwise.circle")
                    .font(.largeTitle)
                    .frame(width: 54, height: 54)
                    .contentShape(Circle())
                    .background(
                        Circle()
                            .stroke(secondaryColor.opacity(0.3), lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
            .help("Previous sentence")

            Button(action: onPlayPause) {
                Image(systemName: model.isPlaying ? "pause.fill" : "play.fill")
                    .font(.title)
                    .foregroundStyle(primaryColor)
                    .frame(width: 72, height: 72)
                    .contentShape(Circle())
                    .background(Circle().fill(secondaryColor.opacity(0.2)))
            }
            .buttonStyle(.plain)
            .help("Play/pause")

            Button(action: onSkipForward) {
                Image(systemName: "arrow.clockwise.circle")
                    .font(.largeTitle)
                    .frame(width: 54, height: 54)
                    .contentShape(Circle())
                    .background(
                        Circle()
                            .stroke(secondaryColor.opacity(0.3), lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
            .help("Next sentence")

            Button(action: onNextChapter) {
                Image(systemName: "forward.end.fill")
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
                    .background(
                        Circle()
                            .stroke(secondaryColor.opacity(0.3), lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
            .help("Next chapter")
        }
        .foregroundStyle(primaryColor)
        .padding(.horizontal, 20)
    }

    private var secondaryControls: some View {
        HStack(spacing: 32) {
            if mode != .ebook {
                PlaybackRateButton(
                    currentRate: model.playbackRate,
                    onRateChange: onPlaybackRateChange,
                    backgroundColor: secondaryColor,
                    foregroundColor: primaryColor,
                    transparency: 1.0,
                    showLabel: true,
                )
            }

            ChaptersButton(
                chapters: chapters,
                selectedChapterId: progressData?.chapterId
                    ?? progressData?.chapterLabel.flatMap { label in
                        chapters.first(where: { $0.label == label })?.id
                    },
                onChapterSelected: onChapterSelected,
                backgroundColor: secondaryColor,
                foregroundColor: primaryColor,
                transparency: 1.0,
                showLabel: true,
            )

            if mode != .ebook {
                #if os(macOS)
                VStack(spacing: 6) {
                    Button(action: { showVolumePopover = true }) {
                        Image(systemName: volumeIcon)
                            .font(.callout.weight(.semibold))
                            .foregroundStyle(primaryColor)
                            .frame(width: 38, height: 38)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(secondaryColor.opacity(0.12))
                            )
                    }
                    .buttonStyle(.plain)
                    .popover(isPresented: $showVolumePopover) {
                        volumePopover
                            .frame(minWidth: 200, maxWidth: 240)
                    }

                    Text("\(Int(model.volume * 100))%")
                        .font(.footnote)
                        .foregroundStyle(secondaryColor)
                }
                #endif

                sleepTimerButton
            }
        }
        .padding(.horizontal, 20)
    }

    @ViewBuilder
    private var statsSection: some View {
        let data = progressData
        let bookFraction = data.flatMap { d in
            normalizedFraction(d.bookCurrentFraction)
                ?? bookAudioFraction(
                    current: d.bookCurrentSecondsAudio,
                    total: d.bookTotalSecondsAudio,
                )
        }
        let pagesCurrent = data.flatMap { normalizedCurrentPage($0.chapterCurrentPage) }
        let pagesTotal = data.flatMap { normalizedTotalPage($0.chapterTotalPages) }
        let bookElapsedRaw = data.flatMap { normalizedSeconds($0.bookCurrentSecondsAudio) }
        let bookTotalRaw = data.flatMap { normalizedSeconds($0.bookTotalSecondsAudio) }
        let chapterElapsedRaw = data.flatMap { normalizedSeconds($0.chapterCurrentSecondsAudio) }
        let chapterTotalRaw = data.flatMap { normalizedSeconds($0.chapterTotalSecondsAudio) }

        let bookRemaining = timeRemaining(
            atRate: model.playbackRate,
            total: bookTotalRaw,
            elapsed: bookElapsedRaw,
        )
        let chapterRemaining = timeRemaining(
            atRate: model.playbackRate,
            total: chapterTotalRaw,
            elapsed: chapterElapsedRaw,
        )

        let hasLeftStats =
            bookFraction != nil || (pagesCurrent != nil && pagesTotal != nil && pagesTotal! > 0)
        let hasRightStats = mode != .ebook

        if hasLeftStats || hasRightStats {
            HStack(alignment: .top) {
                leftStatsColumn(
                    bookFraction: bookFraction,
                    pagesCurrent: pagesCurrent,
                    pagesTotal: pagesTotal,
                )
                Spacer()
                if hasRightStats {
                    rightStatsColumn(
                        bookRemaining: bookRemaining,
                        chapterRemaining: chapterRemaining,
                    )
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func leftStatsColumn(bookFraction: Double?, pagesCurrent: Int?, pagesTotal: Int?)
        -> some View
    {
        VStack(alignment: .leading, spacing: 4) {
            if let fraction = bookFraction {
                HStack(spacing: 6) {
                    Image(systemName: "book.fill")
                        .font(.footnote)
                    Text(formatPercent(fraction))
                        .font(.footnote.monospacedDigit())
                }
                .foregroundStyle(secondaryColor)
            }

            if let current = pagesCurrent, let total = pagesTotal, total > 0 {
                HStack(spacing: 6) {
                    Image(systemName: "bookmark.fill")
                        .font(.footnote)
                    Text("Page \(current) of \(total)")
                        .font(.footnote.monospacedDigit())
                }
                .foregroundStyle(secondaryColor)
            }
        }
    }

    private func rightStatsColumn(bookRemaining: TimeInterval?, chapterRemaining: TimeInterval?)
        -> some View
    {
        VStack(alignment: .trailing, spacing: 4) {
            HStack(spacing: 6) {
                Text(formatTimeHoursMinutes(bookRemaining))
                    .font(.footnote.monospacedDigit())
                Image(systemName: "book.fill")
                    .font(.footnote)
            }
            .foregroundStyle(secondaryColor)

            HStack(spacing: 6) {
                Text(formatTimeMinutesSeconds(chapterRemaining))
                    .font(.footnote.monospacedDigit())
                Image(systemName: "bookmark.fill")
                    .font(.footnote)
            }
            .foregroundStyle(secondaryColor)
        }
    }

    private var volumePopover: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Volume")
                .font(.headline)
                .padding(.horizontal)
                .padding(.top, 8)

            VStack(spacing: 8) {
                Slider(
                    value: Binding(
                        get: { model.volume },
                        set: { newValue in
                            onVolumeChange(newValue)
                        },
                    ),
                    in: 0...1,
                )
                .padding(.horizontal)

                Text("\(Int(model.volume * 100))%")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 12)
        }
    }

    private var sleepTimerButton: some View {
        VStack(spacing: 6) {
            Button(action: {
                if model.sleepTimerActive {
                    onSleepTimerCancel()
                } else {
                    showSleepTimerPopover = true
                }
            }) {
                Image(systemName: model.sleepTimerActive ? "moon.zzz.fill" : "moon.zzz")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(primaryColor)
                    .frame(width: 38, height: 38)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(
                                model.sleepTimerActive
                                    ? Color.accentColor.opacity(0.2)
                                    : secondaryColor.opacity(0.12)
                            )
                    )
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showSleepTimerPopover) {
                sleepTimerPopover
                    .frame(minWidth: 200, maxWidth: 240)
            }

            if let remaining = model.sleepTimerRemaining, model.sleepTimerActive {
                if model.sleepTimerType == .endOfChapter {
                    Text("End Ch.")
                        .font(.footnote)
                        .foregroundStyle(Color.accentColor)
                } else {
                    Text(formatSleepTimerRemaining(remaining))
                        .font(.footnote)
                        .foregroundStyle(Color.accentColor)
                }
            } else {
                Text("Sleep")
                    .font(.footnote)
                    .foregroundStyle(secondaryColor)
            }
        }
    }

    private var sleepTimerPopover: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sleep Timer")
                .font(.headline)
                .padding(.horizontal)
                .padding(.top, 8)

            VStack(spacing: 4) {
                sleepTimerOption(title: "10 minutes", duration: 10 * 60)
                sleepTimerOption(title: "15 minutes", duration: 15 * 60)
                sleepTimerOption(title: "30 minutes", duration: 30 * 60)
                sleepTimerOption(title: "1 hour", duration: 60 * 60)

                Divider()
                    .padding(.horizontal)

                sleepTimerOption(title: "At End of Chapter", duration: nil, type: .endOfChapter)
            }
            .padding(.bottom, 12)
        }
    }

    private func sleepTimerOption(
        title: String,
        duration: TimeInterval?,
        type: SleepTimerType = .duration,
    )
        -> some View
    {
        Button(action: {
            onSleepTimerStart(duration, type)
            showSleepTimerPopover = false
        }) {
            HStack {
                Text(title)
                    .font(.body)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
    }

    private var volumeIcon: String {
        if model.volume == 0 {
            return "speaker.slash"
        } else if model.volume < 0.33 {
            return "speaker.wave.1"
        } else if model.volume < 0.66 {
            return "speaker.wave.2"
        } else {
            return "speaker.wave.3"
        }
    }

    private func formatSleepTimerRemaining(_ time: TimeInterval) -> String {
        let totalSeconds = max(Int(time.rounded()), 0)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let seconds = totalSeconds % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        } else if minutes > 0 {
            return String(format: "%d:%02d", minutes, seconds)
        } else {
            return String(format: "%ds", seconds)
        }
    }

    private var backgroundColor: Color {
        Color.clear
    }

    // The sidebar draws over the reader theme background, which follows the user's
    // theme rather than the system appearance. Semantic colors resolve against the
    // system appearance, so when a theme foreground is provided it must be used
    // instead or the two can disagree (e.g. white-on-white). Popover content is
    // excluded: popovers render on system backgrounds.
    private var primaryColor: Color {
        foregroundColor ?? .primary
    }

    private var secondaryColor: Color {
        foregroundColor?.opacity(0.6) ?? .secondary
    }

    private var playbackRateDescription: String {
        StorytellerAppleKit.playbackRateDescription(for: model.playbackRate)
    }

    private var elapsedTime: TimeInterval {
        max(min(model.chapterDuration * chapterProgress, model.chapterDuration), 0)
    }

}

#Preview("Reading Sidebar") {
    let model = ReadingSidebarView.Model(
        title: "Summer Prince",
        author: "Tracy Weber",
        chapterTitle: "Chapter 1",
        coverArt: nil,
        chapterDuration: (12 * 60) + 27,
        totalRemaining: (8 * 60 * 60) + (9 * 60),
        playbackRate: 1.3,
        isPlaying: true,
    )
    let progress = ProgressData(
        chapterLabel: "Chapter 5",
        chapterCurrentPage: 4,
        chapterTotalPages: 18,
        chapterCurrentSecondsAudio: Double((4 * 60) + 7),
        chapterTotalSecondsAudio: Double((12 * 60) + 27),
        bookCurrentSecondsAudio: 3_600,
        bookTotalSecondsAudio: 28_800,
        bookCurrentFraction: 0.12,
    )
    ReadingSidebarView(
        bookData: nil,
        model: model,
        mode: .readaloud,
        chapterProgress: .constant(Double((4 * 60) + 7) / Double((12 * 60) + 27)),
        progressData: progress,
    )
    .frame(maxWidth: 420)
}

#endif
