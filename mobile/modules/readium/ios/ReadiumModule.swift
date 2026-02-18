import ExpoModulesCore
import ReadiumShared
import ReadiumNavigator

public class ReadiumModule: Module {
    public func definition() -> ModuleDefinition {
        OnCreate {
            Task { @AudiobookPlayerActor in
                await AudiobookPlayerActor.shared.observeClipChanged(self.onClipChanged(overlayPar:))
                await AudiobookPlayerActor.shared.observeTrackChanged(self.onTrackChanged(track:position:))
                await AudiobookPlayerActor.shared.observeIsPlayingChanged(self.onIsPlayingChanged(isPlaying:))
                await AudiobookPlayerActor.shared.observePositionChanged(self.onPositionChanged(position:))
            }
        }
        
        Name("Readium")
        
        Events("clipChanged", "isPlayingChanged", "positionChanged", "trackChanged")
        
        AsyncFunction("getIsPlaying") {
            return await AudiobookPlayerActor.shared.getIsPlaying()
        }
        
        AsyncFunction("getCurrentClip") {
            return await AudiobookPlayerActor.shared.getCurrentClip()?.toJson()
        }
        
        AsyncFunction("loadTracks") { (tracksJson: [[String:Any?]]) in
            let tracks = tracksJson.map { Track.fromJson(json: $0) }
            return try? await AudiobookPlayerActor.shared.loadTracks(tracks: tracks)
        }
        
        AsyncFunction("getPosition") {
            return await AudiobookPlayerActor.shared.getPosition()
        }
        
        AsyncFunction("getCurrentTrack") {
            return await AudiobookPlayerActor.shared.getCurrentTrack()?.toJson()
        }
        
        AsyncFunction("getTracks") {
            return await AudiobookPlayerActor.shared.getTracks().map { $0.toJson() }
        }
        
        AsyncFunction("play") { (automaticRewind: Bool?) in
            await AudiobookPlayerActor.shared.play(automaticRewind: automaticRewind ?? true)
        }
        
        AsyncFunction("pause") {
            await AudiobookPlayerActor.shared.pause()
        }
        
        AsyncFunction("unload") {
            await AudiobookPlayerActor.shared.unload()
        }
        
        AsyncFunction("skip") { (position: Double) in
            await AudiobookPlayerActor.shared.skip(to: position)
        }
        
        AsyncFunction("seekTo") { (relativeUri: String, position: Double, skipEmit: Bool?) in
            await AudiobookPlayerActor.shared.seekTo(relativeUri: relativeUri, position: position, skipEmit: skipEmit ?? false)
        }
        
        AsyncFunction("seekBy") { (amount: Double) in
            await AudiobookPlayerActor.shared.seekBy(amount: amount, bounded: false)
        }
        
        AsyncFunction("next") {
            await AudiobookPlayerActor.shared.next()
        }
        
        AsyncFunction("prev") {
            await AudiobookPlayerActor.shared.prev()
        }

        AsyncFunction("setRate") { (rate: Double) in
            await AudiobookPlayerActor.shared.setRate(rate: rate)
        }
        
        AsyncFunction("setAutomaticRewind") { (config: [String:Any]) in
            await AudiobookPlayerActor.shared.setAutomaticRewind(
                enabled: config["enabled"] as! Bool,
                afterInterruption: config["afterInterruption"] as! Double,
                afterBreak: config["afterBreak"] as! Double
            )
        }
        
        AsyncFunction("extractArchive") { (archiveUrl: URL, extractedUrl: URL) in
            try BookService.shared.extractArchive(archiveUrl: archiveUrl, extractedUrl: extractedUrl)
        }

        AsyncFunction("openPublication") { (bookId: String, publicationUri: URL, clipsJson: [[String:Any]]?) async throws -> String in
            let clips = try clipsJson?.map(OverlayPar.fromJson(_:))
            let pub = try await BookService.shared.openPublication(for: bookId, at: FileURL(url: publicationUri)!, clips: clips)
            return pub.jsonManifest ?? "{}"
        }
        
        AsyncFunction("getOverlayClips") { (bookId: String) in
            return BookService.shared.getOverlayClips(for: bookId).map { $0.toJson() }
        }

        AsyncFunction("buildAudiobookManifest") { (bookId: String) async throws -> [String:Any] in
            if #available(iOS 16.0, *) {
                return try await BookService.shared.buildAudiobookManifest(for: bookId).json
            } else {
                return [:]
            }
        }

        AsyncFunction("getResource") { (bookId: String, linkJson: [String : Any]) async throws -> String in
            let link = try Link(json: linkJson)
            let resource = try BookService.shared.getResource(for: bookId, link: link)
            if link.mediaType?.isBitmap ?? false {
                let data = try await resource.read().get()
                return data.base64EncodedString()
            }
            return try await resource.readAsString().get()
        }

        AsyncFunction("getPositions") { (bookId: String) async throws -> [[String : Any]] in
            let positions = try await BookService.shared.getPositions(for: bookId)
            return positions.map { $0.json }
        }

        AsyncFunction("getClip") { (bookId: String, locatorJson: [String : Any]) -> [String : Any]? in
            guard let locator = try Locator(json: locatorJson),
                  let clip = BookService.shared.getClip(for: bookId, locator: locator) else {
                return nil
            }

            return clip.toJson()
        }

        AsyncFunction("getFragment") { (bookId: String, clipUrlString: String, position: Double) async throws -> [String : Any]? in
            guard let clipUrl = URL(string: clipUrlString),
                  let fragment = BookService.shared.getFragment(for: bookId, clipUrl: clipUrl, position: position) else {
                return nil
            }
            return [
                "href": fragment.locator.href,
                "fragment": fragment.fragmentId,
                "locator": fragment.locator.json
            ]
        }

        AsyncFunction("getPreviousFragment") { (bookId: String, locatorJson: [String : Any]) async throws-> [String : Any]? in
            guard let locator = try Locator(json: locatorJson),
                  let previous = BookService.shared.getFragment(for: bookId, before: locator) else {
                return nil
            }

            return [
                "href": previous.locator.href,
                "fragment": previous.fragmentId,
                "locator": previous.locator.json
            ]
        }

        AsyncFunction("getNextFragment") { (bookId: String, locatorJson: [String : Any]) async throws-> [String : Any]? in
            guard let locator = try Locator(json: locatorJson),
                  let next = BookService.shared.getFragment(for: bookId, after: locator) else {
                return nil
            }

            return [
                "href": next.locator.href,
                "fragment": next.fragmentId,
                "locator": next.locator.json
            ]
        }

        AsyncFunction("locateLink") { (bookId: String, linkJson: [String : Any]) async throws-> [String : Any]? in
            let link = try Link(json: linkJson)
            let locator = await BookService.shared.locateLink(for: bookId, link: link)
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
    
    func onClipChanged(overlayPar: OverlayPar) {
        sendEvent("clipChanged", [
            "relativeUrl": overlayPar.relativeUrl.absoluteString,
            "fragmentId": overlayPar.fragmentId,
            "start": overlayPar.start,
            "end": overlayPar.end,
            "duration": overlayPar.end - overlayPar.start,
            "locator": overlayPar.locator.json
        ])
    }
    
    func onIsPlayingChanged(isPlaying: Bool) {
        sendEvent("isPlayingChanged", ["isPlaying": isPlaying])
    }
    
    func onPositionChanged(position: Double) {
        sendEvent("positionChanged", ["position": position])
    }
    
    func onTrackChanged(track: Track, position: Double) {
        sendEvent("trackChanged", ["track": track.toJson(), "position": position])
    }
}
