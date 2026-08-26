#if os(macOS)
import AppKit
import SwiftUI

struct SidebarImagesGrid: View {
    let viewModel: EbookPlayerViewModel
    let sidebarModel: EbookSidebarModel
    let theme: EbookSidebarTheme

    @Environment(\.openWindow) private var openWindow
    @State private var previewItem: BookImageItem?
    @State private var showHiddenList = false
    @AppStorage("SidebarImagesShowTiny") private var showTiny = false

    private var visibleItems: [BookImageItem] {
        let pinned = viewModel.pinnedImageIDs
        let hidden = viewModel.hiddenImageIDs
        let tiny = viewModel.tinyImageIDs
        let shown = viewModel.imageItems.filter { item in
            !hidden.contains(item.id) && (showTiny || !tiny.contains(item.id))
        }
        guard !pinned.isEmpty else { return shown }
        return shown.filter { pinned.contains($0.id) }
            + shown.filter { !pinned.contains($0.id) }
    }

    private var hiddenItems: [BookImageItem] {
        viewModel.imageItems.filter { viewModel.hiddenImageIDs.contains($0.id) }
    }

    private var tinyFilteredCount: Int {
        viewModel.tinyImageIDs.subtracting(viewModel.hiddenImageIDs).count
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
                    if viewModel.imageItems.isEmpty {
                        unavailable(
                            "No Images",
                            icon: "photo",
                            message: "This book has no indexed images.",
                        )
                    } else if let previewItem {
                        zenPreview(previewItem)
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
                ForEach(visibleItems) { item in
                    SidebarImageCell(
                        item: item,
                        provider: viewModel.imageProvider,
                        theme: theme,
                        positionLabel: positionLabel(for: item),
                        isPinned: viewModel.pinnedImageIDs.contains(item.id),
                        onPreview: { previewItem = item },
                        onPopOut: { open(item) },
                        onPin: { pinned in viewModel.setImagePinned(item, pinned: pinned) },
                        onHide: { viewModel.setImageHidden(item, hidden: true) },
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            footer
        }
    }

    @ViewBuilder
    private var footer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !hiddenItems.isEmpty {
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) { showHiddenList.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: showHiddenList ? "chevron.down" : "chevron.right")
                            .font(.caption2)
                        Text("Hidden (\(hiddenItems.count))")
                            .font(.caption)
                    }
                    .foregroundStyle(theme.secondary)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if showHiddenList {
                    ForEach(hiddenItems) { item in
                        hiddenRow(item)
                    }
                }
            }

            if tinyFilteredCount > 0 {
                Button {
                    showTiny.toggle()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: showTiny ? "eye" : "eye.slash")
                            .font(.caption2)
                        Text(
                            showTiny
                                ? "Showing \(tinyFilteredCount) small images"
                                : "\(tinyFilteredCount) small images filtered"
                        )
                        .font(.caption)
                    }
                    .foregroundStyle(theme.tertiary)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(showTiny ? "Filter small images" : "Show small images")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
    }

    private func hiddenRow(_ item: BookImageItem) -> some View {
        HStack(spacing: 8) {
            SidebarImageThumbnail(
                item: item,
                provider: viewModel.imageProvider,
                placeholderColor: theme.foreground.opacity(0.08),
            )
            .frame(width: 30, height: 22)
            .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))

            Text(item.displayTitle)
                .font(.caption)
                .foregroundStyle(theme.secondary)
                .lineLimit(1)

            Spacer()

            Button {
                viewModel.setImageHidden(item, hidden: false)
            } label: {
                Image(systemName: "eye")
                    .font(.caption)
                    .foregroundStyle(theme.secondary)
            }
            .buttonStyle(.plain)
            .help("Unhide image")
        }
    }

    private func zenPreview(_ item: BookImageItem) -> some View {
        SidebarImageZenView(
            item: item,
            provider: viewModel.imageProvider,
            theme: theme,
            caption: positionLabel(for: item),
            onPopOut: { open(item) },
            onClose: { previewItem = nil },
            onStep: { delta in step(from: item, by: delta) },
        )
    }

    private func step(from item: BookImageItem, by delta: Int) {
        let items = visibleItems
        guard let index = items.firstIndex(where: { $0.id == item.id }) else {
            previewItem = items.first
            return
        }
        let next = index + delta
        guard items.indices.contains(next) else { return }
        previewItem = items[next]
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
    let isPinned: Bool
    let onPreview: () -> Void
    let onPopOut: () -> Void
    let onPin: (Bool) -> Void
    let onHide: () -> Void

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
            .overlay(alignment: .topLeading) {
                if isPinned {
                    Image(systemName: "pin.fill")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(4)
                        .background(Circle().fill(Color.black.opacity(0.45)))
                        .padding(4)
                }
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
        .contextMenu {
            Button(isPinned ? "Unpin" : "Pin") { onPin(!isPinned) }
            Button("Hide Image") { onHide() }
            Divider()
            Button("Open in Separate Window") { onPopOut() }
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

private struct SidebarImageZenView: View {
    let item: BookImageItem
    let provider: BookImageDataProvider?
    let theme: EbookSidebarTheme
    let caption: String
    let onPopOut: () -> Void
    let onClose: () -> Void
    let onStep: (Int) -> Void

    @State private var image: NSImage?
    @State private var hovering = false

    var body: some View {
        ZStack {
            Group {
                if let image {
                    Image(nsImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(14)
                } else {
                    ProgressView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            VStack {
                HStack {
                    Spacer()
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
                        .help("Back to all images")
                    }
                    .buttonStyle(.plain)
                    .padding(10)
                }
                Spacer()
                Text(item.displayTitle.isEmpty ? caption : "\(item.displayTitle) \u{00B7} \(caption)")
                    .font(.caption2)
                    .foregroundStyle(theme.tertiary)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
            }

            if hovering {
                HStack {
                    stepButton(systemName: "chevron.left", delta: -1)
                    Spacer()
                    stepButton(systemName: "chevron.right", delta: 1)
                }
                .padding(.horizontal, 8)
            }
        }
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .task(id: item.id) {
            image = nil
            guard let provider else { return }
            image = await Task.detached(priority: .userInitiated) {
                provider.thumbnail(for: item, maxPixelSize: 2600)
            }.value
        }
    }

    private func stepButton(systemName: String, delta: Int) -> some View {
        Button {
            onStep(delta)
        } label: {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
                .padding(7)
                .background(Circle().fill(Color.black.opacity(0.4)))
        }
        .buttonStyle(.plain)
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
