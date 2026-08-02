#if os(iOS) || os(macOS)
import SwiftUI

/// Opens the category view for a piece of book metadata. Unset on iOS, which navigates
/// through the surrounding stack instead.
struct MetadataLinkAction {
    let handler: ((MetadataLinkTarget) -> Void)?

    var isAvailable: Bool { handler != nil }

    func callAsFunction(_ target: MetadataLinkTarget) {
        handler?(target)
    }
}

private struct MetadataLinkActionKey: EnvironmentKey {
    nonisolated(unsafe) static let defaultValue = MetadataLinkAction(handler: nil)
}

extension EnvironmentValues {
    var metadataLinkAction: MetadataLinkAction {
        get { self[MetadataLinkActionKey.self] }
        set { self[MetadataLinkActionKey.self] = newValue }
    }
}

/// Metadata text that opens its category view, or the plain label when the target has no
/// destination on this platform.
struct BookMetadataLink<Label: View>: View {
    let target: MetadataLinkTarget
    @ViewBuilder let label: () -> Label

    #if os(macOS)
    @Environment(\.metadataLinkAction) private var linkAction
    @State private var isHovering = false
    #endif

    var body: some View {
        #if os(macOS)
        if linkAction.isAvailable {
            Button {
                linkAction(target)
            } label: {
                label()
                    .underline(isHovering)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .onHover { isHovering = $0 }
            .help("Show all for \(target.displayValue)")
        } else {
            label()
        }
        #else
        iosLink
        #endif
    }

    #if os(iOS)
    private var iosLink: some View {
        NavigationLink(value: target) {
            label()
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
    #endif
}

#if os(iOS)
extension View {
    /// The book detail is pushed from many stacks, so it registers the category destinations
    /// itself rather than relying on the one that pushed it.
    func metadataLinkDestinations(mediaKind: MediaKind) -> some View {
        navigationDestination(for: MetadataLinkTarget.self) { target in
            let config = target.configuration(
                mediaKind: mediaKind,
                preferredTileWidth: 110,
                minimumTileWidth: 90,
            )
            MediaGridView(
                title: config.title,
                mediaKind: config.mediaKind,
                viewOptionsKey: "\(target.viewOptionsKey).\(config.mediaKind.rawValue)",
                tagFilter: config.tagFilter,
                seriesFilter: config.seriesFilter,
                collectionFilter: config.collectionFilter,
                authorFilter: config.authorFilter,
                narratorFilter: config.narratorFilter,
                translatorFilter: config.translatorFilter,
                publicationYearFilter: config.publicationYearFilter,
                ratingFilter: config.ratingFilter,
                statusFilter: config.statusFilter,
                defaultSort: "titleAZ",
                preferredTileWidth: 110,
                minimumTileWidth: 90,
                columnBreakpoints: [MediaGridView.ColumnBreakpoint(columns: 3, minWidth: 0)],
            )
            .navigationTitle(config.title)
        }
    }
}
#endif

/// A wrapping, comma-separated run of linked metadata values.
struct BookMetadataLinkRun: View {
    let values: [String]
    let target: (String) -> MetadataLinkTarget
    var prefix: String? = nil
    var prefixColor: Color = .secondary
    var valueColor: Color = .primary
    var alignment: HorizontalAlignment = .center

    var body: some View {
        MetadataFlowLayout(spacing: 0, lineSpacing: 2, alignment: alignment) {
            if let prefix {
                Text(prefix)
                    .foregroundStyle(prefixColor)
            }
            ForEach(Array(values.enumerated()), id: \.offset) { index, value in
                BookMetadataLink(target: target(value)) {
                    Text(index < values.count - 1 ? "\(value), " : value)
                        .foregroundStyle(valueColor)
                }
            }
        }
    }
}

struct MetadataFlowLayout: Layout {
    var spacing: CGFloat = 4
    var lineSpacing: CGFloat = 4
    var alignment: HorizontalAlignment = .center

    private struct Line {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func lines(for sizes: [CGSize], maxWidth: CGFloat) -> [Line] {
        var result: [Line] = []
        var current = Line()

        for (index, size) in sizes.enumerated() {
            let gap = current.indices.isEmpty ? 0 : spacing
            if !current.indices.isEmpty, current.width + gap + size.width > maxWidth {
                result.append(current)
                current = Line()
            }
            let leading = current.indices.isEmpty ? 0 : spacing
            current.indices.append(index)
            current.width += leading + size.width
            current.height = max(current.height, size.height)
        }

        if !current.indices.isEmpty { result.append(current) }
        return result
    }

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache _: inout Void,
    ) -> CGSize {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let maxWidth = proposal.width ?? .infinity
        let laidOut = lines(for: sizes, maxWidth: maxWidth)
        let width = laidOut.map(\.width).max() ?? 0
        let height =
            laidOut.map(\.height).reduce(0, +)
            + (lineSpacing * CGFloat(max(laidOut.count - 1, 0)))
        return CGSize(width: min(width, maxWidth), height: height)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal _: ProposedViewSize,
        subviews: Subviews,
        cache _: inout Void,
    ) {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        var y = bounds.minY

        for line in lines(for: sizes, maxWidth: bounds.width) {
            var x: CGFloat
            switch alignment {
                case .leading: x = bounds.minX
                case .trailing: x = bounds.maxX - line.width
                default: x = bounds.minX + ((bounds.width - line.width) / 2)
            }

            for index in line.indices {
                let size = sizes[index]
                subviews[index].place(
                    at: CGPoint(x: x, y: y + ((line.height - size.height) / 2)),
                    proposal: ProposedViewSize(size),
                )
                x += size.width + spacing
            }
            y += line.height + lineSpacing
        }
    }
}

#endif
