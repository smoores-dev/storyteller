#if os(macOS)
import AppKit
import SwiftUI

struct SidebarImagesGrid: View {
    let viewModel: EbookPlayerViewModel
    let sidebarModel: EbookSidebarModel
    let theme: EbookSidebarTheme

    @Environment(\.openWindow) private var openWindow

    private var items: [BookImageItem] {
        viewModel.imageItems
    }

    var body: some View {
        Group {
            switch viewModel.imageIndexState {
                case .idle, .loading:
                    VStack {
                        ProgressView()
                        Spacer()
                    }
                    .padding(.top, 40)
                case .failed:
                    unavailable(
                        "Images Unavailable",
                        icon: "exclamationmark.triangle",
                        message: "The book's images could not be indexed.",
                    )
                case .ready:
                    if items.isEmpty {
                        unavailable(
                            "No Images",
                            icon: "photo",
                            message: "This book has no indexed images.",
                        )
                    } else {
                        grid
                    }
            }
        }
        // URL-keyed so a nil at first appear retries once the session prepares.
        .task(id: viewModel.session?.originalEbookURL) {
            await viewModel.buildImageIndexIfNeeded()
        }
    }

    private func unavailable(_ title: String, icon: String, message: String) -> some View {
        VStack {
            ContentUnavailableView(title, systemImage: icon, description: Text(message))
            Spacer()
        }
        .padding(.top, 20)
    }

    private var grid: some View {
        ScrollView {
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible())],
                spacing: 14,
            ) {
                ForEach(items) { item in
                    SidebarImageCell(
                        item: item,
                        provider: viewModel.imageProvider,
                        theme: theme,
                        positionLabel: positionLabel(for: item),
                        onOpen: { open(item) },
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
    }

    private func open(_ item: BookImageItem) {
        guard let bookID = viewModel.bookData?.metadata.id else { return }
        openWindow(
            id: "EbookImageViewer",
            value: ImageViewerRequest(bookID: bookID, imageID: item.id),
        )
    }

    private func positionLabel(for item: BookImageItem) -> String {
        if let page = item.pageLabel {
            return "p. \(page)"
        }
        if let label = viewModel.bookStructure[safe: item.sectionIndex]?.label {
            return label
        }
        return "Section \(item.sectionIndex + 1)"
    }
}

private struct SidebarImageCell: View {
    let item: BookImageItem
    let provider: BookImageDataProvider?
    let theme: EbookSidebarTheme
    let positionLabel: String
    let onOpen: () -> Void

    @State private var pixelSize: CGSize?

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 4) {
                ZStack(alignment: .bottomLeading) {
                    SidebarImageThumbnail(
                        item: item,
                        provider: provider,
                        placeholderColor: theme.foreground.opacity(0.08),
                    )
                    .frame(height: 86)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

                    Text(item.kind.rawValue)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.85))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(
                            Capsule().fill(Color.black.opacity(0.45))
                        )
                        .padding(5)
                }

                Text(item.displayTitle)
                    .font(.caption)
                    .foregroundStyle(theme.foreground)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(theme.tertiary)
                    .lineLimit(1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(pixelSize.map { "\(positionLabel) \(BookImageFormatting.dimensions($0))" }
            ?? positionLabel)
        .task(id: item.id) {
            guard let provider else { return }
            pixelSize = await Task.detached(priority: .utility) {
                provider.pixelSize(for: item)
            }.value
        }
    }

    private var subtitle: String {
        guard let pixelSize else { return positionLabel }
        return "\(positionLabel) \u{00B7} \(BookImageFormatting.dimensions(pixelSize))"
    }
}

struct SidebarImageThumbnail: View {
    let item: BookImageItem
    let provider: BookImageDataProvider?
    let placeholderColor: Color

    @State private var image: NSImage?

    var body: some View {
        // A bare .fill image reports its overflowing width and escapes the grid cell.
        Color.clear
            .overlay {
                if let image {
                    let aspect = image.size.height > 0 ? image.size.width / image.size.height : 1
                    Image(nsImage: image)
                        .resizable()
                        .modifier(AspectAwareScaling(extremeAspect: aspect > 2.5 || aspect < 0.4))
                } else {
                    Rectangle()
                        .fill(placeholderColor)
                        .overlay(
                            Image(systemName: "photo")
                                .foregroundStyle(.secondary)
                        )
                }
            }
            .clipped()
        .task(id: item.id) {
            guard image == nil, let provider else { return }
            let loaded = await Task.detached(priority: .utility) {
                provider.thumbnail(for: item, maxPixelSize: 320)
            }.value
            image = loaded
        }
    }
}

private struct AspectAwareScaling: ViewModifier {
    let extremeAspect: Bool

    func body(content: Content) -> some View {
        if extremeAspect {
            content.scaledToFit()
        } else {
            content.scaledToFill()
        }
    }
}
#endif
