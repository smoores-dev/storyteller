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
    let palette: CoverDerivedPalette
    @ViewBuilder let fullContent: () -> FullContent

    @Environment(\.colorScheme) private var colorScheme
    // 0 is the compact card, 1 is the expanded card (or the comic scrubber);
    // the drag writes fractional values so height and cross-fade track the finger.
    @State private var expansion: CGFloat = 0
    @State private var expandedSettled = false
    @State private var dragBase: CGFloat?
    @State private var dismissOffset: CGFloat = 0
    @GestureState private var isDragging = false
    @State private var sliderValue: Double = 0
    @AppStorage("showEbookCoverInAudioView") private var showEbookCover = false

    private let settleSpring = Animation.spring(response: 0.38, dampingFraction: 0.86)

    // Clearance from the top of the screen, not the card: the card already
    // extends past the bottom inset, so only the remainder comes off its height.
    private let menuBarClearance: CGFloat = 50

    private let cardShape = UnevenRoundedRectangle(
        topLeadingRadius: 16,
        bottomLeadingRadius: 0,
        bottomTrailingRadius: 0,
        topTrailingRadius: 16,
        style: .continuous,
    )

    private var effectiveSize: MiniPlayerSize {
        display.supportsMiniPlayerLayout ? miniPlayerConfig.size : .compact
    }

    private var hasStatBand: Bool {
        display.supportsMiniPlayerLayout && miniPlayerConfig.statSlots.hasActiveComplication
    }

    private var compactHeight: CGFloat {
        MiniPlayerMetrics.compactHeight(size: effectiveSize, showStats: hasStatBand)
    }

    private var displayModel: MiniPlayerDisplayModel {
        var model = display
        model.cover = displayedCover
        return model
    }

    private var clampedExpansion: CGFloat {
        min(max(expansion, 0), 1)
    }

    private var compactOpacity: CGFloat {
        1 - min(max(clampedExpansion / 0.35, 0), 1)
    }

    private var fullOpacity: CGFloat {
        min(max((clampedExpansion - 0.1) / 0.5, 0), 1)
    }

    private var paper: Color {
        palette.resolved(for: colorScheme).surface
    }

    private var accent: Color {
        palette.ratingAccent(for: colorScheme)
    }

    var body: some View {
        GeometryReader { geometry in
            let screenHeight = geometry.size.height
            let safeAreaBottom = geometry.safeAreaInsets.bottom
            let compactTotal =
                compactHeight
                + MiniPlayerMetrics.bottomBandHeight(
                    showStats: hasStatBand,
                    safeAreaBottom: safeAreaBottom,
                )
            let expandedTarget =
                supportsComicScrubber
                ? max(screenHeight * 0.28, 170)
                : screenHeight - max(0, menuBarClearance - safeAreaBottom)
            let span = max(expandedTarget - compactTotal, 1)
            let currentHeight = compactTotal + span * min(max(expansion, -0.05), 1.15)

            ZStack(alignment: .bottom) {
                if isPresented {
                    ZStack(alignment: .top) {
                        fullLayer(
                            expandedTarget: expandedTarget,
                            safeAreaBottom: safeAreaBottom,
                        )
                        .frame(height: expandedTarget, alignment: .top)
                        .opacity(fullOpacity)
                        .allowsHitTesting(expansion > 0.7)

                        compactLayer(safeAreaBottom: safeAreaBottom)
                            .frame(height: compactTotal, alignment: .top)
                            .opacity(compactOpacity)
                            .allowsHitTesting(expansion < 0.3)
                    }
                    .frame(height: currentHeight, alignment: .top)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                    .background(cardShape.fill(paper))
                    .clipShape(cardShape)
                    .modifier(GlassEffectModifier())
                    .offset(y: dismissOffset)
                    .gesture(dragGesture(span: span, compactTotal: compactTotal))
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .ignoresSafeArea(edges: .bottom)
        }
        .tint(accent)
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: isPresented)
        .onChange(of: isDragging) { _, dragging in
            guard !dragging, dragBase != nil else { return }
            dragBase = nil
            withAnimation(settleSpring) {
                dismissOffset = 0
            }
            setExpanded(expansion > 0.5)
        }
        .onChange(of: display.chapterProgress) { _, newValue in
            sliderValue = newValue
        }
        .onChange(of: collapseTrigger) { _, _ in
            setExpanded(false)
        }
        .onChange(of: isPresented) { _, newValue in
            if newValue {
                dismissOffset = 0
                expansion = 0
                expandedSettled = false
            }
            notifyScrubberVisibility()
        }
        .onAppear {
            sliderValue = display.chapterProgress
            notifyScrubberVisibility()
        }
        .onDisappear {
            onComicScrubberVisibilityChange(false)
        }
    }

    private func fullLayer(expandedTarget: CGFloat, safeAreaBottom: CGFloat) -> some View {
        VStack(spacing: 0) {
            dragHandleView
            if supportsComicScrubber {
                comicScrubberContent
                Spacer(minLength: 0)
                Color.clear
                    .frame(height: safeAreaBottom)
            } else {
                fullContent()
                Spacer(minLength: safeAreaBottom)
            }
        }
        .background(palette.playerGradient(for: colorScheme))
        .overlay(alignment: .topTrailing) {
            Button(action: { setExpanded(false) }) {
                Image(systemName: "chevron.down")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .padding(.top, 12)
            .padding(.trailing, 16)
        }
    }

    private func compactLayer(safeAreaBottom: CGFloat) -> some View {
        VStack(spacing: 0) {
            MiniPlayerCardContent(
                config: miniPlayerConfig,
                display: displayModel,
                actions: actions,
                onExpandTap: { setExpanded(true) },
            )

            if hasStatBand {
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
            } else {
                Spacer(minLength: safeAreaBottom)
            }
        }
        .overlay(alignment: .top) {
            RoundedRectangle(cornerRadius: 2.5)
                .fill(Color.secondary.opacity(0.5))
                .frame(width: 36, height: 5)
                .padding(.top, MiniPlayerMetrics.grabberTopPadding)
        }
    }

    // Global space: the drag resizes the card, so a local-space translation would
    // shift with the card's own bounds and feed back into itself as flicker.
    private func dragGesture(span: CGFloat, compactTotal: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 10, coordinateSpace: .global)
            .updating($isDragging) { _, state, _ in
                state = true
            }
            .onChanged { value in
                let base = dragBase ?? clampedExpansion
                if dragBase == nil { dragBase = base }
                let raw = base - value.translation.height / span
                if raw < 0 {
                    if !alwaysShow && base == 0 {
                        dismissOffset = max(0, value.translation.height)
                        expansion = 0
                    } else {
                        expansion = raw * 0.15
                        dismissOffset = 0
                    }
                } else if raw > 1 {
                    expansion = 1 + (raw - 1) * 0.15
                    dismissOffset = 0
                } else {
                    expansion = raw
                    dismissOffset = 0
                }
            }
            .onEnded { value in
                let base = dragBase ?? clampedExpansion
                dragBase = nil

                if dismissOffset > 0 {
                    if value.predictedEndTranslation.height > compactTotal * 0.6
                        || value.translation.height > 72
                    {
                        isPresented = false
                    } else {
                        withAnimation(settleSpring) {
                            dismissOffset = 0
                        }
                    }
                    return
                }

                // Projection folds velocity into where the drag was headed, so a
                // committed flick resolves even when the travel itself was short.
                let projected = base - value.predictedEndTranslation.height / span
                let target = base > 0.5 ? projected > 0.75 : projected > 0.25
                setExpanded(target)
            }
    }

    private func setExpanded(_ expanded: Bool) {
        withAnimation(settleSpring) {
            expansion = expanded ? 1 : 0
        }
        if expandedSettled != expanded {
            expandedSettled = expanded
            notifyScrubberVisibility()
        }
    }

    private func notifyScrubberVisibility() {
        onComicScrubberVisibilityChange(isPresented && supportsComicScrubber && expandedSettled)
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
}

#endif

#endif
