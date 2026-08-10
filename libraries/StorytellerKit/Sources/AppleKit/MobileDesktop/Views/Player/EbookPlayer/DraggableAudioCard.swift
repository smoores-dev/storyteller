#if os(iOS) || os(macOS)
import SwiftUI

#if os(iOS)
struct DraggableAudioCard<FullContent: View>: View {
    @Binding var isPresented: Bool
    let alwaysShow: Bool
    let collapseTrigger: Int

    let display: MiniPlayerDisplayModel
    let actions: MiniPlayerActions
    let ebookCoverArt: Image?
    let miniPlayerConfig: StorytellerGlobalConfig.MiniPlayer
    let supportsComicScrubber: Bool

    let onPrevChapter: () -> Void
    let onNextChapter: () -> Void
    let onComicScrubberVisibilityChange: (Bool) -> Void
    @ViewBuilder let fullContent: () -> FullContent

    enum CardState {
        case compact
        case scrubber
        case expanded
    }

    @State private var cardState: CardState = .compact
    @State private var dragOffset: CGFloat = 0
    @GestureState private var isDragging = false
    @State private var sliderValue: Double = 0
    @AppStorage("showEbookCoverInAudioView") private var showEbookCover = false

    private var effectiveSize: MiniPlayerSize {
        display.hasAudioNarration ? miniPlayerConfig.size : .compact
    }

    private var hasStatBand: Bool {
        display.hasAudioNarration && miniPlayerConfig.statSlots.hasActiveComplication
    }

    private var compactHeight: CGFloat {
        MiniPlayerMetrics.compactHeight(size: effectiveSize, showStats: hasStatBand)
    }

    private var displayModel: MiniPlayerDisplayModel {
        var model = display
        model.cover = displayedCover
        return model
    }
    private let expandedFraction: CGFloat = 1.0
    private let scrubberFraction: CGFloat = 0.28
    private let dragThreshold: CGFloat = 40

    var body: some View {
        GeometryReader { geometry in
            let screenHeight = geometry.size.height
            let safeAreaBottom = geometry.safeAreaInsets.bottom
            let expandedHeight = screenHeight * expandedFraction
            let scrubberHeight = max(screenHeight * scrubberFraction, 170)

            let targetHeight: CGFloat =
                switch cardState {
                    case .compact:
                        compactHeight
                            + MiniPlayerMetrics.bottomBandHeight(
                                showStats: hasStatBand,
                                safeAreaBottom: safeAreaBottom,
                            )
                    case .scrubber: scrubberHeight
                    case .expanded: expandedHeight
                }

            let currentHeight =
                isDragging
                ? max(0, min(expandedHeight, targetHeight - dragOffset))
                : targetHeight
            let cardContentAlignment: Alignment = cardState == .scrubber ? .top : .center

            ZStack(alignment: .bottom) {
                if isPresented {
                    VStack(spacing: 0) {
                        if cardState != .compact {
                            dragHandleView
                        }

                        switch cardState {
                            case .compact:
                                MiniPlayerCardContent(
                                    config: miniPlayerConfig,
                                    display: displayModel,
                                    actions: actions,
                                    onExpandTap: {
                                        withAnimation(
                                            .spring(response: 0.35, dampingFraction: 0.85)
                                        ) {
                                            cardState =
                                                supportsComicScrubber ? .scrubber : .expanded
                                        }
                                    },
                                )
                                .transition(.opacity)
                            case .scrubber:
                                comicScrubberContent
                                    .transition(.opacity)
                            case .expanded:
                                fullContent()
                                    .transition(.opacity)
                        }

                        if cardState == .compact && hasStatBand {
                            MiniPlayerStatBand(
                                config: miniPlayerConfig,
                                display: displayModel,
                                actions: actions,
                            )
                            .frame(
                                height: MiniPlayerMetrics.bottomBandHeight(
                                    showStats: true,
                                    safeAreaBottom: safeAreaBottom,
                                )
                            )
                        } else if cardState == .scrubber {
                            Color.clear
                                .frame(height: safeAreaBottom)
                        } else {
                            Spacer(minLength: safeAreaBottom)
                        }
                    }
                    .overlay(alignment: .top) {
                        if cardState == .compact {
                            RoundedRectangle(cornerRadius: 2.5)
                                .fill(Color.secondary.opacity(0.5))
                                .frame(width: 36, height: 5)
                                .padding(.top, MiniPlayerMetrics.grabberTopPadding)
                        }
                    }
                    .overlay(alignment: .topTrailing) {
                        if cardState != .compact {
                            Button(action: {
                                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                    cardState = .compact
                                }
                            }) {
                                Image(systemName: "chevron.down")
                                    .font(.title3.weight(.semibold))
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                            .padding(.top, 12)
                            .padding(.trailing, 16)
                        }
                    }
                    .frame(height: currentHeight, alignment: cardContentAlignment)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                    .modifier(GlassEffectModifier())
                    .gesture(
                        DragGesture()
                            .updating($isDragging) { _, state, _ in
                                state = true
                            }
                            .onChanged { value in
                                dragOffset = value.translation.height
                            }
                            .onEnded { value in
                                handleDragEnd(
                                    translation: value.translation.height,
                                    velocity: value.predictedEndTranslation.height
                                        - value.translation.height,
                                    screenHeight: screenHeight,
                                )
                            }
                    )
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .ignoresSafeArea(edges: .bottom)
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: isPresented)
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: cardState)
        .animation(.interactiveSpring(), value: dragOffset)
        .onChange(of: isDragging) { _, newValue in
            if !newValue && dragOffset != 0 {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    dragOffset = 0
                }
            }
        }
        .onChange(of: display.chapterProgress) { _, newValue in
            sliderValue = newValue
        }
        .onChange(of: collapseTrigger) { _, _ in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                cardState = .compact
            }
        }
        .onChange(of: cardState) { _, newValue in
            onComicScrubberVisibilityChange(
                isPresented && supportsComicScrubber && newValue == .scrubber
            )
        }
        .onChange(of: isPresented) { _, newValue in
            onComicScrubberVisibilityChange(
                newValue && supportsComicScrubber && cardState == .scrubber
            )
        }
        .onAppear {
            sliderValue = display.chapterProgress
            onComicScrubberVisibilityChange(
                isPresented && supportsComicScrubber && cardState == .scrubber
            )
        }
        .onDisappear {
            onComicScrubberVisibilityChange(false)
        }
    }

    private var dragHandleView: some View {
        RoundedRectangle(cornerRadius: 2.5)
            .fill(Color.secondary.opacity(0.5))
            .frame(width: 36, height: 5)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
    }

    private var displayedCover: Image? {
        if showEbookCover, let ebookCover = ebookCoverArt {
            return ebookCover
        }
        return display.cover
    }

    private var comicScrubberContent: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                if let cover = displayedCover {
                    cover
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 36, height: 36)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }

                VStack(alignment: .leading, spacing: 3) {
                    if let title = display.bookTitle {
                        Text(title)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                    }
                    if let chapterTitle = display.chapterTitle {
                        Text(chapterTitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 0)
            }

            Slider(
                value: Binding(
                    get: { sliderValue },
                    set: { newValue in
                        sliderValue = min(max(newValue, 0), 1)
                        actions.onSeek?(sliderValue)
                    },
                ),
                in: 0...1,
            )

            HStack(spacing: 20) {
                Button(action: onPrevChapter) {
                    Image(systemName: "chevron.left")
                        .font(.title3.weight(.semibold))
                        .frame(width: 40, height: 34)
                }
                .buttonStyle(.plain)

                Text(comicProgressLabel)
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)

                Button(action: onNextChapter) {
                    Image(systemName: "chevron.right")
                        .font(.title3.weight(.semibold))
                        .frame(width: 40, height: 34)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, 2)
    }

    private var comicProgressLabel: String {
        let chapters = display.chapters
        guard !chapters.isEmpty else { return "" }
        let selectedPage = display.selectedChapterHref.flatMap(Int.init)
        let page =
            if let selectedPage {
                min(max(selectedPage + 1, 1), chapters.count)
            } else {
                min(
                    max(Int((sliderValue * Double(chapters.count)).rounded(.down)) + 1, 1),
                    chapters.count,
                )
            }
        return "Page \(page) of \(chapters.count)"
    }

    private func handleDragEnd(translation: CGFloat, velocity: CGFloat, screenHeight: CGFloat) {
        let velocityThreshold: CGFloat = 500

        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            dragOffset = 0

            switch cardState {
                case .compact:
                    let isSwipeUp = translation < -dragThreshold || velocity < -velocityThreshold
                    let isSwipeDown = translation > dragThreshold || velocity > velocityThreshold
                    if isSwipeUp {
                        cardState = supportsComicScrubber ? .scrubber : .expanded
                    } else if isSwipeDown && !alwaysShow {
                        isPresented = false
                    }

                case .scrubber:
                    let isSwipeDown = translation > dragThreshold || velocity > velocityThreshold
                    if isSwipeDown {
                        cardState = .compact
                    }

                case .expanded:
                    let isSwipeDown = translation > dragThreshold || velocity > velocityThreshold
                    if isSwipeDown {
                        cardState = .compact
                    }
            }
        }
    }
}

struct GlassEffectModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    private let shape = UnevenRoundedRectangle(
        topLeadingRadius: 16,
        bottomLeadingRadius: 0,
        bottomTrailingRadius: 0,
        topTrailingRadius: 16,
        style: .continuous,
    )

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular.interactive(), in: shape)
        } else {
            content
                .background(
                    shape
                        .fill(Color(uiColor: .systemBackground))
                )
                .clipShape(shape)
                .shadow(color: .black.opacity(0.15), radius: 8, y: -2)
        }
    }
}
#endif

#endif
