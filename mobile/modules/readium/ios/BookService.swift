
import Combine
import Foundation
import ReadiumShared
import ReadiumStreamer
import ReadiumFuzi
import ZIPFoundation
import OrderedCollections

enum BookServiceError : Error {
    case unopenedPublication(String)
    case locatorNotInReadingOrder(String, String)
    case noMediaOverlay(String, String)
    case openContent(String, String)
    case extractFailed(URL, String)
}

extension Task where Failure == Error {
    /// Performs an async task in a sync context.
    ///
    /// - Note: This function blocks the thread until the given operation is finished. The caller is responsible for managing multithreading.
    static func synchronous(priority: TaskPriority? = nil, operation: @escaping @Sendable () async throws -> Success) {
        let semaphore = DispatchSemaphore(value: 0)

        Task(priority: priority) {
            defer { semaphore.signal() }
            return try await operation()
        }

        semaphore.wait()
    }
}

final class BookService {
    let retriever: AssetRetriever
    private let opener: PublicationOpener
    private var publications: [String : Publication] = [:]
    private var mediaOverlays: [String : OrderedDictionary<String, STMediaOverlays>] = [:]

    public static let instance = BookService()

    private static func onCreatePublication(_ manifest: inout Manifest,_ container: inout Container,_ services: inout PublicationServicesBuilder) -> Void {
        let localContainer = container
        var opfHREF: RelativeURL? = nil
        var manifestItems: NodeSet? = nil
        Task.synchronous {
            opfHREF = try? await EPUBContainerParser(container: localContainer).parseOPFHREF()

            guard let opfHREF = opfHREF else {
                return
            }

            guard let opfResource = localContainer[opfHREF] else {
                return
            }

            guard let opfData = try? await opfResource.read().get() else {
                return
            }

            guard let document = try? ReadiumFuzi.XMLDocument(data: opfData) else {
                return
            }
            document.definePrefix("opf", forNamespace: "http://www.idpf.org/2007/opf")

             manifestItems = document.xpath("/opf:package/opf:manifest/opf:item")
        }

        guard let manifestItems = manifestItems else {
            return
        }

        guard let opfHREF = opfHREF else {
            return
        }

        var readingOrder = manifest.readingOrder
        for manifestItem in manifestItems {
            guard let relativeHREF = manifestItem.attr("href").flatMap(RelativeURL.init(epubHREF:)) else {
                continue
            }

            guard let href = opfHREF.resolve(relativeHREF) else {
                continue
            }

            guard let readingOrderIndex = readingOrder.firstIndexWithHREF(href) else {
                continue
            }

            var link = readingOrder[readingOrderIndex]

            if let mediaOverlayId = manifestItem.attr("media-overlay"),
               let mediaOverlay = manifestItems.first(where: { $0.attr("id") == mediaOverlayId }),
               let relativeMediaOverlayHref = mediaOverlay.attr("href").flatMap(RelativeURL.init(epubHREF:)),
               let mediaOverlayHref = opfHREF.resolve(relativeMediaOverlayHref) {
                link.addProperties(["mediaOverlay": mediaOverlayHref.string])
                readingOrder[readingOrderIndex] = link
            }
        }

        manifest.readingOrder = readingOrder
    }

    private init() {
        retriever = AssetRetriever(
            formatSniffer: DefaultFormatSniffer(),
            resourceFactory: DefaultResourceFactory(httpClient: DefaultHTTPClient()),
            archiveOpener: DefaultArchiveOpener()
        )

        opener = PublicationOpener(parser: EPUBParser())
    }

    func extractArchive(archiveUrl: URL, extractedUrl: URL) throws {

        let fileManager = FileManager.default

        do {
            try fileManager.createDirectory(at: extractedUrl, withIntermediateDirectories: true, attributes: nil)
            try fileManager.unzipItem(at: archiveUrl, to: extractedUrl)
        } catch {
            print(error.localizedDescription)
            throw BookServiceError.extractFailed(archiveUrl, error.localizedDescription)
        }
    }

    func getPublication(for bookId: String) -> Publication? {
        return publications[bookId]
    }

    func getResource(for bookId: String, link: Link) throws -> Resource {
        guard let publication = publications[bookId] else {
            throw BookServiceError.unopenedPublication(bookId)
        }
        return publication.get(link)!
    }

    func getPositions(for bookId: String) async throws -> [Locator] {
        guard let publication = getPublication(for: bookId) else {
            throw BookServiceError.unopenedPublication(bookId)
        }
        return await publication.positions().getOrNil() ?? []
    }

    func getClip(for bookId: String, locator: Locator) throws -> Clip? {
        guard let publication = getPublication(for: bookId) else {
            throw BookServiceError.unopenedPublication(bookId)
        }

        guard let link = publication.readingOrder.first(where: { $0.href == locator.href.string }) else {
            throw BookServiceError.locatorNotInReadingOrder(bookId, locator.href.string)
        }

        guard let overlayHref = link.properties.otherProperties["mediaOverlay"] as? String,
              let mediaOverlays = self.mediaOverlays[bookId]?[overlayHref] else {
//            throw BookServiceError.noMediaOverlay(bookId, link.href)
            return nil
        }

        guard let fragment = locator.locations.fragments.first else {
            return nil
        }

        return try? mediaOverlays.clip(forFragmentId: fragment)
    }

    func locateFromPositions(for bookId: String, link: Link) async throws -> Locator {
        guard let publication = getPublication(for: bookId) else {
            throw BookServiceError.unopenedPublication(bookId)
        }

        guard let readingOrderIndex = publication.readingOrder.firstIndexWithHREF(RelativeURL(epubHREF: link.href)!) else {
            throw BookServiceError.locatorNotInReadingOrder(bookId, link.href)
        }

        let positions = try await publication.positionsByReadingOrder().get()

        guard let locator = positions[readingOrderIndex].first else {
            throw BookServiceError.locatorNotInReadingOrder(bookId, link.href)
        }

        return locator
    }

    func getFragments(for bookId: String, locator: Locator) -> [TextFragment] {
        let mediaOverlayStore = self.mediaOverlays[bookId]
        let mediaOverlays = mediaOverlayStore?.values
        let textFragments = mediaOverlays?.flatMap { $0.fragments() } ?? []
        return textFragments.filter { $0.href == locator.href.string }
    }

    func getFragment(for bookId: String, before locator: Locator) async throws ->  TextFragment? {
        guard let currentFragment = locator.locations.fragments.first else {
            return nil
        }
        let mediaOverlayStore = self.mediaOverlays[bookId]
        let mediaOverlays = mediaOverlayStore?.values
        let textFragments = mediaOverlays?.flatMap { $0.fragments() } ?? []
        guard let currentIndex = textFragments.firstIndex(where: { $0.href == locator.href.string && $0.fragment == currentFragment }) else {
            return nil
        }
        if currentIndex == textFragments.startIndex {
            return nil
        }
        let previousIndex = textFragments.index(before: currentIndex)
        var previousFragment = textFragments[previousIndex]
        previousFragment.locator = try await getLocatorFor(bookId: bookId, href: previousFragment.href, fragment: previousFragment.fragment)
        return previousFragment
    }

    func getFragment(for bookId: String, after locator: Locator) async throws -> TextFragment? {
        guard let currentFragment = locator.locations.fragments.first else {
            return nil
        }
        let mediaOverlayStore = self.mediaOverlays[bookId]
        let mediaOverlays = mediaOverlayStore?.values
        let textFragments = mediaOverlays?.flatMap { $0.fragments() } ?? []
        guard let currentIndex = textFragments.firstIndex(where: { $0.href == locator.href.string && $0.fragment == currentFragment }) else {
            return nil
        }
        if currentIndex == textFragments.endIndex {
            return nil
        }
        let nextIndex = textFragments.index(after: currentIndex)
        var nextFragment = textFragments[nextIndex]
        nextFragment.locator = try await getLocatorFor(bookId: bookId, href: nextFragment.href, fragment: nextFragment.fragment)
        return nextFragment
    }

    func getLocatorFor(bookId: String, href: String, fragment: String) async throws -> Locator? {
        guard let publication = getPublication(for: bookId) else {
            throw BookServiceError.unopenedPublication(bookId)
        }

        guard let link = publication.linkWithHREF(RelativeURL(epubHREF: href)!) else {
            return nil
        }

        let resource = publication.get(link)!
        let htmlContent = try await resource.readAsString().get()
        if #available(iOS 16.0, *) {
            let fragmentRegex = try Regex("id=\"\(fragment)\"")
            if let startOfFragment = htmlContent.firstMatch(of: fragmentRegex)?.range.lowerBound {
                let fragmentPosition = htmlContent.distance(from: htmlContent.startIndex, to: startOfFragment)
                let progression = Double(fragmentPosition) / Double(htmlContent.distance(from: htmlContent.startIndex, to: htmlContent.endIndex))
                guard let startOfChapterProgression = try await locateFromPositions(for: bookId, link: link).locations.totalProgression else {
                    return nil
                }
                guard let chapterIndex = publication.readingOrder.firstIndexWithHREF(RelativeURL(epubHREF: link.href)!) else {
                    return nil
                }
                let nextChapterIndex = publication.readingOrder.index(after: chapterIndex)
                let nextChapterLink = publication.readingOrder[nextChapterIndex]
                let startOfNextChapterProgression = try await locateFromPositions(for: bookId, link: nextChapterLink).locations.totalProgression ?? 1
                let totalProgression = startOfChapterProgression + (progression * (startOfNextChapterProgression - startOfChapterProgression))
                return Locator(
                    href: RelativeURL(epubHREF: href)!,
                    mediaType: .xhtml,
                    locations: Locator.Locations(
                        fragments: [fragment],
                        progression: progression,
                        totalProgression: totalProgression
                    )
                )
            }

            return nil
        }

        return Locator(
            href: RelativeURL(epubHREF: href)!,
            mediaType: .xhtml
        )
    }

    func getFragment(for bookId: String, clipUrl: URL, position: Double) async throws -> TextFragment? {
        guard let mediaOverlayStore = self.mediaOverlays[bookId] else {
            return nil
        }

        var maybeFragment: TextFragment? = nil
        for mediaOverlays in mediaOverlayStore.values {
            if let found = mediaOverlays.fragment(clipUrl: clipUrl, position: position) {
                maybeFragment = found
                break
            }
        }

        guard var fragment = maybeFragment else {
            return nil
        }

        let locator = try await getLocatorFor(bookId: bookId, href: fragment.href, fragment: fragment.fragment)
        fragment.locator = locator

        return fragment
    }

    func locateLink(for bookId: String, link: Link) async -> Locator? {
        guard let publication = getPublication(for: bookId) else {
            return nil
        }
        return await publication.locate(link)
    }

    private func makeMediaOverlays(for bookId: String, pub publication: Publication) async throws {
        var mediaOverlayStore: OrderedDictionary<String, STMediaOverlays> = [:]

        let mediaOverlayLinks = publication.resources.filterByMediaType(.smil)

        for link in mediaOverlayLinks {
            let mediaOverlays = STMediaOverlays(link: link)
            let node = MediaOverlayNode()

            let smilResource = publication.get(link)!
            guard let smilData = try? await smilResource.read().get(),
                let smilXml = try? XMLDocument(data: smilData) else
            {
                throw OPFParserError.invalidSmilResource
            }

            smilXml.definePrefix("smil", forNamespace: "http://www.w3.org/ns/SMIL")
            smilXml.definePrefix("epub", forNamespace: "http://www.idpf.org/2007/ops")
            guard let body = smilXml.firstChild(xpath: "./smil:body") else {
                throw OPFParserError.invalidSmilResource
            }

            node.role.append("section")
            if let textRef = body.attr("textref") { // Prevent the crash on the japanese book
                node.text = RelativeURL(epubHREF: link.href)!.resolve( RelativeURL(epubHREF: textRef)!)!.string
            }
            // get body parameters <par>a
            STSMILParser.parseParallels(in: body, withParent: node, base: link.href)
            STSMILParser.parseSequences(in: body, withParent: node, mediaOverlays: mediaOverlays.mediaOverlays, base: link.href)

            mediaOverlayStore[link.href] = mediaOverlays
        }

        self.mediaOverlays[bookId] = mediaOverlayStore
    }

    /// Opens the Readium 2 Publication at the given `url`.
    func openPublication(for bookId: String, at url: FileURL) async throws -> Publication {
        if let publication = getPublication(for: bookId) {
            return publication
        }

        let container = try! await DirectoryContainer(directory: url)

        let asset = await retriever.retrieve(container: container).getOrNil()

        let pubResult = await opener.open(asset: asset!, allowUserInteraction: false, onCreatePublication: BookService.onCreatePublication)

        do {
            let pub = try pubResult.get()
            try checkIsReadable(publication: pub)
            publications[bookId] = pub
            try await makeMediaOverlays(for: bookId, pub: pub)
            return pub
        } catch {
            throw BookError.openFailed(error)
        }
    }

    @available(iOS 16.0, *)
    func buildAudiobookManifest(for bookId: String) async throws -> Manifest {
        guard let publication = getPublication(for: bookId) else {
            throw BookError.bookNotFound
        }
        guard let mediaOverlays = self.mediaOverlays[bookId] else {
            throw BookError.bookNotFound
        }

        func buildAudiobookTocLink(link: Link) async throws -> Link? {
            let children = try await link.children.asyncMap {
                try await buildAudiobookTocLink(link: $0)
            }.compactMap { $0 }

            let fallbackLink = children.first.map {
                Link(
                    href: $0.href,
                    mediaType: $0.mediaType,
                    title: link.title,
                    duration: 0,
                    children: children,
                )
            }

            guard let tocLocator = await locateLink(for: bookId, link: link) else {
                return fallbackLink
            }
            guard let plainLink = publication.linkWithHREF(tocLocator.href) else {
                return fallbackLink
            }
            guard let mediaOverlayHREF = plainLink.properties["mediaOverlay"] else {
                return fallbackLink
            }
            guard let overlay = mediaOverlays[mediaOverlayHREF as! String] else {
                return fallbackLink
            }

            let clip: Clip? = try await {
                if !tocLocator.locations.fragments.isEmpty {
                    let resource = publication.get(plainLink)
                    guard let htmlContent = await resource?.readAsString().getOrNil() else {
                        return nil
                    }
                    let fragmentRegex = try Regex("id=\(tocLocator.locations.fragments.first!)")
                    guard let endOfFragment = htmlContent.firstMatch(of: fragmentRegex)?.range.upperBound else {
                        return nil
                    }
                    let nextFragmentRegex = /id="([a-zA-Z][a-zA-Z0-9\\-_:.]*)"/
                    guard let nextFragment = htmlContent[endOfFragment...].firstMatch(of: nextFragmentRegex)?.1 else {
                        return nil
                    }
                    return try? overlay.clip(forFragmentId: String(nextFragment))
                } else {
                    return overlay.clips().first
                }
            }()

            guard let clip = clip else {
                return fallbackLink
            }

            guard let relativeUrl = clip.relativeUrl, let audioResource = RelativeURL(url: relativeUrl) else {
                return fallbackLink
            }

            let clipResource = publication.resources.first {
                $0.href == audioResource.string
            }

            guard let clipResource = clipResource else {
                return fallbackLink
            }

            let duration = overlay.link.duration

            let href = "\(audioResource)#t=\(clip.start ?? 0.0)"

            return Link(
                href: href,
                mediaType: clipResource.mediaType,
                title: link.title,
                duration: duration,
                children: children,
            )
        }

        var clips: OrderedDictionary<String, Double> = [:]

        for overlay in mediaOverlays.values {
            for clip in overlay.clips() {
                guard let relativeUrl = clip.relativeUrl, let audioResource = RelativeURL(url: relativeUrl) else {
                    continue
                }
                let duration = clips[audioResource.string] ?? 0.0
                let end = clip.end ?? 0.0
                let start = clip.start ?? 0.0
                clips[audioResource.string] = duration + end - start
            }
        }

        return try await Manifest(
            metadata: publication.metadata,
            readingOrder: clips.compactMap { key, value in
                guard var link = publication.linkWithHREF(RelativeURL(epubHREF: key)!) else {
                    return nil
                }

                link.duration = value
                return link
            },
            tableOfContents: publication.tableOfContents().get().asyncMap {
                try await buildAudiobookTocLink(link: $0)
            }.compactMap { $0 },
            )

    }

    private func checkIsReadable(publication: Publication) throws {
        guard !publication.isRestricted else {
          if let error = publication.protectionError {
              throw BookError.openFailed(error)
          } else {
              throw BookError.cancelled
          }
        }
    }
}
