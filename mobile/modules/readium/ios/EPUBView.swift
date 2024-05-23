import ExpoModulesCore
import R2Shared
import R2Navigator
import ReadiumAdapterGCDWebServer

struct Highlight {
    id: String
    color: UIColor
    locator: Locator
}

// This view will be used as a native component. Make sure to inherit from `ExpoView`
// to apply the proper styling (e.g. border radius and shadows).
class EPUBView: ExpoView {
    private let templates = HTMLDecorationTemplate.defaultTemplates()
    let onLocatorChange = EventDispatcher()
    let onMiddleTouch = EventDispatcher()
    let onDoubleTouch = EventDispatcher()
    let onSelection = EventDispatcher()
    let onError = EventDispatcher()
    let onHighlightTap = EventDispatcher()
    
    public var bookId: Int?
    public var locator: Locator?
    public var isPlaying: Bool = false
    public var navigator: EPUBNavigatorViewController?
    public var highlights: [Highlight]
    
    private var didTapWork: DispatchWorkItem?
    
    func initializeNavigator() {
        if self.navigator != nil {
            return
        }
        
        guard let bookId = self.bookId, let locator = self.locator else {
            return
        }
        
        guard let publication = BookService.instance.getPublication(for: bookId) else {
            print("skipping navigator init, publication has not yet been opened")
            return
        }
        
        let resources = Bundle.main.resourceURL!
        
        guard let navigator = try? EPUBNavigatorViewController(
            publication: publication,
            initialLocation: locator,
            config: .init(
                preferences: EPUBPreferences(
                    fontFamily: FontFamily(rawValue: "Bookerly"),
                    lineHeight: 1.4,
                    paragraphSpacing: 0.5
                ),
                defaults: EPUBDefaults(
                    publisherStyles: false
                ),
                decorationTemplates: templates,
                fontFamilyDeclarations: [
                    CSSFontFamilyDeclaration(
                        fontFamily: FontFamily(rawValue: "Bookerly"),
                        fontFaces: [
                            CSSFontFace(
                                file: resources.appendingPathComponent("Bookerly.ttf"),
                                style: .normal, weight: .standard(.normal)
                            ),
                        ]
                    ).eraseToAnyHTMLFontFamilyDeclaration(),
                ]
            ),
            httpServer: GCDHTTPServer.shared
        ) else {
            print("Failed to create Navigator instance")
            return
        }
        
        navigator.delegate = self
        addSubview(navigator.view)
        self.navigator = navigator
        self.navigator.observeDecorationInteractions(inGroup: "highlights", [weak self] event in {
            self.onHighlightTap(["decoration": event.decoration.id, "x": event.rect.midX, "y": event.rect.maxY])
        })
    }
    
    func go() {
        guard let navigator = self.navigator else {
            initializeNavigator()
            return
        }
        
        guard let locator = self.locator else {
            return
        }
        
        _ = navigator.go(to: locator, animated: true) {
            if self.isPlaying {
                self.highlightFragment(locator: locator)
            }
        }
    }

    func decorateHighlights() {
        decorations = highlights.map { highlight in
            let style = Decoration.Style.highlight(tint: highlight.color, isActive: true)
            return Decoration(
                id: highlight.id,
                locator: highlight.locator,
                style: overlayHighlight
            )
        }
        navigator?.apply(decorations: decorations, in: "highlights")
    }
    
    func highlightFragment(locator: Locator) {
        guard let id = locator.locations.fragments.first else {
            return
        }
        
        let overlayHighlight = Decoration.Style.highlight(tint: .yellow, isActive: true)
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

    func findOnPage(locators: [Locator], promise: Promise) {
        guard let epubNav = navigator else {
            return
        }

        guard let currentProgression = epubNav.currentLocation?.locations.progression else {
            return
        }

        let joinedProgressions = locators
            .compactMap(\.locations.progression)
            .map { "\($0)" }
            .joined(separator: ",")

        let jsProgressionsArray = "[\(joinedProgressions)]"

        epubNav.evaluateJavaScript("""
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
        """) {
            switch $0 {
            case .failure(let e):
                print(e)
                promise.resolve([])
            case .success(let anyValue):
                guard let value = anyValue as? [Double] else {
                    promise.resolve([])
                    return
                }
                
                let found = locators.filter {
                    guard let progression = $0.locations.progression else {
                        return false
                    }
                    return value.contains(progression)
                }
                
                promise.resolve(found.map(\.json))
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
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
            case "storytellerDoubleClick":
                guard let fragment = message.body as? String else {
                    return
                }
                guard let bookId = self.bookId else {
                    return
                }
                guard let currentLocator = self.navigator?.currentLocation else {
                    return
                }
                
                guard let locator = try? BookService.instance.getLocatorFor(bookId: bookId, href: currentLocator.href, fragment: fragment) else {
                    return
                }
                
                self.onDoubleTouch(locator.json)
            case "storytellerSelectionCleared":
                onSelection(["cleared": true])
            default:
                return
        }
    }
}

extension EPUBView: EPUBNavigatorDelegate {
    func navigator(_ navigator: any SelectableNavigator, shouldShowMenuForSelection selection: Selection) -> Bool {
        onSelection(["x": selection.frame?.midX as Any, "y": selection.frame?.maxY as Any, "locator": selection.locator.json])
        return false
    }
    
    func navigator(_ navigator: EPUBNavigatorViewController, setupUserScripts userContentController: WKUserContentController) {
        guard let bookId = self.bookId else {
            return
        }
        
        guard let locator = self.locator else {
            return
        }
        
        let fragments = BookService.instance.getFragments(for: bookId, locator: locator)
        
        let joinedFragments = fragments.map(\.fragment).map { "\"\($0)\"" }.joined(separator: ",")
        let jsFragmentsArray = "[\(joinedFragments)]"
        
        let scriptSource = """
            globalThis.storytellerFragments = \(jsFragmentsArray);
        
            let storytellerDoubleClickTimeout = null;
            let storytellerTouchMoved = false;
            for (const fragment of globalThis.storytellerFragments) {
                const element = document.getElementById(fragment);
                if (!element) continue;
                element.addEventListener('touchstart', (event) => {
                    storytellerTouchMoved = false;
                });
                element.addEventListener('touchmove', (event) => {
                    storytellerTouchMoved = true;
                });
                element.addEventListener('touchend', (event) => {
                    if (storytellerTouchMoved || !document.getSelection().isCollapsed || event.changedTouches.length !== 1) return;
        
                    event.bubbles = true
                    event.clientX = event.changedTouches[0].clientX
                    event.clientY = event.changedTouches[0].clientY
                    const clone = new MouseEvent('click', event);
                    event.stopImmediatePropagation();
                    event.preventDefault();

                    if (storytellerDoubleClickTimeout) {
                        clearTimeout(storytellerDoubleClickTimeout);
                        storytellerDoubleClickTimeout = null;
                        window.webkit.messageHandlers.storytellerDoubleClick.postMessage(fragment);
                        return
                    }

                    storytellerDoubleClickTimeout = setTimeout(() => {
                        storytellerDoubleClickTimeout = null;
                        element.parentElement.dispatchEvent(clone);
                    }, 350);
                })
            }
        
            document.addEventListener('selectionchange', () => {
                if (document.getSelection().isCollapsed) {
                    window.webkit.messageHandlers.storytellerSelectionCleared.postMessage(null);
                }
            });
        """
        
        userContentController.addUserScript(WKUserScript(source: scriptSource, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        userContentController.add(self, name: "storytellerDoubleClick")
        userContentController.add(self, name: "storytellerSelectionCleared")
    }

    func navigator(_ navigator: R2Navigator.Navigator, presentError error: R2Navigator.NavigatorError) {
        self.onError(["errorDescription": error.errorDescription as Any, "failureReason": error.failureReason as Any, "recoverySuggestion": error.recoverySuggestion as Any])
    }
    
    func navigator(_ navigator: VisualNavigator, didTapAt point: CGPoint) {
        self.didTapWork = nil
        if point.x < self.bounds.maxX * 0.2 {
            _ = navigator.goBackward(animated: true) {}
            return
        }
        if point.x > self.bounds.maxX * 0.8 {
            _ = navigator.goForward(animated: true) {}
            return
        }
        
        self.onMiddleTouch()
    }
    
    func navigator(_ navigator: Navigator, locationDidChange locator: Locator) {
        if isPlaying {
            return
        }

        guard let epubNav = navigator as? EPUBNavigatorViewController else {
            return
        }
        
        epubNav.evaluateJavaScript("""
            (function() {
                function isOnScreen(element) {
                    const rect = element.getBoundingClientRect();
                    const isVerticallyWithin = rect.bottom >= 0 && rect.top <= window.innerHeight;
                    const isHorizontallyWithin = rect.right >= 0 && rect.left <= window.innerWidth;
                    return isVerticallyWithin && isHorizontallyWithin;
                }

                for (const fragment of globalThis.storytellerFragments) {
                    const element = document.getElementById(fragment);
                    if (!element) continue;
                    if (isOnScreen(element)) {
                        return fragment;
                    }
                }

                return null;
            })();
        """) {
            switch $0 {
            case .failure(_):
                self.onLocatorChange(locator.json)
            case .success(let anyValue):
                guard let value = anyValue as? String else {
                    self.onLocatorChange(locator.json)
                    return
                }
                
                self.onLocatorChange(
                    locator.copy(
                        locations: {
                            $0.otherLocations["fragments"] = [value]
                        }
                    ).json
                )
            }
        }
    }
}
