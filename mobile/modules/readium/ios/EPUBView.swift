import ExpoModulesCore
import WebKit
import ReadiumShared
import ReadiumNavigator
import ReadiumAdapterGCDWebServer

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
    var customFonts: [CustomFont]?
    var foreground: Color?
    var background: Color?
    var fontFamily: FontFamily?
    var lineHeight: Double?
    var paragraphSpacing: Double?
    var fontSize: Double?
    var textAlign: TextAlignment?
}

struct FinalizedProps {
    var bookId: String
    var locator: Locator?
    var isPlaying: Bool
    var highlights: [Highlight]
    var bookmarks: [Locator]
    var readaloudColor: Color
    var customFonts: [CustomFont]
    var foreground: Color
    var background: Color
    var fontFamily: FontFamily
    var lineHeight: Double
    var paragraphSpacing: Double
    var fontSize: Double
    var textAlign: TextAlignment
}

class EPUBView: ExpoView {
    private let templates = HTMLDecorationTemplate.defaultTemplates()
    let onLocatorChange = EventDispatcher()
    let onMiddleTouch = EventDispatcher()
    let onDoubleTouch = EventDispatcher()
    let onSelection = EventDispatcher()
    let onError = EventDispatcher()
    let onHighlightTap = EventDispatcher()
    let onBookmarksActivate = EventDispatcher()

    public var navigator: EPUBNavigatorViewController?

    public var pendingProps: Props = Props()
    public var props: FinalizedProps?

    private var changingResource = false

    public func finalizeProps() {
        let oldProps = props

        let finalProps = FinalizedProps(
            bookId: pendingProps.bookId!,
            locator: pendingProps.locator,
            isPlaying: pendingProps.isPlaying ?? oldProps?.isPlaying ?? false,
            highlights: pendingProps.highlights ?? oldProps?.highlights ?? [],
            bookmarks: pendingProps.bookmarks ?? oldProps?.bookmarks ?? [],
            readaloudColor: pendingProps.readaloudColor ?? oldProps?.readaloudColor ?? Color(color: .yellow)!,
            customFonts: pendingProps.customFonts ?? oldProps?.customFonts ?? [],
            foreground: pendingProps.foreground ?? oldProps?.foreground ?? Color(hex: "#111111")!,
            background: pendingProps.background ?? oldProps?.background ?? Color(hex: "#FFFFFF")!,
            fontFamily: pendingProps.fontFamily ?? oldProps?.fontFamily ?? FontFamily(rawValue: "Literata"),
            lineHeight: pendingProps.lineHeight ?? oldProps?.lineHeight ?? 1.4,
            paragraphSpacing: pendingProps.paragraphSpacing ?? oldProps?.paragraphSpacing ?? 0.5,
            fontSize: pendingProps.fontSize ?? oldProps?.fontSize ?? 1.0,
            textAlign: pendingProps.textAlign ?? oldProps?.textAlign ?? TextAlignment.justify
        )

        props = finalProps

        if finalProps.bookId != oldProps?.bookId || finalProps.customFonts != oldProps?.customFonts {
            destroyNavigator()
            initializeNavigator()
        }

        if finalProps.locator != navigator?.currentLocation, let locator = finalProps.locator {
            go(locator: locator)
        }

        if props!.isPlaying, let locator = finalProps.locator {
            highlightFragment(locator: locator)
        } else {
            clearHighlightedFragment()
        }

        if props!.highlights != oldProps?.highlights {
            decorateHighlights()
        }

        if props!.bookmarks != oldProps?.bookmarks, let locator = finalProps.locator {
            findOnPage(locator: locator)
        }

        if props!.readaloudColor != oldProps?.readaloudColor, let locator = finalProps.locator{
            clearHighlightedFragment()
            highlightFragment(locator: locator)
        }

        navigator!.submitPreferences(EPUBPreferences(
            backgroundColor: finalProps.background,
            fontFamily: finalProps.fontFamily,
            fontSize: finalProps.fontSize,
            lineHeight: finalProps.lineHeight,
            paragraphSpacing: finalProps.paragraphSpacing,
            textAlign: finalProps.textAlign,
            textColor: finalProps.foreground
        ))
    }

    // the fuck is this?
    private var didTapWork: DispatchWorkItem?

    public func initializeNavigator() {
        guard let publication = BookService.shared.getPublication(for: props!.bookId) else {
            print("skipping navigator init, publication has not yet been opened")
            return
        }

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
                preferences: EPUBPreferences(
                    backgroundColor: props!.background,
                    fontFamily: props!.fontFamily,
                    fontSize: props!.fontSize,
                    lineHeight: props!.lineHeight,
                    paragraphSpacing: props!.paragraphSpacing,
                    textAlign: props!.textAlign,
                    textColor: props!.foreground
                ),
                defaults: EPUBDefaults(
                    publisherStyles: false
                ),
                decorationTemplates: templates,
                fontFamilyDeclarations: fontFamilyDeclarations
            ),
            httpServer: GCDHTTPServer(assetRetriever: BookService.shared.retriever)
        ) else {
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
        Task {
            await emitCurrentLocator()
        }
    }

    public func destroyNavigator() {
        self.navigator?.view.removeFromSuperview()
    }

    func emitCurrentLocator() async {
        guard let epubNav = navigator else {
            return
        }
        guard let currentLocator = epubNav.currentLocation else {
            return
        }
        let found = await navigator!.firstVisibleElementLocator()
        let merged = found.map { f in
            currentLocator.copy(locations: {
                $0.otherLocations["fragments"] = f.locations.fragments
                $0.otherLocations["cssSelector"] = f.locations.cssSelector
            })
        }
        
        Task {
            var result = await props?.locator?.locations.fragments.first.asyncMap({
                await epubNav.evaluateJavaScript("""
                    (function() {
                        const element = document.getElementById("\($0)")
                        return storyteller.isEntirelyOnScreen(element);
                    })();
                """)
            })
            if result == nil {
                result = await props?.locator?.locations.progression.asyncMap({
                    await epubNav.evaluateJavaScript("""
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
                            return \($0) * documentWidth >= currentPageStart &&
                                \($0) * documentWidth < currentPageEnd;
                        })();
                    """)
                })
            }
            switch result {
            case nil:
                self.onLocatorChange(merged?.json ?? currentLocator.json)
            case .failure(let e):
                print(e)
                self.onLocatorChange(merged?.json ?? currentLocator.json)
            case .success(let anyValue):
                guard let isPropLocatorOnPage = anyValue as? Bool else {
                    self.onLocatorChange(merged?.json ?? currentLocator.json)
                    return
                }

                // If the locator specified by the prop is still on the page, don't emit
                // a change event. We haven't actually changed the page.
                if merged == nil && !isPropLocatorOnPage {
                    self.onLocatorChange(merged?.json ?? currentLocator.json)
                    return
                }
                
                // If the locator specified by the prop is still on the page,
                // we still need to emit if we're adding fragments that we didn't
                // have initially
                if isPropLocatorOnPage && (props?.locator?.locations.fragments.count ?? 0) > 0 {
                    return
                }
                self.onLocatorChange(merged?.json ?? currentLocator.json)
            }
        }
    }

    func go(locator: Locator) {
        if locator.href != navigator?.currentLocation?.href {
            changingResource = true
        }
        Task {
            _ = await self.navigator!.go(to: locator, options: .animated)
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

    func highlightFragment(locator: Locator) {
        guard let id = locator.locations.fragments.first else {
            return
        }

        let overlayHighlight = Decoration.Style.highlight(tint: props!.readaloudColor.uiColor, isActive: true)
        let decoration = Decoration(
            id: id,
            locator: locator,
            style: overlayHighlight)

        navigator?.apply(decorations: [decoration], in: "overlay")
    }

    func clearHighlightedFragment() {
        navigator?.apply(decorations: [], in: "overlay")
    }

    override func layoutSubviews() {
        guard let navigatorView = self.navigator?.view else {
            print("layoutSubviews called before navigator was instantiated")
            return
        }

        navigatorView.frame = bounds
    }

    func findOnPage(locator: Locator) {
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
    /// Handles incoming calls from JS.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) -> Void {
        Task {
            switch message.name {
                case "storytellerDoubleClick":
                    guard let fragment = message.body as? String else {
                        return
                    }

                    guard let currentLocator = props!.locator else {
                        return
                    }

                guard let locator = BookService.shared.getLocatorFor(bookId: props!.bookId, href: currentLocator.href.string, fragment: fragment) else {
                        return
                    }

                    self.onDoubleTouch(locator.json)
                case "storytellerSelectionCleared":
                    onSelection(["cleared": true])
                case "storytellerNavPrev":
                    await navigator?.goBackward(options: .animated)
                case "storytellerNavNext":
                    await navigator?.goForward(options: .animated)
                case "storytellerMiddleTouch":
                    self.onMiddleTouch()
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

        let joinedFragments = fragments.map(\.fragmentId).map { "\"\($0)\"" }.joined(separator: ",")
        let jsFragmentsArray = "[\(joinedFragments)]"

        let scriptSource = """
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
        """

        userContentController.addUserScript(WKUserScript(source: scriptSource, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        userContentController.add(self, name: "storytellerDoubleClick")
        userContentController.add(self, name: "storytellerNavPrev")
        userContentController.add(self, name: "storytellerNavNext")
        userContentController.add(self, name: "storytellerMiddleTouch")
        userContentController.add(self, name: "storytellerSelectionCleared")
    }

    func navigator(_ navigator: ReadiumNavigator.Navigator, presentError error: ReadiumNavigator.NavigatorError) {
        self.onError(["errorDescription": error.localizedDescription as Any])
    }

    func navigator(_ navigator: Navigator, locationDidChange locator: Locator) {
        let navigator = (navigator as! EPUBNavigatorViewController)

        findOnPage(locator: locator)
        Task {
            if locator.href != props!.locator?.href || changingResource {
                changingResource = false

                let fragments = BookService.shared.getFragments(for: props!.bookId, locator: locator)

                let joinedFragments = fragments.map(\.fragmentId).map { "\"\($0)\"" }.joined(separator: ",")
                let jsFragmentsArray = "[\(joinedFragments)]"


                await navigator.evaluateJavaScript("""
                storyteller.fragmentIds = \(jsFragmentsArray);
                storyteller.fragmentIds.map((id) => document.getElementById(id)).forEach((element) => {
                    storyteller.observer.observe(element)
                });
            """)
            }

            await self.emitCurrentLocator()
        }
    }
}
