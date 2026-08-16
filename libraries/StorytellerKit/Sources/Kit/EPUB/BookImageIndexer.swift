import Foundation
import SwiftSoup
import ZIPFoundation

public enum BookImageIndexer {

    public static func buildIndex(epubURL: URL) throws -> [BookImageItem] {
        let archive = try Archive(url: epubURL, accessMode: .read)
        let opfPath = try SMILParser.findOPFPath(in: archive)
        let opfData = try SMILParser.extractFile(from: archive, path: opfPath)
        let opfDir = (opfPath as NSString).deletingLastPathComponent
        let (manifest, spine) = try SMILParser.parseOPF(opfData)

        let coverPaths = Set(
            manifest.values
                .filter { item in
                    guard let props = item.properties else { return false }
                    return props.split(whereSeparator: \.isWhitespace)
                        .contains("cover-image")
                }
                .map { SMILParser.resolvePath($0.href, relativeTo: opfDir) }
        )

        var items: [BookImageItem] = []
        var seenPaths = Set<String>()
        for (index, spineItem) in spine.enumerated() {
            guard let manifestItem = manifest[spineItem.idref],
                manifestItem.mediaType?.contains("html") == true
            else { continue }

            let sectionId = SMILParser.resolvePath(manifestItem.href, relativeTo: opfDir)
            let sectionDir = (sectionId as NSString).deletingLastPathComponent
            guard let data = try? SMILParser.extractFile(from: archive, path: sectionId),
                let html = String(data: data, encoding: .utf8)
            else { continue }

            let sectionItems = extractImages(
                html: html,
                sectionIndex: index,
                sectionId: sectionId,
                sectionDir: sectionDir,
                coverPaths: coverPaths,
            )
            for item in sectionItems where seenPaths.insert(item.imagePath).inserted {
                items.append(item)
            }
        }
        return items
    }

    private static let decorativeNamePattern =
        #"ornament|decor|rule|divider|bullet|logo|border|flourish"#

    private static func extractImages(
        html: String,
        sectionIndex: Int,
        sectionId: String,
        sectionDir: String,
        coverPaths: Set<String>,
    ) -> [BookImageItem] {
        guard let doc = try? SwiftSoup.parse(html) else { return [] }

        var items: [BookImageItem] = []
        var currentPageLabel: String?
        guard let allElements = try? doc.getAllElements() else { return [] }

        for element in allElements.array() {
            if let pageLabel = pageBreakLabel(for: element) {
                currentPageLabel = pageLabel
                continue
            }

            let tag = element.tagName().lowercased()
            let src: String?
            if tag == "img" {
                src = try? element.attr("src")
            } else if tag == "image" {
                let xlink = (try? element.attr("xlink:href")) ?? ""
                src = xlink.isEmpty ? try? element.attr("href") : xlink
            } else {
                continue
            }

            guard let src, !src.isEmpty, !src.hasPrefix("data:") else { continue }
            let imagePath = SMILParser.resolvePath(
                src.removingPercentEncoding ?? src,
                relativeTo: sectionDir,
            )
            guard !coverPaths.contains(imagePath) else { continue }

            let filename = (imagePath as NSString).lastPathComponent.lowercased()
            if filename.range(of: decorativeNamePattern, options: .regularExpression) != nil
                || filename.contains("cover")
            {
                continue
            }

            let alt = (try? element.attr("alt")) ?? ""
            let figure = ancestor(of: element, tag: "figure")
            let caption = figure.flatMap { fig in
                try? fig.select("figcaption").first()?.text()
            }
            let epubType =
                ((try? element.attr("epub:type")) ?? "")
                + " " + ((figure.flatMap { try? $0.attr("epub:type") }) ?? "")

            var elementId = element.id()
            if elementId.isEmpty, let figure {
                elementId = figure.id()
            }
            if elementId.isEmpty {
                elementId = nearestAncestorId(of: element) ?? ""
            }

            let kindSource = [caption ?? "", alt, epubType, filename].joined(separator: " ")
            items.append(BookImageItem(
                sectionIndex: sectionIndex,
                sectionId: sectionId,
                imagePath: imagePath,
                elementId: elementId.isEmpty ? nil : elementId,
                altText: alt.isEmpty ? nil : alt,
                caption: caption?.isEmpty == false ? caption : nil,
                kind: .inferred(from: kindSource),
                pageLabel: currentPageLabel,
            ))
        }
        return items
    }

    private static func pageBreakLabel(for element: Element) -> String? {
        let epubType = (try? element.attr("epub:type")) ?? ""
        let role = (try? element.attr("role")) ?? ""
        guard
            epubType.split(whereSeparator: \.isWhitespace).contains("pagebreak")
                || role.split(whereSeparator: \.isWhitespace).contains("doc-pagebreak")
        else { return nil }

        let title = (try? element.attr("title")) ?? ""
        if !title.isEmpty { return title }
        let ariaLabel = (try? element.attr("aria-label")) ?? ""
        if !ariaLabel.isEmpty { return ariaLabel }
        let text = ((try? element.text()) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty { return text }
        let id = element.id()
        let digits = id.drop { !$0.isNumber }
        return digits.isEmpty ? nil : String(digits)
    }

    private static func ancestor(of element: Element, tag: String) -> Element? {
        var current = element.parent()
        while let node = current {
            if node.tagName().lowercased() == tag {
                return node
            }
            current = node.parent()
        }
        return nil
    }

    private static func nearestAncestorId(of element: Element) -> String? {
        var current = element.parent()
        while let node = current {
            let id = node.id()
            if !id.isEmpty {
                return id
            }
            current = node.parent()
        }
        return nil
    }
}
