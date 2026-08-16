#if os(macOS)
import AppKit
import SwiftUI

struct ImageViewerWindow: View {
    let request: ImageViewerRequest?

    @State private var zoom: CGFloat = 1
    @State private var fitMode = true
    @State private var image: NSImage?
    @State private var viewportSize: CGSize = .zero
    @State private var captionVisible = true
    @State private var pixelSize: CGSize?

    private var viewModel: EbookPlayerViewModel? {
        request.flatMap { EbookWindowRouter.shared.viewModel(for: $0.bookID) }
    }

    private var item: BookImageItem? {
        guard let request, let viewModel else { return nil }
        return viewModel.imageItems.first { $0.id == request.imageID }
    }

    var body: some View {
        Group {
            if let item, let viewModel {
                content(item: item, viewModel: viewModel)
            } else {
                ContentUnavailableView(
                    "Image Unavailable",
                    systemImage: "photo",
                    description: Text("The reader window for this book is closed."),
                )
                .frame(minWidth: 380, minHeight: 300)
            }
        }
        .background(WindowFloatingConfigurator(
            mergeToolbarIntoTitlebar: true,
            desiredContentSize: desiredWindowSize,
        ))
    }

    private func content(item: BookImageItem, viewModel: EbookPlayerViewModel) -> some View {
        ZStack(alignment: .top) {
            GeometryReader { geometry in
                ScrollView([.horizontal, .vertical]) {
                    imageBody(in: geometry.size)
                        .frame(
                            minWidth: geometry.size.width,
                            minHeight: geometry.size.height,
                        )
                }
                .task(id: "\(geometry.size.width)x\(geometry.size.height)") {
                    viewportSize = geometry.size
                }
            }
            .padding(.top, toolbarHeight)
            .background(Color.black)

            toolbar(item: item, viewModel: viewModel)

            if captionVisible, let caption = overflowCaption(for: item) {
                VStack {
                    Spacer()
                    Text(caption)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.ultraThinMaterial)
                }
            }
        }
        .ignoresSafeArea(.container, edges: .top)
        .frame(minWidth: 420, minHeight: 320)
        .task(id: item.id) {
            guard let provider = viewModel.imageProvider else { return }
            image = await Task.detached(priority: .userInitiated) {
                provider.fullImage(for: item)
            }.value
            pixelSize = await Task.detached(priority: .utility) {
                provider.pixelSize(for: item)
            }.value
        }
    }

    private let toolbarHeight: CGFloat = 36

    private var desiredWindowSize: CGSize? {
        guard let image, image.size.width > 0, image.size.height > 0 else { return nil }
        let maxSize = CGSize(width: 1200, height: 900)
        let scale = min(
            1.5,
            maxSize.width / image.size.width,
            maxSize.height / image.size.height,
        )
        let width = max(420, image.size.width * scale)
        let height = max(320, image.size.height * scale + toolbarHeight)
        return CGSize(width: width, height: height)
    }

    // Length gate drops junk alt text like "image" or "img".
    private func overflowCaption(for item: BookImageItem) -> String? {
        guard let caption = item.caption ?? item.altText, caption.count >= 8 else { return nil }
        return caption
    }

    private func toolbar(item: BookImageItem, viewModel: EbookPlayerViewModel) -> some View {
        HStack(spacing: 10) {
            // Clears the traffic lights.
            Spacer()
                .frame(width: 58)

            Text(metaLabel(item: item, viewModel: viewModel))
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer(minLength: 12)

            zoomCluster

            if overflowCaption(for: item) != nil {
                Button {
                    captionVisible.toggle()
                } label: {
                    Image(systemName: "text.below.photo")
                        .symbolVariant(captionVisible ? .fill : .none)
                }
                .buttonStyle(.borderless)
                .help(captionVisible ? "Hide caption" : "Show caption")
            }

            Button("Go to") {
                Task { await viewModel.navigateToImage(item) }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .fixedSize()
        }
        .padding(.horizontal, 10)
        .frame(height: toolbarHeight)
        .background(.ultraThinMaterial)
        .overlay(alignment: .bottom) {
            Divider()
        }
    }

    private var zoomCluster: some View {
        HStack(spacing: 0) {
            Button {
                stepZoom(by: 1 / 1.25)
            } label: {
                Image(systemName: "minus.magnifyingglass")
            }
            .buttonStyle(.borderless)
            .frame(width: 26)

            Button {
                fitMode = true
            } label: {
                Text(fitMode ? "Fit" : "\(Int(zoom * 100))%")
                    .font(.system(size: 11, weight: .medium).monospacedDigit())
                    .frame(width: 42)
            }
            .buttonStyle(.borderless)
            .help("Fit to window")

            Button {
                stepZoom(by: 1.25)
            } label: {
                Image(systemName: "plus.magnifyingglass")
            }
            .buttonStyle(.borderless)
            .frame(width: 26)
        }
        .padding(.vertical, 3)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color.primary.opacity(0.06))
        )
    }

    private func stepZoom(by factor: CGFloat) {
        if fitMode {
            zoom = currentFitScale()
            fitMode = false
        }
        zoom = min(8, max(0.1, zoom * factor))
    }

    private func currentFitScale() -> CGFloat {
        guard let image else { return 1 }
        return fitScale(for: image.size, in: viewportSize)
    }

    @ViewBuilder
    private func imageBody(in available: CGSize) -> some View {
        if let image {
            let scale = fitMode ? fitScale(for: image.size, in: available) : zoom
            Image(nsImage: image)
                .resizable()
                .interpolation(.high)
                .frame(
                    width: image.size.width * scale,
                    height: image.size.height * scale,
                )
        } else {
            ProgressView()
        }
    }

    private func fitScale(for imageSize: NSSize, in available: CGSize) -> CGFloat {
        guard imageSize.width > 0, imageSize.height > 0,
            available.width > 0, available.height > 0
        else { return 1 }
        return min(
            available.width / imageSize.width,
            available.height / imageSize.height,
        )
    }

    private func metaLabel(item: BookImageItem, viewModel: EbookPlayerViewModel) -> String {
        var parts = [item.kind.rawValue.capitalized]
        if let page = item.pageLabel {
            parts.append("p. \(page)")
        } else if let label = viewModel.bookStructure[safe: item.sectionIndex]?.label {
            parts.append(label)
        }
        if let pixelSize {
            parts.append(BookImageFormatting.dimensions(pixelSize))
        }
        return parts.joined(separator: " \u{00B7} ")
    }
}

// Floats auxiliary reader windows above the main reader window.
struct WindowFloatingConfigurator: NSViewRepresentable {
    var mergeToolbarIntoTitlebar = false
    var desiredContentSize: CGSize? = nil

    final class Coordinator {
        var appliedContentSize: CGSize?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            configure(view.window, coordinator: context.coordinator)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async {
            configure(nsView.window, coordinator: context.coordinator)
        }
    }

    private func configure(_ window: NSWindow?, coordinator: Coordinator) {
        guard let window else { return }
        window.level = .floating
        window.collectionBehavior.insert(.fullScreenAuxiliary)
        window.isExcludedFromWindowsMenu = true

        if mergeToolbarIntoTitlebar {
            window.titleVisibility = .hidden
            window.titlebarAppearsTransparent = true
            window.styleMask.insert(.fullSizeContentView)
        }

        if let desiredContentSize, coordinator.appliedContentSize != desiredContentSize {
            coordinator.appliedContentSize = desiredContentSize
            var size = desiredContentSize
            if let screen = window.screen ?? NSScreen.main {
                let limit = screen.visibleFrame.size
                let scale = min(1, limit.width * 0.9 / size.width, limit.height * 0.9 / size.height)
                size = CGSize(width: size.width * scale, height: size.height * scale)
            }
            window.setContentSize(size)
        }
    }
}
#endif
