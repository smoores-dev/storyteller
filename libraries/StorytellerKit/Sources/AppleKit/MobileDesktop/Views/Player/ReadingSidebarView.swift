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
    private let containerWidth: CGFloat?
    private let foregroundColor: Color?
    private var palette: CoverDerivedPalette? = nil
    @Environment(\.colorScheme) private var colorScheme
    private let progressData: ProgressData?
    @Binding private var chapterProgress: Double
    private let chapters: [ChapterItem]
    private let onChapterSelected: (ChapterItem) -> Void
    private let onProgressSeek: ((Double) -> Void)?
    private let seekWhileDragging: Bool

    @State private var currentPlayerHeight: CGFloat = 800
    @State private var currentPlayerWidth: CGFloat = 380
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
    private let statSlots: [PlayerComplication]
    private let controlSlots: [PlayerComplication]
    private let onOpenBookmarks: (() -> Void)?
    private let onOpenReadingTimeline: (() -> Void)?
    private let onOpenImageGallery: (() -> Void)?
    private let onOpenSearch: (() -> Void)?
    private let onOpenTextSettings: (() -> Void)?

    public init(
        bookData: PlayerBookData?,
        model: Model,
        mode: ReadingMode = .readaloud,
        foregroundColor: Color? = nil,
        containerWidth: CGFloat? = nil,
        chapterProgress: Binding<Double>,
        chapters: [ChapterItem] = [],
        progressData: ProgressData? = nil,
        statSlots: [PlayerComplication]? = nil,
        controlSlots: [PlayerComplication]? = nil,
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
        onOpenBookmarks: (() -> Void)? = nil,
        onOpenReadingTimeline: (() -> Void)? = nil,
        onOpenImageGallery: (() -> Void)? = nil,
        onOpenSearch: (() -> Void)? = nil,
        onOpenTextSettings: (() -> Void)? = nil,
    ) {
        self.bookData = bookData
        self.model = model
        self.mode = mode
        self.foregroundColor = foregroundColor
        self.containerWidth = containerWidth
        self.progressData = progressData
        _chapterProgress = chapterProgress
        self.chapters = chapters
        self.statSlots = SlotLayout.sanitized(
            statSlots ?? StorytellerGlobalConfig.FullPlayer().statSlots,
            for: .fullPlayerStats,
        )
        self.controlSlots = SlotLayout.sanitized(
            controlSlots ?? StorytellerGlobalConfig.FullPlayer().controlSlots,
            for: .fullPlayerControls,
        )
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
        self.onOpenBookmarks = onOpenBookmarks
        self.onOpenReadingTimeline = onOpenReadingTimeline
        self.onOpenImageGallery = onOpenImageGallery
        self.onOpenSearch = onOpenSearch
        self.onOpenTextSettings = onOpenTextSettings
    }

    func coverPalette(_ palette: CoverDerivedPalette?) -> ReadingSidebarView {
        var copy = self
        copy.palette = palette
        return copy
    }

    public var body: some View {
        VStack(spacing: 20) {
            Spacer(minLength: 0)

            metadataSection

            progressSection
            if mode != .ebook {
                transportControls
            }

            Spacer(minLength: 0)

            VStack(spacing: 20) {
                statsSection
                secondaryControls
            }
        }
        .padding(.top, 16)
        .padding(.bottom, 16)
        .frame(minHeight: 400)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onGeometryChange(for: CGSize.self) { proxy in
            proxy.size
        } action: { size in
            currentPlayerHeight = size.height
            currentPlayerWidth = size.width
        }
    }

    private var playerWidth: CGFloat {
        containerWidth ?? currentPlayerWidth
    }

    #if os(macOS)
    private var sectionPadding: CGFloat {
        min(30, max(16, playerWidth * 0.08))
    }
    #else
    private var sectionPadding: CGFloat { 20 }
    #endif

    private var contentWidth: CGFloat {
        max(playerWidth - sectionPadding * 2, 1)
    }

    private static let transportNaturalWidth: CGFloat = 316

    private var transportScale: CGFloat {
        min(1, contentWidth / Self.transportNaturalWidth)
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
                    .font(.editorialTitle(26))
                    .foregroundStyle(primaryColor)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)

                Text(model.chapterTitle)
                    .font(.subheadline)
                    .foregroundStyle(secondaryColor)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, sectionPadding)
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
            PlayerScrubBar(
                value: sliderBinding,
                tint: controlIcon,
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
        .padding(.horizontal, sectionPadding)
    }

    private var transportControls: some View {
        let scale = transportScale
        return HStack(spacing: 12 * scale) {
            transportButton(
                icon: "backward.end",
                size: 44 * scale,
                iconSize: 24 * scale,
                help: "Restart chapter / Previous chapter",
                action: onPrevChapter,
            )

            transportButton(
                icon: skipBackIcon,
                size: 54 * scale,
                iconSize: 26 * scale,
                help: skipBackHelp,
                action: onSkipBackward,
            )

            Button(action: onPlayPause) {
                Image(systemName: model.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 32 * scale))
                    .foregroundStyle(playIcon)
                    .frame(width: 72 * scale, height: 72 * scale)
                    .contentShape(Circle())
                    .background(Circle().fill(playFill))
            }
            .buttonStyle(.plain)
            .help("Play/pause")

            transportButton(
                icon: skipForwardIcon,
                size: 54 * scale,
                iconSize: 26 * scale,
                help: skipForwardHelp,
                action: onSkipForward,
            )

            transportButton(
                icon: "forward.end",
                size: 44 * scale,
                iconSize: 24 * scale,
                help: "Next chapter",
                action: onNextChapter,
            )
        }
        .foregroundStyle(controlIcon)
        .padding(.horizontal, sectionPadding)
    }

    private func transportButton(
        icon: String,
        size: CGFloat,
        iconSize: CGFloat,
        help: String,
        action: @escaping () -> Void,
    ) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: iconSize, weight: .regular))
                .frame(width: size, height: size)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .help(help)
    }

    private var skipBackIcon: String {
        mode == .audiobook ? "gobackward.15" : "gobackward"
    }

    private var skipForwardIcon: String {
        mode == .audiobook ? "goforward.15" : "goforward"
    }

    private var skipBackHelp: String {
        mode == .audiobook ? "Skip back 15 seconds" : "Previous sentence"
    }

    private var skipForwardHelp: String {
        mode == .audiobook ? "Skip forward 15 seconds" : "Next sentence"
    }

    private var selectedChapterId: String? {
        progressData?.chapterId
            ?? progressData?.chapterLabel.flatMap { label in
                chapters.first(where: { $0.label == label })?.id
            }
    }

    private var complicationDisplay: MiniPlayerDisplayModel {
        let data = progressData
        let bookFraction = data.flatMap { d in
            normalizedFraction(d.bookCurrentFraction)
                ?? bookAudioFraction(
                    current: d.bookCurrentSecondsAudio,
                    total: d.bookTotalSecondsAudio,
                )
        }
        let bookRemaining = timeRemaining(
            atRate: model.playbackRate,
            total: data.flatMap { normalizedSeconds($0.bookTotalSecondsAudio) },
            elapsed: data.flatMap { normalizedSeconds($0.bookCurrentSecondsAudio) },
        )
        return MiniPlayerDisplayModel(
            bookTitle: model.title,
            chapterTitle: model.chapterTitle,
            authorName: model.author,
            cover: nil,
            isPlaying: model.isPlaying,
            playbackRate: model.playbackRate,
            volume: model.volume,
            chapterProgress: min(max(chapterProgress, 0), 1),
            chapterElapsedSeconds: data.flatMap { normalizedSeconds($0.chapterCurrentSecondsAudio) },
            chapterTotalSeconds: data.flatMap { normalizedSeconds($0.chapterTotalSecondsAudio) },
            bookTimeRemaining: bookRemaining,
            bookFraction: bookFraction,
            currentPage: data.flatMap { normalizedCurrentPage($0.chapterCurrentPage) },
            totalPages: data.flatMap { normalizedTotalPage($0.chapterTotalPages) },
            chapterIndex: chapters.firstIndex(where: { $0.id == selectedChapterId }),
            chapterCount: chapters.isEmpty ? nil : chapters.count,
            sleepTimerRemaining: model.sleepTimerActive ? model.sleepTimerRemaining : nil,
            sleepTimerEndOfChapter: model.sleepTimerActive
                && model.sleepTimerType == .endOfChapter,
            chapters: chapters,
            selectedChapterHref: selectedChapterId,
            hasAudioNarration: mode != .ebook,
        )
    }

    private var complicationActions: MiniPlayerActions {
        MiniPlayerActions(
            onPlayPause: onPlayPause,
            onSkipBackward: onSkipBackward,
            onSkipForward: onSkipForward,
            onRateChange: onPlaybackRateChange,
            onChapterSelected: onChapterSelected,
            onOpenBookmarks: onOpenBookmarks ?? {},
            onOpenReadingTimeline: onOpenReadingTimeline ?? {},
            onOpenImageGallery: onOpenImageGallery ?? {},
            onOpenSearch: onOpenSearch ?? {},
            onOpenTextSettings: onOpenTextSettings ?? {},
        )
    }

    private var secondaryControls: some View {
        FullPlayerControlsRow(
            availableWidth: contentWidth,
            slots: controlSlots,
            display: complicationDisplay,
            actions: complicationActions,
            accent: controlIcon,
            fill: controlFill,
            onOpenBookmarks: onOpenBookmarks,
            onOpenReadingTimeline: onOpenReadingTimeline,
            onOpenImageGallery: onOpenImageGallery,
            onOpenSearch: onOpenSearch,
            onOpenTextSettings: onOpenTextSettings,
            onVolumeChange: onVolumeChange,
            onSleepTimerStart: onSleepTimerStart,
            onSleepTimerCancel: onSleepTimerCancel,
        )
        .padding(.horizontal, sectionPadding)
    }

    private var statsSection: some View {
        FullPlayerStatColumns(
            slots: statSlots,
            display: complicationDisplay,
            tint: secondaryColor,
        )
        .padding(.horizontal, sectionPadding)
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
        foregroundColor ?? palette?.controlTint(for: colorScheme) ?? .primary
    }

    private var secondaryColor: Color {
        if let foregroundColor { return foregroundColor.opacity(0.6) }
        if let palette { return palette.controlTint(for: colorScheme).opacity(0.62) }
        return .secondary
    }

    private var resolvedPalette: CoverDerivedPalette? {
        palette?.resolved(for: colorScheme)
    }

    private var controlIcon: Color {
        palette?.controlTint(for: colorScheme) ?? primaryColor
    }

    private var controlFill: Color {
        controlIcon.opacity(0.12)
    }

    private var playFill: Color {
        palette != nil ? controlIcon : secondaryColor.opacity(0.2)
    }

    private var playIcon: Color {
        resolvedPalette?.contentBackground ?? primaryColor
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
