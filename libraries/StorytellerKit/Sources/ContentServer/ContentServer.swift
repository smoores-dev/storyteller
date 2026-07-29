import Foundation
import Hummingbird
import Logging
import StorytellerKit

/// Embedded Storyteller-compatible content server.
///
/// Serves books from a single local folder source over plain HTTP so that unmodified Storyteller
/// clients (including Storyteller's own iOS app) can browse, download, and sync reading progress
/// without a full Docker deployment. This is the "Calibre content server" tier: read + progress
/// sync. The real Storyteller server also runs plain HTTP (port 8001 in its Docker image) and
/// leaves TLS to an external reverse proxy, so HTTP is what clients expect on the LAN.
///
/// Every route maps onto `BookServiceActor.shared`, scoped to one folder source. The wire format
/// reuses the app's own `BookMetadata`/`BookReadingPosition` models because the client decodes
/// library responses with `convertFromSnakeCase`; encoding those models with
/// `convertToSnakeCase` reproduces exactly what the real server emits.
public actor ContentServer: ContentServerControlling {
    private var serverTask: Task<Void, Never>?
    private var running = false

    public init() {}

    public var isRunning: Bool { running }

    public func start(
        _ configuration: ContentServerConfiguration
    ) async throws -> ContentServerStartInfo {
        guard !running else {
            throw ContentServerError.alreadyRunning
        }

        let sourceID = try await resolveSourceID(configuration.sourceID)

        // The session token is minted per server run. /token validates credentials and hands it
        // back; every other route checks the bearer header against it.
        let sessionToken = UUID().uuidString
        let router = buildRouter(
            configuration: configuration,
            sourceID: sourceID,
            sessionToken: sessionToken,
        )

        var logger = Logger(label: "storyteller.content-server")
        logger.logLevel = .notice

        let app = Application(
            router: router,
            configuration: ApplicationConfiguration(
                address: .hostname("0.0.0.0", port: configuration.port),
                serverName: "Storyteller",
            ),
            logger: logger,
        )

        running = true
        serverTask = Task {
            do {
                try await app.runService()
            } catch {
                debugLog("[ContentServer] server exited: \(error)")
            }
            await self.markStopped()
        }

        debugLog(
            "[ContentServer] started on port \(configuration.port) for source \(sourceID)"
        )
        return ContentServerStartInfo(port: configuration.port, sourceID: sourceID)
    }

    public func stop() async {
        serverTask?.cancel()
        serverTask = nil
        running = false
        debugLog("[ContentServer] stopped")
    }

    private func markStopped() {
        running = false
        serverTask = nil
    }

    private func resolveSourceID(_ requested: BookSourceID?) async throws -> BookSourceID {
        let snapshot = await BookServiceActor.shared.librarySnapshot()
        if let requested {
            guard
                snapshot.sources.contains(where: {
                    $0.id == requested && $0.kind == .localFolder
                })
            else {
                throw ContentServerError.sourceNotFound
            }
            return requested
        }
        guard let first = snapshot.sources.first(where: { $0.kind == .localFolder }) else {
            throw ContentServerError.noFolderSource
        }
        return first.id
    }

    private func buildRouter(
        configuration: ContentServerConfiguration,
        sourceID: BookSourceID,
        sessionToken: String,
    ) -> Router<BasicRequestContext> {
        let router = Router()
        let handlers = ContentServerHandlers(
            configuration: configuration,
            sourceID: sourceID,
            sessionToken: sessionToken,
        )

        router.post("api/v2/token") { request, context in
            try await handlers.token(request, context)
        }
        router.get("api/v2/user") { request, context in
            try await handlers.user(request, context)
        }
        router.get("api/v2/statuses") { request, context in
            try await handlers.statuses(request, context)
        }
        router.get("api/v2/books") { request, context in
            try await handlers.books(request, context)
        }
        router.get("api/v2/books/:bookID") { request, context in
            try await handlers.book(request, context)
        }
        router.get("api/v2/books/:bookID/cover") { request, context in
            try await handlers.cover(request, context)
        }
        router.get("api/v2/books/:bookID/files") { request, context in
            try await handlers.files(request, context)
        }
        router.get("api/v2/books/:bookID/positions") { request, context in
            try await handlers.getPosition(request, context)
        }
        router.post("api/v2/books/:bookID/positions") { request, context in
            try await handlers.postPosition(request, context)
        }

        return router
    }
}
