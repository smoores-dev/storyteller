#if os(iOS) || os(macOS)
import SwiftUI

struct PreviewChromeBandHeightKey: PreferenceKey {
    static let defaultValue: CGFloat? = nil
    static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) {
        value = nextValue() ?? value
    }
}

/// Bottom half of a fake phone: a page of placeholder text with the supplied
/// chrome pinned to the bottom, clipped to a curved bezel.
struct MiniPlayerPreviewFrame<Chrome: View>: View {
    let backgroundColor: Color
    let foregroundColor: Color
    var chromeOnCard: Bool = true
    @ViewBuilder let chrome: () -> Chrome

    @State private var chromeHeight: CGFloat = 0
    @State private var bandHeight: CGFloat?

    private var pageMaskInset: CGFloat { bandHeight ?? chromeHeight }

    private let bezelShape = UnevenRoundedRectangle(
        topLeadingRadius: 8,
        bottomLeadingRadius: 38,
        bottomTrailingRadius: 38,
        topTrailingRadius: 8,
        style: .continuous,
    )

    var body: some View {
        ZStack(alignment: .bottom) {
            backgroundColor

            fakePage
                .frame(maxHeight: .infinity, alignment: .top)
                .mask {
                    VStack(spacing: 0) {
                        Rectangle()
                        LinearGradient(
                            colors: [.black, .clear],
                            startPoint: .top,
                            endPoint: .bottom,
                        )
                        .frame(height: 12)
                    }
                    .padding(.bottom, pageMaskInset)
                }

            Group {
                if chromeOnCard {
                    chrome()
                        .modifier(GlassEffectModifier())
                } else {
                    chrome()
                }
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: {
                chromeHeight = $0
            }
            .onPreferenceChange(PreviewChromeBandHeightKey.self) {
                bandHeight = $0
            }
        }
        .clipShape(bezelShape)
        .overlay(
            bezelShape
                .strokeBorder(Color.primary.opacity(0.25), lineWidth: 4)
        )
        .padding(.horizontal, 4)
    }

    private var fakePage: some View {
        VStack(alignment: .leading, spacing: 7) {
            ForEach(0..<14, id: \.self) { line in
                RoundedRectangle(cornerRadius: 2)
                    .fill(foregroundColor.opacity(0.35))
                    .frame(height: 6)
                    .frame(maxWidth: .infinity)
                    .padding(.trailing, lineTrailingPadding(line))
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, 18)
    }

    private func lineTrailingPadding(_ line: Int) -> CGFloat {
        switch line % 5 {
            case 0: return 0
            case 1: return 12
            case 2: return 4
            case 3: return 40
            default: return 8
        }
    }
}

struct CustomizePreviewLabel: View {
    @Environment(\.readerPalette) private var readerPalette
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack {
            Text("Preview:")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity)
        .background(groupedBackground)
    }

    private var groupedBackground: Color {
        #if os(iOS)
        if let readerPalette {
            return readerPalette.resolved(for: colorScheme).surface
        }
        return Color(uiColor: .systemGroupedBackground)
        #else
        return Color(nsColor: .windowBackgroundColor)
        #endif
    }
}

enum CustomizePreviewWidget {
    case miniPlayer
    case dock
}

/// Full-width live simulation of the reader's bottom edge, pinned to the bottom
/// of a customize card: the page background, the grey progress line, and the
/// real dock or miniplayer widget rendered exactly as the reader draws it.
struct CustomizePreviewDock: View {
    @Bindable var settingsVM: SettingsViewModel
    let backgroundColor: Color
    let widget: CustomizePreviewWidget

    @State private var demoPlaying = false
    @State private var demoRate = 1.0
    @State private var demoProgress = 0.42

    #if os(iOS)
    private var hasStatBand: Bool {
        settingsVM.miniPlayerStatSlots.hasActiveComplication
    }
    #endif

    private var hasDockContent: Bool {
        (settingsVM.dockLeadingSlots + settingsVM.dockTrailingSlots
            + settingsVM.dockCenterSlots)
            .hasActiveComplication
    }

    private var hasDockControls: Bool {
        settingsVM.dockCenterSlots.hasActiveComplication
    }

    #if os(iOS)
    private var cardBandHeight: CGFloat {
        MiniPlayerMetrics.bottomBandHeight(
            showStats: hasStatBand,
            safeAreaBottom: max(safeAreaBottom, 12),
        )
    }

    private var cardInset: CGFloat {
        MiniPlayerMetrics.compactHeight(
            size: settingsVM.miniPlayerSize,
            showStats: hasStatBand,
        ) + cardBandHeight
    }
    #endif

    private var dockInset: CGFloat {
        hasDockContent
            ? EbookDockIos.reservedBottomInset(withPlaybackControls: hasDockControls) + 8
            : 12
    }

    // No blank page above the widget: in dark mode the page colour reads as a
    // second tone stacked under the header rather than as the reader's page.
    private var dockHeight: CGFloat {
        #if os(iOS)
        max(widget == .miniPlayer ? cardInset : dockInset, 48)
        #else
        max(dockInset, 48)
        #endif
    }

    private var demoDisplay: MiniPlayerDisplayModel {
        var model = MiniPlayerDisplayModel.sample
        model.isPlaying = demoPlaying
        model.playbackRate = demoRate
        model.chapterProgress = demoProgress
        model.bookFraction = 0.73
        model.isScrollingMode = settingsVM.scrollingMode
        model.freeBrowseMode = settingsVM.freeBrowseMode
        return model
    }

    private var demoActions: MiniPlayerActions {
        MiniPlayerActions(
            onPlayPause: { withAnimation { demoPlaying.toggle() } },
            onSkipBackward: { demoProgress = max(0, demoProgress - 0.05) },
            onSkipForward: { demoProgress = min(1, demoProgress + 0.05) },
            onRateChange: { demoRate = $0 },
            onSeek: { demoProgress = $0 },
            onLeadingTap: {
                #if os(iOS)
                if settingsVM.miniPlayerLeadingStyle == .cycle {
                    settingsVM.miniPlayerCycleShowingSecond.toggle()
                    settingsVM.save()
                }
                #endif
            },
            onToggleScrollingMode: {
                settingsVM.scrollingMode.toggle()
                settingsVM.save()
            },
            onToggleFreeBrowse: {
                settingsVM.freeBrowseMode =
                    settingsVM.freeBrowseMode == "always" ? "never" : "always"
                settingsVM.save()
            },
            onToggleOrientationLock: {
                #if os(iOS)
                OrientationLock.shared.toggle()
                #endif
            },
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            CustomizePreviewLabel()

            ZStack(alignment: .bottom) {
                backgroundColor

                switch widget {
                    case .miniPlayer:
                        #if os(iOS)
                        liveCard
                        #else
                        EmptyView()
                        #endif
                    case .dock:
                        if hasDockContent {
                            EbookDockIos(
                                leadingSlots: settingsVM.dockLeadingSlots,
                                trailingSlots: settingsVM.dockTrailingSlots,
                                centerSlots: settingsVM.dockCenterSlots,
                                dockTransparency: settingsVM.dockTransparency,
                                display: demoDisplay,
                                backgroundColor: backgroundColor,
                                positionAtTop: false,
                                actions: demoActions,
                            )
                        }
                }

            }
            .frame(height: dockHeight)
            // Overlay, not a ZStack child: EbookDockIos ignores the safe
            // area, which shifts bottom-aligned siblings off-frame.
            .overlay(alignment: .bottom) {
                if progressIndicatorEnabled {
                    progressLine
                }
            }
        }
    }

    private var progressIndicatorEnabled: Bool {
        switch widget {
            case .miniPlayer: return settingsVM.progressIndicatorMiniPlayer
            case .dock: return settingsVM.progressIndicatorDock
        }
    }

    private var progressLine: some View {
        #if os(iOS)
        let scope =
            widget == .miniPlayer
            ? settingsVM.miniPlayerProgressScope
            : settingsVM.progressIndicatorScopeDock
        let thickness =
            widget == .miniPlayer
            ? settingsVM.progressIndicatorThickness
            : settingsVM.progressIndicatorThicknessDock
        #else
        let scope = settingsVM.progressIndicatorScopeDock
        let thickness = settingsVM.progressIndicatorThicknessDock
        #endif
        let progress =
            scope == .book
            ? (demoDisplay.bookFraction ?? 0) : demoProgress
        return ProgressIndicatorLine(progress: progress, thickness: thickness)
    }

    #if os(iOS)
    private var liveCard: some View {
        VStack(spacing: 0) {
            MiniPlayerCardContent(
                config: settingsVM.miniPlayerConfig,
                display: demoDisplay,
                actions: demoActions,
            )

            if hasStatBand {
                MiniPlayerStatBand(
                    config: settingsVM.miniPlayerConfig,
                    display: demoDisplay,
                    actions: demoActions,
                )
                .frame(height: cardBandHeight)
            } else {
                Color.clear
                    .frame(height: cardBandHeight)
            }
        }
        .overlay(alignment: .top) {
            RoundedRectangle(cornerRadius: 2.5)
                .fill(Color.secondary.opacity(0.5))
                .frame(width: 36, height: 5)
                .padding(.top, MiniPlayerMetrics.grabberTopPadding)
        }
        .frame(maxWidth: .infinity)
        .modifier(GlassEffectModifier())
    }

    private var safeAreaBottom: CGFloat {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
            let window = windowScene.windows.first
        else {
            return 0
        }
        return window.safeAreaInsets.bottom
    }
    #endif
}
#endif
