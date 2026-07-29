import Foundation
import Testing

@testable import StorytellerAppleKit
@testable import StorytellerKit

@Test func watchProtocolRoundTripsTypedProgressEnvelope() throws {
    let watchBookID = BookID(sourceID: "watch-source", uuid: "shared-book")
    let phoneBookID = BookID(sourceID: "phone-source", uuid: "shared-book")
    let locator = BookLocator(
        href: "chapter.xhtml",
        type: "text/html",
        title: nil,
        locations: nil,
        text: nil,
    )
    let original = WatchProtocolMessage.progress(
        WatchProgressPayload(
            watchBookID: watchBookID,
            phoneBookID: phoneBookID,
            locator: locator,
            timestamp: 42,
        )
    )

    let envelope = try original.encode()

    #expect(envelope[WatchProtocolV2.versionKey] as? Int == 2)
    #expect(envelope[WatchProtocolV2.typeKey] as? String == "progress")
    #expect(envelope[WatchProtocolV2.payloadKey] is Data)
    #expect(try WatchProtocolMessage.decode(from: envelope) == original)
}

@Test func watchProtocolRejectsWrongVersionBeforePayloadDecode() throws {
    let envelope: [String: Any] = [
        WatchProtocolV2.versionKey: 1,
        WatchProtocolV2.typeKey: WatchProtocolMessage.Kind.progress.rawValue,
        WatchProtocolV2.payloadKey: Data("not json".utf8),
    ]

    #expect(throws: WatchProtocolError.unsupportedVersion(1)) {
        try WatchProtocolMessage.decode(from: envelope)
    }
}

@Test func watchBookIdentityIncludesSourceAndCategory() {
    let firstSource = WatchBookInfo.ID(
        bookID: BookID(sourceID: "source-a", uuid: "shared"),
        category: .ebook,
    )
    let secondSource = WatchBookInfo.ID(
        bookID: BookID(sourceID: "source-b", uuid: "shared"),
        category: .ebook,
    )
    let secondCategory = WatchBookInfo.ID(
        bookID: BookID(sourceID: "source-a", uuid: "shared"),
        category: .audio,
    )

    #expect(Set([firstSource, secondSource, secondCategory]).count == 3)
}

@Test func watchLibraryKeepsWatchAndPhoneBookIdentitiesSeparate() throws {
    let watchBookID = BookID(sourceID: "watch-source", uuid: "shared")
    let phoneBookID = BookID(sourceID: "phone-source", uuid: "shared")
    let original = WatchProtocolMessage.watchLibrary(
        WatchLibrary(books: [
            WatchBookInfo(
                bookID: watchBookID,
                phoneBookID: phoneBookID,
                title: "Book",
                authorNames: [],
                category: .synced,
                sizeBytes: 1,
            )
        ])
    )

    #expect(try WatchProtocolMessage.decode(from: original.encode()) == original)
}

@Test func watchProtocolRoundTripsRequiredChunkIdentityAndMetadata() throws {
    let bookID = BookID(sourceID: "source-a", uuid: "book-a")
    let metadata = BookMetadata(
        bookID: bookID,
        title: "Book",
        subtitle: nil,
        description: nil,
        language: nil,
        createdAt: nil,
        updatedAt: nil,
        publicationDate: nil,
        authors: nil,
        narrators: nil,
        creators: nil,
        series: nil,
        tags: nil,
        collections: nil,
        ebook: nil,
        audiobook: nil,
        readaloud: nil,
        status: nil,
        position: nil,
        rating: nil,
    )
    let transferID = UUID()
    let original = WatchProtocolMessage.chunkTransfer(
        WatchChunkTransferPayload(
            transferID: transferID,
            phoneBookID: bookID,
            category: .ebook,
            chunkIndex: 0,
            totalChunks: 2,
            totalFileSize: 100,
            fileExtension: "epub",
            title: "Book",
            authors: ["Author"],
            bookMetadata: metadata,
        )
    )

    #expect(try WatchProtocolMessage.decode(from: original.encode()) == original)
}

@Test func watchProtocolRoundTripsTransferFailure() throws {
    let original = WatchProtocolMessage.transferFailed(
        WatchTransferFailure(
            transferID: UUID(),
            message: "Could not import transferred book",
        )
    )

    #expect(try WatchProtocolMessage.decode(from: original.encode()) == original)
}

@Test func watchProtocolRoundTripsCompletePhoneSourceList() throws {
    let list = PhoneSourceList(sources: [
        PhoneSource(
            sourceID: "remote",
            name: "Server",
            kind: .storyteller,
            serverURL: "https://books.example:8443/base",
            username: "reader",
            serverUUID: "server-uuid",
        ),
        PhoneSource(sourceID: "folder", name: "Folder", kind: .localFolder),
    ])
    let original = WatchProtocolMessage.context(
        WatchProtocolContext(phoneSourceList: list)
    )

    #expect(try WatchProtocolMessage.decode(from: original.encode()) == original)
}

@Test func phoneSourceMatchingIncludesPortPathAndUsername() {
    let source = PhoneSource(
        sourceID: "source",
        name: "Server",
        kind: .storyteller,
        serverURL: "https://BOOKS.example/library/",
        username: "reader",
    )

    #expect(
        source.matchesServer(serverURL: "https://books.example:443/library", username: "reader")
    )
    #expect(
        !source.matchesServer(serverURL: "https://books.example:8443/library", username: "reader")
    )
    #expect(!source.matchesServer(serverURL: "https://books.example/other", username: "reader"))
    #expect(!source.matchesServer(serverURL: "https://books.example/library", username: "other"))
}

@Test func phoneSourceMatchingUsesServerUUIDWhenBothDevicesKnowIt() {
    let source = PhoneSource(
        sourceID: "source",
        name: "Server",
        kind: .storyteller,
        serverURL: "https://internal.example:8443",
        username: "reader",
        serverUUID: "same-server",
    )

    #expect(
        source.matchesServer(
            serverURL: "https://public.example",
            username: "reader",
            serverUUID: "same-server",
        )
    )
    #expect(
        !source.matchesServer(
            serverURL: "https://public.example",
            username: "reader",
            serverUUID: "different-server",
        )
    )
}

@Test func remotePlaybackCommandUsesTypedCodablePayload() throws {
    let original = WatchProtocolMessage.playbackCommand(.seekToChapter(sectionIndex: 7))

    #expect(try WatchProtocolMessage.decode(from: original.encode()) == original)
}
