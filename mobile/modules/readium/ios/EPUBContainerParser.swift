//
//  EPUBContainerParser.swift
//  Readium
//
//  Created by Shane Friedman on 1/29/24.
//

import Foundation
import Fuzi
import R2Shared

public func readFetcherData(fetcher: Fetcher, href: String) throws -> Data {
    let resource = fetcher.get(href)
    defer { resource.close() }
    return try resource.read().get()
}

/// Errors thrown during the parsing of the EPUB
///
/// - wrongMimeType: The mimetype file is missing or its content differs from
///                 "application/epub+zip" (expected).
/// - missingFile: A file is missing from the container at `path`.
/// - xmlParse: An XML parsing error occurred.
/// - missingElement: An XML element is missing.
public enum EPUBParserError: Error {
    /// The mimetype of the EPUB is not valid.
    case wrongMimeType
    case missingFile(path: String)
    case xmlParse(underlyingError: Error)
    /// Missing rootfile in `container.xml`.
    case missingRootfile
}

@available(*, unavailable, renamed: "EPUBParserError")
public typealias EpubParserError = EPUBParserError

/// A parser for the META-INF/container.xml file.
final class EPUBContainerParser: Loggable {
    private let document: Fuzi.XMLDocument

    init(data: Data) throws {
        document = try XMLDocument(data: data)
        document.definePrefix("cn", forNamespace: "urn:oasis:names:tc:opendocument:xmlns:container")
    }

    convenience init(fetcher: Fetcher) throws {
        let href = "/META-INF/container.xml"
        do {
            let data = try readFetcherData(fetcher: fetcher, href: href)
            try self.init(data: data)
        } catch {
            throw EPUBParserError.missingFile(path: href)
        }
    }

    /// Parses the container.xml file and retrieves the relative path to the OPF file (rootFilePath)
    /// (the default one for now, not handling multiple renditions).
    func parseOPFHREF() throws -> String {
        // Get the path of the OPF file, relative to the metadata.rootPath.
        guard let path = document.firstChild(xpath: "/cn:container/cn:rootfiles/cn:rootfile")?.attr("full-path") else {
            throw EPUBParserError.missingRootfile
        }
        return path.addingPrefix("/")
    }
}
