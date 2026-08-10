#if os(iOS)
import SwiftUI

/// iOS stats dock drawn over the webview, composed from three complication
/// regions: leading stack, centered controls, trailing stack.
/// Supports both bottom position (default) and top position (when mini player covers bottom)
struct EbookDockIos: View {
    // Fixed band heights so toggling individual items never resizes the fitted
    // webview. Only enabling/disabling playback controls changes the band.
    static let controlsContentHeight: CGFloat = 44
    static let statsContentHeight: CGFloat = 30

    // The webview may run right up to the dock content. Only the content box
    // and the padding below it stay clear.
    static func reservedBottomInset(withPlaybackControls: Bool) -> CGFloat {
        (withPlaybackControls ? controlsContentHeight : statsContentHeight) + 20
    }

    let leadingSlots: [PlayerComplication]
    let trailingSlots: [PlayerComplication]
    let centerSlots: [PlayerComplication]
    let dockTransparency: Double
    let display: MiniPlayerDisplayModel
    let backgroundColor: Color
    let positionAtTop: Bool
    let actions: MiniPlayerActions
    var mirrored: Bool = false
    var editing: Binding<SlotRef?>? = nil

    // Swapping hands moves the whole band across, stats included.
    private var leftSlots: [PlayerComplication] { mirrored ? trailingSlots : leadingSlots }
    private var rightSlots: [PlayerComplication] { mirrored ? leadingSlots : trailingSlots }
    private var leftRegion: SlotRegion { mirrored ? .dockTrailing : .dockLeading }
    private var rightRegion: SlotRegion { mirrored ? .dockLeading : .dockTrailing }

    private func isVisible(_ comp: PlayerComplication) -> Bool {
        if editing != nil { return true }
        if comp == .none { return false }
        return display.hasAudioNarration || !comp.requiresAudio
    }

    private var visibleLeading: [(Int, PlayerComplication)] {
        Array(leftSlots.enumerated()).filter { isVisible($0.1) }
    }

    private var visibleTrailing: [(Int, PlayerComplication)] {
        Array(rightSlots.enumerated()).filter { isVisible($0.1) }
    }

    private var visibleCenter: [(Int, PlayerComplication)] {
        let entries = Array(centerSlots.enumerated()).filter { isVisible($0.1) }
        return mirrored ? mirroredRowEntries(entries, comp: \.1) : entries
    }

    private var hasStatsToDisplay: Bool {
        !visibleLeading.isEmpty || !visibleTrailing.isEmpty
    }

    private var hasPlaybackControlsToDisplay: Bool {
        !visibleCenter.isEmpty
    }

    private var hasDockContent: Bool {
        hasStatsToDisplay || hasPlaybackControlsToDisplay
    }

    var body: some View {
        if positionAtTop {
            topPositionedLayout
        } else {
            bottomPositionedLayout
        }
    }

    private func slotStack(
        _ slots: [(Int, PlayerComplication)],
        region: SlotRegion,
        alignment: HorizontalAlignment,
    ) -> some View {
        VStack(alignment: alignment, spacing: 2) {
            ForEach(slots, id: \.0) { index, comp in
                PlayerComplicationView(
                    complication: comp,
                    display: display,
                    actions: actions,
                    style: .dock(transparency: dockTransparency),
                    iconTrailing: alignment == .trailing,
                )
                .slotEditable(SlotRef(region: region, index: index), editing)
            }
        }
    }

    private var centerControls: some View {
        HStack(spacing: 16) {
            ForEach(visibleCenter, id: \.0) { index, comp in
                PlayerComplicationView(
                    complication: comp,
                    display: display,
                    actions: actions,
                    style: .dock(transparency: dockTransparency),
                )
                .slotEditable(SlotRef(region: .dockCenter, index: index), editing)
            }
        }
    }

    private var topPositionedLayout: some View {
        VStack {
            HStack(alignment: .top) {
                if !visibleLeading.isEmpty {
                    slotStack(visibleLeading, region: leftRegion, alignment: .leading)
                }
                Spacer()
                if !visibleTrailing.isEmpty {
                    slotStack(visibleTrailing, region: rightRegion, alignment: .trailing)
                }
            }
            .padding(.horizontal, 38)
            .padding(.top, 16)
            .padding(.bottom, 8)
            .frame(maxWidth: .infinity)
            .background(alignment: .top) {
                if hasStatsToDisplay {
                    backgroundColor.ignoresSafeArea(edges: .top)
                }
            }

            Spacer()
        }
        .ignoresSafeArea(.all)
    }

    private var bottomPositionedLayout: some View {
        VStack {
            Spacer()
            // Equal-flex side columns keep the transport controls truly centered
            // while guaranteeing the stats can never slide underneath them.
            HStack(spacing: 8) {
                Group {
                    if !visibleLeading.isEmpty {
                        slotStack(visibleLeading, region: leftRegion, alignment: .leading)
                    } else {
                        Color.clear.frame(height: 1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if hasPlaybackControlsToDisplay {
                    centerControls
                        .fixedSize()
                }

                Group {
                    if !visibleTrailing.isEmpty {
                        slotStack(visibleTrailing, region: rightRegion, alignment: .trailing)
                    } else {
                        Color.clear.frame(height: 1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .frame(
                height: hasPlaybackControlsToDisplay
                    ? Self.controlsContentHeight : Self.statsContentHeight,
            )
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
            .background(alignment: .bottom) {
                if hasDockContent {
                    backgroundColor.ignoresSafeArea(edges: .bottom)
                }
            }
        }
        .ignoresSafeArea(.all)
    }
}

#endif
