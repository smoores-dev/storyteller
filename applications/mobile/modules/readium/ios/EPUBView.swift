import ExpoModulesCore
import Foundation
import WebKit
import ReadiumShared
import ReadiumNavigator
import ReadiumAdapterGCDWebServer

typealias Color = ReadiumNavigator.Color
typealias TextAlignment = ReadiumNavigator.TextAlignment

struct Highlight: Equatable {
    var id: String
    var color: UIColor
    var locator: Locator
}

struct CustomFont: Equatable {
    var uri: String
    var name: String
    var type: String
}

struct Props {
    var bookId: String?
    var locator: Locator?
    var isPlaying: Bool?
    var highlights: [Highlight]?
    var bookmarks: [Locator]?
    var readaloudColor: Color?
    var readaloudDecoratorStyle: String?
    var customFonts: [CustomFont]?
    var foreground: Color?
    var background: Color?
    var fontFamily: FontFamily?
    var lineHeight: Double?
    var paragraphSpacing: Double?
    var fontSize: Double?
    var textAlign: TextAlignment?
    var marginLeft: Int?
    var marginRight: Int?
    var scrollMode: Bool?
}

struct FinalizedProps {
    var bookId: String
    var locator: Locator?
    var isPlaying: Bool
    var highlights: [Highlight]
    var bookmarks: [Locator]
    var readaloudColor: Color
    var readaloudDecoratorStyle: String
    var customFonts: [CustomFont]
    var foreground: Color
    var background: Color
    var fontFamily: FontFamily
    var lineHeight: Double
    var paragraphSpacing: Double
    var fontSize: Double
    var textAlign: TextAlignment
    var marginLeft: Int
    var marginRight: Int
    var scrollMode: Bool
}

private struct EPUBLayoutChange {
    let finalProps: FinalizedProps
    let layoutModeChanged: Bool
    let enteredPageLayout: Bool
    let locatorChangedFromExternalUpdate: Bool
    let playbackStarted: Bool
}

private protocol EPUBLayoutBehavior {
    var supportsPagedClipScheduling: Bool { get }

    func preferences(for view: EPUBView) -> EPUBPreferences
    func submitModePreferences(on view: EPUBView, change: EPUBLayoutChange)
    func shouldNavigateToLocator(on view: EPUBView, change: EPUBLayoutChange) -> Bool
    func navigate(to locator: Locator, on view: EPUBView)
    func handleExternalLocatorChange(
        on view: EPUBView,
        change: EPUBLayoutChange,
        didNavigateToLocator: Bool
    )
    func handlePlayingFragmentChanged(
        on view: EPUBView,
        change: EPUBLayoutChange,
        newFragment: String?,
        oldFragment: String?
    )
    func keepPlayingLocatorVisible(
        on view: EPUBView,
        change: EPUBLayoutChange,
        didNavigateToLocator: Bool
    )
    func submitReadingPreferences(on view: EPUBView, change: EPUBLayoutChange)
    func isProgressionVisible(
        on view: EPUBView,
        currentLocator: Locator,
        progression: Double
    ) async -> Bool?
    func findOnPage(on view: EPUBView, locator: Locator)
    func goBackwardFromScript(on view: EPUBView) async
    func goForwardFromScript(on view: EPUBView) async
}

private struct PagedEPUBLayoutBehavior: EPUBLayoutBehavior {
    let supportsPagedClipScheduling = true

    func preferences(for view: EPUBView) -> EPUBPreferences {
        view.preferences(for: view.props!)
    }

    func submitModePreferences(on view: EPUBView, change: EPUBLayoutChange) {
        if change.enteredPageLayout {
            view.navigator!.submitPreferences(view.preferences(for: change.finalProps, scroll: false))
        }
    }

    func shouldNavigateToLocator(on view: EPUBView, change: EPUBLayoutChange) -> Bool {
        guard let locator = change.finalProps.locator else {
            return false
        }

        return !change.enteredPageLayout && locator != view.navigator?.currentLocation
    }

    func navigate(to locator: Locator, on view: EPUBView) {
        view.go(locator: locator)
    }

    func handleExternalLocatorChange(
        on view: EPUBView,
        change: EPUBLayoutChange,
        didNavigateToLocator: Bool
    ) {}

    func handlePlayingFragmentChanged(
        on view: EPUBView,
        change: EPUBLayoutChange,
        newFragment: String?,
        oldFragment: String?
    ) {
        guard let fragmentId = newFragment, fragmentId != oldFragment || change.enteredPageLayout || change.playbackStarted else {
            return
        }

        view.schedulePagedClipChanged(fragmentId: fragmentId)
    }

    func keepPlayingLocatorVisible(
        on view: EPUBView,
        change: EPUBLayoutChange,
        didNavigateToLocator: Bool
    ) {}

    func submitReadingPreferences(on view: EPUBView, change: EPUBLayoutChange) {
        view.navigator!.submitPreferences(view.preferences(for: change.finalProps))
    }

    func isProgressionVisible(
        on view: EPUBView,
        currentLocator: Locator,
        progression: Double
    ) async -> Bool? {
        await view.isPagedProgressionVisible(currentLocator: currentLocator, progression: progression)
    }

    func findOnPage(on view: EPUBView, locator: Locator) {
        view.findOnPageInPagedLayout(locator: locator)
    }

    func goBackwardFromScript(on view: EPUBView) async {
        await view.navigator?.goBackward(options: .animated)
    }

    func goForwardFromScript(on view: EPUBView) async {
        await view.navigator?.goForward(options: .animated)
    }
}

private struct ScrollEPUBLayoutBehavior: EPUBLayoutBehavior {
    let supportsPagedClipScheduling = false

    func preferences(for view: EPUBView) -> EPUBPreferences {
        view.preferences(for: view.props!, scroll: true)
    }

    func submitModePreferences(on view: EPUBView, change: EPUBLayoutChange) {
        view.navigator!.submitPreferences(view.preferences(for: change.finalProps, scroll: true))
    }

    func shouldNavigateToLocator(on view: EPUBView, change: EPUBLayoutChange) -> Bool {
        guard let locator = change.finalProps.locator else {
            return false
        }

        let currentLocation = view.navigator?.currentLocation
        return change.layoutModeChanged ||
            currentLocation == nil ||
            locator.href != currentLocation?.href
    }

    func navigate(to locator: Locator, on view: EPUBView) {
        view.go(locator: locator, scrollAfterNavigation: true)
    }

    func handleExternalLocatorChange(
        on view: EPUBView,
        change: EPUBLayoutChange,
        didNavigateToLocator: Bool
    ) {
        guard !didNavigateToLocator,
              change.locatorChangedFromExternalUpdate,
              !change.finalProps.isPlaying,
              let locator = change.finalProps.locator else {
            return
        }

        // In active playback, same-resource updates are centered below; go() top-aligns first.
        view.go(locator: locator, scrollAfterNavigation: true)
    }

    func handlePlayingFragmentChanged(
        on view: EPUBView,
        change: EPUBLayoutChange,
        newFragment: String?,
        oldFragment: String?
    ) {}

    func keepPlayingLocatorVisible(
        on view: EPUBView,
        change: EPUBLayoutChange,
        didNavigateToLocator: Bool
    ) {
        guard !didNavigateToLocator,
              change.finalProps.isPlaying,
              let locator = change.finalProps.locator else {
            return
        }

        Task {
            await view.scrollFragmentIntoView(locator: locator)
        }
    }

    func submitReadingPreferences(on view: EPUBView, change: EPUBLayoutChange) {}

    func isProgressionVisible(
        on view: EPUBView,
        currentLocator: Locator,
        progression: Double
    ) async -> Bool? {
        await view.isScrollProgressionVisible(progression: progression)
    }

    func findOnPage(on view: EPUBView, locator: Locator) {
        view.findOnPageInScrollLayout(locator: locator)
    }

    func goBackwardFromScript(on view: EPUBView) async {
        if await view.isAtScrollBoundary(end: false) {
            await view.navigator?.goBackward(options: .animated)
        } else {
            await view.scrollCurrentResource(goForward: false)
        }
    }

    func goForwardFromScript(on view: EPUBView) async {
        if await view.isAtScrollBoundary(end: true) {
            await view.navigator?.goForward(options: .animated)
        } else {
            await view.scrollCurrentResource(goForward: true)
        }
    }
}

class EPUBView: ExpoView {
    static weak var current: EPUBView?

    private let templates = HTMLDecorationTemplate.defaultTemplates()
    let onLocatorChange = EventDispatcher()
    let onMiddleTouch = EventDispatcher()
    let onDoubleTouch = EventDispatcher()
    let onSelection = EventDispatcher()
    let onError = EventDispatcher()
    let onHighlightTap = EventDispatcher()
    let onBookmarksActivate = EventDispatcher()
    let onShowFootnote = EventDispatcher()

    public var navigator: EPUBNavigatorViewController?

    public var pendingProps: Props = Props()
    public var props: FinalizedProps?


    private var changingResource = false
    private var lastEmittedLocator: Locator?
    private let pagedLayoutBehavior = PagedEPUBLayoutBehavior()
    private let scrollLayoutBehavior = ScrollEPUBLayoutBehavior()
    private var initialLocatorEmissionInProgress = false

    private func javascriptStringLiteral(_ value: String) -> String {
        guard let data = try? JSONEncoder().encode(value),
              let string = String(data: data, encoding: .utf8) else {
            return "\"\""
        }

        return string
    }

    private func javascriptStringArrayLiteral(_ values: [String]) -> String {
        guard let data = try? JSONEncoder().encode(values),
              let string = String(data: data, encoding: .utf8) else {
            return "[]"
        }

        return string
    }

    private func isSameLocatorPosition(_ lhs: Locator?, _ rhs: Locator?) -> Bool {
        guard let lhs, let rhs else {
            return lhs == nil && rhs == nil
        }

        guard lhs.href.isEquivalentTo(rhs.href) else {
            return false
        }

        let lhsFragment = lhs.locations.fragments.first
        let rhsFragment = rhs.locations.fragments.first
        if lhsFragment != nil || rhsFragment != nil {
            return lhsFragment == rhsFragment
        }

        switch (lhs.locations.progression, rhs.locations.progression) {
        case let (lhsProgression?, rhsProgression?):
            return abs(lhsProgression - rhsProgression) < 0.00001
        case (nil, nil):
            return true
        default:
            return false
        }
    }

    private func emitLocatorChange(_ locator: Locator) {
        lastEmittedLocator = locator
        onLocatorChange(locator.json)
    }

    private func shouldGateInitialLocatorEmission(for locator: Locator?) -> Bool {
        guard let locator else {
            return false
        }

        return locator.locations.fragments.first != nil || locator.locations.progression != nil
    }

    private func emitInitialCurrentLocatorIfReady() async {
        guard initialLocatorEmissionInProgress else {
            return
        }

        await emitCurrentLocator(suppressIfPropLocatorVisible: true)
        initialLocatorEmissionInProgress = false
    }

    private func layoutBehavior(for props: FinalizedProps? = nil) -> any EPUBLayoutBehavior {
        if (props ?? self.props)?.scrollMode == true {
            return scrollLayoutBehavior
        }

        return pagedLayoutBehavior
    }

    func layoutPreferences() -> EPUBPreferences {
        layoutBehavior(for: props!).preferences(for: self)
    }

    fileprivate func preferences(for props: FinalizedProps, scroll: Bool? = nil) -> EPUBPreferences {
        if let scroll {
            return EPUBPreferences(
                backgroundColor: props.background,
                fontFamily: props.fontFamily,
                fontSize: props.fontSize,
                lineHeight: props.lineHeight,
                paragraphSpacing: props.paragraphSpacing,
                scroll: scroll,
                textAlign: props.textAlign,
                textColor: props.foreground
            )
        }

        return EPUBPreferences(
            backgroundColor: props.background,
            fontFamily: props.fontFamily,
            fontSize: props.fontSize,
            lineHeight: props.lineHeight,
            paragraphSpacing: props.paragraphSpacing,
            textAlign: props.textAlign,
            textColor: props.foreground
        )
    }

    public func finalizeProps() {
        let oldProps = props

        let finalProps = FinalizedProps(
            bookId: pendingProps.bookId!,
            locator: pendingProps.locator,
            isPlaying: pendingProps.isPlaying ?? oldProps?.isPlaying ?? false,
            highlights: pendingProps.highlights ?? oldProps?.highlights ?? [],
            bookmarks: pendingProps.bookmarks ?? oldProps?.bookmarks ?? [],
            readaloudColor: pendingProps.readaloudColor ?? oldProps?.readaloudColor ?? Color(color: .yellow)!,
            readaloudDecoratorStyle: pendingProps.readaloudDecoratorStyle ?? oldProps?.readaloudDecoratorStyle ?? "highlight",
            customFonts: pendingProps.customFonts ?? oldProps?.customFonts ?? [],
            foreground: pendingProps.foreground ?? oldProps?.foreground ?? Color(hex: "#111111")!,
            background: pendingProps.background ?? oldProps?.background ?? Color(hex: "#FFFFFF")!,
            fontFamily: pendingProps.fontFamily ?? oldProps?.fontFamily ?? FontFamily(rawValue: "Literata"),
            lineHeight: pendingProps.lineHeight ?? oldProps?.lineHeight ?? 1.4,
            paragraphSpacing: pendingProps.paragraphSpacing ?? oldProps?.paragraphSpacing ?? 0.5,
            fontSize: pendingProps.fontSize ?? oldProps?.fontSize ?? 1.0,
            textAlign: pendingProps.textAlign ?? oldProps?.textAlign ?? TextAlignment.justify,
            marginLeft: pendingProps.marginLeft ?? oldProps?.marginLeft ?? 0,
            marginRight: pendingProps.marginRight ?? oldProps?.marginRight ?? 0,
            scrollMode: pendingProps.scrollMode ?? oldProps?.scrollMode ?? false
        )

        props = finalProps
        let scrollModeChanged = oldProps.map { finalProps.scrollMode != $0.scrollMode } ?? false
        let enteredPageLayout = oldProps?.scrollMode == true && !finalProps.scrollMode
        let locatorChangedFromExternalUpdate = finalProps.locator != nil &&
            !isSameLocatorPosition(finalProps.locator, oldProps?.locator) &&
            !isSameLocatorPosition(finalProps.locator, lastEmittedLocator)
        let playbackStarted = finalProps.isPlaying && oldProps?.isPlaying != true
        let layoutChange = EPUBLayoutChange(
            finalProps: finalProps,
            layoutModeChanged: scrollModeChanged,
            enteredPageLayout: enteredPageLayout,
            locatorChangedFromExternalUpdate: locatorChangedFromExternalUpdate,
            playbackStarted: playbackStarted
        )
        let layoutBehavior = layoutBehavior(for: finalProps)

        if finalProps.bookId != oldProps?.bookId || finalProps.customFonts != oldProps?.customFonts {
            destroyNavigator()
            initializeNavigator()
        }

        layoutBehavior.submitModePreferences(on: self, change: layoutChange)
        let shouldNavigateToLocator = layoutBehavior.shouldNavigateToLocator(on: self, change: layoutChange)
        if shouldNavigateToLocator, let locator = finalProps.locator {
            layoutBehavior.navigate(to: locator, on: self)
        } else {
            layoutBehavior.handleExternalLocatorChange(
                on: self,
                change: layoutChange,
                didNavigateToLocator: false
            )
        }

        if finalProps.marginLeft != oldProps?.marginLeft {
            setCssVar("--st-padding-left", "\(finalProps.marginLeft)")
        }

        if finalProps.marginRight != oldProps?.marginRight {
            setCssVar("--st-padding-right", "\(finalProps.marginRight)")
        }

        if props!.isPlaying, let locator = finalProps.locator {
            applyReadaloudDecoration(locator: locator)

            let newFragment = locator.locations.fragments.first
            let oldFragment = oldProps?.locator?.locations.fragments.first

            layoutBehavior.handlePlayingFragmentChanged(
                on: self,
                change: layoutChange,
                newFragment: newFragment,
                oldFragment: oldFragment
            )
        } else {
            clearReadaloudDecoration()
        }

        if props!.highlights != oldProps?.highlights {
            decorateHighlights()
        }

        if props!.bookmarks != oldProps?.bookmarks, let locator = finalProps.locator {
            findOnPage(locator: locator)
        }

        layoutBehavior.keepPlayingLocatorVisible(
            on: self,
            change: layoutChange,
            didNavigateToLocator: shouldNavigateToLocator
        )
        layoutBehavior.submitReadingPreferences(on: self, change: layoutChange)
    }

    // the fuck is this?
    private var didTapWork: DispatchWorkItem?

    public func initializeNavigator() {
        guard let publication = BookService.shared.getPublication(for: props!.bookId) else {
            print("skipping navigator init, publication has not yet been opened")
            return
        }

        let gatesInitialLocatorEmission = shouldGateInitialLocatorEmission(for: props!.locator)
        initialLocatorEmissionInProgress = gatesInitialLocatorEmission

        let resources = Bundle.main.resourceURL!

        let fontFamilyDeclarations = [
            CSSFontFamilyDeclaration(
                fontFamily: FontFamily(rawValue: "OpenDyslexic"),
                fontFaces: [
                    CSSFontFace(
                        file: FileURL(url:resources.appendingPathComponent("OpenDyslexic-Regular.otf"))!,
                        style: .normal, weight: .standard(.normal)
                    ),
                    CSSFontFace(
                        file: FileURL(url:resources.appendingPathComponent("OpenDyslexic-Bold.otf"))!,
                        style: .normal, weight: .standard(.bold)
                    ),
                    CSSFontFace(
                        file: FileURL(url:resources.appendingPathComponent("OpenDyslexic-Italic.otf"))!,
                        style: .italic, weight: .standard(.normal)
                    ),
                    CSSFontFace(
                        file: FileURL(url:resources.appendingPathComponent("OpenDyslexic-Bold-Italic.otf"))!,
                        style: .italic, weight: .standard(.bold)
                    ),
                ]
            ).eraseToAnyHTMLFontFamilyDeclaration(),
            CSSFontFamilyDeclaration(
                fontFamily: FontFamily(rawValue: "Literata"),
                fontFaces: [
                    CSSFontFace(
                        file: FileURL(url:resources.appendingPathComponent("Literata_500Medium.ttf"))!,
                        style: .normal, weight: .standard(.normal)
                    ),
                ]
            ).eraseToAnyHTMLFontFamilyDeclaration(),
        ] + props!.customFonts.map {
            CSSFontFamilyDeclaration(
                fontFamily: FontFamily(rawValue: $0.name),
                fontFaces: [
                    CSSFontFace(
                        file: FileURL(string: $0.uri)!,
                        style: .normal,
                        weight: .variable(200...900)
                    )
            ]).eraseToAnyHTMLFontFamilyDeclaration()
        }

        guard let navigator = try? EPUBNavigatorViewController(
            publication: publication,
            initialLocation: props!.locator,
            config: .init(
                preferences: layoutPreferences(),
                defaults: EPUBDefaults(
                    publisherStyles: false
                ),
                disablePageTurnsWhileScrolling: true,
                decorationTemplates: templates,
                fontFamilyDeclarations: fontFamilyDeclarations
            ),
            httpServer: GCDHTTPServer(assetRetriever: BookService.shared.retriever)
        ) else {
            initialLocatorEmissionInProgress = false
            print("Failed to create Navigator instance")
            return
        }

        navigator.delegate = self
        addSubview(navigator.view)
        self.navigator = navigator

        self.decorateHighlights()
        self.navigator?.observeDecorationInteractions(inGroup: "highlights") { [weak self] event in
            guard let rect = event.rect else {
                return
            }
            self?.onHighlightTap(["decoration": event.decoration.id, "x": rect.midX, "y": rect.minY])
        }
        EPUBView.current = self

        if !gatesInitialLocatorEmission {
            Task {
                await emitCurrentLocator()
            }
        }
    }

    public func destroyNavigator() {
        initialLocatorEmissionInProgress = false
        self.navigator?.view.removeFromSuperview()

        if EPUBView.current === self {
            EPUBView.current = nil
        }
    }

    func setCssVar(_ name: String, _ value: String) {
        guard let epubNav = navigator else {
            return
        }
        Task {
            await epubNav.evaluateJavaScript("""
                (function() {
                    document.body.style.setProperty('\(name)', '\(value)')
                })();
            """)
        }
    }

    private func propLocatorVisibility(
        _ propLocator: Locator?,
        currentLocator: Locator,
        navigator epubNav: EPUBNavigatorViewController
    ) async -> Bool? {
        if let fragment = propLocator?.locations.fragments.first {
            let result = await epubNav.evaluateJavaScript("""
                (function() {
                    if (!globalThis.storyteller || !storyteller.isFirstClientRectOnScreen) return null;
                    const element = document.getElementById(\(javascriptStringLiteral(fragment)));
                    if (!element || !element.getClientRects()[0]) return null;
                    return storyteller.isFirstClientRectOnScreen(element);
                })();
            """)

            switch result {
            case .failure(let e):
                print(e)
                return nil
            case .success(let anyValue):
                return anyValue as? Bool
            }
        }

        if let progression = propLocator?.locations.progression {
            return await layoutBehavior().isProgressionVisible(
                on: self,
                currentLocator: currentLocator,
                progression: progression
            )
        }

        return nil
    }

    func emitCurrentLocator(suppressIfPropLocatorVisible: Bool = false) async {
        guard let epubNav = navigator else {
            return
        }
        guard let currentLocator = epubNav.currentLocation else {
            return
        }

        let propLocator = props?.locator
        let isPropLocatorOnPage = await propLocatorVisibility(
            propLocator,
            currentLocator: currentLocator,
            navigator: epubNav
        )

        let found = await navigator!.firstVisibleElementLocator()
        let merged = found.map { f in
            currentLocator.copy(locations: {
                $0.fragments = f.locations.fragments
                $0.otherLocations["cssSelector"] = f.locations.cssSelector
            })
        }

        guard let isPropLocatorOnPage else {
            if suppressIfPropLocatorVisible && propLocator != nil {
                return
            }

            emitLocatorChange(merged ?? currentLocator)
            return
        }

        // If the locator specified by the prop is still on the page, don't emit
        // a change event. We haven't actually changed the page.
        if merged == nil && !isPropLocatorOnPage {
            emitLocatorChange(merged ?? currentLocator)
            return
        }

        if isPropLocatorOnPage && suppressIfPropLocatorVisible {
            return
        }

        // If the locator specified by the prop is still on the page,
        // we still need to emit if we're adding fragments that we didn't
        // have initially
        if isPropLocatorOnPage && (props?.locator?.locations.fragments.count ?? 0) > 0 {
            return
        }
        emitLocatorChange(merged ?? currentLocator)
    }

    func go(locator: Locator, scrollAfterNavigation: Bool = false) {
        if locator.href != navigator?.currentLocation?.href {
            changingResource = true
        }
        Task {
            _ = await self.navigator!.go(to: locator, options: .animated)
            if scrollAfterNavigation {
                await self.scrollFragmentIntoView(locator: locator)
            }
        }
    }

    func decorateHighlights() {
        let decorations = props!.highlights.map { highlight in
            let style = Decoration.Style.highlight(tint: highlight.color, isActive: true)
            return Decoration(
                id: highlight.id,
                locator: highlight.locator,
                style: style
            )
        }
        navigator?.apply(decorations: decorations, in: "highlights")
    }

    func applyReadaloudDecoration(locator: Locator) {
        guard let id = locator.locations.fragments.first else {
            return
        }

        let style: Decoration.Style = if props!.readaloudDecoratorStyle == "underline" {
            .underline(tint: props!.foreground.uiColor)
        } else {
            .highlight(tint: props!.readaloudColor.uiColor, isActive: true)
        }
        let decoration = Decoration(
            id: id,
            locator: locator,
            style: style)

        navigator?.apply(decorations: [decoration], in: "overlay")
    }

    func clearReadaloudDecoration() {
        navigator?.apply(decorations: [], in: "overlay")
    }

    func scrollFragmentIntoView(locator: Locator) async {
        guard let id = locator.locations.fragments.first else {
            return
        }

        guard let idData = try? JSONEncoder().encode(id),
              let idJson = String(data: idData, encoding: .utf8) else {
            return
        }

        _ = await navigator?.evaluateJavaScript("""
            (function() {
                if (!globalThis.storyteller || !storyteller.scrollElementIntoView) return false;
                const element = document.getElementById(\(idJson));
                return storyteller.scrollElementIntoView(element);
            })();
        """)
    }

    func isAtScrollBoundary(end: Bool) async -> Bool {
        guard let navigator else { return false }

        let boundaryCheck: String
        if end {
            boundaryCheck = "scroller.scrollTop >= maxScrollTop - tolerance"
        } else {
            boundaryCheck = "scroller.scrollTop <= tolerance"
        }

        let result = await navigator.evaluateJavaScript("""
            (function() {
                const scroller = document.scrollingElement || document.documentElement;
                const viewportHeight = window.innerHeight;
                const maxScrollTop = Math.max(0, scroller.scrollHeight - viewportHeight);
                const tolerance = 1;

                return \(boundaryCheck);
            })();
        """)

        switch result {
        case .success(let value):
            return (value as? Bool) ?? false
        case .failure(let e):
            print(e)
            return false
        }
    }

    func scrollCurrentResource(goForward: Bool) async {
        guard let navigator else { return }

        let direction = goForward ? 1 : -1
        _ = await navigator.evaluateJavaScript("""
            (function() {
                const scroller = document.scrollingElement || document.documentElement;
                const viewportHeight = window.innerHeight;
                const maxScrollTop = Math.max(0, scroller.scrollHeight - viewportHeight);
                const delta = Math.max(96, viewportHeight * 0.65) * \(direction);
                const targetScrollTop = Math.min(maxScrollTop, Math.max(0, scroller.scrollTop + delta));

                if (Math.abs(targetScrollTop - scroller.scrollTop) < 1) return false;

                try {
                    scroller.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
                } catch (_) {
                    scroller.scrollTop = targetScrollTop;
                }

                return true;
            })();
        """)
    }

    fileprivate func isScrollProgressionVisible(progression: Double) async -> Bool? {
        guard let navigator else { return nil }

        let result = await navigator.evaluateJavaScript("""
            (function() {
                const scroller = document.scrollingElement || document.documentElement;
                const viewportHeight = window.innerHeight;
                const visibleTopProgression = scroller.scrollHeight > 0
                    ? scroller.scrollTop / scroller.scrollHeight
                    : 0;
                const visibleBottomProgression = scroller.scrollHeight > 0
                    ? (scroller.scrollTop + viewportHeight) / scroller.scrollHeight
                    : 1;

                return \(progression) >= visibleTopProgression &&
                    \(progression) <= visibleBottomProgression;
            })();
        """)

        switch result {
        case .success(let value):
            return value as? Bool
        case .failure(let e):
            print(e)
            return nil
        }
    }

    fileprivate func isPagedProgressionVisible(
        currentLocator: Locator,
        progression: Double
    ) async -> Bool? {
        guard let navigator else { return nil }

        let result = await navigator.evaluateJavaScript("""
            (function() {
                const maxScreenX = window.orientation === 0 || window.orientation == 180
                        ? screen.width
                        : screen.height;

                function snapOffset(offset) {
                    const value = offset + 1;

                    return value - (value % maxScreenX);
                }

                const documentWidth = document.scrollingElement.scrollWidth;
                const currentPageStart = snapOffset(documentWidth * \(currentLocator.locations.progression ?? 0.0));
                const currentPageEnd = currentPageStart + maxScreenX;
                return \(progression) * documentWidth >= currentPageStart &&
                    \(progression) * documentWidth < currentPageEnd;
            })();
        """)

        switch result {
        case .success(let value):
            return value as? Bool
        case .failure(let e):
            print(e)
            return nil
        }
    }

    func getFragmentPageProportion(fragmentId: String) async -> [String: Any]? {
        guard let navigator = navigator else { return nil }

        let result = await navigator.evaluateJavaScript("""
            (function() {
                return storyteller.getFragmentPageProportion("\(fragmentId)");
            })();
        """)

        switch result {
        case .success(let value):
            guard let dict = value as? [String: Any] else { return nil }
            return dict
        case .failure(let e):
            print(e)
            return nil
        }
    }

    func handleClipChanged(fragmentId: String) {
        guard let props else { return }

        layoutBehavior().handlePlayingFragmentChanged(
            on: self,
            change: EPUBLayoutChange(
                finalProps: props,
                layoutModeChanged: false,
                enteredPageLayout: false,
                locatorChangedFromExternalUpdate: false,
                playbackStarted: false
            ),
            newFragment: fragmentId,
            oldFragment: nil
        )
    }

    fileprivate func schedulePagedClipChanged(fragmentId: String) {
        Task {
            guard let result = await getFragmentPageProportion(fragmentId: fragmentId) else { return }
            guard let crossesPage = result["crossesPage"] as? Bool, crossesPage else { return }
            guard let proportion = result["proportionOnCurrentPage"] as? Double else { return }

            await AudiobookPlayerActor.shared.scheduleClipEvent(
                fragmentId: fragmentId,
                fragmentProgress: proportion
            ) { [weak self] in
                guard let self else { return }

                Task {
                    guard await self.layoutBehavior().supportsPagedClipScheduling else { return }

                    let result = await self.getFragmentPageProportion(fragmentId: fragmentId)
                    // check necessary to avoid going forward again if user manually moved the page
                    let overflowsRight = (result?["crossesPage"] as? Bool) ?? false

                    if overflowsRight {
                        // not animated
                        await self.navigator?.goForward()
                    }
                }
            }
        }
    }

    override func layoutSubviews() {
        guard let navigatorView = self.navigator?.view else {
            print("layoutSubviews called before navigator was instantiated")
            return
        }

        navigatorView.frame = bounds
    }

    func findOnPage(locator: Locator) {
        layoutBehavior().findOnPage(on: self, locator: locator)
    }

    fileprivate func findOnPageInScrollLayout(locator: Locator) {
        guard let epubNav = navigator else {
            return
        }

        let bookmarkCandidates = props!.bookmarks.enumerated().compactMap { index, bookmark -> [String: Any]? in
            guard bookmark.href.isEquivalentTo(locator.href) else {
                return nil
            }

            var candidate: [String: Any] = ["index": index]
            if let fragment = bookmark.locations.fragments.first {
                candidate["fragment"] = fragment
            }
            if let progression = bookmark.locations.progression {
                candidate["progression"] = progression
            }
            return candidate
        }

        guard let bookmarksData = try? JSONSerialization.data(withJSONObject: bookmarkCandidates),
              let bookmarksJson = String(data: bookmarksData, encoding: .utf8) else {
            onBookmarksActivate(["activeBookmarks": []])
            return
        }

        Task {
            let result = await epubNav.evaluateJavaScript("""
                (function() {
                    const bookmarks = \(bookmarksJson);
                    const scroller = document.scrollingElement || document.documentElement;
                    const viewportHeight = window.innerHeight;
                    const visibleTopProgression = scroller.scrollHeight > 0
                        ? scroller.scrollTop / scroller.scrollHeight
                        : 0;
                    const visibleBottomProgression = scroller.scrollHeight > 0
                        ? (scroller.scrollTop + viewportHeight) / scroller.scrollHeight
                        : 1;

                    return bookmarks.filter((bookmark) => {
                        if (bookmark.fragment) {
                            const element = document.getElementById(bookmark.fragment);
                            if (element) {
                                const rects = Array.from(element.getClientRects());
                                const visibleRects = rects.length > 0 ? rects : [element.getBoundingClientRect()];
                                const isVisible = visibleRects.some((rect) => {
                                    const isVerticallyVisible = rect.bottom >= 0 && rect.top <= viewportHeight;
                                    const isHorizontallyVisible = rect.right >= 0 && rect.left <= window.innerWidth;
                                    return isVerticallyVisible && isHorizontallyVisible;
                                });

                                if (isVisible) return true;
                            }
                        }

                        if (typeof bookmark.progression === 'number') {
                            return bookmark.progression >= visibleTopProgression &&
                                bookmark.progression <= visibleBottomProgression;
                        }

                        return false;
                    }).map((bookmark) => bookmark.index);
                })();
            """)

            switch result {
            case .failure(let e):
                print(e)
                self.onBookmarksActivate(["activeBookmarks": []])
            case .success(let anyValue):
                guard let value = anyValue as? [NSNumber] else {
                    self.onBookmarksActivate(["activeBookmarks": []])
                    return
                }

                let activeIndexes = Set(value.map(\.intValue))
                let found = self.props!.bookmarks.enumerated().compactMap { index, bookmark in
                    activeIndexes.contains(index) ? bookmark : nil
                }

                self.onBookmarksActivate(["activeBookmarks": found.map(\.json)])
            }
        }
    }

    fileprivate func findOnPageInPagedLayout(locator: Locator) {
        guard let epubNav = navigator else {
            return
        }

        guard let currentProgression = locator.locations.progression else {
            return
        }

        let joinedProgressions = props!.bookmarks
            .filter { $0.href.isEquivalentTo(locator.href) }
            .compactMap(\.locations.progression)
            .map { "\($0)" }
            .joined(separator: ",")

        let jsProgressionsArray = "[\(joinedProgressions)]"

        Task {
            let result = await epubNav.evaluateJavaScript("""
            (function() {
                const maxScreenX = window.orientation === 0 || window.orientation == 180
                        ? screen.width
                        : screen.height;

                function snapOffset(offset) {
                    const value = offset + 1;

                    return value - (value % maxScreenX);
                }

                const documentWidth = document.scrollingElement.scrollWidth;
                const currentPageStart = snapOffset(documentWidth * \(currentProgression));
                const currentPageEnd = currentPageStart + maxScreenX;
                return \(jsProgressionsArray).filter((progression) =>
                    progression * documentWidth >= currentPageStart &&
                    progression * documentWidth < currentPageEnd
                );
            })();
        """)
            switch result {
            case .failure(let e):
                print(e)
                self.onBookmarksActivate(["activeBookmarks": []])
            case .success(let anyValue):
                guard let value = anyValue as? [Double] else {
                    self.onBookmarksActivate(["activeBookmarks": []])
                    return
                }

                let found = self.props!.bookmarks.filter {
                    guard let progression = $0.locations.progression else {
                        return false
                    }
                    return value.contains(progression)
                }

                self.onBookmarksActivate(["activeBookmarks": found.map(\.json)])
            }
        }
    }
}

extension EPUBView: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        true
    }
}

extension EPUBView: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) -> Void {
        Task {
            switch message.name {
                case "storytellerDoubleClick":
                    guard let fragment = message.body as? String else { return }
                    guard let currentLocator = navigator?.currentLocation ?? props!.locator else { return }

                    guard let locator = try? await BookService.shared.getLocatorFor(bookId: props!.bookId, href: currentLocator.href.string, fragment: fragment) else {
                        return
                    }

                    self.onDoubleTouch(locator.json)
                case "storytellerSelectionCleared":
                    onSelection(["cleared": true])
                case "storytellerNavPrev":
                    await self.layoutBehavior().goBackwardFromScript(on: self)
                case "storytellerNavNext":
                    await self.layoutBehavior().goForwardFromScript(on: self)
                case "storytellerMiddleTouch":
                    self.onMiddleTouch()
                case "storytellerInitialLocatorReady":
                    await self.emitInitialCurrentLocatorIfReady()
                default:
                    return
            }
        }
    }
}

extension EPUBView: EPUBNavigatorDelegate {
    func navigatorContentInset(_ navigator: VisualNavigator) -> UIEdgeInsets? {
        return .zero
    }

    func navigator(_ navigator: any SelectableNavigator, shouldShowMenuForSelection selection: Selection) -> Bool {
        onSelection(["x": selection.frame?.midX as Any, "y": selection.frame?.minY as Any, "locator": selection.locator.json])
        return false
    }

    func navigator(_ navigator: EPUBNavigatorViewController, setupUserScripts userContentController: WKUserContentController) {

        guard let currentLocator = props!.locator else {
            return
        }

        let fragments = BookService.shared.getFragments(for: props!.bookId, locator: currentLocator)

        let jsFragmentsArray = javascriptStringArrayLiteral(fragments.map(\.fragmentId))
        let initialLocatorHref = javascriptStringLiteral(currentLocator.href.string)

        var scriptSource = """
            globalThis.storyteller = {};
            storyteller.doubleClickTimeout = null;
            storyteller.touchMoved = false;

            storyteller.touchStartHandler = (event) => {
                storyteller.touchMoved = false;
            }

            storyteller.touchMoveHandler = (event) => {
                storyteller.touchMoved = true;
            }

            storyteller.touchEndHandler = (event) => {
                if (storyteller.touchMoved || !document.getSelection().isCollapsed || event.changedTouches.length !== 1) return;

                event.bubbles = true
                event.clientX = event.changedTouches[0].clientX
                event.clientY = event.changedTouches[0].clientY
                const clone = new MouseEvent('click', event);
                event.stopImmediatePropagation();
                event.preventDefault();

                if (storyteller.doubleClickTimeout) {
                    clearTimeout(storyteller.doubleClickTimeout);
                    storyteller.doubleClickTimeout = null;
                    window.webkit.messageHandlers.storytellerDoubleClick.postMessage(event.currentTarget.id);
                    return
                }

                const element = event.currentTarget;

                storyteller.doubleClickTimeout = setTimeout(() => {
                    storyteller.doubleClickTimeout = null;
                    element.parentElement.dispatchEvent(clone);
                }, 350);
            }

            storyteller.observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.addEventListener('touchstart', storyteller.touchStartHandler)
                        entry.target.addEventListener('touchmove', storyteller.touchMoveHandler)
                        entry.target.addEventListener('touchend', storyteller.touchEndHandler)
                    } else {
                        entry.target.removeEventListener('touchstart', storyteller.touchStartHandler)
                        entry.target.removeEventListener('touchmove', storyteller.touchMoveHandler)
                        entry.target.removeEventListener('touchend', storyteller.touchEndHandler)
                    }
                })
            }, {
                threshold: [0],
            })

            document.addEventListener('click', (event) => {
                if (event.target.closest('a')) return;
                if (event.clientX <= window.innerWidth * 0.2) {
                    window.webkit.messageHandlers.storytellerNavPrev.postMessage(null);
                } else if (event.clientX >= window.innerWidth * 0.8) {
                    window.webkit.messageHandlers.storytellerNavNext.postMessage(null);
                } else {
                    window.webkit.messageHandlers.storytellerMiddleTouch.postMessage(null);
                }
            })

            document.addEventListener('selectionchange', () => {
                if (document.getSelection().isCollapsed) {
                    window.webkit.messageHandlers.storytellerSelectionCleared.postMessage(null);
                }
            });

            storyteller.isEntirelyOnScreen = function isEntirelyOnScreen(element) {
                const rects = element.getClientRects()
                return Array.from(rects).every((rect) => {
                    const isVerticallyWithin = rect.bottom >= 0 && rect.top <= window.innerHeight;
                    const isHorizontallyWithin = rect.right >= 0 && rect.left <= window.innerWidth;
                    return isVerticallyWithin && isHorizontallyWithin;
                });
            }

            storyteller.isFirstClientRectOnScreen = function isFirstClientRectOnScreen(element) {
                if (!element) return false;

                const rect = element.getClientRects()[0];
                if (!rect) return false;

                const isVerticallyWithin = rect.bottom >= 0 && rect.top <= window.innerHeight;
                const isHorizontallyWithin = rect.right >= 0 && rect.left <= window.innerWidth;
                return isVerticallyWithin && isHorizontallyWithin;
            }

            storyteller.notifyInitialLocatorReady = function notifyInitialLocatorReady(expectedHref) {
                let posted = false;

                const decode = (value) => {
                    try {
                        return decodeURIComponent(value);
                    } catch (_) {
                        return value;
                    }
                };

                const currentResourceMatches = () => {
                    const expected = decode(expectedHref.split("#")[0]).replace(/^\\/+/, "");
                    if (!expected) return true;

                    const pageHref = decode(window.location.href.split("#")[0]);
                    return pageHref.endsWith(expected) || pageHref.endsWith(`/${expected}`);
                };

                if (!currentResourceMatches()) return;

                const post = () => {
                    if (posted) return;
                    posted = true;

                    window.webkit.messageHandlers.storytellerInitialLocatorReady.postMessage(null);
                };

                // Readium's scrollTo* helpers mutate scroll state synchronously.
                // Wait two frames so WebKit has a layout/paint opportunity before
                // Swift measures whether the original prop locator is visible.
                const postAfterLayout = () => requestAnimationFrame(() => requestAnimationFrame(post));

                const wrapInitialNavigationFunction = (name) => {
                    if (!globalThis.readium || typeof readium[name] !== "function") return;
                    if (readium[name].storytellerInitialLocatorReadyWrapped) return;

                    const original = readium[name];
                    const wrapped = function(...args) {
                        const result = original.apply(this, args);
                        postAfterLayout();
                        return result;
                    };
                    wrapped.storytellerInitialLocatorReadyWrapped = true;
                    readium[name] = wrapped;
                };

                wrapInitialNavigationFunction("scrollToId");
                wrapInitialNavigationFunction("scrollToLocator");
                wrapInitialNavigationFunction("scrollToPosition");
            }

            storyteller.notifyInitialLocatorReady(\(initialLocatorHref));

            storyteller.scrollElementIntoView = function scrollElementIntoView(element) {
                if (!element) return false;

                const rects = Array.from(element.getClientRects())
                    .filter((rect) => rect.width > 0 && rect.height > 0);
                if (rects.length === 0) return false;

                const top = Math.min(...rects.map((rect) => rect.top));
                const bottom = Math.max(...rects.map((rect) => rect.bottom));
                const viewportHeight = window.innerHeight;
                const viewportCenter = viewportHeight / 2;
                const elementCenter = top + ((bottom - top) / 2);
                const deadZone = Math.min(36, Math.max(16, viewportHeight * 0.04));
                const delta = elementCenter - viewportCenter;

                if (Math.abs(delta) < deadZone) return false;

                const scroller = document.scrollingElement || document.documentElement;
                const maxScrollTop = Math.max(0, scroller.scrollHeight - viewportHeight);
                const targetScrollTop = Math.min(maxScrollTop, Math.max(0, scroller.scrollTop + delta));
                if (Math.abs(targetScrollTop - scroller.scrollTop) < 1) return false;

                try {
                    scroller.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
                } catch (_) {
                    scroller.scrollTop = targetScrollTop;
                }
                return true;
            }

            readium.findFirstVisibleLocator = function findFirstVisibleLocator() {
                let firstVisibleFragmentId = null;

                for (const fragmentId of storyteller.fragmentIds) {
                    const element = document.getElementById(fragmentId);
                    if (!element) continue;
                    if (storyteller.isEntirelyOnScreen(element)) {
                        firstVisibleFragmentId = fragmentId
                        break
                    }
                }

                if (firstVisibleFragmentId === null) return null;

                return {
                    href: "#",
                    type: "application/xhtml+xml",
                    locations: {
                        cssSelector: `#${firstVisibleFragmentId}`,
                        fragments: [firstVisibleFragmentId]
                    },
                    text: {
                        highlight: document.getElementById(firstVisibleFragmentId).textContent,
                    },
                };
            }

            storyteller.fragmentIds = \(jsFragmentsArray);
            storyteller.fragmentIds.map((id) => document.getElementById(id)).forEach((element) => {
                storyteller.observer.observe(element)
            })

            storyteller.getFragmentPageProportion = function getFragmentPageProportion(fragmentId) {
                const element = document.getElementById(fragmentId);
                if (!element) return null;

                const rects = Array.from(element.getClientRects());
                if (rects.length === 0) return null;

                const viewportWidth = window.innerWidth;
                let visibleWidth = 0;
                let totalWidth = 0;
                let overflowsRight = false;

                for (const rect of rects) {
                    totalWidth += rect.width;

                    if (rect.right > viewportWidth) {
                        overflowsRight = true;
                    }

                    if (rect.left >= 0 && rect.right <= viewportWidth) {
                        visibleWidth += rect.width;
                    } else if (rect.left < viewportWidth && rect.right > 0) {
                        const visibleLeft = Math.max(rect.left, 0);
                        const visibleRight = Math.min(rect.right, viewportWidth);
                        visibleWidth += visibleRight - visibleLeft;
                    }
                }

                if (totalWidth === 0) return null;

                const proportion = visibleWidth / totalWidth;
                return { crossesPage: overflowsRight, proportionOnCurrentPage: proportion };
            }

            document.body.firstElementChild.style.paddingLeft = "var(--st-padding-left)";
            document.body.firstElementChild.style.paddingRight = "var(--st-padding-right)";
        """

        if traitCollection.userInterfaceIdiom == .phone {
            scriptSource += """

                const wideReadingColumns = document.createElement("style");
                wideReadingColumns.textContent = "@media screen and (min-width: 35em){html:root{--RS__colWidth:20em;--RS__colCount:2;}}";
                document.head.appendChild(wideReadingColumns);

                """
        }

        userContentController.addUserScript(WKUserScript(source: scriptSource, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        userContentController.add(self, name: "storytellerDoubleClick")
        userContentController.add(self, name: "storytellerNavPrev")
        userContentController.add(self, name: "storytellerNavNext")
        userContentController.add(self, name: "storytellerMiddleTouch")
        userContentController.add(self, name: "storytellerSelectionCleared")
        userContentController.add(self, name: "storytellerInitialLocatorReady")

        setCssVar("--st-padding-left", "\(props!.marginLeft)px")
        setCssVar("--st-padding-right", "\(props!.marginRight)px")
    }

    func navigator(_ navigator: ReadiumNavigator.Navigator, presentError error: ReadiumNavigator.NavigatorError) {
        self.onError(["errorDescription": error.localizedDescription as Any])
    }

    func navigator(_ navigator: Navigator, locationDidChange locator: Locator) {
        let navigator = (navigator as! EPUBNavigatorViewController)
        let shouldSkipLocatorEmission = initialLocatorEmissionInProgress

        findOnPage(locator: locator)
        Task {
            if locator.href != props!.locator?.href || changingResource {
                changingResource = false

                let fragments = BookService.shared.getFragments(for: props!.bookId, locator: locator)

                let jsFragmentsArray = javascriptStringArrayLiteral(fragments.map(\.fragmentId))


                await navigator.evaluateJavaScript("""
                storyteller.fragmentIds = \(jsFragmentsArray);
                storyteller.fragmentIds.map((id) => document.getElementById(id)).forEach((element) => {
                    storyteller.observer.observe(element)
                });
            """)
                if props!.isPlaying, props!.locator?.href == locator.href, let propLocator = props!.locator {
                    applyReadaloudDecoration(locator: propLocator)
                }
            }

            guard !shouldSkipLocatorEmission else {
                return
            }

            await self.emitCurrentLocator()
        }
    }

    func navigator(_ navigator: Navigator, shouldNavigateToNoteAt link: ReadiumShared.Link, content: String, referrer: String?) -> Bool {
        onShowFootnote(["content": content])
        return false
    }
}
