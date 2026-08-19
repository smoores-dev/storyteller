#if os(iOS)
import SwiftUI
import UIKit

struct ImageGallerySheet: View {
    let items: [BookImageItem]
    let state: EbookPlayerViewModel.ImageIndexState
    let provider: BookImageDataProvider?
    let positionLabel: (BookImageItem) -> String
    let onNavigate: (BookImageItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var viewing: BookImageItem?

    private let columns = [
        GridItem(.adaptive(minimum: 108), spacing: 12)
    ]

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Images")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
        }
        .fullScreenCover(item: $viewing) { item in
            ImageGalleryViewer(
                item: item,
                provider: provider,
                subtitle: positionLabel(item),
                onNavigate: {
                    viewing = nil
                    dismiss()
                    onNavigate(item)
                },
            )
        }
    }

    @ViewBuilder
    private var content: some View {
        switch state {
            case .idle, .loading:
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed:
                ContentUnavailableView(
                    "Images Unavailable",
                    systemImage: "exclamationmark.triangle",
                    description: Text("The book's images could not be indexed."),
                )
            case .ready:
                if items.isEmpty {
                    ContentUnavailableView(
                        "No Images",
                        systemImage: "photo",
                        description: Text("This book has no indexed images."),
                    )
                } else {
                    grid
                }
        }
    }

    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(items) { item in
                    Button {
                        viewing = item
                    } label: {
                        GalleryCell(
                            item: item,
                            provider: provider,
                            positionLabel: positionLabel(item),
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
    }
}

private struct GalleryCell: View {
    let item: BookImageItem
    let provider: BookImageDataProvider?
    let positionLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ZStack(alignment: .bottomLeading) {
                GalleryThumbnail(item: item, provider: provider)
                    .frame(height: 104)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                Text(item.kind.rawValue)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color.black.opacity(0.45)))
                    .padding(5)
            }

            Text(item.displayTitle)
                .font(.caption)
                .foregroundStyle(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            Text(positionLabel)
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .lineLimit(1)
        }
        .contentShape(Rectangle())
    }
}

private struct GalleryThumbnail: View {
    let item: BookImageItem
    let provider: BookImageDataProvider?

    @State private var image: UIImage?

    var body: some View {
        // A bare .fill image reports its overflowing width and escapes the grid cell.
        Color.clear
            .overlay {
                if let image {
                    let aspect = image.size.height > 0 ? image.size.width / image.size.height : 1
                    Image(uiImage: image)
                        .resizable()
                        .modifier(GalleryAspectScaling(
                            extremeAspect: aspect > 2.5 || aspect < 0.4,
                        ))
                } else {
                    Rectangle()
                        .fill(Color.secondary.opacity(0.12))
                        .overlay(
                            Image(systemName: "photo")
                                .foregroundStyle(.secondary)
                        )
                }
            }
            .clipped()
            .task(id: item.id) {
                guard image == nil, let provider else { return }
                image = await Task.detached(priority: .utility) {
                    provider.thumbnail(for: item, maxPixelSize: 400)
                }.value
            }
    }
}

private struct GalleryAspectScaling: ViewModifier {
    let extremeAspect: Bool

    func body(content: Content) -> some View {
        if extremeAspect {
            content.scaledToFit()
        } else {
            content.scaledToFill()
        }
    }
}

struct ImageGalleryViewer: View {
    let item: BookImageItem
    let provider: BookImageDataProvider?
    let subtitle: String
    let onNavigate: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?
    @State private var pixelSize: CGSize?
    @State private var zoom: CGFloat = 1
    @State private var gestureZoom: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var gestureOffset: CGSize = .zero
    @State private var chromeVisible = true

    private var totalZoom: CGFloat { zoom * gestureZoom }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let image {
                imageBody(image)
            } else {
                ProgressView()
                    .tint(.white)
            }

            if chromeVisible {
                VStack {
                    topBar
                    Spacer()
                    if let caption {
                        Text(caption)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.85))
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(.black.opacity(0.55))
                    }
                }
            }
        }
        .statusBarHidden(!chromeVisible)
        .task(id: item.id) {
            guard let provider else { return }
            image = await Task.detached(priority: .userInitiated) {
                provider.fullImage(for: item)
            }.value
            pixelSize = await Task.detached(priority: .utility) {
                provider.pixelSize(for: item)
            }.value
        }
    }

    private var caption: String? {
        // Length gate drops junk alt text like "image" or "img".
        guard let caption = item.caption ?? item.altText, caption.count >= 8 else { return nil }
        return caption
    }

    private var topBar: some View {
        HStack(spacing: 12) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(.black.opacity(0.45)))
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(item.displayTitle)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                Text(metaLabel)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
            }
            .foregroundStyle(.white)

            Spacer(minLength: 8)

            Button("Go to", action: onNavigate)
                .font(.system(size: 13, weight: .semibold))
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .fixedSize()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.black.opacity(0.35))
    }

    private var metaLabel: String {
        var parts = [item.kind.rawValue.capitalized, subtitle]
        if let pixelSize {
            parts.append(BookImageFormatting.dimensions(pixelSize))
        }
        return parts.filter { !$0.isEmpty }.joined(separator: " \u{00B7} ")
    }

    private func imageBody(_ image: UIImage) -> some View {
        Image(uiImage: image)
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .scaleEffect(totalZoom)
            .offset(
                x: offset.width + gestureOffset.width,
                y: offset.height + gestureOffset.height,
            )
            .gesture(
                MagnifyGesture()
                    .onChanged { gestureZoom = $0.magnification }
                    .onEnded { _ in
                        zoom = min(8, max(1, zoom * gestureZoom))
                        gestureZoom = 1
                        if zoom == 1 { offset = .zero }
                    }
            )
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in
                        guard totalZoom > 1 else { return }
                        gestureOffset = value.translation
                    }
                    .onEnded { _ in
                        offset.width += gestureOffset.width
                        offset.height += gestureOffset.height
                        gestureOffset = .zero
                    }
            )
            .onTapGesture(count: 2) {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if zoom > 1 {
                        zoom = 1
                        offset = .zero
                    } else {
                        zoom = 2.5
                    }
                }
            }
            .onTapGesture {
                withAnimation(.easeInOut(duration: 0.15)) {
                    chromeVisible.toggle()
                }
            }
            .animation(.interactiveSpring, value: zoom)
    }
}
#endif
