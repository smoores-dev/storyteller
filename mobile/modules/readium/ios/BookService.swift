
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
    private var clips: [String : [OverlayPar]] = [:]

    public static let shared = BookService()

    private static func onCreatePublication(_ manifest: inout Manifest,_ container: inout Container,_ services: inout PublicationServicesBuilder) async -> Void {
        let localContainer = container

        let opfHREF = try? await EPUBContainerParser(container: localContainer).parseOPFHREF()

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

        let manifestItems = document.xpath("/opf:package/opf:manifest/opf:item")

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
    
    func getOverlayClips(for bookUuid: String) -> [OverlayPar] {
        return clips[bookUuid] ?? []
    }

    func getClip(for bookId: String, locator: Locator) -> OverlayPar? {
        guard let bookClips = clips[bookId] else {
            return nil
        }
        
        guard let fragment = locator.locations.fragments.first else {
            return nil
        }
        
        return bookClips.first {
            $0.locator.href.string == locator.href.string &&
            $0.fragmentId == fragment
        }
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

    func getFragments(for bookId: String, locator: Locator) -> [OverlayPar] {
        guard let bookClips = clips[bookId] else {
            return []
        }
        return bookClips.filter { $0.locator.href.string == locator.href.string }
    }

    func getFragment(for bookId: String, before locator: Locator) -> OverlayPar? {
        guard let currentFragment = locator.locations.fragments.first else {
            return nil
        }
        guard let bookClips = clips[bookId] else {
            return nil
        }
        guard let currentIndex = bookClips.firstIndex(where: { $0.locator.href.string == locator.href.string && $0.fragmentId == currentFragment }) else {
            return nil
        }
        if currentIndex == bookClips.startIndex {
            return nil
        }
        let previousIndex = bookClips.index(before: currentIndex)
        return bookClips[previousIndex]
    }

    func getFragment(for bookId: String, after locator: Locator) -> OverlayPar? {
        guard let currentFragment = locator.locations.fragments.first else {
            return nil
        }
        guard let bookClips = clips[bookId] else {
            return nil
        }
        guard let currentIndex = bookClips.firstIndex(where: { $0.locator.href.string == locator.href.string && $0.fragmentId == currentFragment }) else {
            return nil
        }
        if currentIndex == bookClips.endIndex {
            return nil
        }
        let nextIndex = bookClips.index(after: currentIndex)
        return bookClips[nextIndex]
    }

    func getLocatorFor(bookId: String, href: String, fragment: String) -> Locator? {
        guard let bookClips = clips[bookId] else {
            return nil
        }
        
        return bookClips.first { $0.locator.href.string == href && $0.fragmentId == fragment }?.locator
    }

    func getFragment(for bookId: String, clipUrl: URL, position: Double) -> OverlayPar? {
        guard let bookClips = clips[bookId] else {
            return nil
        }
        
        let clipsInUrl = bookClips.filter { $0.relativeUrl.relativeString == clipUrl.relativeString }
        
        return searchForClip(clips: clipsInUrl, position: position)
    }

    func locateLink(for bookId: String, link: Link) async -> Locator? {
        guard let publication = getPublication(for: bookId) else {
            return nil
        }
        return await publication.locate(link)
    }

    private func makeMediaOverlays(for bookId: String, pub publication: Publication) async throws {
        var bookClips: [OverlayPar] = []

        let mediaOverlayLinks = publication.resources.filterByMediaType(.smil)

        for link in mediaOverlayLinks {
            let mediaOverlays = STMediaOverlays(link: link)
            let node = STMediaOverlayNode()

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
            await STSMILParser.parseParallels(publication, in: body, withParent: node, base: link.href, htmlContent: nil)
            await STSMILParser.parseSequences(publication, in: body, withParent: node, mediaOverlays: mediaOverlays, base: link.href)

            bookClips.append(contentsOf: mediaOverlays.clips())
        }

        clips[bookId] = bookClips
    }

    /// Opens the Readium 2 Publication at the given `url`.
    func openPublication(for bookId: String, at url: FileURL, clips: [OverlayPar]?) async throws -> Publication {
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
            if clips == nil {
                try await makeMediaOverlays(for: bookId, pub: pub)
            } else {
                self.clips[bookId] = clips
            }
            return pub
        } catch {
            throw BookError.openFailed(error)
        }
    }

    func buildAudiobookManifest(for bookId: String) async throws -> Manifest {
        guard let publication = getPublication(for: bookId) else {
            throw BookError.bookNotFound
        }
        guard let bookClips = clips[bookId] else {
            throw BookError.bookNotFound
        }
        let clipsByHref = Dictionary(grouping: bookClips, by: \.locator.href.string)

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
            guard let tocProgression = tocLocator.locations.progression else {
                return fallbackLink
            }
            guard let plainLink = publication.linkWithHREF(tocLocator.href) else {
                return fallbackLink
            }
            guard let chapterClips = clipsByHref[plainLink.url().string] else {
                return fallbackLink
            }
            guard let clip = searchForClipsByProgression(clips: chapterClips, progression: tocProgression) else {
                return fallbackLink
            }

            guard let audioResource = RelativeURL(url: clip.relativeUrl) else {
                return fallbackLink
            }

            let clipResource = publication.resources.first {
                $0.href == audioResource.string
            }

            guard let clipResource = clipResource else {
                return fallbackLink
            }

            let href = "\(audioResource)#t=\(clip.start)"

            return Link(
                href: href,
                mediaType: clipResource.mediaType,
                title: link.title,
                children: children,
            )
        }

        var clips: OrderedDictionary<String, Double> = [:]

        for clip in bookClips {
            guard let audioResource = RelativeURL(url: clip.relativeUrl) else {
                continue
            }
            let duration = clips[audioResource.string] ?? 0.0
            let end = clip.end
            let start = clip.start
            clips[audioResource.string] = duration + end - start
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

func searchForClipsByProgression(clips: [OverlayPar], progression: Double) -> OverlayPar? {
    var startIndex = clips.startIndex
    var endIndex = clips.endIndex
    while (startIndex <= endIndex) {
        let midIndex = Int((startIndex + endIndex) / 2)
        let midItem = clips[midIndex]
        let prevIndex = midIndex - 1
        let prevItem = prevIndex < 0 ? nil : clips[prevIndex]
        if progression > (midItem.locator.locations.progression ?? 0.0) {
            startIndex = midIndex + 1
            continue
        }
        if (prevItem != nil && progression < (midItem.locator.locations.progression ?? 0.0)) {
            endIndex = midIndex - 1
            continue
        }
        return midItem
    }
    return nil
}
