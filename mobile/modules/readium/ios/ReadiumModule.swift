import ExpoModulesCore
import R2Shared

public class ReadiumModule: Module {
    public func definition() -> ModuleDefinition {
        Name("Readium")

        AsyncFunction("openPublication") { (bookId: Int, publicationUri: URL) -> String in
            let pub = try await BookService.instance.openPublication(for: bookId, at: publicationUri)
            return pub.jsonManifest ?? "{}"
        }
        
        AsyncFunction("getResource") { (bookId: Int, linkJson: [String : Any]) -> String in
            let link = try Link(json: linkJson)
            let resource = try BookService.instance.getResource(for: bookId, link: link)
            if link.type?.starts(with: "image/") != nil {
                let data = try resource.read().get()
                return data.base64EncodedString()
            }
            return try resource.readAsString().get()
        }
        
        AsyncFunction("getClip") { (bookId: Int, locatorJson: [String : Any]) -> [String : Any]? in
            guard let locator = try Locator(json: locatorJson),
                  let clip = try BookService.instance.getClip(for: bookId, locator: locator) else {
                return nil
            }
            
            return [
                "relativeUrl": clip.relativeUrl!.absoluteString,
                "fragmentId": clip.fragmentId!,
                "start": clip.start!,
                "end": clip.end!,
                "duration": clip.duration!
            ]
        }
        
        AsyncFunction("getFragment") { (bookId: Int, clipUrlString: String, position: Double) -> [String : Any]? in
            guard let clipUrl = URL(string: clipUrlString),
                  let fragment = try BookService.instance.getFragment(for: bookId, clipUrl: clipUrl, position: position) else {
                return nil
            }
            return [
                "href": fragment.href,
                "fragment": fragment.fragment,
                "locator": fragment.locator!.json
            ]
        }
        
        AsyncFunction("locateLink") { (bookId: Int, linkJson: [String : Any]) -> [String : Any]? in
            let link = try Link(json: linkJson)
            let locator = BookService.instance.locateLink(for: bookId, link: link)
            return locator?.json
        }

        View(EPUBView.self) {
            Events("onLocatorChange", "onMiddleTouch", "onSelection", "onDoubleTouch", "onError", "onHighlightTap", "onBookmarksActivate")
            
            Prop("bookId") { (view: EPUBView, prop: Int) in
                view.bookId = prop
                view.initializeNavigator()
            }

            Prop("locator") { (view: EPUBView, prop: [String : Any]) in
                guard let locator = try? Locator(json: prop) else {
                    return
                }
                
                if let currentLocation = view.navigator?.currentLocation {
                    let locatorComp = currentLocation.locations.fragments.isEmpty ? locator.copy( locations: { $0.fragments = [] }) : locator;
                    guard currentLocation != locatorComp else {
                        return
                    }
                }
                
                view.locator = locator
                view.go()
            }

            Prop("isPlaying") { (view: EPUBView, prop: Bool?) in
                let isPlaying = prop ?? false
                view.isPlaying = isPlaying
                if view.isPlaying, let locator = view.locator {
                    view.highlightFragment(locator: locator)
                } else {
                    view.clearHighlightedFragment()
                }
            }

            Prop("highlights") { (view: EPUBView, prop: [[String: Any]]) in
                let highlights = prop.compactMap { (highlightDict: [String: Any]) -> Highlight? in
                    guard let id = highlightDict["id"] as? String else {
                        return nil
                    }
                    guard let color = highlightDict["color"] as? String else {
                        return nil
                    }
                    guard let locatorDict = highlightDict["locator"] as? [String: Any] else {
                        return nil
                    }
                    guard let locator = try? Locator(json: locatorDict) else {
                        return nil
                    }
                    let mappedColor = switch color {
                    case "yellow":
                        UIColor.yellow
                    case "red":
                        UIColor.red
                    case "blue":
                        UIColor.blue
                    case "green":
                        UIColor.green
                    case "magenta":
                        UIColor.magenta
                    default:
                        UIColor.yellow
                    }
                    return Highlight(id: id, color: mappedColor, locator: locator)
                }

                view.highlights = highlights
                view.decorateHighlights()
            }
            
            Prop("bookmarks") { (view: EPUBView, prop: [[String: Any]]) in
                let bookmarks = prop.compactMap { (locatorJson: [String : Any]) -> Locator? in
                    return try? Locator(json: locatorJson)
                }
                
                view.bookmarks = bookmarks
                if let currentLocator = view.navigator?.currentLocation {
                    view.findOnPage(locator: currentLocator)
                }
            }
        }
    }
}
