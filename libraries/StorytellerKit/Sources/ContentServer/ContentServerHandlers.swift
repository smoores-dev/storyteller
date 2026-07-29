import Foundation
import HTTPTypes
import Hummingbird
import NIOCore
import StorytellerKit

/// Stateless request handlers for the content server. Holds only immutable, `Sendable`
/// configuration so the router closures can call across the NIO boundary freely.
struct ContentServerHandlers: Sendable {
    let configuration: ContentServerConfiguration
    let sourceID: BookSourceID
    let sessionToken: String

    func token(_ request: Request, _ context: BasicRequestContext) async throws -> Response {
        let body = try await collectString(request)
        let fields = Self.parseFormURLEncoded(body)
        guard
            let username = fields["usernameOrEmail"],
            let password = fields["password"]
        else {
            return empty(.badRequest)
        }
        guard username == configuration.username, password == configuration.password else {
            return empty(.unauthorized)
        }
        let payload = TokenResponse(
            accessToken: sessionToken,
            tokenType: "Bearer",
            expiresIn: nil,
        )
        return try json(plainEncoder().encode(payload))
    }

    func user(_ request: Request, _ context: BasicRequestContext) async throws -> Response {
        guard authorized(request) else { return empty(.unauthorized) }
        let payload = UserResponse(
            id: "local-user",
            name: configuration.username,
            username: configuration.username,
            email: nil,
            permissions: UserPermissions(),
        )
        return try json(plainEncoder().encode(payload))
    }

    func statuses(_ request: Request, _ context: BasicRequestContext) async throws -> Response {
        guard authorized(request) else { return empty(.unauthorized) }
        let statuses = await BookServiceActor.shared.getAvailableStatuses(sourceID: sourceID)
        return try json(bookEncoder().encode(statuses))
    }

    func books(_ request: Request, _ context: BasicRequestContext) async throws -> Response {
        guard authorized(request) else { return empty(.unauthorized) }
        let books = await BookServiceActor.shared.fetchLibraryInformation(sourceID: sourceID) ?? []
        let payload = books.map { StorytellerBookMetadataPayload(book: $0) }
        return try json(bookEncoder().encode(payload))
    }

    func book(_ request: Request, _ context: BasicRequestContext) async throws -> Response {
        guard authorized(request) else { return empty(.unauthorized) }
        guard let uuid = context.parameters.get("bookID") else { return empty(.badRequest) }
        let bookID = BookID(sourceID: sourceID, uuid: uuid)
        let books = await BookServiceActor.shared.fetchLibraryInformation(sourceID: sourceID) ?? []
        guard let book = books.first(where: { $0.id == bookID }) else {
            return notFound("Could not find book with id \(bookID)")
        }
        return try json(
            bookEncoder().encode(StorytellerBookMetadataPayload(book: book))
        )
    }

    func cover(_ request: Request, _ context: BasicRequestContext) async throws -> Response {
        guard authorized(request) else { return empty(.unauthorized) }
        guard let uuid = context.parameters.get("bookID") else { return empty(.badRequest) }
        let bookID = BookID(sourceID: sourceID, uuid: uuid)
        let audio = boolQuery(request, "audio")
        let width = intQuery(request, "w")
        let height = intQuery(request, "h")
        guard
            let cover = await BookServiceActor.shared.fetchCoverImage(
                for: bookID,
                audio: audio,
                width: width,
                height: height,
            )
        else {
            return empty(.notFound)
        }
        return binary(cover.data, contentType: cover.contentType ?? "image/jpeg")
    }

    func files(_ request: Request, _ context: BasicRequestContext) async throws -> Response {
        guard authorized(request) else { return empty(.unauthorized) }
        guard let uuid = context.parameters.get("bookID") else { return empty(.badRequest) }
        let bookID = BookID(sourceID: sourceID, uuid: uuid)

        let requestedFormat = stringQuery(request, "format")

        guard let category = await resolveFormatCategory(requestedFormat, bookID: bookID) else {
            return notFound("Book with id \(bookID) has no valid formats")
        }

        if category == .audio {
            return try await audiobookResponse(for: bookID, requestedFormat: requestedFormat)
        }
        return try await epubResponse(
            for: bookID,
            category: category,
            requestedFormat: requestedFormat,
        )
    }

    /// Maps the client's `format` query to a local media category. Both Storyteller and the official
    /// Storyteller client send one of `ebook`, `readaloud`, `audiobook`, `audiobook-rpf`. When no
    /// format is given we mirror the real server's fallback: readaloud, then audiobook, then ebook.
    private func resolveFormatCategory(
        _ format: String?,
        bookID: BookID,
    ) async -> LocalMediaCategory? {
        switch format {
            case "ebook":
                return .ebook
            case "readaloud":
                return .synced
            case "audiobook", "audiobook-rpf":
                return .audio
            default:
                for candidate in [LocalMediaCategory.synced, .audio, .ebook] {
                    if await BookServiceActor.shared.resolveLocalMedia(
                        for: bookID,
                        category: candidate,
                    ) != nil {
                        return candidate
                    }
                }
                return nil
        }
    }

    private func epubResponse(
        for bookID: BookID,
        category: LocalMediaCategory,
        requestedFormat: String?,
    ) async throws -> Response {
        guard
            let media = await BookServiceActor.shared.resolveLocalMedia(
                for: bookID,
                category: category,
            )
        else {
            return notFound(
                "Could not open \(requestedFormat ?? category.rawValue) for book with id \(bookID)"
            )
        }

        guard let data = try? Data(contentsOf: media.url, options: .mappedIfSafe) else {
            return notFound("Could not read file for book with id \(bookID)")
        }

        var headers = HTTPFields()
        headers[.contentType] = "application/epub+zip"
        headers[.acceptRanges] = "bytes"
        headers[.contentLength] = String(data.count)
        headers[.contentDisposition] =
            "attachment; filename=\"\(media.url.lastPathComponent)\""
        var buffer = ByteBuffer()
        buffer.writeBytes(data)
        return Response(status: .ok, headers: headers, body: ResponseBody(byteBuffer: buffer))
    }

    /// Audiobooks are stored as a directory (manifest.json + audio files). Package that into a
    /// Readium `.audiobook` zip so both clients can consume it; the official client downloads with
    /// `Accept: application/audiobook+zip` and reads `manifest.audiobook-manifest`, Storyteller
    /// requests `format=audiobook-rpf` and reads `manifest.json`; the package carries both.
    private func audiobookResponse(
        for bookID: BookID,
        requestedFormat: String?,
    ) async throws -> Response {
        guard
            let zipURL = await BookServiceActor.shared.packageAudiobook(
                for: bookID
            )
        else {
            return notFound(
                "Could not open \(requestedFormat ?? "audiobook") for book with id \(bookID)"
            )
        }
        defer { try? FileManager.default.removeItem(at: zipURL) }

        guard let data = try? Data(contentsOf: zipURL, options: .mappedIfSafe) else {
            return notFound("Could not read audiobook for book with id \(bookID)")
        }

        var headers = HTTPFields()
        headers[.contentType] = "application/audiobook+zip"
        headers[.acceptRanges] = "bytes"
        headers[.contentLength] = String(data.count)
        headers[.contentDisposition] = "attachment; filename=\"\(bookID.uuid).audiobook\""
        var buffer = ByteBuffer()
        buffer.writeBytes(data)
        return Response(status: .ok, headers: headers, body: ResponseBody(byteBuffer: buffer))
    }

    func getPosition(_ request: Request, _ context: BasicRequestContext) async throws -> Response {
        guard authorized(request) else { return empty(.unauthorized) }
        guard let uuid = context.parameters.get("bookID") else { return empty(.badRequest) }
        let bookID = BookID(sourceID: sourceID, uuid: uuid)
        guard
            let position = await BookServiceActor.shared.fetchBookPosition(
                bookID: bookID
            ),
            position.locator != nil
        else {
            return notFound("No position found")
        }
        return try json(bookEncoder().encode(position))
    }

    func postPosition(_ request: Request, _ context: BasicRequestContext) async throws -> Response {
        guard authorized(request) else { return empty(.unauthorized) }
        guard let uuid = context.parameters.get("bookID") else { return empty(.badRequest) }
        let bookID = BookID(sourceID: sourceID, uuid: uuid)

        let data = try await collectData(request)
        guard let update = try? bookDecoder().decode(PositionUpdate.self, from: data) else {
            return empty(.badRequest)
        }

        // Reject stale writes so concurrent clients converge on the newest position. The client
        // re-fetches via GET when it sees a 409.
        let existing = await BookServiceActor.shared.fetchBookPosition(
            bookID: bookID
        )
        if let existingTimestamp = existing?.timestamp, existingTimestamp > update.timestamp {
            return jsonMessage("Position already exists with a later timestamp", status: .conflict)
        }

        let result = await BookServiceActor.shared.sendProgressToServer(
            bookID: bookID,
            locator: update.locator,
            timestamp: update.timestamp,
        )
        switch result {
            case .success:
                return empty(.noContent)
            default:
                return empty(.internalServerError)
        }
    }

    private func authorized(_ request: Request) -> Bool {
        guard let header = request.headers[.authorization] else { return false }
        let expected = "Bearer \(sessionToken)"
        return header.caseInsensitiveCompare(expected) == .orderedSame
    }

    private func bookEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }

    private func bookDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }

    private func plainEncoder() -> JSONEncoder {
        JSONEncoder()
    }

    private func collectData(_ request: Request) async throws -> Data {
        let buffer = try await request.body.collect(upTo: 256 * 1024 * 1024)
        return Data(buffer.readableBytesView)
    }

    private func collectString(_ request: Request) async throws -> String {
        let buffer = try await request.body.collect(upTo: 1024 * 1024)
        return String(decoding: buffer.readableBytesView, as: UTF8.self)
    }

    private func stringQuery(_ request: Request, _ key: String) -> String? {
        request.uri.queryParameters.get(key).map { String($0) }
    }

    private func intQuery(_ request: Request, _ key: String) -> Int? {
        stringQuery(request, key).flatMap(Int.init)
    }

    private func boolQuery(_ request: Request, _ key: String) -> Bool {
        stringQuery(request, key) == "true"
    }

    private static func parseFormURLEncoded(_ body: String) -> [String: String] {
        var result: [String: String] = [:]
        for pair in body.split(separator: "&") {
            let parts = pair.split(separator: "=", maxSplits: 1)
            guard let rawKey = parts.first else { continue }
            let key = decodeFormComponent(String(rawKey))
            let value = parts.count > 1 ? decodeFormComponent(String(parts[1])) : ""
            result[key] = value
        }
        return result
    }

    private static func decodeFormComponent(_ component: String) -> String {
        component.replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? component
    }

    private func json(_ data: Data, status: HTTPResponse.Status = .ok) -> Response {
        var headers = HTTPFields()
        headers[.contentType] = "application/json"
        var buffer = ByteBuffer()
        buffer.writeBytes(data)
        return Response(status: status, headers: headers, body: ResponseBody(byteBuffer: buffer))
    }

    private func jsonMessage(_ message: String, status: HTTPResponse.Status) -> Response {
        let data = (try? plainEncoder().encode(["message": message])) ?? Data()
        return json(data, status: status)
    }

    private func binary(_ data: Data, contentType: String) -> Response {
        var headers = HTTPFields()
        headers[.contentType] = contentType
        headers[.contentLength] = String(data.count)
        var buffer = ByteBuffer()
        buffer.writeBytes(data)
        return Response(status: .ok, headers: headers, body: ResponseBody(byteBuffer: buffer))
    }

    private func empty(_ status: HTTPResponse.Status) -> Response {
        Response(status: status)
    }

    private func notFound(_ message: String) -> Response {
        jsonMessage(message, status: .notFound)
    }
}
