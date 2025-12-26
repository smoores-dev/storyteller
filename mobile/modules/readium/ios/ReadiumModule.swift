import ExpoModulesCore
import ReadiumShared
import ReadiumNavigator

public class ReadiumModule: Module {
    public func definition() -> ModuleDefinition {
        Name("Readium")

        AsyncFunction("extractArchive") { (archiveUrl: URL, extractedUrl: URL) in
            try BookService.instance.extractArchive(archiveUrl: archiveUrl, extractedUrl: extractedUrl)
        }

        AsyncFunction("openPublication") { (bookId: String, publicationUri: URL) -> String in
            let pub = try await BookService.instance.openPublication(for: bookId, at: FileURL(url: publicationUri)!)
            return pub.jsonManifest ?? "{}"
        }

        AsyncFunction("buildAudiobookManifest") { (bookId: String) async throws -> [String:Any] in
            if #available(iOS 16.0, *) {
                return try await BookService.instance.buildAudiobookManifest(for: bookId).json
            } else {
                return [:]
            }
        }

        AsyncFunction("getResource") { (bookId: String, linkJson: [String : Any]) async throws -> String in
            let link = try Link(json: linkJson)
            let resource = try BookService.instance.getResource(for: bookId, link: link)
            if link.mediaType?.isBitmap ?? false {
                let data = try await resource.read().get()
                return data.base64EncodedString()
            }
            return try await resource.readAsString().get()
        }

        AsyncFunction("getPositions") { (bookId: String) async throws -> [[String : Any]] in
            let positions = try await BookService.instance.getPositions(for: bookId)
            return positions.map { $0.json }
        }

        AsyncFunction("getClip") { (bookId: String, locatorJson: [String : Any]) -> [String : Any]? in
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

        AsyncFunction("getFragment") { (bookId: String, clipUrlString: String, position: Double) async throws -> [String : Any]? in
            guard let clipUrl = URL(string: clipUrlString),
                  let fragment = try await BookService.instance.getFragment(for: bookId, clipUrl: clipUrl, position: position) else {
                return nil
            }
            return [
                "href": fragment.href,
                "fragment": fragment.fragment,
                "locator": fragment.locator!.json
            ]
        }

        AsyncFunction("getPreviousFragment") { (bookId: String, locatorJson: [String : Any]) async throws-> [String : Any]? in
            guard let locator = try Locator(json: locatorJson),
                  let previous = try? await BookService.instance.getFragment(for: bookId, before: locator) else {
                return nil
            }

            return [
                "href": previous.href,
                "fragment": previous.fragment,
                "locator": previous.locator!.json
            ]
        }

        AsyncFunction("getNextFragment") { (bookId: String, locatorJson: [String : Any]) async throws-> [String : Any]? in
            guard let locator = try Locator(json: locatorJson),
                  let next = try? await BookService.instance.getFragment(for: bookId, after: locator) else {
                return nil
            }

            return [
                "href": next.href,
                "fragment": next.fragment,
                "locator": next.locator!.json
            ]
        }

        AsyncFunction("locateLink") { (bookId: String, linkJson: [String : Any]) async throws-> [String : Any]? in
            let link = try Link(json: linkJson)
            let locator = await BookService.instance.locateLink(for: bookId, link: link)
            return locator?.json
        }

        View(EPUBView.self) {
            Events("onLocatorChange", "onMiddleTouch", "onSelection", "onDoubleTouch", "onError", "onHighlightTap", "onBookmarksActivate")

            Prop("bookUuid") { (view: EPUBView, prop: String) in
                view.pendingProps.bookId = prop
            }

            Prop("locator") { (view: EPUBView, prop: [String : Any]) in
                guard let locator = try? Locator(json: prop) else {
                    return
                }

                view.pendingProps.locator = locator
            }

            Prop("isPlaying") { (view: EPUBView, prop: Bool?) in
                let isPlaying = prop ?? false
                view.pendingProps.isPlaying = isPlaying
            }

            Prop("highlights") { (view: EPUBView, prop: [[String: Any]]) in
                let highlights = prop.compactMap { (highlightDict: [String: Any]) -> Highlight? in
                    guard let id = highlightDict["uuid"] as? String else {
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
                        case "yellow": UIColor.yellow
                        case "red": UIColor.red
                        case "blue": UIColor.blue
                        case "green": UIColor.green
                        case "magenta": UIColor.magenta
                        default: UIColor.yellow
                    }
                    return Highlight(id: id, color: mappedColor, locator: locator)
                }

                view.pendingProps.highlights = highlights
            }

            Prop("bookmarks") { (view: EPUBView, prop: [[String: Any]]) in
                let bookmarks = prop.compactMap { (locatorJson: [String : Any]) -> Locator? in
                    return try? Locator(json: locatorJson)
                }

                view.pendingProps.bookmarks = bookmarks
            }

            Prop("colorTheme") { (view: EPUBView, prop: [String: String]) in
                let foregroundHex = prop["foreground"] ?? "#111111"
                let backgroundHex = prop["background"] ?? "#FFFFFF"

                view.pendingProps.background = Color(hex: backgroundHex)
                view.pendingProps.foreground = Color(hex: foregroundHex)
            }

            Prop("readaloudColor") { (view: EPUBView, prop: String) in
                view.pendingProps.readaloudColor = Color(hex: prop)
            }

            Prop("fontScale") { (view: EPUBView, prop: Double) in
                view.pendingProps.fontSize = prop
            }

            Prop("lineHeight") { (view: EPUBView, prop: Double) in
                view.pendingProps.lineHeight = prop
            }

            Prop("textAlign") { (view: EPUBView, prop: String) in
                let textAlign = switch prop {
                    case "left": TextAlignment.left
                    default: TextAlignment.justify
                }

                view.pendingProps.textAlign = textAlign
            }

            Prop("customFonts") {(view: EPUBView, prop: [[String : String]]) in
                let customFonts = prop.compactMap { (customFontDict: [String : String]) -> CustomFont? in
                    guard let uri = customFontDict["uri"] else {
                        return nil
                    }
                    guard let name = customFontDict["name"] else {
                        return nil
                    }
                    guard let type = customFontDict["type"] else {
                        return nil
                    }
                    return CustomFont(uri: uri, name: name, type: type)
                }
                view.pendingProps.customFonts = customFonts
            }

            Prop("fontFamily") { (view: EPUBView, prop: String) in
                view.pendingProps.fontFamily = FontFamily(rawValue: prop)
            }

            OnViewDidUpdateProps {(view: EPUBView) in
                view.finalizeProps()
            }
        }
    }
}
