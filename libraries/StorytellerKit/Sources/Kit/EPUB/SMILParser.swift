import Foundation
import ZIPFoundation

#if canImport(FoundationXML)
import FoundationXML
#endif

public enum SMILParserError: Error {
    case failedToOpenArchive(String)
    case containerNotFound
    case opfPathNotFound
    case invalidXML
    case fileNotFoundInArchive(String)
    case parseError(String)
}

public enum SMILParser {

    public struct ParseResult {
        public let sections: [SectionInfo]
        public let tocEntries: [TocEntry]
    }

    /// Parse EPUB to extract SMIL structure for audio playback
    public static func parseEPUB(at url: URL) throws -> ParseResult {
        let archive = try Archive(url: url, accessMode: .read)

        let opfPath = try findOPFPath(in: archive)
        let opfData = try extractFile(from: archive, path: opfPath)

        let opfDir = (opfPath as NSString).deletingLastPathComponent

        let (manifest, spine) = try parseOPF(opfData)

        var sections: [SectionInfo] = []
        var cumulativeTime: Double = 0

        for (index, spineItem) in spine.enumerated() {
            guard let manifestItem = manifest[spineItem.idref] else { continue }

            let sectionId = resolvePath(manifestItem.href, relativeTo: opfDir)

            var mediaOverlay: [SMILEntry] = []

            if let mediaOverlayId = spineItem.mediaOverlay ?? manifestItem.mediaOverlay,
                let smilItem = manifest[mediaOverlayId]
            {
                let smilPath = resolvePath(smilItem.href, relativeTo: opfDir)
                if let smilData = try? extractFile(from: archive, path: smilPath) {
                    let smilDir = (smilPath as NSString).deletingLastPathComponent
                    let entries = try parseSMIL(smilData, smilDir: smilDir, opfDir: opfDir)
                    for entry in entries {
                        let duration = entry.end - entry.begin
                        cumulativeTime += duration
                        mediaOverlay.append(
                            SMILEntry(
                                textId: entry.textId,
                                textHref: entry.textHref,
                                audioFile: entry.audioFile,
                                begin: entry.begin,
                                end: entry.end,
                                cumSumAtEnd: cumulativeTime,
                            )
                        )
                    }
                }
            }

            sections.append(
                SectionInfo(
                    index: index,
                    id: sectionId,
                    label: nil,
                    level: nil,
                    mediaOverlay: mediaOverlay,
                )
            )
        }

        let rawTocEntries = try parseTOC(from: archive, manifest: manifest, opfDir: opfDir)

        let tocEntries = rawTocEntries.compactMap { raw -> TocEntry? in
            let baseHref = raw.href.components(separatedBy: "#").first ?? raw.href
            guard let idx = findSectionIndex(for: baseHref, in: sections) else { return nil }
            return TocEntry(label: raw.label, href: raw.href, level: raw.level, sectionIndex: idx)
        }

        let labelsBySection = labelsFromTocEntries(tocEntries)
        let labeledSections = sections.map { section -> SectionInfo in
            if let (label, level) = labelsBySection[section.index] {
                return SectionInfo(
                    index: section.index,
                    id: section.id,
                    label: label,
                    level: level,
                    mediaOverlay: section.mediaOverlay,
                )
            }
            return section
        }

        return ParseResult(sections: labeledSections, tocEntries: tocEntries)
    }

    /// Parse SMIL time formats: "h:mm:ss.fff", "m:ss", "5.5s", "100ms"
    static func parseSMILTime(_ str: String?) -> Double? {
        guard let str = str, !str.isEmpty else { return nil }

        let parts = str.split(separator: ":").compactMap { Double($0) }
        if parts.count == 3 {
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        }
        if parts.count == 2 {
            return parts[0] * 60 + parts[1]
        }

        let trimmed = str.trimmingCharacters(in: .whitespaces)

        if trimmed.hasSuffix("h") {
            let numberStr = String(trimmed.dropLast())
            if let number = Double(numberStr) { return number * 3600 }
        } else if trimmed.hasSuffix("min") {
            let numberStr = String(trimmed.dropLast(3))
            if let number = Double(numberStr) { return number * 60 }
        } else if trimmed.hasSuffix("ms") {
            let numberStr = String(trimmed.dropLast(2))
            if let number = Double(numberStr) { return number * 0.001 }
        } else if trimmed.hasSuffix("s") {
            let numberStr = String(trimmed.dropLast())
            if let number = Double(numberStr) { return number }
        }

        return Double(trimmed)
    }

    private static func findOPFPath(in archive: Archive) throws -> String {
        let containerPath = "META-INF/container.xml"
        let containerData = try extractFile(from: archive, path: containerPath)

        let delegate = ContainerXMLDelegate()
        let parser = XMLParser(data: containerData)
        parser.delegate = delegate
        guard parser.parse(), let opfPath = delegate.opfPath else {
            throw SMILParserError.opfPathNotFound
        }

        return opfPath
    }

    private static func extractFile(from archive: Archive, path: String) throws -> Data {
        guard let entry = archive[path] else {
            throw SMILParserError.fileNotFoundInArchive(path)
        }

        var data = Data()
        _ = try archive.extract(entry, skipCRC32: true) { chunk in
            data.append(chunk)
        }
        return data
    }

    struct ManifestItem {
        let id: String
        let href: String
        let mediaType: String?
        let mediaOverlay: String?
        let properties: String?
    }

    struct SpineItem {
        let idref: String
        let mediaOverlay: String?
    }

    private static func parseOPF(_ data: Data) throws -> (
        manifest: [String: ManifestItem], spine: [SpineItem]
    ) {
        let delegate = OPFXMLDelegate()
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        guard parser.parse() else {
            throw SMILParserError.parseError("Failed to parse OPF")
        }
        return (delegate.manifest, delegate.spine)
    }

    struct RawTocEntry {
        let label: String
        let href: String
        let level: Int
    }

    private static func parseTOC(
        from archive: Archive,
        manifest: [String: ManifestItem],
        opfDir: String,
    ) throws -> [RawTocEntry] {
        let ncxItem = manifest.values.first { $0.mediaType == "application/x-dtbncx+xml" }

        if let ncxItem = ncxItem {
            let ncxPath = resolvePath(ncxItem.href, relativeTo: opfDir)
            debugLog("[SMILParser] Found NCX at: \(ncxPath)")
            if let ncxData = try? extractFile(from: archive, path: ncxPath) {
                let entries = parseNCXTocEntries(ncxData)
                debugLog("[SMILParser] NCX parsed: \(entries.count) entries")
                if !entries.isEmpty {
                    return entries
                }
            } else {
                debugLog("[SMILParser] Failed to extract NCX file")
            }
        } else {
            debugLog("[SMILParser] No NCX file in manifest")
        }

        let navItem = manifest.values.first { item in
            guard let props = item.properties else { return false }
            let tokens = props.split { $0.isWhitespace }.map { String($0) }
            return tokens.contains("nav")
        }

        if let navItem = navItem {
            let navPath = resolvePath(navItem.href, relativeTo: opfDir)
            let navDir = (navPath as NSString).deletingLastPathComponent
            debugLog("[SMILParser] Found EPUB3 nav at: \(navPath)")
            if let navData = try? extractFile(from: archive, path: navPath) {
                let entries = parseNavTocEntries(navData, navDir: navDir)
                debugLog("[SMILParser] Nav parsed: \(entries.count) entries")
                if entries.isEmpty {
                    debugLog("[SMILParser] Nav file contained no TOC entries")
                }
                return entries
            } else {
                debugLog("[SMILParser] Failed to extract nav file")
            }
        } else {
            debugLog("[SMILParser] No EPUB3 nav document in manifest")
        }

        debugLog("[SMILParser] No TOC entries found (no NCX or nav)")
        return []
    }

    private static func parseNavTocEntries(_ data: Data, navDir: String) -> [RawTocEntry] {
        let delegate = NavXMLDelegate(navDir: navDir)
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        _ = parser.parse()
        return delegate.entries
    }

    private static func parseNCXTocEntries(_ data: Data) -> [RawTocEntry] {
        let delegate = NCXXMLDelegate()
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        _ = parser.parse()
        return delegate.entries
    }

    static func labelsFromTocEntries(_ entries: [TocEntry]) -> [Int: (label: String, level: Int)] {
        var result: [Int: (label: String, level: Int)] = [:]
        for entry in entries {
            if result[entry.sectionIndex] == nil {
                result[entry.sectionIndex] = (entry.label, entry.level)
            }
        }
        return result
    }

    struct RawSMILEntry {
        let textId: String
        let textHref: String
        let audioFile: String
        let begin: Double
        let end: Double
    }

    private static func parseSMIL(_ data: Data, smilDir: String, opfDir: String) throws
        -> [RawSMILEntry]
    {
        let delegate = SMILXMLDelegate(smilDir: smilDir)
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        guard parser.parse() else {
            throw SMILParserError.parseError("Failed to parse SMIL")
        }

        return delegate.entries.map { entry in
            let resolvedTextHref = resolvePath(entry.textHref, relativeTo: smilDir)
            return RawSMILEntry(
                textId: entry.textId,
                textHref: resolvedTextHref,
                audioFile: entry.audioFile,
                begin: entry.begin,
                end: entry.end,
            )
        }
    }

    private static func resolvePath(_ path: String, relativeTo base: String) -> String {
        if path.hasPrefix("/") || path.hasPrefix("http") {
            return path
        }
        if base.isEmpty {
            return path
        }
        let combined = (base as NSString).appendingPathComponent(path)
        return normalizePath(combined)
    }

    private static func normalizePath(_ path: String) -> String {
        var components: [String] = []
        for component in path.components(separatedBy: "/") {
            if component == ".." {
                if !components.isEmpty && components.last != ".." {
                    components.removeLast()
                }
            } else if component != "." && !component.isEmpty {
                components.append(component)
            }
        }
        return components.joined(separator: "/")
    }
}

private class ContainerXMLDelegate: NSObject, XMLParserDelegate {
    var opfPath: String?

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
        attributes: [String: String],
    ) {
        if elementName == "rootfile" || qName?.hasSuffix(":rootfile") == true {
            opfPath = attributes["full-path"]
        }
    }
}

private class OPFXMLDelegate: NSObject, XMLParserDelegate {
    var manifest: [String: SMILParser.ManifestItem] = [:]
    var spine: [SMILParser.SpineItem] = []

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
        attributes: [String: String],
    ) {
        let localName = elementName.components(separatedBy: ":").last ?? elementName

        if localName == "item" {
            guard let id = attributes["id"], let href = attributes["href"] else { return }
            let decodedHref = href.removingPercentEncoding ?? href
            manifest[id] = SMILParser.ManifestItem(
                id: id,
                href: decodedHref,
                mediaType: attributes["media-type"],
                mediaOverlay: attributes["media-overlay"],
                properties: attributes["properties"],
            )
        } else if localName == "itemref" {
            guard let idref = attributes["idref"] else { return }
            spine.append(
                SMILParser.SpineItem(
                    idref: idref,
                    mediaOverlay: attributes["media-overlay"],
                )
            )
        }
    }
}

private class NCXXMLDelegate: NSObject, XMLParserDelegate {
    var entries: [SMILParser.RawTocEntry] = []

    private struct NavPointState {
        var src: String?
        var text: String = ""
        var emitted: Bool = false
        let depth: Int
    }

    private var stack: [NavPointState] = []
    private var inNavLabel = false
    private var inText = false

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
        attributes: [String: String],
    ) {
        let localName = elementName.components(separatedBy: ":").last ?? elementName

        switch localName {
            case "navPoint":
                stack.append(NavPointState(depth: stack.count))
            case "navLabel":
                inNavLabel = true
            case "text":
                if inNavLabel {
                    inText = true
                    if !stack.isEmpty {
                        stack[stack.count - 1].text = ""
                    }
                }
            case "content":
                if let src = attributes["src"], !stack.isEmpty {
                    let decoded = src.removingPercentEncoding ?? src
                    stack[stack.count - 1].src = decoded
                    // Emit entry now (preserves document order: parent before children)
                    let state = stack[stack.count - 1]
                    let trimmedText = state.text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmedText.isEmpty {
                        entries.append(
                            SMILParser.RawTocEntry(
                                label: trimmedText,
                                href: decoded,
                                level: state.depth,
                            )
                        )
                        stack[stack.count - 1].emitted = true
                    }
                }
            default:
                break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if inText, !stack.isEmpty {
            stack[stack.count - 1].text += string
        }
    }

    func parser(
        _ parser: XMLParser,
        didEndElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
    ) {
        let localName = elementName.components(separatedBy: ":").last ?? elementName

        switch localName {
            case "navLabel":
                inNavLabel = false
            case "text":
                inText = false
            case "navPoint":
                _ = stack.popLast()
            default:
                break
        }
    }
}

private class NavXMLDelegate: NSObject, XMLParserDelegate {
    let navDir: String
    var entries: [SMILParser.RawTocEntry] = []

    private var inTocNav = false
    private var inAnchor = false
    private var currentHref: String?
    private var currentText: String = ""
    private var olDepth = 0

    init(navDir: String) {
        self.navDir = navDir
    }

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
        attributes: [String: String],
    ) {
        let localName = elementName.components(separatedBy: ":").last ?? elementName

        switch localName {
            case "nav":
                let epubType = attributes["epub:type"] ?? attributes["type"] ?? ""
                let role = attributes["role"] ?? ""
                let epubTypeTokens = epubType.split { $0.isWhitespace }.map { String($0) }
                let roleTokens = role.split { $0.isWhitespace }.map { String($0) }
                if epubTypeTokens.contains("toc") || roleTokens.contains("doc-toc") {
                    inTocNav = true
                }
            case "ol":
                if inTocNav {
                    olDepth += 1
                }
            case "a":
                if inTocNav, let href = attributes["href"] {
                    inAnchor = true
                    let decoded = href.removingPercentEncoding ?? href
                    currentHref = resolvePath(decoded, relativeTo: navDir)
                    currentText = ""
                }
            default:
                break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if inAnchor {
            currentText += string
        }
    }

    func parser(
        _ parser: XMLParser,
        didEndElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
    ) {
        let localName = elementName.components(separatedBy: ":").last ?? elementName

        switch localName {
            case "nav":
                inTocNav = false
            case "ol":
                if inTocNav {
                    olDepth -= 1
                }
            case "a":
                if inAnchor, let href = currentHref {
                    let trimmedText = currentText.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmedText.isEmpty {
                        entries.append(
                            SMILParser.RawTocEntry(
                                label: trimmedText,
                                href: href,
                                level: max(0, olDepth - 1),
                            )
                        )
                    }
                }
                inAnchor = false
                currentHref = nil
            default:
                break
        }
    }

    private func resolvePath(_ path: String, relativeTo base: String) -> String {
        if path.hasPrefix("/") || path.hasPrefix("http") || path.isEmpty {
            return path
        }
        if base.isEmpty {
            return path
        }
        let combined = (base as NSString).appendingPathComponent(path)
        return normalizePath(combined)
    }

    private func normalizePath(_ path: String) -> String {
        var components: [String] = []
        for component in path.components(separatedBy: "/") {
            if component == ".." {
                if !components.isEmpty && components.last != ".." {
                    components.removeLast()
                }
            } else if component != "." && !component.isEmpty {
                components.append(component)
            }
        }
        return components.joined(separator: "/")
    }
}

private class SMILXMLDelegate: NSObject, XMLParserDelegate {
    let smilDir: String
    var entries: [SMILParser.RawSMILEntry] = []

    private var inPar = false
    private var currentTextSrc: String?
    private var currentAudioSrc: String?
    private var currentClipBegin: Double = 0
    private var currentClipEnd: Double = 0

    init(smilDir: String) {
        self.smilDir = smilDir
    }

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
        attributes: [String: String],
    ) {
        let localName = elementName.components(separatedBy: ":").last ?? elementName

        switch localName {
            case "par":
                inPar = true
                currentTextSrc = nil
                currentAudioSrc = nil
                currentClipBegin = 0
                currentClipEnd = 0
            case "text":
                if inPar, let src = attributes["src"] {
                    currentTextSrc = src
                }
            case "audio":
                if inPar {
                    currentAudioSrc = attributes["src"]
                    currentClipBegin = SMILParser.parseSMILTime(attributes["clipBegin"]) ?? 0
                    currentClipEnd = SMILParser.parseSMILTime(attributes["clipEnd"]) ?? 0
                }
            default:
                break
        }
    }

    func parser(
        _ parser: XMLParser,
        didEndElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
    ) {
        let localName = elementName.components(separatedBy: ":").last ?? elementName

        if localName == "par" {
            if let textSrc = currentTextSrc, let audioSrc = currentAudioSrc {
                let (textHref, textId) = parseTextSrc(textSrc)
                let resolvedAudioPath = resolvePath(audioSrc, relativeTo: smilDir)

                entries.append(
                    SMILParser.RawSMILEntry(
                        textId: textId,
                        textHref: textHref,
                        audioFile: resolvedAudioPath,
                        begin: currentClipBegin,
                        end: currentClipEnd,
                    )
                )
            }
            inPar = false
        }
    }

    private func parseTextSrc(_ src: String) -> (href: String, id: String) {
        let components = src.components(separatedBy: "#")
        let href = components.first ?? src
        let id = components.count > 1 ? components[1] : ""
        let decodedHref = href.removingPercentEncoding ?? href
        return (decodedHref, id)
    }

    private func resolvePath(_ path: String, relativeTo base: String) -> String {
        if path.hasPrefix("/") || path.hasPrefix("http") {
            return path
        }
        if base.isEmpty {
            return path
        }
        let combined = (base as NSString).appendingPathComponent(path)
        return normalizePath(combined)
    }

    private func normalizePath(_ path: String) -> String {
        var components: [String] = []
        for component in path.components(separatedBy: "/") {
            if component == ".." {
                if !components.isEmpty && components.last != ".." {
                    components.removeLast()
                }
            } else if component != "." && !component.isEmpty {
                components.append(component)
            }
        }
        return components.joined(separator: "/")
    }
}
