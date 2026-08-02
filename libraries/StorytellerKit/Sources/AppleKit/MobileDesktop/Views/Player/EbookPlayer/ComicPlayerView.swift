#if os(iOS) || os(macOS)
import SwiftUI

#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct ComicPlayerView: View {
    let pageURLs: [URL]
    let selectedPageIndex: Int
    let backgroundColor: Color
    let isBottomScrubberVisible: Bool
    let isTopChromeVisible: Bool
    let onPageSelected: (Int) -> Void
    let onNavigateLeft: () -> Void
    let onNavigateRight: () -> Void
    let onToggleOverlay: () -> Void

    var body: some View {
        Group {
            if let pageURL = pageURLs[safe: selectedPageIndex] {
                PlatformComicPageView(
                    pageURLs: pageURLs,
                    pageURL: pageURL,
                    pageIndex: selectedPageIndex,
                    backgroundColor: backgroundColor,
                    isBottomScrubberVisible: isBottomScrubberVisible,
                    isTopChromeVisible: isTopChromeVisible,
                    onPageSelected: onPageSelected,
                    onTapLeft: onNavigateLeft,
                    onTapRight: onNavigateRight,
                    onTapCenter: onToggleOverlay,
                )
            } else if pageURLs.isEmpty {
                ProgressView("Loading comic...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(backgroundColor)
        .onKeyPress(.leftArrow) {
            onNavigateLeft()
            return .handled
        }
        .onKeyPress(.rightArrow) {
            onNavigateRight()
            return .handled
        }
    }
}

#if os(iOS)
private struct PlatformComicPageView: UIViewRepresentable {
    let pageURLs: [URL]
    let pageURL: URL
    let pageIndex: Int
    let backgroundColor: Color
    let isBottomScrubberVisible: Bool
    let isTopChromeVisible: Bool
    let onPageSelected: (Int) -> Void
    let onTapLeft: () -> Void
    let onTapRight: () -> Void
    let onTapCenter: () -> Void

    func makeUIView(context: Context) -> UIScrollView {
        let scrollView = ComicScrollView()
        scrollView.delegate = context.coordinator
        scrollView.minimumZoomScale = 1
        scrollView.maximumZoomScale = 8
        scrollView.bouncesZoom = true
        scrollView.showsVerticalScrollIndicator = false
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.backgroundColor = UIColor(backgroundColor)
        scrollView.delaysContentTouches = false
        scrollView.onLayout = { [weak coordinator = context.coordinator, weak scrollView] in
            guard let scrollView else { return }
            coordinator?.layoutImageIfNeeded(in: scrollView)
        }

        let imageView = UIImageView()
        imageView.contentMode = .scaleAspectFit
        imageView.isUserInteractionEnabled = true
        scrollView.addSubview(imageView)
        context.coordinator.imageView = imageView

        let tap = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleTap(_:)),
        )
        tap.delegate = context.coordinator

        let doubleTap = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleDoubleTap(_:)),
        )
        doubleTap.numberOfTapsRequired = 2
        doubleTap.delegate = context.coordinator
        tap.require(toFail: doubleTap)

        let swipeLeft = UISwipeGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleSwipe(_:)),
        )
        swipeLeft.direction = .left
        swipeLeft.delegate = context.coordinator

        let swipeRight = UISwipeGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleSwipe(_:)),
        )
        swipeRight.direction = .right
        swipeRight.delegate = context.coordinator

        scrollView.addGestureRecognizer(tap)
        scrollView.addGestureRecognizer(doubleTap)
        scrollView.addGestureRecognizer(swipeLeft)
        scrollView.addGestureRecognizer(swipeRight)

        return scrollView
    }

    func updateUIView(_ scrollView: UIScrollView, context: Context) {
        context.coordinator.onTapLeft = onTapLeft
        context.coordinator.onTapRight = onTapRight
        context.coordinator.onTapCenter = onTapCenter
        context.coordinator.updateLayoutMode(
            isBottomScrubberVisible: isBottomScrubberVisible,
            isTopChromeVisible: isTopChromeVisible,
        )
        scrollView.backgroundColor = UIColor(backgroundColor)
        context.coordinator.update(pageURL: pageURL, pageIndex: pageIndex, in: scrollView)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    @MainActor
    final class Coordinator: NSObject, UIScrollViewDelegate, UIGestureRecognizerDelegate {
        weak var imageView: UIImageView?
        var onTapLeft: () -> Void = {}
        var onTapRight: () -> Void = {}
        var onTapCenter: () -> Void = {}
        private var loadedPageIndex: Int?
        private var lastLaidOutBounds: CGSize = .zero
        private var isBottomScrubberVisible = false
        private var isTopChromeVisible = false

        func updateLayoutMode(isBottomScrubberVisible: Bool, isTopChromeVisible: Bool) {
            guard
                self.isBottomScrubberVisible != isBottomScrubberVisible
                    || self.isTopChromeVisible != isTopChromeVisible
            else {
                return
            }
            self.isBottomScrubberVisible = isBottomScrubberVisible
            self.isTopChromeVisible = isTopChromeVisible
            lastLaidOutBounds = .zero
            if let scrollView = imageView?.superview as? UIScrollView {
                layoutImageIfNeeded(in: scrollView)
            }
        }

        func update(pageURL: URL, pageIndex: Int, in scrollView: UIScrollView) {
            guard loadedPageIndex != pageIndex else {
                layoutImageIfNeeded(in: scrollView)
                return
            }
            loadedPageIndex = pageIndex
            lastLaidOutBounds = .zero
            imageView?.image = UIImage(contentsOfFile: pageURL.path)
            scrollView.zoomScale = 1
            layoutImage(in: scrollView, force: true)
            scrollView.setNeedsLayout()
        }

        func viewForZooming(in scrollView: UIScrollView) -> UIView? {
            imageView
        }

        func scrollViewDidZoom(_ scrollView: UIScrollView) {
            centerImage(in: scrollView)
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer,
        ) -> Bool {
            true
        }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard gestureRecognizer is UISwipeGestureRecognizer,
                let scrollView = gestureRecognizer.view as? UIScrollView
            else {
                return true
            }
            return scrollView.zoomScale <= scrollView.minimumZoomScale + 0.01
        }

        @objc func handleTap(_ recognizer: UITapGestureRecognizer) {
            guard let view = recognizer.view else { return }
            let x = recognizer.location(in: view).x
            let third = view.bounds.width / 3
            if x < third {
                onTapLeft()
            } else if x > third * 2 {
                onTapRight()
            } else {
                onTapCenter()
            }
        }

        @objc func handleDoubleTap(_ recognizer: UITapGestureRecognizer) {
            guard let scrollView = recognizer.view as? UIScrollView else { return }

            if scrollView.zoomScale > scrollView.minimumZoomScale + 0.01 {
                scrollView.setZoomScale(scrollView.minimumZoomScale, animated: true)
                return
            }

            guard let imageView else { return }
            let point = recognizer.location(in: imageView)
            let targetScale = min(
                max(scrollView.minimumZoomScale * 2.5, 2.5),
                scrollView.maximumZoomScale,
            )
            let zoomSize = CGSize(
                width: scrollView.bounds.width / targetScale,
                height: scrollView.bounds.height / targetScale,
            )
            let zoomOrigin = CGPoint(
                x: point.x - zoomSize.width / 2,
                y: point.y - zoomSize.height / 2,
            )
            scrollView.zoom(to: CGRect(origin: zoomOrigin, size: zoomSize), animated: true)
        }

        @objc func handleSwipe(_ recognizer: UISwipeGestureRecognizer) {
            switch recognizer.direction {
                case .left:
                    onTapRight()
                case .right:
                    onTapLeft()
                default:
                    break
            }
        }

        func layoutImageIfNeeded(in scrollView: UIScrollView) {
            guard scrollView.zoomScale <= scrollView.minimumZoomScale + 0.01 else { return }
            guard scrollView.bounds.size != lastLaidOutBounds else { return }
            layoutImage(in: scrollView, force: false)
        }

        private func layoutImage(in scrollView: UIScrollView, force: Bool) {
            guard let image = imageView?.image, let imageView else { return }
            let bounds = scrollView.bounds
            guard bounds.width > 0, bounds.height > 0 else { return }
            guard force || bounds.size != lastLaidOutBounds else { return }
            lastLaidOutBounds = bounds.size
            let topReservedHeight = isTopChromeVisible ? scrollView.safeAreaInsets.top + 44 : 0
            let bottomReservedHeight =
                isBottomScrubberVisible
                ? max(bounds.height * 0.28, 170)
                : 0
            let verticalMargin: CGFloat = isBottomScrubberVisible ? 14 : 0
            let availableHeight = max(
                bounds.height - topReservedHeight - bottomReservedHeight - (verticalMargin * 2),
                1,
            )
            let scale = min(bounds.width / image.size.width, availableHeight / image.size.height)
            let fittedSize = CGSize(
                width: image.size.width * scale,
                height: image.size.height * scale,
            )
            let originY =
                isBottomScrubberVisible
                ? topReservedHeight + verticalMargin
                    + max((availableHeight - fittedSize.height) / 2, 0)
                : 0
            imageView.frame = CGRect(origin: CGPoint(x: 0, y: originY), size: fittedSize)
            scrollView.contentSize = CGSize(
                width: fittedSize.width,
                height: fittedSize.height + originY + bottomReservedHeight,
            )
            centerImage(in: scrollView)
        }

        private func centerImage(in scrollView: UIScrollView) {
            guard let imageView else { return }
            let horizontalInset = max((scrollView.bounds.width - imageView.frame.width) / 2, 0)
            let verticalInset: CGFloat =
                isBottomScrubberVisible
                ? 0
                : max((scrollView.bounds.height - imageView.frame.height) / 2, 0)
            scrollView.contentInset = UIEdgeInsets(
                top: verticalInset,
                left: horizontalInset,
                bottom: isBottomScrubberVisible ? 0 : verticalInset,
                right: horizontalInset,
            )
        }
    }

    final class ComicScrollView: UIScrollView {
        var onLayout: (() -> Void)?

        override func layoutSubviews() {
            super.layoutSubviews()
            onLayout?()
        }
    }
}
#else
private struct PlatformComicPageView: NSViewRepresentable {
    let pageURLs: [URL]
    let pageURL: URL
    let pageIndex: Int
    let backgroundColor: Color
    let isBottomScrubberVisible: Bool
    let isTopChromeVisible: Bool
    let onPageSelected: (Int) -> Void
    let onTapLeft: () -> Void
    let onTapRight: () -> Void
    let onTapCenter: () -> Void

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = ComicMacScrollView()
        scrollView.allowsMagnification = true
        scrollView.minMagnification = 1
        scrollView.maxMagnification = 8
        scrollView.hasVerticalScroller = false
        scrollView.hasHorizontalScroller = false
        scrollView.drawsBackground = true
        scrollView.backgroundColor = NSColor(backgroundColor)
        scrollView.autohidesScrollers = true
        scrollView.onLayout = { [weak coordinator = context.coordinator, weak scrollView] in
            guard let scrollView else { return }
            coordinator?.layoutPages(in: scrollView)
        }
        scrollView.onNavigateLeft = { [weak coordinator = context.coordinator] in
            coordinator?.navigateLeft()
        }
        scrollView.onNavigateRight = { [weak coordinator = context.coordinator] in
            coordinator?.navigateRight()
        }
        scrollView.onZoomIn = { [weak coordinator = context.coordinator, weak scrollView] in
            guard let scrollView else { return }
            coordinator?.zoom(in: scrollView, multiplier: 1.2)
        }
        scrollView.onZoomOut = { [weak coordinator = context.coordinator, weak scrollView] in
            guard let scrollView else { return }
            coordinator?.zoom(in: scrollView, multiplier: 1 / 1.2)
        }

        let pageView = NSView()
        pageView.wantsLayer = true
        scrollView.documentView = pageView
        context.coordinator.pageView = pageView

        let primaryImageView = Self.makeImageView()
        let secondaryImageView = Self.makeImageView()
        pageView.addSubview(primaryImageView)
        pageView.addSubview(secondaryImageView)
        context.coordinator.primaryImageView = primaryImageView
        context.coordinator.secondaryImageView = secondaryImageView

        let click = NSClickGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleClick(_:)),
        )
        pageView.addGestureRecognizer(click)

        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        context.coordinator.onTapLeft = onTapLeft
        context.coordinator.onTapRight = onTapRight
        context.coordinator.onTapCenter = onTapCenter
        context.coordinator.onPageSelected = onPageSelected
        scrollView.backgroundColor = NSColor(backgroundColor)
        context.coordinator.update(pageURLs: pageURLs, pageIndex: pageIndex, in: scrollView)
        DispatchQueue.main.async {
            scrollView.window?.makeFirstResponder(scrollView)
            context.coordinator.layoutPages(in: scrollView)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    private static func makeImageView() -> NSImageView {
        let imageView = NSImageView()
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.imageAlignment = .alignCenter
        return imageView
    }

    @MainActor
    final class Coordinator: NSObject {
        weak var pageView: NSView?
        weak var primaryImageView: NSImageView?
        weak var secondaryImageView: NSImageView?
        var onTapLeft: () -> Void = {}
        var onTapRight: () -> Void = {}
        var onTapCenter: () -> Void = {}
        var onPageSelected: (Int) -> Void = { _ in }
        private var loadedPageIndex: Int?
        private var pageURLs: [URL] = []
        private var isShowingSpread = false
        private let spreadMinWidth: CGFloat = 1050
        private let spreadGap: CGFloat = 16

        func update(pageURLs: [URL], pageIndex: Int, in scrollView: NSScrollView) {
            self.pageURLs = pageURLs
            guard loadedPageIndex != pageIndex else {
                layoutPages(in: scrollView)
                return
            }
            loadedPageIndex = pageIndex
            primaryImageView?.image = pageURLs[safe: pageIndex].flatMap(NSImage.init(contentsOf:))
            secondaryImageView?.image = pageURLs[safe: pageIndex + 1].flatMap(
                NSImage.init(contentsOf:)
            )
            scrollView.magnification = 1
            layoutPages(in: scrollView)
        }

        @objc func handleClick(_ recognizer: NSClickGestureRecognizer) {
            guard let scrollView = recognizer.view?.enclosingScrollView else { return }
            let x = recognizer.location(in: scrollView).x
            let third = scrollView.bounds.width / 3
            if x < third {
                navigateLeft()
            } else if x > third * 2 {
                navigateRight()
            } else {
                onTapCenter()
            }
        }

        func navigateLeft() {
            if isShowingSpread, let index = loadedPageIndex {
                onPageSelected(max(index - 2, 0))
            } else {
                onTapLeft()
            }
        }

        func navigateRight() {
            if isShowingSpread, let index = loadedPageIndex, !pageURLs.isEmpty {
                onPageSelected(min(index + 2, pageURLs.count - 1))
            } else {
                onTapRight()
            }
        }

        func zoom(in scrollView: NSScrollView, multiplier: CGFloat) {
            guard let documentView = scrollView.documentView else { return }
            let nextMagnification = min(
                max(scrollView.magnification * multiplier, scrollView.minMagnification),
                scrollView.maxMagnification,
            )
            let visibleCenter = CGPoint(
                x: scrollView.contentView.bounds.midX,
                y: scrollView.contentView.bounds.midY,
            )
            let documentCenter = scrollView.contentView.convert(visibleCenter, to: documentView)
            scrollView.setMagnification(nextMagnification, centeredAt: documentCenter)
        }

        func layoutPages(in scrollView: NSScrollView) {
            guard let primaryImage = primaryImageView?.image,
                let primaryImageView,
                let secondaryImageView,
                let pageView
            else {
                return
            }
            let bounds = scrollView.contentView.bounds
            guard bounds.width > 0, bounds.height > 0 else { return }

            let secondaryImage = secondaryImageView.image
            let shouldShowSpread =
                bounds.width >= spreadMinWidth && secondaryImage != nil
            isShowingSpread = shouldShowSpread
            secondaryImageView.isHidden = !shouldShowSpread

            let primarySize = primaryImage.size
            let secondarySize = shouldShowSpread ? (secondaryImage?.size ?? .zero) : .zero
            let naturalWidth =
                shouldShowSpread
                ? primarySize.width + spreadGap + secondarySize.width : primarySize.width
            let naturalHeight = max(primarySize.height, secondarySize.height)
            guard naturalWidth > 0, naturalHeight > 0 else { return }

            let scale = min(bounds.width / naturalWidth, bounds.height / naturalHeight)
            let fittedPrimarySize = NSSize(
                width: primarySize.width * scale,
                height: primarySize.height * scale,
            )
            let fittedSecondarySize = NSSize(
                width: secondarySize.width * scale,
                height: secondarySize.height * scale,
            )
            let fittedGap = shouldShowSpread ? spreadGap : 0
            let fittedSpreadSize = NSSize(
                width: shouldShowSpread
                    ? fittedPrimarySize.width + fittedGap + fittedSecondarySize.width
                    : fittedPrimarySize.width,
                height: max(fittedPrimarySize.height, fittedSecondarySize.height),
            )
            let documentSize = NSSize(
                width: max(bounds.width, fittedSpreadSize.width),
                height: max(bounds.height, fittedSpreadSize.height),
            )
            pageView.frame = NSRect(origin: .zero, size: documentSize)

            let originX = max((documentSize.width - fittedSpreadSize.width) / 2, 0)
            let primaryOriginY = max((documentSize.height - fittedPrimarySize.height) / 2, 0)
            primaryImageView.frame = NSRect(
                origin: CGPoint(x: originX, y: primaryOriginY),
                size: fittedPrimarySize,
            )

            if shouldShowSpread {
                let secondaryOriginY = max(
                    (documentSize.height - fittedSecondarySize.height) / 2,
                    0,
                )
                secondaryImageView.frame = NSRect(
                    origin: CGPoint(
                        x: originX + fittedPrimarySize.width + fittedGap,
                        y: secondaryOriginY,
                    ),
                    size: fittedSecondarySize,
                )
            } else {
                secondaryImageView.frame = .zero
            }
        }
    }

    @MainActor
    final class ComicMacScrollView: NSScrollView {
        var onLayout: (() -> Void)?
        var onNavigateLeft: (() -> Void)?
        var onNavigateRight: (() -> Void)?
        var onZoomIn: (() -> Void)?
        var onZoomOut: (() -> Void)?
        private var keyMonitor: Any?

        override var acceptsFirstResponder: Bool { true }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            updateKeyMonitor()
            window?.makeFirstResponder(self)
        }

        override func layout() {
            super.layout()
            onLayout?()
        }

        override func keyDown(with event: NSEvent) {
            if handleKeyEvent(event) {
                return
            }
            super.keyDown(with: event)
        }

        private func updateKeyMonitor() {
            if let keyMonitor {
                NSEvent.removeMonitor(keyMonitor)
                self.keyMonitor = nil
            }

            guard window != nil else { return }
            keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                guard let self, event.window == self.window else { return event }
                return self.handleKeyEvent(event) ? nil : event
            }
        }

        private func handleKeyEvent(_ event: NSEvent) -> Bool {
            if event.modifierFlags.intersection(.deviceIndependentFlagsMask).contains(.command),
                let character = event.charactersIgnoringModifiers
            {
                switch character {
                    case "+", "=":
                        onZoomIn?()
                        return true
                    case "-", "_":
                        onZoomOut?()
                        return true
                    default:
                        break
                }
            }

            switch event.keyCode {
                case 123:
                    onNavigateLeft?()
                    return true
                case 124:
                    onNavigateRight?()
                    return true
                default:
                    return false
            }
        }
    }
}
#endif

#endif
