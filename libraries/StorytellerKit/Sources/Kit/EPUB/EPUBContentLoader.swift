import Foundation
import SwiftSoup
import ZIPFoundation

public enum EPUBContentLoaderError: Error {
    case failedToOpenArchive(String)
    case fileNotFoundInArchive(String)
    case invalidEncoding
    case parseError(String)
}

public enum EPUBContentLoader {

    public struct ElementTextExtraction: Sendable {
        public let textById: [String: String]
        public let paragraphKeyById: [String: String]

        public init(
            textById: [String: String],
            paragraphKeyById: [String: String],
        ) {
            self.textById = textById
            self.paragraphKeyById = paragraphKeyById
        }
    }

    /// Load full XHTML content for a section
    public static func loadSection(
        from epubURL: URL,
        href: String,
    ) throws -> String {
        let archive = try Archive(url: epubURL, accessMode: .read)
        let data = try extractFile(from: archive, path: href)
        guard let content = String(data: data, encoding: .utf8) else {
            throw EPUBContentLoaderError.invalidEncoding
        }
        return content
    }

    /// Extract element content by ID from HTML
    /// Returns the inner HTML of the element with the given ID
    public static func extractElement(
        from html: String,
        elementId: String,
    ) -> String? {
        do {
            let doc = try SwiftSoup.parse(html)
            guard let element = try doc.getElementById(elementId) else {
                return nil
            }
            return try element.html()
        } catch {
            return nil
        }
    }

    /// Strip HTML tags from string, returning plain text
    public static func stripHTML(_ html: String) -> String {
        do {
            let doc = try SwiftSoup.parse(html)
            return try doc.text()
        } catch {
            return html
        }
    }

    public static func extractElementsText(
        from html: String,
        elementIds: [String],
    ) -> [String: String] {
        do {
            let doc = try SwiftSoup.parse(html)
            var results: [String: String] = [:]
            for elementId in Set(elementIds) {
                guard let element = try doc.getElementById(elementId) else { continue }
                let text = try element.text()
                if !text.isEmpty {
                    results[elementId] = text
                }
            }
            return results
        } catch {
            return [:]
        }
    }

    public static func extractElementsTextAndParagraphKeys(
        from html: String,
        elementIds: [String],
    ) -> ElementTextExtraction {
        do {
            let doc = try SwiftSoup.parse(html)
            var textById: [String: String] = [:]
            var paragraphKeyById: [String: String] = [:]
            let idSet = Set(elementIds)
            for elementId in idSet {
                guard let element = try doc.getElementById(elementId) else { continue }
                let text = try entryOwnText(of: element, excludingNestedIds: idSet)
                if !text.isEmpty {
                    textById[elementId] = text
                }
                paragraphKeyById[elementId] = paragraphKey(for: element)
            }
            return ElementTextExtraction(
                textById: textById,
                paragraphKeyById: paragraphKeyById,
            )
        } catch {
            return ElementTextExtraction(textById: [:], paragraphKeyById: [:])
        }
    }

    /// Text of an entry element excluding descendants that are themselves entries.
    /// Word-level media overlays (e.g. StoryAlign) nest each entry span inside the next,
    /// so a plain text() would repeat every earlier word of the sentence.
    public static func entryOwnText(
        of element: Element,
        excludingNestedIds entryIds: Set<String>,
    ) throws -> String {
        let nestedEntries = try element.select("[id]").filter { candidate in
            candidate !== element && entryIds.contains(candidate.id())
        }
        guard !nestedEntries.isEmpty else {
            return try element.text()
        }
        guard let clone = element.copy() as? Element else {
            return try element.text()
        }
        for candidate in try clone.select("[id]")
        where candidate !== clone && entryIds.contains(candidate.id()) {
            try candidate.remove()
        }
        return try clone.text()
    }

    /// Plain text for one entry element, with the same nested-entry exclusion as
    /// extractElementsTextAndParagraphKeys.
    public static func extractElementText(
        from html: String,
        elementId: String,
        excludingNestedIds entryIds: Set<String> = [],
    ) -> String? {
        do {
            let doc = try SwiftSoup.parse(html)
            guard let element = try doc.getElementById(elementId) else { return nil }
            return try entryOwnText(of: element, excludingNestedIds: entryIds)
        } catch {
            return nil
        }
    }

    /// Get plain text for a specific element
    public static func getElementText(
        from epubURL: URL,
        href: String,
        elementId: String,
    ) throws -> String? {
        let html = try loadSection(from: epubURL, href: href)
        guard let elementHTML = extractElement(from: html, elementId: elementId) else {
            return nil
        }
        return stripHTML(elementHTML)
    }

    private static let paragraphBlockTags: Set<String> = [
        "p",
        "li",
        "blockquote",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "pre",
        "dt",
        "dd",
        "figcaption",
        "address",
    ]

    private static let inlineTags: Set<String> = [
        "a",
        "abbr",
        "b",
        "bdi",
        "bdo",
        "br",
        "cite",
        "code",
        "data",
        "dfn",
        "em",
        "i",
        "img",
        "input",
        "kbd",
        "label",
        "mark",
        "q",
        "rp",
        "rt",
        "ruby",
        "s",
        "samp",
        "small",
        "span",
        "strong",
        "sub",
        "sup",
        "time",
        "u",
        "var",
        "wbr",
    ]

    private static func paragraphKey(for element: Element) -> String {
        if let key = paragraphKeyByBlockTag(for: element) {
            return key
        }
        if let key = paragraphKeyByNonInlineAncestor(for: element) {
            return key
        }
        if let selector = try? element.cssSelector() {
            return selector
        }
        return (try? element.tagName()) ?? "unknown"
    }

    private static func paragraphKeyByBlockTag(for element: Element) -> String? {
        var current: Element? = element
        while let node = current {
            let tag = (try? node.tagName())?.lowercased() ?? ""
            if paragraphBlockTags.contains(tag) {
                let id = (try? node.id()) ?? ""
                if !id.isEmpty {
                    return "\(tag)#\(id)"
                }
                if let selector = try? node.cssSelector() {
                    return selector
                }
                return tag
            }
            current = node.parent()
        }
        return nil
    }

    private static func paragraphKeyByNonInlineAncestor(for element: Element) -> String? {
        var current: Element? = element
        while let node = current {
            let tag = (try? node.tagName())?.lowercased() ?? ""
            if !inlineTags.contains(tag) {
                if let selector = try? node.cssSelector() {
                    return selector
                }
                let id = (try? node.id()) ?? ""
                if !id.isEmpty {
                    return "\(tag)#\(id)"
                }
                return tag
            }
            current = node.parent()
        }
        return nil
    }

    private static func extractFile(from archive: Archive, path: String) throws -> Data {
        let pathsToTry = [
            path,
            "OPS/\(path)",
            "OEBPS/\(path)",
            "epub/\(path)",
        ]

        for tryPath in pathsToTry {
            if let entry = archive[tryPath] {
                var data = Data()
                _ = try archive.extract(entry, skipCRC32: true) { chunk in
                    data.append(chunk)
                }
                return data
            }
        }

        throw EPUBContentLoaderError.fileNotFoundInArchive(path)
    }
}
