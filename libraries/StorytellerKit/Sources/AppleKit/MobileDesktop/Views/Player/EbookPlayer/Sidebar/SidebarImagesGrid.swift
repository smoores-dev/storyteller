#if os(macOS)
import AppKit
import SwiftUI

struct SidebarImagesGrid: View {
    let viewModel: EbookPlayerViewModel
    let sidebarModel: EbookSidebarModel
    let theme: EbookSidebarTheme

    @Environment(\.openWindow) private var openWindow
    @State private var previewItem: BookImageItem?

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
        GeometryReader { geometry in
            VStack(spacing: 0) {
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
                                isPreviewing: previewItem?.id == item.id,
                                onPreview: { previewItem = item },
                                onPopOut: { open(item) },
                            )
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }

                if let previewItem {
                    SidebarImagePreviewPanel(
                        item: previewItem,
                        provider: viewModel.imageProvider,
                        theme: theme,
                        caption: positionLabel(for: previewItem),
                        maxHeight: max(geometry.size.height * 0.55, 160),
                        onPopOut: { open(previewItem) },
                        onClose: { self.previewItem = nil },
                    )
                }
            }
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
    let isPreviewing: Bool
    let onPreview: () -> Void
    let onPopOut: () -> Void

    @State private var pixelSize: CGSize?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(action: onPreview) {
                SidebarImageThumbnail(
                    item: item,
                    provider: provider,
                    placeholderColor: theme.foreground.opacity(0.08),
                )
                .frame(height: 86)
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(theme.accent, lineWidth: isPreviewing ? 2 : 0)
            }
            .overlay(alignment: .topTrailing) {
                Button(action: onPopOut) {
                    Image(systemName: "arrow.up.forward.square")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(4)
                        .background(Circle().fill(Color.black.opacity(0.45)))
                }
                .buttonStyle(.plain)
                .help("Open in separate window")
                .padding(4)
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

private struct SidebarImagePreviewPanel: View {
    let item: BookImageItem
    let provider: BookImageDataProvider?
    let theme: EbookSidebarTheme
    let caption: String
    let maxHeight: CGFloat
    let onPopOut: () -> Void
    let onClose: () -> Void

    @State private var image: NSImage?

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            ZStack(alignment: .topTrailing) {
                Group {
                    if let image {
                        Image(nsImage: image)
                            .resizable()
                            .scaledToFit()
                    } else {
                        ProgressView()
                            .frame(height: 120)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(maxHeight: maxHeight)

                HStack(spacing: 6) {
                    Button(action: onPopOut) {
                        Image(systemName: "arrow.up.forward.square")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(5)
                            .background(Circle().fill(Color.black.opacity(0.5)))
                    }
                    .help("Open in separate window")

                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(5)
                            .background(Circle().fill(Color.black.opacity(0.5)))
                    }
                    .help("Close preview")
                }
                .buttonStyle(.plain)
                .padding(8)
            }

            Text(item.displayTitle.isEmpty ? caption : "\(item.displayTitle) \u{00B7} \(caption)")
                .font(.caption2)
                .foregroundStyle(theme.tertiary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
        }
        .background(theme.foreground.opacity(0.05))
        .task(id: item.id) {
            image = nil
            guard let provider else { return }
            image = await Task.detached(priority: .userInitiated) {
                provider.thumbnail(for: item, maxPixelSize: 1600)
            }.value
        }
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
