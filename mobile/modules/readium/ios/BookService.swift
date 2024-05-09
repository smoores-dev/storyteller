
import Combine
import Foundation
import R2Shared
import R2Streamer
import Fuzi

enum BookServiceError : Error {
    case unopenedPublication(Int)
    case locatorNotInReadingOrder(Int, String)
    case noMediaOverlay(Int, String)
    case openContent(Int, String)
}

final class BookService {
    private let streamer: Streamer
    private var publications: [Int : Publication] = [:]
    private var mediaOverlays: [Int : [String : STMediaOverlays]] = [:]
    
    public static let instance = BookService()
    
    private static func onCreatePublication(_ mediaType: MediaType,_ manifest: inout Manifest,_ fetcher: inout Fetcher,_ services: inout PublicationServicesBuilder) -> Void {
        guard let opfHREF = try? EPUBContainerParser(fetcher: fetcher).parseOPFHREF() else {
            return
        }
        
        let opfResource = fetcher.get(opfHREF)
        defer { opfResource.close() }
        guard let opfData = try? opfResource.read().get() else {
            return
        }
        
        guard let document = try? Fuzi.XMLDocument(data: opfData) else {
            return
        }
        document.definePrefix("opf", forNamespace: "http://www.idpf.org/2007/opf")
        
        let manifestItems = document.xpath("/opf:package/opf:manifest/opf:item")

        var readingOrder = manifest.readingOrder
        for manifestItem in manifestItems {
            guard var href = manifestItem.attr("href")?.removingPercentEncoding else {
                continue
            }
            
            href = HREF(href, relativeTo: opfHREF).string
            
            guard let readingOrderIndex = readingOrder.firstIndex(withHREF: href) else {
                continue
            }
            
            let link = readingOrder[readingOrderIndex]
            
            if let mediaOverlayId = manifestItem.attr("media-overlay"),
               let mediaOverlay = manifestItems.first(where: { $0.attr("id") == mediaOverlayId }),
               let mediaOverlayHref = mediaOverlay.attr("href") {
                 let updatedLink = link.copy(properties: link.properties.adding(["mediaOverlay": HREF(mediaOverlayHref, relativeTo: opfHREF).string]))
                 readingOrder[readingOrderIndex] = updatedLink
            }
        }
        manifest = manifest.copy(
            readingOrder: readingOrder
        )
    }

    private init() {
        streamer = Streamer(
            onCreatePublication: Self.onCreatePublication
        )
    }
    
    func getPublication(for bookId: Int) -> Publication? {
        return publications[bookId]
    }

    func getResource(for bookId: Int, link: Link) throws -> Resource {
        guard let publication = publications[bookId] else {
            throw BookServiceError.unopenedPublication(bookId)
        }
        return publication.get(link)
    }
    
    func getClip(for bookId: Int, locator: Locator) throws -> Clip? {
        guard let publication = getPublication(for: bookId) else {
            throw BookServiceError.unopenedPublication(bookId)
        }
        
        guard let link = publication.readingOrder.first(where: { $0.href == locator.href }) else {
            throw BookServiceError.locatorNotInReadingOrder(bookId, locator.href)
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
    
    func locateFromPositions(for bookId: Int, link: Link) throws -> Locator {
        guard let publication = getPublication(for: bookId) else {
            throw BookServiceError.unopenedPublication(bookId)
        }
        
        guard let readingOrderIndex = publication.readingOrder.firstIndex(withHREF: link.href) else {
            throw BookServiceError.locatorNotInReadingOrder(bookId, link.href)
        }
        
        guard let locator = publication.positionsByReadingOrder[readingOrderIndex].first else {
            throw BookServiceError.locatorNotInReadingOrder(bookId, link.href)
        }
        
        return locator
    }
    
    func getFragments(for bookId: Int, locator: Locator) -> [TextFragment] {
        let mediaOverlayStore = self.mediaOverlays[bookId]
        let mediaOverlays = mediaOverlayStore?.values
        let textFragments = mediaOverlays?.flatMap { $0.fragments() } ?? []
        return textFragments.filter { $0.href == locator.href }
    }
    
    func getFragment(for bookId: Int, clipUrl: URL, position: Double) throws -> TextFragment? {
        guard let publication = getPublication(for: bookId) else {
            throw BookServiceError.unopenedPublication(bookId)
        }
        
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
        
        guard let link = publication.link(withHREF: fragment.href) else {
            return nil
        }
        
        let resource = publication.get(link)
        let htmlContent = try resource.readAsString().get()
        if #available(iOS 16.0, *) {
            let fragmentRegex = try Regex("id=\"\(fragment.fragment)\"")
            if let startOfFragment = htmlContent.firstMatch(of: fragmentRegex)?.range.lowerBound {
                let fragmentPosition = htmlContent.distance(from: htmlContent.startIndex, to: startOfFragment)
                let progression = Double(fragmentPosition) / Double(htmlContent.distance(from: htmlContent.startIndex, to: htmlContent.endIndex))
                guard let startOfChapterProgression = try locateFromPositions(for: bookId, link: link).locations.totalProgression else {
                    return nil
                }
                guard let chapterIndex = publication.readingOrder.firstIndex(withHREF: link.href) else {
                    return nil
                }
                let nextChapterIndex = publication.readingOrder.index(after: chapterIndex)
                let nextChapterLink = publication.readingOrder[nextChapterIndex]
                let startOfNextChapterProgression = try locateFromPositions(for: bookId, link: nextChapterLink).locations.totalProgression ?? 1
                let totalProgression = startOfChapterProgression + (progression * (startOfNextChapterProgression - startOfChapterProgression))
                fragment.locator = Locator(
                    href: fragment.href,
                    type: "application/xhtml+xml",
                    locations: Locator.Locations(
                        fragments: [fragment.fragment],
                        progression: progression,
                        totalProgression: totalProgression
                    )
                )
            }
            
        } else {
            fragment.locator = Locator(
                href: fragment.href,
                type: "application/xhtml+xml"
            )
        }
        
        return fragment
    }

    func locateLink(for bookId: Int, link: Link) -> Locator? {
        guard let publication = getPublication(for: bookId) else {
            return nil
        }
        return publication.locate(link)
    }
    
    private func makeMediaOverlays(for bookId: Int, pub publication: Publication) throws {
        var mediaOverlayStore: [String : STMediaOverlays] = [:]
        
        let mediaOverlayLinks = publication.resources.filter(byMediaType: .smil)
        
        for link in mediaOverlayLinks {
            let mediaOverlays = STMediaOverlays()
            let node = MediaOverlayNode()
            
            let smilResource = publication.get(link)
            defer { smilResource.close() }
            guard let smilData = try? smilResource.read().get(),
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
                node.text = HREF(textRef, relativeTo: link.href).string
            }
            // get body parameters <par>a
            STSMILParser.parseParallels(in: body, withParent: node, base: link.href)
            STSMILParser.parseSequences(in: body, withParent: node, mediaOverlays: mediaOverlays.mediaOverlays, base: link.href)
            
            mediaOverlayStore[link.href] = mediaOverlays
        }
        
        self.mediaOverlays[bookId] = mediaOverlayStore
    }

    /// Opens the Readium 2 Publication at the given `url`.
    func openPublication(for bookId: Int, at url: URL) async throws -> Publication {
        let asset = FileAsset(url: url)
        guard let mediaType = asset.mediaType() else {
            throw BookError.openFailed(Publication.OpeningError.unsupportedFormat)
        }

        let (pub, _) = try await withCheckedThrowingContinuation { cont in
          streamer.open(asset: asset, allowUserInteraction: false) { result in
            switch result {
            case let .success(publication):
                cont.resume(returning: (publication, mediaType))
            case let .failure(error):
                cont.resume(throwing: BookError.openFailed(error))
            case .cancelled:
                cont.resume(throwing: BookError.cancelled)
            }
          }
        }

        try checkIsReadable(publication: pub)
        publications[bookId] = pub
        try makeMediaOverlays(for: bookId, pub: pub)
        return pub
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
