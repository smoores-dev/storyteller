#if os(iOS)
import SwiftUI

/// Bottom half of a fake phone: a page of placeholder text with the supplied
/// chrome pinned to the bottom, clipped to a curved bezel.
struct MiniPlayerPreviewFrame<Chrome: View>: View {
    let backgroundColor: Color
    let foregroundColor: Color
    var chromeOnCard: Bool = true
    @ViewBuilder let chrome: () -> Chrome

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

            if chromeOnCard {
                chrome()
                    .modifier(GlassEffectModifier())
            } else {
                chrome()
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
        .background(Color(uiColor: .systemGroupedBackground))
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

    private var hasStatBand: Bool {
        settingsVM.miniPlayerStatSlots.hasActiveComplication
    }

    private var hasDockContent: Bool {
        (settingsVM.dockLeadingSlots + settingsVM.dockTrailingSlots
            + settingsVM.dockCenterSlots)
            .hasActiveComplication
    }

    private var hasDockControls: Bool {
        settingsVM.dockCenterSlots.hasActiveComplication
    }

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

    private var dockInset: CGFloat {
        hasDockContent
            ? EbookDockIos.reservedBottomInset(withPlaybackControls: hasDockControls) + 8
            : 12
    }

    // No blank page above the widget: in dark mode the page colour reads as a
    // second tone stacked under the header rather than as the reader's page.
    private var dockHeight: CGFloat {
        max(widget == .miniPlayer ? cardInset : dockInset, 48)
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
                if settingsVM.miniPlayerLeadingStyle == .cycle {
                    settingsVM.miniPlayerCycleShowingSecond.toggle()
                    settingsVM.save()
                }
            },
            onToggleMirror: {
                settingsVM.miniPlayerMirrored.toggle()
                settingsVM.save()
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
            onToggleOrientationLock: { OrientationLock.shared.toggle() },
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            CustomizePreviewLabel()

            ZStack(alignment: .bottom) {
                backgroundColor

                switch widget {
                    case .miniPlayer:
                        liveCard
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
                                mirrored: settingsVM.miniPlayerMirrored,
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
        let scope =
            widget == .miniPlayer
            ? settingsVM.miniPlayerProgressScope
            : settingsVM.progressIndicatorScopeDock
        let progress =
            scope == .book
            ? (demoDisplay.bookFraction ?? 0) : demoProgress
        let thickness =
            widget == .miniPlayer
            ? settingsVM.progressIndicatorThickness
            : settingsVM.progressIndicatorThicknessDock
        return ProgressIndicatorLine(progress: progress, thickness: thickness)
    }

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
}
#endif
