import ExpoModulesCore
import R2Shared
import R2Navigator
import ReadiumAdapterGCDWebServer

// This view will be used as a native component. Make sure to inherit from `ExpoView`
// to apply the proper styling (e.g. border radius and shadows).
class EPUBView: ExpoView {
    private let templates = HTMLDecorationTemplate.defaultTemplates()
    let onLocatorChange = EventDispatcher()
    let onMiddleTouch = EventDispatcher()
    
    public var bookId: Int?
    public var locator: Locator?
    public var isPlaying: Bool = false
    public var navigator: EPUBNavigatorViewController?
    
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
                self.highlightSelection()
            }
        }
    }
    
    func highlightSelection() {
        guard let locator = self.locator, let id = locator.locations.fragments.first else {
            return
        }
        
        let overlayHighlight = Decoration.Style.highlight(tint: .yellow, isActive: true)
        let decoration = Decoration(
            id: id,
            locator: locator,
            style: overlayHighlight)
        
        navigator?.apply(decorations: [decoration], in: "overlay")
    }
    
    func clearHighlights() {
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
        guard let epubNav = navigator as? EPUBNavigatorViewController else {
            return
        }

        let currentProgression = locator.progression else {
            return
        }

        let joinedProgressions = locators
            .compactMap(\.progression)
            .map { "\($0)" }
            .joined(separator: ",")

        let jsProgressionsArray = "[\(joinedProgressions)]"

        epubNav.evaluateJavaScript("""
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
                progression * documentWidth > currentPageStart &&
                progression * documentWidth < currentPageEnd
            );
        """) {
            switch $0 {
            case .failure(_):
                self.onLocatorChange(locator.json)
            case .success(let anyValue):
                guard let value = anyValue as? [Double] else {
                    promise.resolve([])
                }
                
                let found = locations.filter { value.contains($0.progression) }
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

extension EPUBView: EPUBNavigatorDelegate {
    func navigator(_ navigator: R2Navigator.Navigator, presentError error: R2Navigator.NavigatorError) {
        // pass
    }
    
    func navigator(_ navigator: VisualNavigator, didTapAt point: CGPoint) {
        guard let navigator = self.navigator else {
            return
        }
        
        if point.x < bounds.maxX * 0.2 {
            _ = navigator.goBackward(animated: true) {}
            return
        }
        if point.x > bounds.maxX * 0.8 {
            _ = navigator.goForward(animated: true) {}
            return
        }
        
        onMiddleTouch()
    }
    
    func navigator(_ navigator: Navigator, locationDidChange locator: Locator) {
        if isPlaying {
            return
        }

        guard let epubNav = navigator as? EPUBNavigatorViewController else {
            return
        }
        
        guard let bookId = self.bookId else {
            return
        }
        
        let fragments = BookService.instance.getFragments(for: bookId, locator: locator)
        
        let joinedFragments = fragments.map(\.fragment).map { "\"\($0)\"" }.joined(separator: ",")
        let jsFragmentsArray = "[\(joinedFragments)]"
        
        epubNav.evaluateJavaScript("""
            function isOnScreen(element) {
                const rect = element.getBoundingClientRect();
                const isVerticallyWithin = rect.bottom >= 0 && rect.top <= window.innerHeight;
                const isHorizontallyWithin = rect.right >= 0 && rect.left <= window.innerWidth;
                return isVerticallyWithin && isHorizontallyWithin;
            }

            for (const fragment of \(jsFragmentsArray)) {
                const element = document.getElementById(fragment);
                if (isOnScreen(element)) {
                    return fragment;
                }
            }

            return null;
        """) {
            switch $0 {
            case .failure(_):
                self.onLocatorChange(locator.json)
            case .success(let anyValue):
                guard let value = anyValue as? [Double] else {
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
