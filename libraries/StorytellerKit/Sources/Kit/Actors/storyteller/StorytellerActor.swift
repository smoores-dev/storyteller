import Foundation
import ZIPFoundation

#if canImport(CoreFoundation)
import CoreFoundation
#endif
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
#if canImport(Network)
import Network
#endif

public enum AlignmentRestartMode: String, Sendable {
    case none = "false"
    case full = "full"
    case transcription = "transcription"
    case sync = "sync"
}

public enum ConnectionStatus: Equatable, Sendable {
    case disconnected
    case connecting
    case connected
    case error(String)
}

public enum HTTPResult: Sendable {
    case success
    case failure
    case noConnection
}

public enum ActivitySource: String, Hashable, Sendable {
    case app
    case mac
    case tv
    case watch
    case carPlay
}

public actor StorytellerActor {

    private var sourceRecordValue: BookSourceRecord
    private var observers: (@Sendable () -> Void)? = nil

    private var username: String?
    private var password: String?
    private var sessionToken: String?
    private var sessionTokenRejected = false
    private var apiBaseURL: URL?
    private var accessToken: AccessToken?
    private(set) public var libraryMetadata: [BookMetadata] = []
    public var lastUpdateBookError: String?
    private var cachedStatuses: [BookStatus] = []
    public private(set) var connectionStatus: ConnectionStatus = .disconnected
    private var cachedBookCreatePermission: Bool?
    private var cachedBookUpdatePermission: Bool?

    public var isConfigured: Bool {
        apiBaseURL != nil && username != nil && (hasUsablePassword || sessionToken != nil)
    }

    private var hasUsablePassword: Bool {
        guard let password else { return false }
        return !password.isEmpty
    }

    public var needsBrowserSignIn: Bool {
        sessionToken != nil && sessionTokenRejected
    }

    static let browserSignInExpiredMessage = "Session expired, sign in with your browser again"

    public var currentApiBaseURL: URL? {
        apiBaseURL
    }

    private let urlSession: URLSession
    private let downloadDelegate: StorytellerDownloadDelegate
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    /// Make authentication non-reentrant
    private var authenticationTask: Task<Bool, Never>? = nil

    private var monitoringTask: Task<Void, Never>? = nil
    private var isAppActive: Bool = false
    private var activeSources: Set<ActivitySource> = []
    private var reconnectFailureCount: Int = 0
    private var reconnectCooldownUntil: Date? = nil
    private var networkAvailable = true
    public private(set) var lastNetworkOpSucceeded: Bool? = nil
    #if canImport(Network)
    private var networkMonitor: NWPathMonitor? = nil
    private let networkMonitorQueue = DispatchQueue(label: "StorytellerActor.NetworkMonitor")
    #endif

    public init(
        sourceRecord: BookSourceRecord,
        session: URLSession? = nil,
    ) {
        self.sourceRecordValue = sourceRecord
        let delegate = StorytellerDownloadDelegate()
        let configuration: URLSessionConfiguration = {
            if let session {
                return session.configuration
            }
            return URLSessionConfiguration.default
        }()
        configuration.urlCache = URLCache(
            memoryCapacity: 0,
            diskCapacity: 0,
            diskPath: nil,
        )
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 60
        configuration.timeoutIntervalForResource = 600

        urlSession = URLSession(
            configuration: configuration,
            delegate: delegate,
            delegateQueue: nil,
        )
        downloadDelegate = delegate
        decoder = JSONDecoder()
        encoder = JSONEncoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        delegate.recordNetworkError = { [weak self] error in
            Task {
                await self?.recordNetworkError(error)
            }
        }
    }

    private func logStorytellerError(_ message: String, error: Error) {
        if let urlError = error as? URLError {
            debugLog(
                "[StorytellerActor] \(message): \(urlError.code.rawValue) \(urlError.localizedDescription) host=\(apiBaseURL?.host ?? "?")"
            )
        } else {
            debugLog("[StorytellerActor] \(message): \(error)")
        }
        Task {
            await self.recordNetworkError(error)
        }
    }

    public func request_notify(callback: @escaping @Sendable () -> Void) {
        self.observers = callback
    }

    public func setActive(_ active: Bool, source: ActivitySource) async {
        if active {
            activeSources.insert(source)
        } else {
            activeSources.remove(source)
        }

        let wasActive = isAppActive
        isAppActive = !activeSources.isEmpty

        debugLog(
            "[StorytellerActor] setActive: source=\(source.rawValue), active=\(active), activeSources=\(activeSources.map { $0.rawValue }.sorted())"
        )

        if active && !wasActive {
            await handleActivation()
        } else if wasActive && !isAppActive {
            await handleDeactivation()
        }
    }

    /// Shows the yellow "connecting" state only for a fresh attempt with no known outcome.
    /// Once a source has failed (.error), background retries keep showing red instead of
    /// flickering back to yellow on every retry tick.
    private func beginConnectingIfFresh() async {
        if connectionStatus == .disconnected {
            await updateConnectionStatus(.connecting)
        }
    }

    private func updateConnectionStatus(_ status: ConnectionStatus) async {
        let wasNotConnected = connectionStatus != .connected
        debugLog(
            "[StorytellerActor] updateConnectionStatus: \(connectionStatus) -> \(status), wasNotConnected: \(wasNotConnected)"
        )
        connectionStatus = status
        observers?()

        if wasNotConnected && status == .connected {
            debugLog("[StorytellerActor] Connection restored, scheduling pending queue flush")
            await ProgressSyncActor.shared.scheduleQueueFlush(notifyUser: true)
        }
    }

    private func handleActivation() async {
        guard isConfigured else { return }

        await ProgressSyncActor.shared.recordWakeEvent()
        await ProgressSyncActor.shared.startPolling()

        guard networkAvailable else { return }

        var reconnected = false
        if connectionStatus != .connected {
            reconnected = await attemptReconnect()
        } else {
            await verifyConnection()
        }

        if connectionStatus == .connected, !reconnected {
            await ProgressSyncActor.shared.scheduleQueueFlush(notifyUser: true)
        }
    }

    private func handleDeactivation() async {
    }

    private func startMonitoring() {
        startNetworkMonitoring()
        monitoringTask?.cancel()
        monitoringTask = Task { [weak self] in
            guard let self else { return }

            while !Task.isCancelled {
                let currentStatus = await self.connectionStatus
                let sleepInterval: Duration =
                    if currentStatus == .connected {
                        .seconds(30)
                    } else {
                        .seconds(3)
                    }

                try? await Task.sleep(for: sleepInterval)
                guard !Task.isCancelled else { break }

                guard await self.isAppActive else {
                    continue
                }

                if await self.connectionStatus != .connected {
                    await self.attemptReconnect()
                }
            }
        }
    }

    private func verifyConnection() async {
        guard let apiBaseURL = apiBaseURL, let token = accessToken else {
            debugLog("[StorytellerActor] verifyConnection: no credentials, marking disconnected")
            await updateConnectionStatus(.disconnected)
            return
        }

        let statusesURL = apiBaseURL.appendingPathComponent("statuses")
        do {
            let response = try await httpGet(
                statusesURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                session: urlSession,
                allowedStatusCodes: Set(200..<300).union([401, 403]),
            )

            if response.statusCode == 401 || response.statusCode == 403 {
                debugLog("[StorytellerActor] verifyConnection: token expired/invalid, clearing")
                lastNetworkOpSucceeded = false
                await updateConnectionStatus(
                    markUnauthorized(
                        statusCode: response.statusCode,
                        fallbackStatus: .error("Session expired"),
                    )
                )
            } else {
                debugLog("[StorytellerActor] verifyConnection: connection verified")
                await recordNetworkSuccess()
            }
        } catch {
            debugLog("[StorytellerActor] verifyConnection: failed - \(error)")
            if await recordNetworkError(error) {
                return
            }
            lastNetworkOpSucceeded = false
            await updateConnectionStatus(.error("Connection lost"))
        }
    }

    private func markUnauthorized(
        statusCode: Int,
        fallbackStatus: ConnectionStatus,
    ) -> ConnectionStatus {
        accessToken = nil
        guard sessionToken != nil, statusCode == 401 else { return fallbackStatus }
        sessionTokenRejected = true
        return .error(Self.browserSignInExpiredMessage)
    }

    private func canAttemptReconnect() -> Bool {
        guard networkAvailable else { return false }
        guard let cooldownUntil = reconnectCooldownUntil else { return true }
        return cooldownUntil <= Date()
    }

    private func scheduleReconnectBackoff() {
        reconnectFailureCount += 1
        let delay = min(60.0, Double(reconnectFailureCount) * 5.0)
        reconnectCooldownUntil = Date().addingTimeInterval(delay)
        debugLog("[StorytellerActor] attemptReconnect: backoff \(Int(delay))s")
    }

    private func resetReconnectBackoff() {
        reconnectFailureCount = 0
        reconnectCooldownUntil = nil
    }

    @discardableResult
    private func attemptReconnect() async -> Bool {
        guard username != nil, hasUsablePassword || sessionToken != nil, apiBaseURL != nil else {
            return false
        }
        guard canAttemptReconnect() else { return false }

        debugLog("[StorytellerActor] attemptReconnect: trying to reconnect...")

        if await authenticate() {
            debugLog("[StorytellerActor] attemptReconnect: success")
            await recordNetworkSuccess()
            return true
        } else {
            debugLog("[StorytellerActor] attemptReconnect: failed")
            return false
        }
    }

    public func appWillResignActive() async {
        debugLog("[StorytellerActor] appWillResignActive")
        await setActive(false, source: .app)
    }

    private func startNetworkMonitoring() {
        #if canImport(Network)
        guard networkMonitor == nil else { return }
        let monitor = NWPathMonitor()
        networkMonitor = monitor
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            Task { await self.handleNetworkPathUpdate(path) }
        }
        monitor.start(queue: networkMonitorQueue)
        #endif
    }

    private func stopNetworkMonitoring() {
        #if canImport(Network)
        networkMonitor?.cancel()
        networkMonitor = nil
        #endif
    }

    #if canImport(Network)
    private func handleNetworkPathUpdate(_ path: NWPath) async {
        debugLog("[StorytellerActor] network path update: status=\(path.status)")
        await networkAvailabilityDidChange(path.status == .satisfied)
    }
    #endif

    public func networkAvailabilityDidChange(_ available: Bool) async {
        networkAvailable = available
        if !available {
            lastNetworkOpSucceeded = false
            await updateConnectionStatus(.error("No network"))
            return
        }

        guard isAppActive else { return }
        resetReconnectBackoff()
        if connectionStatus == .connected {
            await verifyConnection()
        } else {
            await attemptReconnect()
        }
    }

    private func isConnectivityError(_ error: URLError) -> Bool {
        switch error.code {
            case .notConnectedToInternet,
                .networkConnectionLost,
                .cannotFindHost,
                .cannotConnectToHost,
                .timedOut,
                .dnsLookupFailed:
                return true
            default:
                return false
        }
    }

    private func recordNetworkSuccess(notifyWhenAlreadyConnected: Bool = true) async {
        let changed = lastNetworkOpSucceeded != true
        lastNetworkOpSucceeded = true
        resetReconnectBackoff()
        if connectionStatus != .connected {
            await updateConnectionStatus(.connected)
        } else if changed && notifyWhenAlreadyConnected {
            observers?()
        }
    }

    @discardableResult
    func recordNetworkError(_ error: Error) async -> Bool {
        guard let urlError = error as? URLError, isConnectivityError(urlError) else {
            return false
        }

        lastNetworkOpSucceeded = false
        switch connectionStatus {
            case .connected, .connecting:
                await updateConnectionStatus(.error("Connection lost"))
            default:
                observers?()
        }
        return true
    }

    public func setLogin(
        baseURL baseURLString: String,
        username: String,
        password: String,
        sessionToken: String? = nil,
    ) async -> Bool {
        guard
            await configureCredentials(
                baseURL: baseURLString,
                username: username,
                password: password,
                sessionToken: sessionToken,
            )
        else {
            return false
        }
        _ = try? await FilesystemActor.shared.loadOrCreateBookSources()

        /// A retry right after granting local network access must not be eaten by the
        /// cooldown from the attempt that triggered the OS prompt.
        resetReconnectBackoff()
        await updateConnectionStatus(.connecting)
        let success = await ensureAuthentication() != nil

        if success {
            await updateConnectionStatus(.connected)
            let _ = await fetchLibraryInformation()
        }

        startMonitoring()
        if isAppActive {
            await ProgressSyncActor.shared.startPolling()
        }
        return success
    }

    public enum CredentialTestResult: Sendable {
        case success
        case invalidCredentials
        case failure(String)
    }

    /// Validates Storyteller credentials without registering or mutating any source.
    /// Uses an ephemeral session with a short timeout so it never hangs the UI.
    public static func validateCredentials(
        baseURL baseURLString: String,
        username: String,
        password: String,
    ) async -> CredentialTestResult {
        let trimmedURL = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let baseURL = URL(string: trimmedURL), baseURL.scheme != nil else {
            return .failure("Invalid server URL")
        }

        let apiBaseURL = resolveAPIBaseURL(from: baseURL)
        let tokenURL = apiBaseURL.appendingPathComponent("token")

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 20
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }

        do {
            _ = try await httpPost(
                tokenURL.absoluteString,
                headers: [
                    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
                    "Accept": "application/json",
                ],
                formParameters: [
                    "usernameOrEmail": username,
                    "password": password,
                ],
                session: session,
            )
            return .success
        } catch HTTPRequestError.unauthorized {
            return .invalidCredentials
        } catch let error as URLError {
            return .failure(error.localizedDescription)
        } catch {
            return .failure("Could not connect to this server.")
        }
    }

    func updateSourceRecord(_ record: BookSourceRecord) {
        precondition(record.id == sourceRecordValue.id)
        sourceRecordValue = record
    }

    public func configureCredentials(
        baseURL baseURLString: String,
        username: String,
        password: String,
        sessionToken: String? = nil,
    ) async -> Bool {
        self.username = username
        self.password = password
        self.sessionToken = sessionToken
        self.sessionTokenRejected = false
        self.accessToken = nil
        resetReconnectBackoff()
        guard let baseURL = URL(string: baseURLString) else {
            debugLog("[StorytellerActor] Invalid base URL: \(baseURLString)")
            await updateConnectionStatus(.error("Invalid server URL"))
            return false
        }
        apiBaseURL = StorytellerActor.resolveAPIBaseURL(from: baseURL)
        return true
    }

    /// Calls Storyteller's `/api/v2/token` endpoint to exchange credentials for a bearer token.
    /// Server implementation: `storyteller/web/src/app/api/v2/token/route.ts`.
    /// If successful, token will be stored on instance for future methods.
    @discardableResult
    func authenticate() async -> Bool {
        guard let apiBaseURL = apiBaseURL, username != nil else {
            return false
        }

        if let sessionToken {
            guard !sessionTokenRejected else {
                await updateConnectionStatus(.error(Self.browserSignInExpiredMessage))
                scheduleReconnectBackoff()
                return false
            }
            guard canAttemptReconnect() else {
                return false
            }
            accessToken = AccessToken(
                accessToken: sessionToken,
                tokenType: "bearer",
                expiresIn: nil,
            )
            return true
        }

        guard let password = password, !password.isEmpty, let username = username else {
            return false
        }
        /// Don't duplicate auth requests to server if one is already pending
        if let task = authenticationTask {
            return await task.value
        }

        /// A source that just failed is in backoff; short-circuit so lazy callers
        /// (cover loads, refresh, progress sync) don't re-probe a dead server every tick.
        guard canAttemptReconnect() else {
            return false
        }

        let task = Task {
            defer { authenticationTask = nil }
            let authStart = Date().timeIntervalSinceReferenceDate
            let authHost = apiBaseURL.host ?? "?"
            debugLog("[ConnDiag] authenticate start host=\(authHost)")
            defer {
                let authElapsed = (Date().timeIntervalSinceReferenceDate - authStart) * 1000
                debugLog(
                    "[ConnDiag] authenticate finished host=\(authHost) elapsed=\(String(format: "%.0f", authElapsed))ms"
                )
            }
            await beginConnectingIfFresh()
            do {
                let tokenURL = apiBaseURL.appendingPathComponent("token")

                let response = try await httpPost(
                    tokenURL.absoluteString,
                    headers: [
                        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
                        "Accept": "application/json",
                    ],
                    formParameters: [
                        "usernameOrEmail": username,
                        "password": password,
                    ],
                    session: urlSession,
                    requestTimeout: 10,
                )

                self.accessToken = try decoder.decode(AccessToken.self, from: response.data)
                resetReconnectBackoff()
                return true
            } catch let error as HTTPRequestError {
                logStorytellerError("authenticate", error: error)
                switch error {
                    case .unauthorized:
                        await updateConnectionStatus(.error("Invalid credentials"))
                    default:
                        await updateConnectionStatus(.error("Connection failed"))
                }
                scheduleReconnectBackoff()
                return false
            } catch let error as URLError {
                logStorytellerError("authenticate", error: error)
                await updateConnectionStatus(.error("Connection failed"))
                scheduleReconnectBackoff()
                return false
            } catch {
                logStorytellerError("authenticate", error: error)
                await updateConnectionStatus(.error("Connection failed"))
                scheduleReconnectBackoff()
                return false
            }
        }
        authenticationTask = task
        return await task.value
    }

    @discardableResult
    private func ensureAuthentication(forceReauth: Bool = false) async -> (URL, AccessToken)? {
        if forceReauth {
            accessToken = nil
        }

        if let accessToken = accessToken, let apiBaseURL = apiBaseURL {
            return (apiBaseURL, accessToken)
        }

        guard username != nil, hasUsablePassword || sessionToken != nil, apiBaseURL != nil else {
            debugLog("[StorytellerActor] ensureAuthentication: not configured")
            return nil
        }

        if await authenticate(), let accessToken = accessToken, let apiBaseURL = apiBaseURL {
            await updateConnectionStatus(.connected)
            return (apiBaseURL, accessToken)
        }

        return nil
    }

    public enum PermissionCheckResult: Sendable {
        case allowed
        case denied
        case error(String)
    }

    /// Whether the logged-in user may create books on this server, for gating upload UI. The
    /// server gates its new-book endpoints with `bookCreate` (`bookUpdate` only covers editing
    /// existing books). A definitive server answer is cached for the session. Unknown (not
    /// connected, or a transient error) reports true so connection hiccups don't hide features;
    /// the upload itself will report the real failure.
    public func currentUserCanUploadBooks() async -> Bool {
        if let cachedBookCreatePermission {
            return cachedBookCreatePermission
        }
        guard connectionStatus == .connected else { return true }
        switch await checkUserPermission(named: "bookCreate") {
            case .allowed:
                cachedBookCreatePermission = true
                return true
            case .denied:
                cachedBookCreatePermission = false
                return false
            case .error:
                return true
        }
    }

    /// Whether the logged-in user definitively holds `bookUpdate`, which the replace-asset
    /// endpoint is gated on. Unlike the menu-gating `currentUserCanUploadBooks`, unknown is NOT
    /// treated as allowed: the caller is deciding whether to create a book that a later denial
    /// would strand half-made, so only a server-confirmed yes passes. Definitive answers are
    /// cached for the session.
    public func currentUserCanUpdateBooks() async -> Bool {
        if let cachedBookUpdatePermission {
            return cachedBookUpdatePermission
        }
        switch await checkUserPermission(named: "bookUpdate") {
            case .allowed:
                cachedBookUpdatePermission = true
                return true
            case .denied:
                cachedBookUpdatePermission = false
                return false
            case .error:
                return false
        }
    }

    /// Checks if the current user has the `bookUpdate` permission.
    public func checkBookUpdatePermission() async -> PermissionCheckResult {
        await checkUserPermission(named: "bookUpdate")
    }

    /// Server implementation: `storyteller/applications/web/src/app/api/v2/user/route.ts`.
    private func checkUserPermission(named permission: String) async -> PermissionCheckResult {
        guard let (baseURL, token) = await ensureAuthentication() else {
            return .error("Not connected to server")
        }

        let result = await fetchUserPermission(named: permission, baseURL: baseURL, token: token)
        if case .error = result {
            guard let (retryURL, retryToken) = await ensureAuthentication(forceReauth: true) else {
                return .error("Authentication failed")
            }
            return await fetchUserPermission(
                named: permission,
                baseURL: retryURL,
                token: retryToken,
            )
        }
        return result
    }

    private func fetchUserPermission(
        named permission: String,
        baseURL: URL,
        token: AccessToken,
    ) async
        -> PermissionCheckResult
    {
        let userURL = baseURL.appendingPathComponent("user")
        var allowedStatuses = Set(200..<300)
        allowedStatuses.insert(401)
        allowedStatuses.insert(403)

        do {
            let response = try await httpGet(
                userURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            switch evaluateResponse(
                response,
                methodName: "checkUserPermission",
                context: "user permissions",
            ) {
                case .success:
                    break
                case .unauthorized:
                    return .error("Unauthorized")
                default:
                    return .error("Unexpected server response (\(response.statusCode))")
            }

            guard
                let json = try? JSONSerialization.jsonObject(with: response.data) as? [String: Any],
                let permissions = json["permissions"] as? [String: Any],
                let granted = permissions[permission] as? Bool
            else {
                return .error("Invalid response from server")
            }
            return granted ? .allowed : .denied
        } catch {
            return .error(error.localizedDescription)
        }
    }

    /// Fetches library metadata from `/api/v2/books`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/route.ts`.
    public func fetchLibraryInformation() async -> [BookMetadata]? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let booksURL = baseURL.appendingPathComponent("books")

        do {
            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)
            allowedStatuses.insert(404)

            let response = try await httpGet(
                booksURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchLibraryInformation",
                    context: "library listing",
                )
            else {
                return nil
            }

            do {
                try Task.checkCancellation()
                let wrapper = try decoder.decode(
                    LenientArrayWrapper<StorytellerBookMetadataPayload>.self,
                    from: response.data,
                )
                libraryMetadata = wrapper.values.map { payload in
                    var book = payload.scoped(to: sourceRecordValue.id)
                    book.source = book.source ?? sourceRecordValue.name
                    return book
                }

                if let jsonArray = try? JSONSerialization.jsonObject(with: response.data) as? [Any]
                {
                    let totalCount = jsonArray.count
                    if totalCount > libraryMetadata.count {
                        let skipped = totalCount - libraryMetadata.count
                        debugLog(
                            "[StorytellerActor] WARNING: Skipped \(skipped) book(s) due to decode errors (loaded \(libraryMetadata.count)/\(totalCount))"
                        )
                    }
                }
            } catch {
                debugLog("[StorytellerActor] DECODE ERROR in fetchLibraryInformation:")
                debugLog("[StorytellerActor] Error: \(error)")
                if let decodingError = error as? DecodingError {
                    logDetailedDecodingError(decodingError, data: response.data)
                }
                throw error
            }

            try Task.checkCancellation()
            try? await LocalMediaActor.shared.updateSourceCacheMetadata(
                libraryMetadata,
                replacingSourceID: sourceRecordValue.id,
            )
            await ProgressSyncActor.shared.updateServerPositions(from: libraryMetadata)

            await recordNetworkSuccess()
            return libraryMetadata
        } catch {
            logStorytellerError("fetchLibraryInformation", error: error)
            return nil
        }
    }

    /// Downloads the cover image from `/api/v2/books/{bookId}/cover`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/cover/route.ts`.
    /// Returns `nil` when the server responds with 304 (Not Modified) or 404 (no cover available).
    public func fetchCoverImage(
        for bookId: String,
        audio: Bool = false,
        // Hard-code sizes. Storyteller server current returns 404 if you give no dimensions for non-readaloud books--a bug?
        width: Int? = 209,
        height: Int? = 320,
        version: String? = nil,
        ifNoneMatch: String? = nil,
        ifModifiedSince: String? = nil,
    ) async -> BookCover? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }

        let coverURL =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)
            .appendingPathComponent("cover")

        var queryParameters: [String: String] = [:]
        if let width {
            queryParameters["w"] = String(width)
        }
        if let height {
            queryParameters["h"] = String(height)
        }
        if audio {
            queryParameters["audio"] = "true"
        }
        if let version = Self.coverVersionQueryValue(from: version) {
            queryParameters["v"] = version
        }
        debugLog(
            "[MetadataCoverRefresh] StorytellerActor fetchCoverImage request bookID=\(bookId) audio=\(audio) width=\(width.map(String.init) ?? "nil") height=\(height.map(String.init) ?? "nil") versionInput=\(version ?? "nil") query=\(queryParameters)"
        )

        var headers: [String: String] = [
            "Accept": "image/*",
            "Authorization": authorizationHeaderValue(for: token),
        ]
        if let ifNoneMatch {
            headers["If-None-Match"] = ifNoneMatch
        }
        if let ifModifiedSince {
            headers["If-Modified-Since"] = ifModifiedSince
        }

        var allowedStatuses = Set(200..<300)
        allowedStatuses.insert(304)
        allowedStatuses.insert(404)

        do {
            let response = try await httpGet(
                coverURL.absoluteString,
                headers: headers,
                queryParameters: queryParameters,
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchCoverImage",
                    context: "cover for \(bookId)",
                )
            else {
                return nil
            }

            let httpResponse = response.response
            debugLog(
                "[MetadataCoverRefresh] StorytellerActor fetchCoverImage response bookID=\(bookId) status=\(response.statusCode) bytes=\(response.data.count) etag=\(httpResponse.value(forHTTPHeaderField: "Etag") ?? "nil") lastModified=\(httpResponse.value(forHTTPHeaderField: "Last-Modified") ?? "nil") cacheControl=\(httpResponse.value(forHTTPHeaderField: "Cache-Control") ?? "nil")"
            )
            return BookCover(
                data: response.data,
                contentType: httpResponse.value(forHTTPHeaderField: "Content-Type"),
                etag: httpResponse.value(forHTTPHeaderField: "Etag"),
                lastModified: httpResponse.value(forHTTPHeaderField: "Last-Modified"),
                cacheControl: httpResponse.value(forHTTPHeaderField: "Cache-Control"),
                contentDisposition: httpResponse.value(
                    forHTTPHeaderField: "Content-Disposition"
                ),
            )
        } catch {
            debugLog(
                "[MetadataCoverRefresh] StorytellerActor fetchCoverImage error bookID=\(bookId) error=\(error)"
            )
            logStorytellerError("fetchCoverImage", error: error)
            return nil
        }
    }

    public nonisolated static func coverVersionQueryValue(from updatedAt: String?) -> String? {
        guard let updatedAt, !updatedAt.isEmpty else { return nil }
        if let numeric = Int64(updatedAt) {
            return String(numeric)
        }

        guard let date = StorytellerDate.parse(updatedAt, field: .coverVersion) else { return nil }
        return StorytellerDate.epochMillisString(from: date)
    }

    private func handleDownloadFailure(
        _ failure: StorytellerDownloadFailure,
        bookId: String,
    ) async {
        switch failure {
            case .nonHTTPResponse:
                debugLog("[StorytellerActor] fetchBook received non-HTTP response.")
            case .unauthorized:
                debugLog("[StorytellerActor] fetchBook unauthorized for \(bookId).")
                accessToken = nil
                await updateConnectionStatus(.error("Unauthorized"))
            case .notFound:
                debugLog("[StorytellerActor] fetchBook asset not found for \(bookId).")
            case .unexpectedStatus(let status):
                debugLog("[StorytellerActor] fetchBook unexpected status \(status) for \(bookId).")
        }
    }

    public func createAuthenticatedDownloadRequest(
        for bookId: String,
        format: StorytellerBookFormat,
    ) async -> URLRequest? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }

        let fileURL =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)
            .appendingPathComponent("files")

        do {
            let requestURL = try urlWithQueryParameters(
                fileURL,
                queryParameters: ["format": downloadQueryValue(for: format)],
            )

            var request = URLRequest(url: requestURL)
            request.httpMethod = "GET"
            request.setValue(downloadAcceptHeader(for: format), forHTTPHeaderField: "Accept")
            request.setValue(
                authorizationHeaderValue(for: token),
                forHTTPHeaderField: "Authorization",
            )
            return request
        } catch {
            logStorytellerError("createAuthenticatedDownloadRequest", error: error)
            return nil
        }
    }

    /// Builds a ready-to-send positions POST for use with a background URLSession.
    /// The body is returned separately because background upload tasks require
    /// file-based bodies rather than request.httpBody.
    public func createAuthenticatedPositionUploadRequest(
        bookId: String,
        locator: BookLocator,
        timestamp: Double,
    ) async -> ProgressUploadRequest? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }

        let url = baseURL.appendingPathComponent("books/\(bookId)/positions")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(
            authorizationHeaderValue(for: token),
            forHTTPHeaderField: "Authorization",
        )
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "locator": encodeLocatorToDict(locator),
            "timestamp": Int64(timestamp),
        ]

        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            return ProgressUploadRequest(request: request, body: bodyData)
        } catch {
            logStorytellerError("createAuthenticatedPositionUploadRequest", error: error)
            return nil
        }
    }

    /// Fetches detailed metadata for a single book via `/api/v2/books/{bookId}`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/route.ts` (GET handler).
    func fetchBookDetails(for bookId: String) async -> BookMetadata? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let bookURL =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)

        do {
            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)
            allowedStatuses.insert(404)

            let response = try await httpGet(
                bookURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchBookDetails",
                    context: "book detail \(bookId)",
                )
            else {
                return nil
            }

            do {
                let metadata = try decoder.decode(
                    StorytellerBookMetadataPayload.self,
                    from: response.data,
                ).scoped(to: sourceRecordValue.id)
                debugLog(
                    "[MetadataCoverRefresh] StorytellerActor fetchBookDetails success bookID=\(bookId) updatedAt=\(metadata.updatedAt ?? "nil")"
                )
                return metadata
            } catch {
                debugLog("[StorytellerActor] DECODE ERROR in fetchBookDetails for book \(bookId):")
                debugLog("[StorytellerActor] Error: \(error)")
                if let decodingError = error as? DecodingError {
                    logDetailedDecodingError(decodingError, data: response.data)
                }
                throw error
            }
        } catch {
            debugLog(
                "[MetadataCoverRefresh] StorytellerActor fetchBookDetails error bookID=\(bookId) error=\(error)"
            )
            logStorytellerError("fetchBookDetails", error: error)
            return nil
        }
    }

    /// Updates book metadata using the multipart protocol handled at `/api/v2/books/{bookId}`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/route.ts` (PUT handler).
    public func updateBook(
        _ payload: StorytellerBookUpdatePayload,
        textCover: StorytellerCoverUpload? = nil,
        audioCover: StorytellerCoverUpload? = nil,
    ) async -> BookMetadata? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let updateURL =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(payload.uuid)

        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        var fieldOrder: [String] = []
        var formEntries: [(name: String, value: String)] = []
        var fileEntries: [(name: String, upload: StorytellerCoverUpload)] = []

        // Bug in swift compiler requires non-isolated (local isolation cannot validate)
        nonisolated func registerField(_ name: String) {
            if !fieldOrder.contains(name) {
                fieldOrder.append(name)
            }
        }

        func appendJSONField<T: Encodable>(_ name: String, value: T?) -> Bool {
            registerField(name)
            guard let fragment = jsonFragment(from: value) else {
                debugLog("[StorytellerActor] updateBook failed to encode field \(name).")
                return false
            }
            formEntries.append((name, fragment))
            return true
        }

        if let title = payload.title {
            guard appendJSONField("title", value: title) else { return nil }
        }

        if let subtitle = payload.subtitle {
            guard appendJSONField("subtitle", value: subtitle) else { return nil }
        }

        if let language = payload.language {
            guard appendJSONField("language", value: language) else { return nil }
        }

        if let publicationDate = payload.publicationDate {
            switch publicationDate {
                case .value(let date):
                    guard appendJSONField("publicationDate", value: date) else { return nil }
                case .null:
                    guard appendJSONField("publicationDate", value: Optional<String>.none) else {
                        return nil
                    }
            }
        }

        if let descriptionWrapper = payload.description {
            guard appendJSONField("description", value: descriptionWrapper) else { return nil }
        }

        if let statusWrapper = payload.status {
            guard appendJSONField("status", value: statusWrapper) else { return nil }
        }

        if let authors = payload.authors {
            registerField("authors")
            for author in authors {
                guard appendJSONField("authors", value: Optional(author)) else { return nil }
            }
        }

        if let narrators = payload.narrators {
            registerField("narrators")
            for narrator in narrators {
                guard appendJSONField("narrators", value: Optional(narrator)) else { return nil }
            }
        }

        if let creators = payload.creators {
            registerField("creators")
            for creator in creators {
                guard appendJSONField("creators", value: creator) else { return nil }
            }
        }

        if let series = payload.series {
            registerField("series")
            for item in series {
                guard appendJSONField("series", value: item) else { return nil }
            }
        }

        if let collections = payload.collections {
            registerField("collections")
            for collection in collections {
                formEntries.append(("collections", collection))
            }
        }

        if let tags = payload.tags {
            registerField("tags")
            for tag in tags {
                guard appendJSONField("tags", value: Optional(tag)) else { return nil }
            }
        }

        if let textCover {
            registerField("textCover")
            fileEntries.append(("textCover", textCover))
        }

        if let audioCover {
            registerField("audioCover")
            fileEntries.append(("audioCover", audioCover))
        }

        guard !fieldOrder.isEmpty else {
            debugLog("[StorytellerActor] updateBook called without any fields to update.")
            return nil
        }

        for field in fieldOrder {
            appendFormField(&body, boundary: boundary, name: "fields", value: field)
        }

        for entry in formEntries {
            appendFormField(&body, boundary: boundary, name: entry.name, value: entry.value)
        }

        for entry in fileEntries {
            appendFileField(
                &body,
                boundary: boundary,
                name: entry.name,
                file: entry.upload,
            )
        }

        finalizeMultipart(&body, boundary: boundary)

        let headers: [String: String] = [
            "Authorization": authorizationHeaderValue(for: token),
            "Content-Type": "multipart/form-data; boundary=\(boundary)",
            "Accept": "application/json",
        ]

        var allowedStatuses = Set(200..<300)
        allowedStatuses.insert(401)
        allowedStatuses.insert(403)
        allowedStatuses.insert(404)
        allowedStatuses.insert(405)

        do {
            let response = try await httpPut(
                updateURL.absoluteString,
                headers: headers,
                body: body,
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            let status = evaluateResponse(
                response,
                methodName: "updateBook",
                context: "book \(payload.uuid)",
            )
            guard case .success = status else {
                if let errorMessage = extractServerErrorMessage(from: response.data) {
                    lastUpdateBookError = errorMessage
                } else {
                    lastUpdateBookError = "Server rejected update (HTTP \(response.statusCode))"
                }
                return nil
            }

            do {
                lastUpdateBookError = nil
                return try decoder.decode(
                    StorytellerBookMetadataPayload.self,
                    from: response.data,
                ).scoped(to: sourceRecordValue.id)
            } catch {
                logStorytellerError("updateBook decode", error: error)
                let bodyPreview =
                    String(data: response.data.prefix(500), encoding: .utf8) ?? "<binary>"
                debugLog("[StorytellerActor] updateBook response body: \(bodyPreview)")
                lastUpdateBookError = "Failed to decode server response"
                return nil
            }
        } catch {
            logStorytellerError("updateBook", error: error)
            lastUpdateBookError = "Network error: \(error.localizedDescription)"
            return nil
        }
    }

    /// Deletes a book using `/api/v2/books/{bookId}` (the server also deletes its files), then drops
    /// the device's downloaded copy so nothing is stranded.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/route.ts` (DELETE handler).
    public func deleteBook(_ bookId: String) async -> Bool {
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let deleteURL =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)

        var allowedStatuses = Set(200..<300)
        allowedStatuses.insert(401)
        allowedStatuses.insert(403)
        allowedStatuses.insert(404)

        do {
            let response = try await httpDelete(
                deleteURL.absoluteString,
                headers: [
                    "Authorization": authorizationHeaderValue(for: token)
                ],
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            let succeeded =
                evaluateResponse(
                    response,
                    methodName: "deleteBook",
                    context: "book \(bookId)",
                ) == .success
            if succeeded {
                await LocalMediaActor.shared.removeAllMedia(
                    for: BookID(sourceID: sourceRecordValue.id, uuid: bookId)
                )
            }
            return succeeded
        } catch {
            logStorytellerError("deleteBook", error: error)
            return false
        }
    }

    /// Deletes a specific asset type from a book using `/api/v2/books/{bookId}/replace-asset`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/replace-asset/route.ts` (DELETE handler).
    /// Returns `.notSupported` if the server doesn't have this endpoint.
    public func deleteBookAsset(
        _ bookId: String,
        type: StorytellerBookFormat,
    ) async -> DeleteAssetResult {
        guard let (baseURL, token) = await ensureAuthentication() else { return .failed }
        let deleteURL =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)
            .appendingPathComponent("replace-asset")

        let queryParameters = ["format": type.rawValue]

        var allowedStatuses = Set(200..<300)
        allowedStatuses.insert(401)
        allowedStatuses.insert(403)
        allowedStatuses.insert(404)
        allowedStatuses.insert(405)

        do {
            let response = try await httpDelete(
                deleteURL.absoluteString,
                headers: [
                    "Authorization": authorizationHeaderValue(for: token),
                    "Accept": "application/json",
                ],
                queryParameters: queryParameters,
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            let status = response.statusCode
            if status == 404 || status == 405 {
                debugLog(
                    "[StorytellerActor] deleteBookAsset: endpoint not supported (status \(status))"
                )
                return .notSupported
            }

            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "deleteBookAsset",
                    context: "\(type.rawValue) for book \(bookId)",
                )
            else {
                return .failed
            }

            do {
                let updatedBook = try decoder.decode(
                    StorytellerBookMetadataPayload.self,
                    from: response.data,
                ).scoped(to: sourceRecordValue.id)
                return .success(updatedBook)
            } catch {
                logStorytellerError("deleteBookAsset decode", error: error)
                return .failed
            }
        } catch {
            logStorytellerError("deleteBookAsset", error: error)
            return .failed
        }
    }

    /// Starts alignment processing for a book (creates readaloud from ebook + audiobook).
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/process/route.ts` (POST handler).
    public func startAlignment(for bookId: String, restart: AlignmentRestartMode = .none) async
        -> Bool
    {
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let processURL =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)
            .appendingPathComponent("process")

        var queryParameters: [String: String] = [:]
        if restart != .none {
            queryParameters["restart"] = restart.rawValue
        }

        var allowedStatuses = Set(200..<300)
        allowedStatuses.insert(401)
        allowedStatuses.insert(403)
        allowedStatuses.insert(404)

        do {
            let response = try await httpPost(
                processURL.absoluteString,
                headers: [
                    "Authorization": authorizationHeaderValue(for: token)
                ],
                queryParameters: queryParameters,
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            return evaluateResponse(
                response,
                methodName: "startAlignment",
                context: "book \(bookId)",
            ) == .success
        } catch {
            logStorytellerError("startAlignment", error: error)
            return false
        }
    }

    /// Cancels alignment processing for a book.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/process/route.ts` (DELETE handler).
    public func cancelAlignment(for bookId: String) async -> Bool {
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let processURL =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)
            .appendingPathComponent("process")

        var allowedStatuses = Set(200..<300)
        allowedStatuses.insert(401)
        allowedStatuses.insert(403)
        allowedStatuses.insert(404)

        do {
            let response = try await httpDelete(
                processURL.absoluteString,
                headers: [
                    "Authorization": authorizationHeaderValue(for: token)
                ],
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            return evaluateResponse(
                response,
                methodName: "cancelAlignment",
                context: "book \(bookId)",
            ) == .success
        } catch {
            logStorytellerError("cancelAlignment", error: error)
            return false
        }
    }

    /// Upgrades a book's EPUB files from EPUB 2 to EPUB 3.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/upgrade-epub/route.ts`.
    public func upgradeEpub(for bookId: String) async -> Bool {
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)
            .appendingPathComponent("upgrade-epub")

        var allowedStatuses = Set(200..<300)
        allowedStatuses.insert(401)
        allowedStatuses.insert(403)
        allowedStatuses.insert(404)

        do {
            let bodyData = try JSONSerialization.data(
                withJSONObject: ["createBackup": true]
            )
            let response = try await httpPost(
                url.absoluteString,
                headers: [
                    "Authorization": authorizationHeaderValue(for: token),
                    "Content-Type": "application/json",
                ],
                body: bodyData,
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            return evaluateResponse(
                response,
                methodName: "upgradeEpub",
                context: "book \(bookId)",
            ) == .success
        } catch {
            logStorytellerError("upgradeEpub", error: error)
            return false
        }
    }

    /// Uploads one or more assets for a book using the Tus protocol exposed at `/api/v2/books/upload`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/upload/[[...path]]/route.ts`.
    public func uploadBookAssets(
        bookUUID: String,
        ebook: StorytellerUploadAsset? = nil,
        audiobook: StorytellerUploadAsset? = nil,
        audiobooks: [StorytellerUploadAsset] = [],
        readaloud: StorytellerUploadAsset? = nil,
        collectionUUID: String? = nil,
        onProgress: (@Sendable (Double) -> Void)? = nil,
    ) async -> Bool {
        let audiobookAssets = audiobooks + [audiobook].compactMap(\.self)
        let assets = [ebook].compactMap(\.self) + audiobookAssets + [readaloud].compactMap(\.self)
        guard !assets.isEmpty else {
            debugLog("[StorytellerActor] uploadBookAssets requires at least one asset.")
            return false
        }

        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let totalBytes = assets.reduce(Int64(0)) { $0 + Int64($1.data.count) }
        var completedBytes: Int64 = 0
        for (index, asset) in assets.enumerated() {
            let assetBaseBytes = completedBytes
            var onSendProgress: (@Sendable (Int64, Int64) -> Void)?
            if let onProgress, totalBytes > 0 {
                onSendProgress = { sentBytes, _ in
                    onProgress(Double(assetBaseBytes + sentBytes) / Double(totalBytes))
                }
            }
            let succeeded = await uploadAsset(
                asset,
                bookUUID: bookUUID,
                collectionUUID: index == 0 ? collectionUUID : nil,
                baseURL: baseURL,
                token: token,
                totalAudioFiles: asset.format == .audiobook ? audiobookAssets.count : nil,
                onSendProgress: onSendProgress,
            )
            if !succeeded {
                return false
            }
            completedBytes += Int64(asset.data.count)
        }
        return true
    }

    private static func resolveAPIBaseURL(from serverURL: URL) -> URL {
        let trimmedPath = serverURL.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        if trimmedPath.hasSuffix("api/v2") {
            return serverURL
        }

        if trimmedPath.hasSuffix("api") {
            return serverURL.appendingPathComponent("v2")
        }

        return
            serverURL
            .appendingPathComponent("api")
            .appendingPathComponent("v2")
    }

    private func authorizationHeaderValue(for token: AccessToken) -> String {
        if token.tokenType.compare("bearer", options: .caseInsensitive) == .orderedSame {
            return "Bearer \(token.accessToken)"
        }
        return "\(token.tokenType) \(token.accessToken)"
    }

    private func fallbackFilename(
        for bookId: String,
        format: StorytellerBookFormat,
    ) -> String {
        let fileExtension: String =
            switch format {
                case .ebook, .readaloud:
                    "epub"
                case .audiobook:
                    "m4b"
            }
        return "\(bookId).\(fileExtension)"
    }

    private func downloadQueryValue(for format: StorytellerBookFormat) -> String {
        switch format {
            case .audiobook:
                return "audiobook-rpf"
            case .ebook, .readaloud:
                return format.rawValue
        }
    }

    private func downloadAcceptHeader(for format: StorytellerBookFormat) -> String {
        switch format {
            case .audiobook:
                return "application/audiobook+zip"
            case .ebook, .readaloud:
                return "application/octet-stream"
        }
    }

    private func defaultFilename(
        for bookId: String,
        format: StorytellerBookFormat,
        response: HTTPURLResponse,
    ) -> String {
        let guessedExtension =
            if let contentType = response.value(forHTTPHeaderField: "Content-Type"),
                let uti = mimeTypeToPreferredExtension(contentType)
            {
                ".\(uti)"
            } else {
                switch format {
                    case .ebook:
                        ".epub"
                    case .audiobook:
                        ".m4b"
                    case .readaloud:
                        ".epub"
                }
            }
        return "\(bookId)\(guessedExtension)"
    }

    private func mimeTypeToPreferredExtension(_ mimeType: String) -> String? {
        if mimeType == "application/epub+zip" { return "epub" }
        if mimeType == "application/zip" { return "zip" }
        if mimeType == "audio/mpeg" { return "mp3" }
        if mimeType == "audio/mp4" { return "m4a" }
        if mimeType == "audio/x-m4a" { return "m4a" }
        return nil
    }

    private func defaultMimeType(for format: StorytellerBookFormat, filename: String) -> String? {
        if let inferred = inferMimeType(from: filename) {
            return inferred
        }
        switch format {
            case .ebook, .readaloud:
                return "application/epub+zip"
            case .audiobook:
                return "application/zip"
        }
    }

    private func inferMimeType(from filename: String) -> String? {
        if filename.lowercased().hasSuffix(".epub") { return "application/epub+zip" }
        if filename.lowercased().hasSuffix(".zip") { return "application/zip" }
        if filename.lowercased().hasSuffix(".mp3") { return "audio/mpeg" }
        if filename.lowercased().hasSuffix(".m4a") { return "audio/m4a" }
        if filename.lowercased().hasSuffix(".m4b") { return "audio/m4b" }
        if filename.lowercased().hasSuffix(".mp4") { return "audio/mp4" }
        return nil
    }

    private func uploadAsset(
        _ asset: StorytellerUploadAsset,
        bookUUID: String,
        collectionUUID: String?,
        baseURL: URL,
        token: AccessToken,
        totalAudioFiles: Int? = nil,
        onSendProgress: (@Sendable (Int64, Int64) -> Void)? = nil,
    ) async -> Bool {
        let uploadBaseURL =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent("upload")

        var metadata: [String: String] = [
            "bookUuid": bookUUID,
            "filename": asset.filename,
        ]

        if let contentType = asset.contentType {
            metadata["filetype"] = contentType
        } else if let guessedType = defaultMimeType(for: asset.format, filename: asset.filename) {
            metadata["filetype"] = guessedType
        }

        if let relativePath = asset.relativePath {
            metadata["relativePath"] = relativePath
        }

        if let collectionUUID {
            metadata["collection"] = collectionUUID
        }

        if let totalAudioFiles, totalAudioFiles > 1 {
            metadata["totalAudioFiles"] = "\(totalAudioFiles)"
        }

        let metadataHeader =
            metadata
            .map { key, value in
                let encodedValue = Data(value.utf8).base64EncodedString()
                return "\(key) \(encodedValue)"
            }
            .joined(separator: ",")

        guard !asset.data.isEmpty else {
            debugLog("[StorytellerActor] uploadAsset received empty data for \(asset.filename).")
            return false
        }

        do {
            var createAllowedStatuses = Set(200..<300)
            createAllowedStatuses.insert(401)
            createAllowedStatuses.insert(403)

            let createResponse = try await httpPost(
                uploadBaseURL.absoluteString,
                headers: [
                    "Tus-Resumable": "1.0.0",
                    "Authorization": authorizationHeaderValue(for: token),
                    "Upload-Length": "\(asset.data.count)",
                    "Upload-Metadata": metadataHeader,
                    "Content-Length": "0",
                ],
                body: Data(),
                session: urlSession,
                allowedStatusCodes: createAllowedStatuses,
            )

            guard
                case .success = evaluateResponse(
                    createResponse,
                    methodName: "uploadAsset",
                    context: "create for \(asset.filename)",
                )
            else {
                return false
            }

            guard
                let locationHeader = createResponse.response.value(forHTTPHeaderField: "Location")
            else {
                debugLog("[StorytellerActor] uploadAsset missing Location header.")
                return false
            }

            let uploadURL = resolveUploadLocation(locationHeader, relativeTo: uploadBaseURL)
            debugLog(
                "[StorytellerActor] uploadAsset: POST succeeded, Location=\(locationHeader), PATCH URL=\(uploadURL.absoluteString), dataSize=\(asset.data.count)"
            )

            var patchAllowedStatuses = Set(200..<300)
            patchAllowedStatuses.insert(401)
            patchAllowedStatuses.insert(403)

            let patchResponse = try await httpPatch(
                uploadURL.absoluteString,
                headers: [
                    "Tus-Resumable": "1.0.0",
                    "Content-Type": "application/offset+octet-stream",
                    "Authorization": authorizationHeaderValue(for: token),
                    "Upload-Offset": "0",
                    "Content-Length": "\(asset.data.count)",
                ],
                body: asset.data,
                session: urlSession,
                allowedStatusCodes: patchAllowedStatuses,
                onSendProgress: onSendProgress,
            )

            guard
                case .success = evaluateResponse(
                    patchResponse,
                    methodName: "uploadAsset",
                    context: "patch for \(asset.filename)",
                )
            else {
                return false
            }

            let offset = patchResponse.response.value(forHTTPHeaderField: "Upload-Offset")
            if Int(offset ?? "") != asset.data.count {
                debugLog("[StorytellerActor] uploadAsset patch offset mismatch.")
                return false
            }
        } catch {
            logStorytellerError("uploadAsset", error: error)
            return false
        }
        return true
    }

    /// Result of a replaceBookAsset operation.
    /// Replaces a specific asset type on an existing book using `/api/v2/books/{bookId}/replace-asset/upload`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/replace-asset/upload/[[...path]]/route.ts`.
    /// Returns `.notSupported` if the server doesn't have this endpoint.
    /// - Parameters:
    ///   - asset: The asset to upload.
    ///   - bookUUID: The UUID of the book to replace the asset on.
    ///   - replaceMetadata: If true, updates book metadata from the new file. Defaults to false.
    public func replaceBookAsset(
        _ asset: StorytellerUploadAsset,
        bookUUID: String,
        replaceMetadata: Bool = false,
        onSendProgress: (@Sendable (Int64, Int64) -> Void)? = nil,
    ) async -> ReplaceAssetResult {
        guard let (baseURL, token) = await ensureAuthentication() else { return .failed }

        let uploadBaseURL =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookUUID)
            .appendingPathComponent("replace-asset")
            .appendingPathComponent("upload")

        let batchId = UUID().uuidString

        var metadata: [String: String] = [
            "bookUuid": bookUUID,
            "format": asset.format.rawValue,
            "filename": asset.filename,
            "batchId": batchId,
        ]

        if let contentType = asset.contentType {
            metadata["filetype"] = contentType
        } else if let guessedType = defaultMimeType(for: asset.format, filename: asset.filename) {
            metadata["filetype"] = guessedType
        }

        if asset.format == .audiobook {
            metadata["totalAudioFiles"] = "1"
        }

        if let relativePath = asset.relativePath {
            metadata["relativePath"] = relativePath
        }

        if !replaceMetadata {
            metadata["metadataFieldOverrides"] = skipMetadataFieldOverridesJSONString()
        }

        let metadataHeader =
            metadata
            .map { key, value in
                let encodedValue = Data(value.utf8).base64EncodedString()
                return "\(key) \(encodedValue)"
            }
            .joined(separator: ",")

        guard !asset.data.isEmpty else {
            debugLog(
                "[StorytellerActor] replaceBookAsset received empty data for \(asset.filename)."
            )
            return .failed
        }

        debugLog(
            "[StorytellerActor] replaceBookAsset: URL=\(uploadBaseURL.absoluteString), bookUUID=\(bookUUID), metadata=\(metadata)"
        )

        do {
            var createAllowedStatuses = Set(200..<300)
            createAllowedStatuses.insert(401)
            createAllowedStatuses.insert(403)
            createAllowedStatuses.insert(404)
            createAllowedStatuses.insert(405)

            let createResponse = try await httpPost(
                uploadBaseURL.absoluteString,
                headers: [
                    "Tus-Resumable": "1.0.0",
                    "Authorization": authorizationHeaderValue(for: token),
                    "Upload-Length": "\(asset.data.count)",
                    "Upload-Metadata": metadataHeader,
                    "Content-Length": "0",
                ],
                body: Data(),
                session: urlSession,
                allowedStatusCodes: createAllowedStatuses,
            )

            let status = createResponse.statusCode
            if status == 404 || status == 405 {
                debugLog(
                    "[StorytellerActor] replaceBookAsset: endpoint not supported (status \(status))"
                )
                return .notSupported
            }

            guard
                case .success = evaluateResponse(
                    createResponse,
                    methodName: "replaceBookAsset",
                    context: "create for \(asset.filename)",
                )
            else {
                return .failed
            }

            guard
                let locationHeader = createResponse.response.value(forHTTPHeaderField: "Location")
            else {
                debugLog("[StorytellerActor] replaceBookAsset missing Location header.")
                return .failed
            }

            let uploadURL = resolveUploadLocation(locationHeader, relativeTo: uploadBaseURL)

            var patchAllowedStatuses = Set(200..<300)
            patchAllowedStatuses.insert(401)
            patchAllowedStatuses.insert(403)

            let patchResponse = try await httpPatch(
                uploadURL.absoluteString,
                headers: [
                    "Tus-Resumable": "1.0.0",
                    "Content-Type": "application/offset+octet-stream",
                    "Authorization": authorizationHeaderValue(for: token),
                    "Upload-Offset": "0",
                    "Content-Length": "\(asset.data.count)",
                ],
                body: asset.data,
                session: urlSession,
                allowedStatusCodes: patchAllowedStatuses,
                onSendProgress: onSendProgress,
            )

            guard
                case .success = evaluateResponse(
                    patchResponse,
                    methodName: "replaceBookAsset",
                    context: "patch for \(asset.filename)",
                )
            else {
                return .failed
            }

            let offset = patchResponse.response.value(forHTTPHeaderField: "Upload-Offset")
            if Int(offset ?? "") != asset.data.count {
                debugLog("[StorytellerActor] replaceBookAsset patch offset mismatch.")
                return .failed
            }

            return .success
        } catch {
            logStorytellerError("replaceBookAsset", error: error)
            return .failed
        }
    }

    private func skipMetadataFieldOverridesJSONString() -> String {
        let overrides = [
            "authors": "skip",
            "cover": "skip",
            "creators": "skip",
            "description": "skip",
            "language": "skip",
            "narrators": "skip",
            "publicationDate": "skip",
            "series": "skip",
            "subtitle": "skip",
            "tags": "skip",
            "title": "skip",
        ]
        let data = try? JSONSerialization.data(
            withJSONObject: overrides,
            options: [.sortedKeys],
        )
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }

    /// Retrieves available reading statuses from `/api/v2/statuses`.
    /// Server implementation: `storyteller/web/src/app/api/v2/statuses/route.ts`.
    private func fetchStatuses() async -> [BookStatus]? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let statusesURL = baseURL.appendingPathComponent("statuses")

        do {
            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)
            allowedStatuses.insert(404)

            let response = try await httpGet(
                statusesURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchStatuses",
                    context: "statuses",
                )
            else {
                return nil
            }

            let statuses = try decoder.decode([BookStatus].self, from: response.data)
            cachedStatuses = statuses
            return statuses
        } catch {
            logStorytellerError("fetchStatuses", error: error)
            return nil
        }
    }

    /// Returns available statuses for UI display. Uses cached values if available, otherwise fetches from server.
    public func getAvailableStatuses() async -> [BookStatus] {
        if !cachedStatuses.isEmpty {
            return cachedStatuses
        }
        return await fetchStatuses() ?? []
    }

    /// Updates the status for a set of books using `/api/v2/books/status`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/status/route.ts` (PUT handler).
    public func updateStatus(forBooks bookIds: [String], toStatusNamed statusName: String) async
        -> Bool
    {
        guard !bookIds.isEmpty else {
            debugLog("[StorytellerActor] updateStatus requires at least one book id.")
            return false
        }

        if cachedStatuses.isEmpty {
            _ = await fetchStatuses()
        }

        guard let status = cachedStatuses.first(where: { $0.name == statusName }) else {
            debugLog(
                "[StorytellerActor] updateStatus error: status '\(statusName)' not found in cached statuses"
            )
            return false
        }

        guard let statusUUID = status.uuid else {
            debugLog("[StorytellerActor] updateStatus error: status '\(statusName)' has no UUID")
            return false
        }

        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let statusURL = baseURL.appendingPathComponent("books/status")

        struct StatusBody: Encodable {
            let books: [String]
            let status: String
        }

        let body = StatusBody(books: bookIds, status: statusUUID)

        do {
            let payload = try encoder.encode(body)

            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)

            let response = try await httpPut(
                statusURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                body: payload,
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            let succeeded =
                evaluateResponse(
                    response,
                    methodName: "updateStatus",
                    context: "status update",
                ) == .success
            if succeeded {
                // Refresh this source's own cache so observers reflect the new status without the
                // caller forcing a cross-source refetch.
                _ = await fetchLibraryInformation()
            }
            return succeeded
        } catch {
            logStorytellerError("updateStatus", error: error)
            return false
        }
    }

    /// Removes tags from books using `/api/v2/books/tags` (DELETE).
    /// Server implementation: `storyteller/web/src/app/api/v2/books/tags/route.ts`.
    /// TODO: UNTESTED
    func removeTags(_ tagUUIDs: [String], fromBooks bookIds: [String]) async -> Bool {
        guard !bookIds.isEmpty else {
            debugLog("[StorytellerActor] removeTags requires at least one book id.")
            return false
        }

        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let tagsURL = baseURL.appendingPathComponent("books/tags")

        struct RemoveTagsBody: Encodable {
            let tags: [String]
            let books: [String]
        }

        let body = RemoveTagsBody(tags: tagUUIDs, books: bookIds)

        do {
            let payload = try encoder.encode(body)

            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)

            let response = try await httpDelete(
                tagsURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                body: payload,
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            return evaluateResponse(
                response,
                methodName: "removeTags",
                context: "tag removal",
            ) == .success
        } catch {
            logStorytellerError("removeTags", error: error)
            return false
        }
    }

    /// Lists collections visible to the user via `/api/v2/collections`.
    /// Server implementation: `storyteller/web/src/app/api/v2/collections/route.ts` (GET handler).
    public func fetchCollections() async -> [StorytellerCollection]? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let collectionsURL = baseURL.appendingPathComponent("collections")

        do {
            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)
            allowedStatuses.insert(404)

            let response = try await httpGet(
                collectionsURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchCollections",
                    context: "collections",
                )
            else {
                return nil
            }

            return try decoder.decode([StorytellerCollection].self, from: response.data)
        } catch {
            logStorytellerError("fetchCollections", error: error)
            return nil
        }
    }

    /// Retrieves details for a specific collection via `/api/v2/collections/{uuid}`.
    /// Server implementation: `storyteller/web/src/app/api/v2/collections/[uuid]/route.ts` (GET handler).
    /// TODO: UNTESTED
    func fetchCollection(uuid: String) async -> StorytellerCollection? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let collectionURL =
            baseURL
            .appendingPathComponent("collections")
            .appendingPathComponent(uuid)

        do {
            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)
            allowedStatuses.insert(404)

            let response = try await httpGet(
                collectionURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchCollection",
                    context: "collection \(uuid)",
                )
            else {
                return nil
            }

            return try decoder.decode(StorytellerCollection.self, from: response.data)
        } catch {
            logStorytellerError("fetchCollection", error: error)
            return nil
        }
    }

    /// Creates a new collection using `/api/v2/collections`.
    /// Server implementation: `storyteller/web/src/app/api/v2/collections/route.ts` (POST handler).
    /// TODO: UNTESTED
    public func createCollection(_ payload: StorytellerCollectionCreatePayload) async
        -> StorytellerCollection?
    {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let collectionsURL = baseURL.appendingPathComponent("collections")

        do {
            let payloadData = try encoder.encode(payload)

            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)

            let response = try await httpPost(
                collectionsURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                body: payloadData,
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "createCollection",
                    context: "collection creation",
                )
            else {
                return nil
            }

            do {
                return try decoder.decode(StorytellerCollection.self, from: response.data)
            } catch {
                logStorytellerError("createCollection decode", error: error)
                return nil
            }
        } catch {
            logStorytellerError("createCollection", error: error)
            return nil
        }
    }

    /// Updates collection metadata via `/api/v2/collections/{uuid}`.
    /// Server implementation: `storyteller/web/src/app/api/v2/collections/[uuid]/route.ts` (PUT handler).
    /// TODO: UNTESTED
    func updateCollection(
        uuid: String,
        payload: StorytellerCollectionUpdatePayload,
    ) async -> StorytellerCollection? {
        guard
            payload.name != nil || payload.description != nil || payload.isPublic != nil
                || payload.users != nil
        else {
            debugLog("[StorytellerActor] updateCollection requires at least one field to update.")
            return nil
        }

        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let collectionURL =
            baseURL
            .appendingPathComponent("collections")
            .appendingPathComponent(uuid)

        do {
            let payloadData = try encoder.encode(payload)

            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)
            allowedStatuses.insert(404)

            let response = try await httpPut(
                collectionURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                body: payloadData,
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "updateCollection",
                    context: "collection \(uuid)",
                )
            else {
                return nil
            }

            do {
                return try decoder.decode(StorytellerCollection.self, from: response.data)
            } catch {
                logStorytellerError("updateCollection decode", error: error)
                return nil
            }
        } catch {
            logStorytellerError("updateCollection", error: error)
            return nil
        }
    }

    /// Deletes a collection with `/api/v2/collections/{uuid}`.
    /// Server implementation: `storyteller/web/src/app/api/v2/collections/[uuid]/route.ts` (DELETE handler).
    /// TODO: UNTESTED
    public func deleteCollection(uuid: String) async -> Bool {
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let collectionURL =
            baseURL
            .appendingPathComponent("collections")
            .appendingPathComponent(uuid)

        var allowedStatuses = Set(200..<300)
        allowedStatuses.insert(401)
        allowedStatuses.insert(403)
        allowedStatuses.insert(404)

        do {
            let response = try await httpDelete(
                collectionURL.absoluteString,
                headers: [
                    "Authorization": authorizationHeaderValue(for: token)
                ],
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            return evaluateResponse(
                response,
                methodName: "deleteCollection",
                context: "collection \(uuid)",
            ) == .success
        } catch {
            logStorytellerError("deleteCollection", error: error)
            return false
        }
    }

    /// Adds book memberships to collections via `/api/v2/collections/books`.
    /// Server implementation: `storyteller/web/src/app/api/v2/collections/books/route.ts` (POST handler).
    /// TODO: UNTESTED
    func addBooks(_ bookIds: [String], toCollections collectionIds: [String]) async -> Bool {
        guard !bookIds.isEmpty, !collectionIds.isEmpty else {
            debugLog("[StorytellerActor] addBooks requires non-empty books and collections.")
            return false
        }

        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let membershipURL = baseURL.appendingPathComponent("collections/books")

        struct MembershipBody: Encodable {
            let collections: [String]
            let books: [String]
        }

        let body = MembershipBody(collections: collectionIds, books: bookIds)

        do {
            let payload = try encoder.encode(body)

            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)

            let response = try await httpPost(
                membershipURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                body: payload,
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            return evaluateResponse(
                response,
                methodName: "addBooks",
                context: "membership add",
            ) == .success
        } catch {
            logStorytellerError("addBooks", error: error)
            return false
        }
    }

    /// Removes book memberships from collections via `/api/v2/collections/books`.
    /// Server implementation: `storyteller/web/src/app/api/v2/collections/books/route.ts` (DELETE handler).
    /// TODO: UNTESTED
    func removeBooks(_ bookIds: [String], fromCollections collectionIds: [String]) async -> Bool {
        guard !bookIds.isEmpty, !collectionIds.isEmpty else {
            debugLog("[StorytellerActor] removeBooks requires non-empty books and collections.")
            return false
        }

        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let membershipURL = baseURL.appendingPathComponent("collections/books")

        struct MembershipBody: Encodable {
            let collections: [String]
            let books: [String]
        }

        let body = MembershipBody(collections: collectionIds, books: bookIds)

        do {
            let payload = try encoder.encode(body)

            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)

            let response = try await httpDelete(
                membershipURL.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                body: payload,
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            return evaluateResponse(
                response,
                methodName: "removeBooks",
                context: "membership removal",
            ) == .success
        } catch {
            logStorytellerError("removeBooks", error: error)
            return false
        }
    }

    /// Logs out of the remote Storyteller instance and clears cached auth state.
    /// Server implementation: `storyteller/web/src/app/api/v2/logout/route.ts`.
    public func logout() async -> Bool {
        guard let token = accessToken else {
            libraryMetadata.removeAll()
            return true
        }
        guard let apiBaseURL = apiBaseURL else {
            return false
        }

        let logoutURL = apiBaseURL.appendingPathComponent("logout")

        var succeeded = true
        do {
            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)

            let response = try await httpPost(
                logoutURL.absoluteString,
                headers: [
                    "Authorization": authorizationHeaderValue(for: token)
                ],
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            let status = evaluateResponse(response, methodName: "logout", context: "session")
            switch status {
                case .success, .unauthorized:
                    break
                default:
                    succeeded = false
            }
        } catch {
            logStorytellerError("logout", error: error)
            succeeded = false
        }

        accessToken = nil
        username = nil
        password = nil
        sessionToken = nil
        sessionTokenRejected = false
        self.apiBaseURL = nil
        libraryMetadata.removeAll()
        await updateConnectionStatus(.disconnected)
        monitoringTask?.cancel()
        monitoringTask = nil
        stopNetworkMonitoring()
        return succeeded
    }

    private enum StorytellerResponseStatus: Equatable {
        case success
        case notModified
        case unauthorized
        case notFound
        case unexpected(Int)
    }

    private func evaluateResponse(
        _ response: HTTPResponse,
        methodName: String,
        context: String,
    ) -> StorytellerResponseStatus {
        let statusCode = response.statusCode

        if (200..<300).contains(statusCode) {
            return .success
        }

        switch statusCode {
            case 304:
                debugLog("[StorytellerActor] \(methodName) \(context) not modified.")
                return .notModified
            case 401, 403:
                debugLog(
                    "[StorytellerActor] \(methodName) \(context) unauthorized (\(statusCode))."
                )
                let status = markUnauthorized(
                    statusCode: statusCode,
                    fallbackStatus: .error("Unauthorized"),
                )
                Task { await self.updateConnectionStatus(status) }
                return .unauthorized
            case 404:
                debugLog("[StorytellerActor] \(methodName) \(context) not found.")
                return .notFound
            default:
                if let body = String(data: response.data, encoding: .utf8), !body.isEmpty {
                    debugLog(
                        "[StorytellerActor] \(methodName) \(context) unexpected status \(statusCode): \(body)"
                    )
                } else {
                    debugLog(
                        "[StorytellerActor] \(methodName) \(context) unexpected status \(statusCode)."
                    )
                }
                return .unexpected(statusCode)
        }
    }

    private func extractServerErrorMessage(from data: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let message = json["message"] as? String
        else { return nil }
        return message
    }

    private func resolveUploadLocation(_ locationHeader: String, relativeTo baseURL: URL) -> URL {
        if let explicit = URL(string: locationHeader), explicit.host != nil {
            return explicit
        }

        if locationHeader.hasPrefix("/") {
            var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
            components?.path = locationHeader
            components?.query = nil
            components?.fragment = nil
            if let url = components?.url { return url }
        }

        return baseURL.appendingPathComponent(locationHeader)
    }

    private func appendFormField(
        _ body: inout Data,
        boundary: String,
        name: String,
        value: String,
    ) {
        guard let headerData = "--\(boundary)\r\n".data(using: .utf8) else { return }
        body.append(headerData)
        body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
        body.append(value.data(using: .utf8) ?? Data())
        body.append("\r\n".data(using: .utf8)!)
    }

    private func appendFileField(
        _ body: inout Data,
        boundary: String,
        name: String,
        file: StorytellerCoverUpload,
    ) {
        guard let headerData = "--\(boundary)\r\n".data(using: .utf8) else { return }
        body.append(headerData)
        body.append(
            "Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(file.filename)\"\r\n"
                .data(using: .utf8)!
        )
        if let contentType = file.contentType {
            body.append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
        } else {
            body.append("Content-Type: application/octet-stream\r\n\r\n".data(using: .utf8)!)
        }
        body.append(file.data)
        body.append("\r\n".data(using: .utf8)!)
    }

    private func finalizeMultipart(_ body: inout Data, boundary: String) {
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
    }

    private func jsonFragment(from value: (some Encodable)?) -> String? {
        if let value {
            do {
                let data = try encoder.encode(value)
                guard let string = String(data: data, encoding: .utf8) else {
                    debugLog("[StorytellerActor] Failed to encode JSON fragment: invalid UTF-8.")
                    return nil
                }
                return string
            } catch {
                logStorytellerError("jsonFragment encode", error: error)
                return nil
            }
        }
        return "null"
    }

    private func encodeLocatorToDict(_ locator: BookLocator) -> [String: Any] {
        var dict: [String: Any] = [
            "href": locator.href,
            "type": locator.type,
        ]

        if let title = locator.title {
            dict["title"] = title
        }

        if let locations = locator.locations {
            var locationsDict: [String: Any] = [:]

            if let progression = locations.progression {
                locationsDict["progression"] = progression
            }
            if let totalProgression = locations.totalProgression {
                locationsDict["totalProgression"] = totalProgression
            }
            if let position = locations.position {
                locationsDict["position"] = position
            }
            if let partialCfi = locations.partialCfi {
                locationsDict["partialCfi"] = partialCfi
            }
            if let cssSelector = locations.cssSelector {
                locationsDict["cssSelector"] = cssSelector
            }
            if let fragments = locations.fragments {
                locationsDict["fragments"] = fragments
            }

            if !locationsDict.isEmpty {
                dict["locations"] = locationsDict
            }
        }

        if let text = locator.text {
            var textDict: [String: Any] = [:]
            if let before = text.before {
                textDict["before"] = before
            }
            if let after = text.after {
                textDict["after"] = after
            }
            if let highlight = text.highlight {
                textDict["highlight"] = highlight
            }

            if !textDict.isEmpty {
                dict["text"] = textDict
            }
        }

        debugLog("[StorytellerActor] Encoded locator to dictionary")
        return dict
    }

    public func sendProgressToServer(
        bookId: String,
        locator: BookLocator,
        timestamp: Double,
    ) async -> HTTPResult {
        debugLog(
            "[StorytellerActor] sendProgressToServer: bookId=\(bookId), timestamp=\(timestamp)"
        )

        guard let baseURL = apiBaseURL else {
            debugLog("[StorytellerActor] sendProgressToServer: no API base URL")
            return .noConnection
        }

        guard let token = accessToken?.accessToken else {
            debugLog("[StorytellerActor] sendProgressToServer: no access token")
            return .noConnection
        }

        let url = baseURL.appendingPathComponent("books/\(bookId)/positions")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        // Position payloads are tiny; a wedged connection should fail fast so the
        // background flush can retry later instead of pinning the queue for a minute.
        request.timeoutInterval = 15
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "locator": encodeLocatorToDict(locator),
            "timestamp": Int64(timestamp),
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (_, response) = try await urlSession.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                debugLog("[StorytellerActor] sendProgressToServer: invalid response type")
                return .failure
            }

            debugLog("[StorytellerActor] sendProgressToServer: status=\(httpResponse.statusCode)")

            switch httpResponse.statusCode {
                case 204:
                    return .success
                case 409, 404:
                    return .failure
                default:
                    return .failure
            }
        } catch {
            debugLog("[StorytellerActor] sendProgressToServer: request failed - \(error)")
            return .noConnection
        }
    }

    public func fetchBookProgress(bookId: String, log: Bool = true) async -> BookReadingPosition? {
        if log {
            debugLog("[StorytellerActor] fetchBookProgress: bookId=\(bookId)")
        }

        guard let metadata = await fetchBookDetails(for: bookId) else {
            if log {
                debugLog("[StorytellerActor] fetchBookProgress: failed to fetch metadata")
            }
            return nil
        }

        if log {
            debugLog(
                "[StorytellerActor] fetchBookProgress: returning position with timestamp=\(metadata.position?.timestamp ?? 0)"
            )
        }
        return metadata.position
    }

    /// Fetches only the position for a book using the slim /positions endpoint.
    /// Returns just {locator, timestamp} without full book metadata.
    public func fetchBookPosition(bookId: String) async -> BookReadingPosition? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }

        let url =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)
            .appendingPathComponent("positions")

        do {
            var allowedStatuses = Set(200..<300)
            allowedStatuses.insert(401)
            allowedStatuses.insert(403)
            allowedStatuses.insert(404)

            let response = try await httpGet(
                url.absoluteString,
                headers: [
                    "Accept": "application/json",
                    "Authorization": authorizationHeaderValue(for: token),
                ],
                session: urlSession,
                allowedStatusCodes: allowedStatuses,
            )

            // A 404 from the slim positions endpoint means the server has no saved
            // position for this book yet. The progress poller can hit this path
            // repeatedly, so keep it out of the generic failure logger.
            if response.statusCode == 404 {
                await recordNetworkSuccess(notifyWhenAlreadyConnected: false)
                return nil
            }

            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchBookPosition",
                    context: "position for \(bookId)",
                )
            else {
                return nil
            }

            await recordNetworkSuccess()
            return try decoder.decode(BookReadingPosition.self, from: response.data)
        } catch {
            logStorytellerError("fetchBookPosition", error: error)
            return nil
        }
    }

    // TODO: Remaining API wrappers
    // - `/api/v2/books/events` (storyteller/web/src/app/api/v2/books/events/route.ts) – real-time catalogue updates.
    // - `/api/v2/books` POST (storyteller/web/src/app/api/v2/books/route.ts) – server-side ingest utilities.
    // - `/api/v2/books/[bookId]/cache` (storyteller/web/src/app/api/v2/books/[bookId]/cache/route.ts) – purge cached assets.
    // - `/api/v2/series` & `/api/v2/series/books` (storyteller/web/src/app/api/v2/series/**/*.ts) – manage series metadata.
    // - `/api/v2/settings` & `/api/v2/settings/maxUploadChunkSize` (storyteller/web/src/app/api/v2/settings/**/*.ts) – admin settings.
    // - `/api/v2/creators` (storyteller/web/src/app/api/v2/creators/route.ts) – creator directory.
    // - `/api/v2/users` and `/api/v2/users/{userId}` (storyteller/web/src/app/api/v2/users/**/*.ts) – user administration.
    // - `/api/v2/invites` endpoints (storyteller/web/src/app/api/v2/invites/**/*.ts) – invite management.
    // - `/api/v2/reports` (storyteller/web/src/app/api/v2/reports/**/*.ts) – processing reports and transcripts.
    // - `/api/v2/validate` (storyteller/web/src/app/api/v2/validate/route.ts) – session validation helper.

    // Several of the newer payloads carry dictionaries keyed by user-controlled strings
    // (dimension ids, chapter hrefs, filepaths) that a key-conversion strategy would rewrite.
    private static func plainJSONDecoder() -> JSONDecoder {
        JSONDecoder()
    }

    private static func plainJSONEncoder() -> JSONEncoder {
        JSONEncoder()
    }

    private func jsonRequestHeaders(for token: AccessToken, hasBody: Bool = false) -> [String:
        String]
    {
        var headers = [
            "Accept": "application/json",
            "Authorization": authorizationHeaderValue(for: token),
        ]
        if hasBody {
            headers["Content-Type"] = "application/json"
        }
        return headers
    }

    private static func allowedStatuses(_ additional: Int...) -> Set<Int> {
        var statuses = Set(200..<300)
        statuses.formUnion([401, 403, 404, 405])
        statuses.formUnion(additional)
        return statuses
    }

    private static func isFeatureUnavailable(_ response: HTTPResponse) -> Bool {
        response.statusCode == 404 || response.statusCode == 405
    }

    /// Fetches the user's raw settings map via `/api/v2/user/settings`.
    /// Server implementation: `storyteller/web/src/app/api/v2/user/settings/route.ts` (GET handler).
    public func fetchUserSettings() async -> [String: JSONValue]? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url = baseURL.appendingPathComponent("user/settings")

        do {
            let response = try await httpGet(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            if Self.isFeatureUnavailable(response) {
                await recordNetworkSuccess(notifyWhenAlreadyConnected: false)
                return nil
            }
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchUserSettings",
                    context: "user settings",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode(
                [String: JSONValue].self,
                from: response.data,
            )
        } catch {
            logStorytellerError("fetchUserSettings", error: error)
            return nil
        }
    }

    /// Merges the given keys into the user's settings via `/api/v2/user/settings`.
    /// Server implementation: `storyteller/web/src/app/api/v2/user/settings/route.ts` (PUT handler).
    public func updateUserSettings(_ values: [String: JSONValue]) async -> Bool {
        guard !values.isEmpty else { return true }
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url = baseURL.appendingPathComponent("user/settings")

        do {
            let body = try Self.plainJSONEncoder().encode(values)
            let response = try await httpPut(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: true),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            return evaluateResponse(
                response,
                methodName: "updateUserSettings",
                context: "user settings update",
            ) == .success
        } catch {
            logStorytellerError("updateUserSettings", error: error)
            return false
        }
    }

    /// Fetches `/api/v2/user/settings` decoded into the documented preference keys.
    /// Server implementation: `storyteller/web/src/app/api/v2/user/settings/route.ts` (GET handler).
    public func fetchUserPreferences() async -> ServerUserPreferences? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url = baseURL.appendingPathComponent("user/settings")

        do {
            let response = try await httpGet(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            if Self.isFeatureUnavailable(response) {
                await recordNetworkSuccess(notifyWhenAlreadyConnected: false)
                return nil
            }
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchUserPreferences",
                    context: "user preferences",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode(
                ServerUserPreferences.self,
                from: response.data,
            )
        } catch {
            logStorytellerError("fetchUserPreferences", error: error)
            return nil
        }
    }

    /// Writes a single preference key via `/api/v2/user/settings`.
    /// Server implementation: `storyteller/web/src/app/api/v2/user/settings/route.ts` (PUT handler).
    public func updateUserPreference(_ key: ServerUserPreferenceKey, to value: JSONValue) async
        -> Bool
    {
        await updateUserSettings([key.rawValue: value])
    }

    /// Fetches the user's rating for a book via `/api/v2/books/{bookId}/rating`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/rating/route.ts` (GET handler).
    public func fetchBookRating(for bookId: String) async -> UserBookRating? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)
            .appendingPathComponent("rating")

        do {
            let response = try await httpGet(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            if Self.isFeatureUnavailable(response) {
                await recordNetworkSuccess(notifyWhenAlreadyConnected: false)
                return nil
            }
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchBookRating",
                    context: "rating for \(bookId)",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode(UserBookRating.self, from: response.data)
        } catch {
            logStorytellerError("fetchBookRating", error: error)
            return nil
        }
    }

    /// Sets or updates the user's rating/review via `/api/v2/books/{bookId}/rating`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/rating/route.ts` (PUT handler).
    public func updateBookRating(
        for bookId: String,
        update: UserBookRatingUpdate,
    ) async -> UserBookRatingUpdateResult {
        guard let (baseURL, token) = await ensureAuthentication() else {
            return .failed(message: "Not connected to server")
        }
        let url =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)
            .appendingPathComponent("rating")

        do {
            let body = try Self.plainJSONEncoder().encode(update)
            let response = try await httpPut(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: true),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )

            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "updateBookRating",
                    context: "rating update for \(bookId)",
                )
            else {
                return .failed(message: extractServerErrorMessage(from: response.data))
            }

            await recordNetworkSuccess()
            if response.statusCode == 204 || response.data.isEmpty {
                return .cleared
            }
            let rating = try Self.plainJSONDecoder().decode(
                UserBookRating.self,
                from: response.data,
            )
            return .saved(rating)
        } catch {
            logStorytellerError("updateBookRating", error: error)
            return .failed(message: error.localizedDescription)
        }
    }

    /// Deletes the user's rating for a book via `/api/v2/books/{bookId}/rating`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/rating/route.ts` (DELETE handler).
    public func deleteBookRating(for bookId: String) async -> Bool {
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)
            .appendingPathComponent("rating")

        do {
            let response = try await httpDelete(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            return evaluateResponse(
                response,
                methodName: "deleteBookRating",
                context: "rating removal for \(bookId)",
            ) == .success
        } catch {
            logStorytellerError("deleteBookRating", error: error)
            return false
        }
    }

    /// Fetches all of the user's ratings via `/api/v2/user/ratings`.
    /// Server implementation: `storyteller/web/src/app/api/v2/user/ratings/route.ts`.
    public func fetchUserRatings() async -> [UserBookRating]? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url = baseURL.appendingPathComponent("user/ratings")

        do {
            let response = try await httpGet(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            if Self.isFeatureUnavailable(response) {
                await recordNetworkSuccess(notifyWhenAlreadyConnected: false)
                return nil
            }
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchUserRatings",
                    context: "user ratings",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode([UserBookRating].self, from: response.data)
        } catch {
            logStorytellerError("fetchUserRatings", error: error)
            return nil
        }
    }

    /// Lists the user's shelves via `/api/v2/shelves`.
    /// Server implementation: `storyteller/web/src/app/api/v2/shelves/route.ts` (GET handler).
    public func fetchShelves() async -> [UserShelf]? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url = baseURL.appendingPathComponent("shelves")

        do {
            let response = try await httpGet(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            if Self.isFeatureUnavailable(response) {
                await recordNetworkSuccess(notifyWhenAlreadyConnected: false)
                return nil
            }
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchShelves",
                    context: "shelf listing",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode([UserShelf].self, from: response.data)
        } catch {
            logStorytellerError("fetchShelves", error: error)
            return nil
        }
    }

    /// Creates a shelf via `/api/v2/shelves`.
    /// Server implementation: `storyteller/web/src/app/api/v2/shelves/route.ts` (POST handler).
    public func createShelf(_ payload: UserShelfCreatePayload) async -> UserShelf? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url = baseURL.appendingPathComponent("shelves")

        do {
            let body = try Self.plainJSONEncoder().encode(payload)
            let response = try await httpPost(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: true),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(400),
            )
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "createShelf",
                    context: "shelf creation",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode(UserShelf.self, from: response.data)
        } catch {
            logStorytellerError("createShelf", error: error)
            return nil
        }
    }

    /// Fetches one shelf via `/api/v2/shelves/{uuid}`. Nonexistent or unowned shelves
    /// come back as 500, not 404, on every shelf route.
    /// Server implementation: `storyteller/web/src/app/api/v2/shelves/[uuid]/route.ts` (GET handler).
    public func fetchShelf(uuid: String) async -> UserShelf? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url =
            baseURL
            .appendingPathComponent("shelves")
            .appendingPathComponent(uuid)

        do {
            let response = try await httpGet(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(500),
            )
            if Self.isFeatureUnavailable(response) {
                await recordNetworkSuccess(notifyWhenAlreadyConnected: false)
                return nil
            }
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchShelf",
                    context: "shelf \(uuid)",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode(UserShelf.self, from: response.data)
        } catch {
            logStorytellerError("fetchShelf", error: error)
            return nil
        }
    }

    /// Patches a shelf via `/api/v2/shelves/{uuid}`.
    /// Server implementation: `storyteller/web/src/app/api/v2/shelves/[uuid]/route.ts` (PUT handler).
    public func updateShelf(
        uuid: String,
        with payload: UserShelfUpdatePayload,
    ) async -> UserShelf? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url =
            baseURL
            .appendingPathComponent("shelves")
            .appendingPathComponent(uuid)

        do {
            let body = try Self.plainJSONEncoder().encode(payload)
            let response = try await httpPut(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: true),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(400, 500),
            )
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "updateShelf",
                    context: "shelf update \(uuid)",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode(UserShelf.self, from: response.data)
        } catch {
            logStorytellerError("updateShelf", error: error)
            return nil
        }
    }

    /// Deletes a shelf via `/api/v2/shelves/{uuid}`.
    /// Server implementation: `storyteller/web/src/app/api/v2/shelves/[uuid]/route.ts` (DELETE handler).
    public func deleteShelf(uuid: String) async -> Bool {
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url =
            baseURL
            .appendingPathComponent("shelves")
            .appendingPathComponent(uuid)

        do {
            let response = try await httpDelete(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(500),
            )
            return evaluateResponse(
                response,
                methodName: "deleteShelf",
                context: "shelf removal \(uuid)",
            ) == .success
        } catch {
            logStorytellerError("deleteShelf", error: error)
            return false
        }
    }

    /// Fetches a shelf's server-computed membership via `/api/v2/shelves/{uuid}/books`.
    /// Server implementation: `storyteller/web/src/app/api/v2/shelves/[uuid]/books/route.ts` (GET handler).
    public func fetchShelfBooks(
        uuid: String,
        limit: Int? = nil,
        offset: Int? = nil,
    ) async -> [BookMetadata]? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url =
            baseURL
            .appendingPathComponent("shelves")
            .appendingPathComponent(uuid)
            .appendingPathComponent("books")

        var queryParameters: [String: String] = [:]
        if let limit {
            queryParameters["limit"] = String(limit)
        }
        if let offset {
            queryParameters["offset"] = String(offset)
        }

        do {
            let response = try await httpGet(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                queryParameters: queryParameters,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(500),
            )
            if Self.isFeatureUnavailable(response) {
                await recordNetworkSuccess(notifyWhenAlreadyConnected: false)
                return nil
            }
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchShelfBooks",
                    context: "shelf books \(uuid)",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            let wrapper = try decoder.decode(
                LenientArrayWrapper<StorytellerBookMetadataPayload>.self,
                from: response.data,
            )
            return wrapper.values.map { $0.scoped(to: sourceRecord.id) }
        } catch {
            logStorytellerError("fetchShelfBooks", error: error)
            return nil
        }
    }

    /// Appends books to a shelf's manual list via `/api/v2/shelves/{uuid}/books`.
    /// Server implementation: `storyteller/web/src/app/api/v2/shelves/[uuid]/books/route.ts` (POST handler).
    public func addBooksToShelf(uuid: String, bookUUIDs: [String]) async -> Bool {
        await mutateShelfBooks(
            uuid: uuid,
            bookUUIDs: bookUUIDs,
            remove: false,
            methodName: "addBooksToShelf",
        )
    }

    /// Removes books from a shelf's manual list via `/api/v2/shelves/{uuid}/books`.
    /// Server implementation: `storyteller/web/src/app/api/v2/shelves/[uuid]/books/route.ts` (DELETE handler).
    public func removeBooksFromShelf(uuid: String, bookUUIDs: [String]) async -> Bool {
        await mutateShelfBooks(
            uuid: uuid,
            bookUUIDs: bookUUIDs,
            remove: true,
            methodName: "removeBooksFromShelf",
        )
    }

    private func mutateShelfBooks(
        uuid: String,
        bookUUIDs: [String],
        remove: Bool,
        methodName: String,
    ) async -> Bool {
        guard !bookUUIDs.isEmpty else { return true }
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url =
            baseURL
            .appendingPathComponent("shelves")
            .appendingPathComponent(uuid)
            .appendingPathComponent("books")

        struct ShelfBooksBody: Encodable {
            let books: [String]
        }

        do {
            let body = try Self.plainJSONEncoder().encode(ShelfBooksBody(books: bookUUIDs))
            let headers = jsonRequestHeaders(for: token, hasBody: true)
            let allowed = Self.allowedStatuses(500)
            let response: HTTPResponse
            if remove {
                response = try await httpDelete(
                    url.absoluteString,
                    headers: headers,
                    body: body,
                    session: urlSession,
                    allowedStatusCodes: allowed,
                )
            } else {
                response = try await httpPost(
                    url.absoluteString,
                    headers: headers,
                    body: body,
                    session: urlSession,
                    allowedStatusCodes: allowed,
                )
            }
            return evaluateResponse(
                response,
                methodName: methodName,
                context: "shelf books \(uuid)",
            ) == .success
        } catch {
            logStorytellerError(methodName, error: error)
            return false
        }
    }

    /// Fetches a book's alignment report via `/api/v2/books/{bookId}/alignment-report`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/alignment-report/route.ts` (GET handler).
    public func fetchAlignmentReport(for bookId: String) async -> BookAlignmentReport? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)
            .appendingPathComponent("alignment-report")

        do {
            let response = try await httpGet(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            if Self.isFeatureUnavailable(response) {
                await recordNetworkSuccess(notifyWhenAlreadyConnected: false)
                return nil
            }
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchAlignmentReport",
                    context: "alignment report for \(bookId)",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode(
                BookAlignmentReport.self,
                from: response.data,
            )
        } catch {
            logStorytellerError("fetchAlignmentReport", error: error)
            return nil
        }
    }

    /// Replaces a book's alignment overrides via `/api/v2/books/{bookId}/alignment-report`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/alignment-report/route.ts` (PATCH handler).
    public func updateAlignmentOverrides(
        for bookId: String,
        overrides: AlignmentOverrides,
    ) async -> Bool {
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookId)
            .appendingPathComponent("alignment-report")

        do {
            let body = try Self.plainJSONEncoder().encode(overrides)
            let response = try await httpPatch(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: true),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            return evaluateResponse(
                response,
                methodName: "updateAlignmentOverrides",
                context: "alignment overrides for \(bookId)",
            ) == .success
        } catch {
            logStorytellerError("updateAlignmentOverrides", error: error)
            return false
        }
    }

    /// Fetches per-grade book counts via `/api/v2/books/alignment-facets`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/alignment-facets/route.ts`.
    public func fetchAlignmentFacets() async -> AlignmentFacets? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url = baseURL.appendingPathComponent("books/alignment-facets")

        do {
            let response = try await httpGet(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            if Self.isFeatureUnavailable(response) {
                await recordNetworkSuccess(notifyWhenAlreadyConnected: false)
                return nil
            }
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchAlignmentFacets",
                    context: "alignment facets",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode(AlignmentFacets.self, from: response.data)
        } catch {
            logStorytellerError("fetchAlignmentFacets", error: error)
            return nil
        }
    }

    /// Fetches a book's raw identifier relations via `/api/v2/books/{bookId}/identifiers`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/identifiers/route.ts` (GET handler).
    public func fetchBookIdentifiers(bookUUID: String) async -> [BookIdentifierRelation]? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookUUID)
            .appendingPathComponent("identifiers")

        do {
            let response = try await httpGet(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            if Self.isFeatureUnavailable(response) {
                await recordNetworkSuccess(notifyWhenAlreadyConnected: false)
                return nil
            }
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchBookIdentifiers",
                    context: "identifiers for \(bookUUID)",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode(
                [BookIdentifierRelation].self,
                from: response.data,
            )
        } catch {
            logStorytellerError("fetchBookIdentifiers", error: error)
            return nil
        }
    }

    /// REPLACES the book's whole identifier set (204 on success). Requires `bookUpdate`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/[bookId]/identifiers/route.ts` (PUT handler).
    public func replaceBookIdentifiers(
        bookUUID: String,
        identifiers: [IdentifierRelationPayload],
    ) async -> Bool {
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url =
            baseURL
            .appendingPathComponent("books")
            .appendingPathComponent(bookUUID)
            .appendingPathComponent("identifiers")

        struct ReplaceIdentifiersBody: Encodable {
            let identifiers: [IdentifierRelationPayload]
        }

        do {
            let body = try Self.plainJSONEncoder().encode(
                ReplaceIdentifiersBody(identifiers: identifiers)
            )
            let response = try await httpPut(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: true),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(400),
            )
            let succeeded =
                evaluateResponse(
                    response,
                    methodName: "replaceBookIdentifiers",
                    context: "identifier replace for \(bookUUID)",
                ) == .success
            if succeeded {
                await recordNetworkSuccess()
                _ = await fetchLibraryInformation()
            }
            return succeeded
        } catch {
            logStorytellerError("replaceBookIdentifiers", error: error)
            return false
        }
    }

    /// Lists the library's identifier types via `/api/v2/identifiers`.
    /// Server implementation: `storyteller/web/src/app/api/v2/identifiers/route.ts` (GET handler).
    public func fetchIdentifierTypes() async -> [IdentifierType]? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url = baseURL.appendingPathComponent("identifiers")

        do {
            let response = try await httpGet(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            if Self.isFeatureUnavailable(response) {
                await recordNetworkSuccess(notifyWhenAlreadyConnected: false)
                return nil
            }
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "fetchIdentifierTypes",
                    context: "identifier types",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode([IdentifierType].self, from: response.data)
        } catch {
            logStorytellerError("fetchIdentifierTypes", error: error)
            return nil
        }
    }

    /// Creates a custom identifier type (201 with the new type). `kind` is server-assigned
    /// only, so it is never sent (the server answers 400 when a body carries one).
    /// Server implementation: `storyteller/web/src/app/api/v2/identifiers/route.ts` (POST handler).
    public func createIdentifierType(
        name: String,
        urlTemplate: String? = nil,
    ) async -> IdentifierType? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url = baseURL.appendingPathComponent("identifiers")

        struct CreateIdentifierTypeBody: Encodable {
            let name: String
            let urlTemplate: String?
        }

        do {
            let body = try Self.plainJSONEncoder().encode(
                CreateIdentifierTypeBody(name: name, urlTemplate: urlTemplate)
            )
            let response = try await httpPost(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: true),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(400),
            )
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "createIdentifierType",
                    context: "identifier type creation",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try Self.plainJSONDecoder().decode(IdentifierType.self, from: response.data)
        } catch {
            logStorytellerError("createIdentifierType", error: error)
            return nil
        }
    }

    /// Deletes a custom identifier type; the server cascades away every identifier of
    /// that type and answers 400 for built-in types (non-null `kind`).
    /// Server implementation: `storyteller/web/src/app/api/v2/identifiers/[identifierId]/route.ts` (DELETE handler).
    public func deleteIdentifierType(typeUUID: String) async -> Bool {
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url = baseURL.appendingPathComponent("identifiers").appendingPathComponent(typeUUID)

        do {
            let response = try await httpDelete(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(400),
            )
            let succeeded =
                evaluateResponse(
                    response,
                    methodName: "deleteIdentifierType",
                    context: "identifier type \(typeUUID)",
                ) == .success
            if succeeded {
                await recordNetworkSuccess()
                _ = await fetchLibraryInformation()
            }
            return succeeded
        } catch {
            logStorytellerError("deleteIdentifierType", error: error)
            return false
        }
    }

    /// Deletes books in bulk via `/api/v2/books`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/route.ts` (DELETE handler).
    public func deleteBooks(_ bookUUIDs: [String], preventReImport: Bool? = nil) async -> Bool {
        guard !bookUUIDs.isEmpty else { return true }
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url = baseURL.appendingPathComponent("books")

        struct DeleteBooksBody: Encodable {
            let books: [String]
            let preventReImport: Bool?
        }

        do {
            let body = try Self.plainJSONEncoder().encode(
                DeleteBooksBody(books: bookUUIDs, preventReImport: preventReImport)
            )
            let response = try await httpDelete(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: true),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            let succeeded =
                evaluateResponse(
                    response,
                    methodName: "deleteBooks",
                    context: "bulk book removal",
                ) == .success
            if succeeded {
                _ = await fetchLibraryInformation()
            }
            return succeeded
        } catch {
            logStorytellerError("deleteBooks", error: error)
            return false
        }
    }

    /// Adds tags to books via `/api/v2/books/tags`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/tags/route.ts` (POST handler).
    public func addTags(_ tagNames: [String], toBooks bookIds: [String]) async -> Bool {
        guard !tagNames.isEmpty, !bookIds.isEmpty else { return true }
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url = baseURL.appendingPathComponent("books/tags")

        struct AddTagsBody: Encodable {
            let tags: [String]
            let books: [String]
        }

        do {
            let body = try Self.plainJSONEncoder().encode(
                AddTagsBody(tags: tagNames, books: bookIds)
            )
            let response = try await httpPost(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: true),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            return evaluateResponse(
                response,
                methodName: "addTags",
                context: "bulk tag add",
            ) == .success
        } catch {
            logStorytellerError("addTags", error: error)
            return false
        }
    }

    /// Adds creators to books in a role via `/api/v2/books/creators`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/creators/route.ts` (POST handler).
    public func addCreators(
        _ creatorNames: [String],
        toBooks bookIds: [String],
        role: CreatorRole,
    ) async -> Bool {
        await mutateBulkCreators(
            creatorNames,
            books: bookIds,
            role: role,
            remove: false,
            methodName: "addCreators",
        )
    }

    /// Removes creators from books in a role via `/api/v2/books/creators`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/creators/route.ts` (DELETE handler).
    public func removeCreators(
        _ creatorUUIDs: [String],
        fromBooks bookIds: [String],
        role: CreatorRole,
    ) async -> Bool {
        await mutateBulkCreators(
            creatorUUIDs,
            books: bookIds,
            role: role,
            remove: true,
            methodName: "removeCreators",
        )
    }

    private func mutateBulkCreators(
        _ creators: [String],
        books: [String],
        role: CreatorRole,
        remove: Bool,
        methodName: String,
    ) async -> Bool {
        guard !creators.isEmpty, !books.isEmpty else { return true }
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url = baseURL.appendingPathComponent("books/creators")

        struct CreatorsBody: Encodable {
            let creators: [String]
            let books: [String]
            let role: String
        }

        do {
            let body = try Self.plainJSONEncoder().encode(
                CreatorsBody(creators: creators, books: books, role: role.rawValue)
            )
            let headers = jsonRequestHeaders(for: token, hasBody: true)
            let allowed = Self.allowedStatuses()
            let response: HTTPResponse
            if remove {
                response = try await httpDelete(
                    url.absoluteString,
                    headers: headers,
                    body: body,
                    session: urlSession,
                    allowedStatusCodes: allowed,
                )
            } else {
                response = try await httpPost(
                    url.absoluteString,
                    headers: headers,
                    body: body,
                    session: urlSession,
                    allowedStatusCodes: allowed,
                )
            }
            return evaluateResponse(
                response,
                methodName: methodName,
                context: "bulk creator update",
            ) == .success
        } catch {
            logStorytellerError(methodName, error: error)
            return false
        }
    }

    /// Deletes processed cache files via `/api/v2/books/cache`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/cache/route.ts`.
    public func deleteProcessingCache(bookUUIDs: [String]? = nil) async -> Bool {
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url = baseURL.appendingPathComponent("books/cache")

        struct DeleteCacheBody: Encodable {
            let bookUuids: [String]?
        }

        do {
            let body: Data? =
                if let bookUUIDs {
                    try Self.plainJSONEncoder().encode(DeleteCacheBody(bookUuids: bookUUIDs))
                } else {
                    nil
                }
            let response = try await httpDelete(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: body != nil),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            return evaluateResponse(
                response,
                methodName: "deleteProcessingCache",
                context: "processing cache removal",
            ) == .success
        } catch {
            logStorytellerError("deleteProcessingCache", error: error)
            return false
        }
    }

    /// Creates a custom status via `/api/v2/statuses`.
    /// Server implementation: `storyteller/web/src/app/api/v2/statuses/route.ts` (POST handler).
    public func createStatus(name: String, label: String? = nil) async -> BookStatus? {
        guard let (baseURL, token) = await ensureAuthentication() else { return nil }
        let url = baseURL.appendingPathComponent("statuses")

        struct CreateStatusBody: Encodable {
            let name: String
            let label: String?
        }

        do {
            let body = try Self.plainJSONEncoder().encode(
                CreateStatusBody(name: name, label: label)
            )
            let response = try await httpPost(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: true),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            guard
                case .success = evaluateResponse(
                    response,
                    methodName: "createStatus",
                    context: "status creation",
                )
            else {
                return nil
            }
            await recordNetworkSuccess()
            return try decoder.decode(BookStatus.self, from: response.data)
        } catch {
            logStorytellerError("createStatus", error: error)
            return nil
        }
    }

    /// Updates a status's label or default flag via `/api/v2/statuses/{uuid}`.
    /// Server implementation: `storyteller/web/src/app/api/v2/statuses/[uuid]/route.ts` (PUT handler).
    public func updateStatusDefinition(
        uuid: String,
        label: String? = nil,
        isDefault: Bool? = nil,
    ) async -> Bool {
        guard label != nil || isDefault != nil else { return true }
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url =
            baseURL
            .appendingPathComponent("statuses")
            .appendingPathComponent(uuid)

        struct UpdateStatusBody: Encodable {
            let label: String?
            let isDefault: Bool?
        }

        do {
            let body = try Self.plainJSONEncoder().encode(
                UpdateStatusBody(label: label, isDefault: isDefault)
            )
            let response = try await httpPut(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: true),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            return evaluateResponse(
                response,
                methodName: "updateStatusDefinition",
                context: "status update \(uuid)",
            ) == .success
        } catch {
            logStorytellerError("updateStatusDefinition", error: error)
            return false
        }
    }

    /// Deletes a custom status via `/api/v2/statuses/{uuid}`.
    /// Server implementation: `storyteller/web/src/app/api/v2/statuses/[uuid]/route.ts` (DELETE handler).
    public func deleteStatus(uuid: String) async -> Bool {
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url =
            baseURL
            .appendingPathComponent("statuses")
            .appendingPathComponent(uuid)

        do {
            let response = try await httpDelete(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token),
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(500),
            )
            return evaluateResponse(
                response,
                methodName: "deleteStatus",
                context: "status removal \(uuid)",
            ) == .success
        } catch {
            logStorytellerError("deleteStatus", error: error)
            return false
        }
    }

    /// Updates the status for a set of books by status uuid via `/api/v2/books/status`.
    /// Server implementation: `storyteller/web/src/app/api/v2/books/status/route.ts` (PUT handler).
    public func updateStatus(
        forBooks bookIds: [String],
        toStatusUUID statusUUID: String,
    ) async -> Bool {
        guard !bookIds.isEmpty else { return true }
        guard let (baseURL, token) = await ensureAuthentication() else { return false }
        let url = baseURL.appendingPathComponent("books/status")

        struct StatusBody: Encodable {
            let books: [String]
            let status: String
        }

        do {
            let body = try Self.plainJSONEncoder().encode(
                StatusBody(books: bookIds, status: statusUUID)
            )
            let response = try await httpPut(
                url.absoluteString,
                headers: jsonRequestHeaders(for: token, hasBody: true),
                body: body,
                session: urlSession,
                allowedStatusCodes: Self.allowedStatuses(),
            )
            let succeeded =
                evaluateResponse(
                    response,
                    methodName: "updateStatus(toStatusUUID:)",
                    context: "bulk status update",
                ) == .success
            if succeeded {
                _ = await fetchLibraryInformation()
            }
            return succeeded
        } catch {
            logStorytellerError("updateStatus(toStatusUUID:)", error: error)
            return false
        }
    }
}

extension StorytellerActor: BookSourceActor {
    public var sourceRecord: BookSourceRecord {
        sourceRecordValue
    }

    public func resolveLocalMedia(
        for bookID: String,
        category: LocalMediaCategory,
    ) async -> ResolvedLocalMedia? {
        guard
            let url = await LocalMediaActor.shared.resolveAndRecordBookPath(
                for: BookID(sourceID: sourceRecordValue.id, uuid: bookID),
                category: category,
            )
        else {
            return nil
        }
        return ResolvedLocalMedia(
            bookID: BookID(sourceID: sourceRecordValue.id, uuid: bookID),
            category: category,
            url: url,
            kind: .cached,
        )
    }

    public func localAudioFiles(for bookID: String) async -> [URL] {
        guard let manifest = await resolveLocalMedia(for: bookID, category: .audio) else {
            return []
        }
        return packagedAudioFiles(inPackageAt: manifest.url.deletingLastPathComponent())
    }

    /// Audio tracks of a downloaded `.audiobook` package, in the manifest's reading order. A
    /// Storyteller package may nest tracks under subdirectories (per-disc folders, nested archives),
    /// so the manifest's `readingOrder` hrefs, resolved relative to the manifest directory, are the
    /// authoritative list and order. Falls back to a recursive scan if the manifest is unreadable.
    private func packagedAudioFiles(inPackageAt directory: URL) -> [URL] {
        let fm = FileManager.default
        let manifestURL = directory.appendingPathComponent("manifest.json", isDirectory: false)
        if let data = try? Data(contentsOf: manifestURL),
            let manifest = try? decoder.decode(PackagedAudiobookManifest.self, from: data)
        {
            let urls =
                manifest.readingOrder
                .compactMap { resolvePackagedHref($0.href, inPackageAt: directory) }
                .filter { fm.fileExists(atPath: $0.path) }
            if !urls.isEmpty {
                return urls
            }
        }

        let all =
            (fm.enumerator(
                at: directory,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles],
            )?.allObjects as? [URL]) ?? []
        return
            all
            .filter { AudioMediaTypes.isAudioFile($0) }
            .sorted {
                $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent)
                    == .orderedAscending
            }
    }

    private func resolvePackagedHref(_ href: String, inPackageAt rootURL: URL) -> URL? {
        let path = href.split(separator: "#", maxSplits: 1).first.map(String.init) ?? href
        if let url = URL(string: path), url.isFileURL {
            return url
        }
        let decoded = path.removingPercentEncoding ?? path
        guard !decoded.isEmpty else { return nil }
        if decoded.hasPrefix("/") {
            return URL(fileURLWithPath: decoded)
        }
        return rootURL.appendingPathComponent(decoded, isDirectory: false)
    }

    public func acceptBook(
        bookUUID: String,
        title _: String,
        ebook: StorytellerUploadAsset?,
        audiobooks: [StorytellerUploadAsset],
        readaloud: StorytellerUploadAsset?,
        collectionUUID: String?,
        onProgress: (@Sendable (Double) -> Void)?,
    ) async -> String? {
        // A readaloud-only book goes straight through the new-book upload: the server's ingest
        // scanner detects media overlays and registers the epub as the readaloud on its own, and
        // the replace-asset phase below both needs the separate bookUpdate permission and would
        // leave a stray created book behind if it failed.
        if ebook == nil, audiobooks.isEmpty, let readaloud {
            let uploaded = await uploadBookAssets(
                bookUUID: bookUUID,
                readaloud: readaloud,
                collectionUUID: collectionUUID,
                onProgress: onProgress,
            )
            return uploaded ? bookUUID : nil
        }

        // The new-book upload endpoint classifies every epub as the ebook, so a pre-aligned readaloud
        // (also an epub) can't go through it because it would overwrite the ebook. Upload ebook + audiobook
        // there, then attach the readaloud through the format-aware replace-asset endpoint.
        if readaloud != nil {
            // The attach step needs bookUpdate where the create only needed bookCreate; failing
            // it after phase 1 would leave a partial book behind, so refuse up front unless the
            // server confirms the permission.
            guard await currentUserCanUpdateBooks() else {
                debugLog(
                    "[StorytellerActor] acceptBook: bookUpdate not confirmed; refusing to create a book the readaloud attach could strand (\(bookUUID))"
                )
                return nil
            }
        }

        let ebookBytes = Int64(ebook?.data.count ?? 0)
        let audioBytes = audiobooks.reduce(Int64(0)) { $0 + Int64($1.data.count) }
        let readaloudBytes = Int64(readaloud?.data.count ?? 0)
        let totalBytes = max(ebookBytes + audioBytes + readaloudBytes, 1)
        let baseBytes = ebookBytes + audioBytes

        var phase1Progress: (@Sendable (Double) -> Void)?
        if let onProgress {
            phase1Progress = { fraction in
                onProgress(Double(baseBytes) * fraction / Double(totalBytes))
            }
        }

        let uploaded = await uploadBookAssets(
            bookUUID: bookUUID,
            ebook: ebook,
            audiobooks: audiobooks,
            readaloud: nil,
            collectionUUID: collectionUUID,
            onProgress: phase1Progress,
        )
        guard uploaded else { return nil }

        guard let readaloud else {
            onProgress?(1.0)
            return bookUUID
        }

        var phase2Progress: (@Sendable (Int64, Int64) -> Void)?
        if let onProgress {
            phase2Progress = { sent, total in
                guard total > 0 else { return }
                let phaseBytes = Double(sent) / Double(total) * Double(readaloudBytes)
                onProgress((Double(baseBytes) + phaseBytes) / Double(totalBytes))
            }
        }

        let result = await replaceBookAsset(
            readaloud,
            bookUUID: bookUUID,
            replaceMetadata: false,
            onSendProgress: phase2Progress,
        )
        switch result {
            case .success:
                onProgress?(1.0)
                return bookUUID
            case .notSupported:
                debugLog(
                    "[StorytellerActor] acceptBook: server cannot attach a readaloud (replace-asset unsupported); ebook + audiobook uploaded for \(bookUUID)"
                )
                return nil
            case .failed:
                debugLog("[StorytellerActor] acceptBook: readaloud attach failed for \(bookUUID)")
                return nil
        }
    }

    public func deleteAsset(
        _ bookID: String,
        category: LocalMediaCategory,
    ) async -> DeleteAssetResult {
        let result = await deleteBookAsset(bookID, type: storytellerFormat(for: category))
        if case .success(let updatedBook) = result {
            try? await LocalMediaActor.shared.deleteMedia(
                for: BookID(sourceID: sourceRecordValue.id, uuid: bookID),
                category: category,
            )
            // The DELETE response is authoritative for this book; write it straight to the cache so
            // the UI updates without a full multi-source library refetch.
            try? await LocalMediaActor.shared.updateSourceCacheBookMetadata(
                updatedBook
            )
        }
        return result
    }

    public func replaceAsset(
        _ asset: StorytellerUploadAsset,
        bookID: String,
        replaceMetadata: Bool,
        onProgress: (@Sendable (Double) -> Void)?,
    ) async -> ReplaceAssetResult {
        var onSendProgress: (@Sendable (Int64, Int64) -> Void)?
        if let onProgress {
            onSendProgress = { sent, total in
                guard total > 0 else { return }
                onProgress(Double(sent) / Double(total))
            }
        }
        let result = await replaceBookAsset(
            asset,
            bookUUID: bookID,
            replaceMetadata: replaceMetadata,
            onSendProgress: onSendProgress,
        )
        if case .success = result {
            try? await LocalMediaActor.shared.deleteMedia(
                for: BookID(sourceID: sourceRecordValue.id, uuid: bookID),
                category: localMediaCategory(for: asset.format),
            )
        }
        return result
    }

    public func packageAudiobook(for bookID: String) async -> URL? {
        guard let media = await resolveLocalMedia(for: bookID, category: .audio) else {
            return nil
        }
        let audioDirectory = media.url.deletingLastPathComponent()
        let fm = FileManager.default
        let stagingDir = fm.temporaryDirectory.appendingPathComponent(
            "storyteller-content-server",
            isDirectory: true,
        )
        let zipURL = stagingDir.appendingPathComponent(
            "\(bookID)-\(UUID().uuidString).audiobook"
        )

        do {
            try fm.createDirectory(at: stagingDir, withIntermediateDirectories: true)
            if fm.fileExists(atPath: zipURL.path) {
                try fm.removeItem(at: zipURL)
            }
            let archive = try Archive(url: zipURL, accessMode: .create)

            // Recurse: a package can nest tracks under subdirectories, and the manifest's hrefs are
            // relative to its directory, so entries must keep their relative paths.
            let base = audioDirectory.standardizedFileURL.path
            let files =
                ((fm.enumerator(
                    at: audioDirectory,
                    includingPropertiesForKeys: [.isRegularFileKey],
                    options: [.skipsHiddenFiles],
                )?.allObjects as? [URL]) ?? []).filter { !$0.hasDirectoryPath }

            for file in files {
                let relativePath = String(
                    file.standardizedFileURL.path.dropFirst(base.count).drop(while: { $0 == "/" })
                )
                // Audio is already compressed; store everything without re-deflating.
                try archive.addEntry(
                    with: relativePath,
                    fileURL: file,
                    compressionMethod: .none,
                )
            }

            // Storyteller reads `manifest.json`; the official Storyteller client reads
            // `manifest.audiobook-manifest`. Duplicate it so both can open the result.
            if let manifest = files.first(where: { $0.lastPathComponent == "manifest.json" }) {
                let alias = stagingDir.appendingPathComponent("\(UUID().uuidString).manifest")
                try fm.copyItem(at: manifest, to: alias)
                defer { try? fm.removeItem(at: alias) }
                try archive.addEntry(
                    with: "manifest.audiobook-manifest",
                    fileURL: alias,
                    compressionMethod: .none,
                )
            }

            return zipURL
        } catch {
            debugLog("[StorytellerActor] packageAudiobook failed for \(bookID): \(error)")
            try? fm.removeItem(at: zipURL)
            return nil
        }
    }

    private func storytellerFormat(for category: LocalMediaCategory) -> StorytellerBookFormat {
        switch category {
            case .ebook: return .ebook
            case .audio: return .audiobook
            case .synced: return .readaloud
        }
    }

    private func localMediaCategory(for format: StorytellerBookFormat) -> LocalMediaCategory {
        switch format {
            case .ebook: return .ebook
            case .audiobook: return .audio
            case .readaloud: return .synced
        }
    }
}

private struct PackagedAudiobookManifest: Decodable {
    struct Link: Decodable {
        let href: String
    }
    let readingOrder: [Link]
}

private enum StorytellerDownloadError: Error, Sendable {
    case missingTaskState
    case fileMoveFailed(underlying: Error)
}

private final class StorytellerDownloadDelegate: NSObject, URLSessionDownloadDelegate,
    URLSessionTaskDelegate
{
    var recordNetworkError: (@Sendable (Error) -> Void)?

    struct TaskState: Sendable {
        var continuation: AsyncThrowingStream<StorytellerDownloadEvent, Error>.Continuation
        let fallbackFilename: String
        let bookId: String
        let format: StorytellerBookFormat
        let failureHandler: @Sendable (StorytellerDownloadFailure) -> Void
        var filename: String?
        var expectedBytes: Int64?
        var contentType: String?
        var etag: String?
        var lastModified: String?
        var lastProgressTime: TimeInterval = 0
    }

    private let stateQueue = DispatchQueue(
        label: "dev.smoores.storyteller.storyteller.download-state"
    )
    private var states: [Int: TaskState] = [:]

    func register(task: URLSessionDownloadTask, state: TaskState) {
        stateQueue.sync {
            self.states[task.taskIdentifier] = state
        }
    }

    private func mutateState<Result>(
        for task: URLSessionTask,
        _ mutation: (inout TaskState) -> Result,
    ) -> (TaskState, Result)? {
        var updatedState: TaskState?
        var mutationResult: Result?
        stateQueue.sync {
            guard var state = states[task.taskIdentifier] else { return }
            let result = mutation(&state)
            states[task.taskIdentifier] = state
            updatedState = state
            mutationResult = result
        }
        if let updatedState, let mutationResult {
            return (updatedState, mutationResult)
        }
        return nil
    }

    private func removeState(for task: URLSessionTask) -> TaskState? {
        var removed: TaskState?
        stateQueue.sync {
            removed = states.removeValue(forKey: task.taskIdentifier)
        }
        return removed
    }

    #if canImport(ObjectiveC)
    @objc(urlSession:downloadTask:didReceiveResponse:completionHandler:)
    #endif
    private func handleDownloadResponse(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void,
    ) {
        guard let httpResponse = response as? HTTPURLResponse else {
            if let state = removeState(for: downloadTask) {
                state.failureHandler(.nonHTTPResponse)
                state.continuation.finish(throwing: StorytellerDownloadFailure.nonHTTPResponse)
            }
            completionHandler(.cancel)
            return
        }

        let statusCode = httpResponse.statusCode
        guard (200..<300).contains(statusCode) else {
            let failure: StorytellerDownloadFailure
            switch statusCode {
                case 401, 403:
                    failure = .unauthorized
                case 404:
                    failure = .notFound
                default:
                    failure = .unexpectedStatus(statusCode)
            }
            if let state = removeState(for: downloadTask) {
                state.failureHandler(failure)
                state.continuation.finish(throwing: failure)
            }
            completionHandler(.cancel)
            return
        }

        let contentDisposition = httpResponse.value(forHTTPHeaderField: "Content-Disposition")
        let resolvedFilename =
            mutateState(for: downloadTask) { state -> StorytellerDownloadEvent in
                let filename =
                    parseFilename(fromContentDisposition: contentDisposition)
                    ?? state.fallbackFilename
                let contentLengthString = httpResponse.value(forHTTPHeaderField: "Content-Length")
                let expectedLength = contentLengthString.flatMap { Int64($0) }
                state.filename = filename
                state.expectedBytes = expectedLength
                state.contentType = httpResponse.value(forHTTPHeaderField: "Content-Type")
                state.etag = httpResponse.value(forHTTPHeaderField: "Etag")
                state.lastModified = httpResponse.value(forHTTPHeaderField: "Last-Modified")
                return .response(
                    filename: filename,
                    expectedBytes: expectedLength,
                    contentType: state.contentType,
                    etag: state.etag,
                    lastModified: state.lastModified,
                )
            }

        if let (state, event) = resolvedFilename {
            state.continuation.yield(event)
            completionHandler(.allow)
        } else {
            completionHandler(.cancel)
        }
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64,
    ) {
        let now = Date().timeIntervalSinceReferenceDate
        let updateResult = mutateState(for: downloadTask) { state -> (Int64?, String, Bool) in
            if state.expectedBytes == nil, totalBytesExpectedToWrite > 0 {
                state.expectedBytes = totalBytesExpectedToWrite
            }
            let shouldEmit = now - state.lastProgressTime >= 0.1
            if shouldEmit {
                state.lastProgressTime = now
            }
            return (state.expectedBytes, state.bookId, shouldEmit)
        }

        guard let (state, (expectedBytes, _, shouldEmit)) = updateResult, shouldEmit else { return }
        state.continuation.yield(
            .progress(
                receivedBytes: totalBytesWritten,
                expectedBytes: expectedBytes,
            )
        )
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL,
    ) {
        let persistentURL = FileManager.default.temporaryDirectory.appendingPathComponent(
            UUID().uuidString
        )

        do {
            let fm = FileManager.default
            if fm.fileExists(atPath: persistentURL.path) {
                try fm.removeItem(at: persistentURL)
            }
            try fm.moveItem(at: location, to: persistentURL)
        } catch {
            if let state = removeState(for: downloadTask) {
                state.continuation.finish(
                    throwing: StorytellerDownloadError.fileMoveFailed(underlying: error)
                )
            }
            return
        }

        if let state = removeState(for: downloadTask) {
            state.continuation.yield(.finished(temporaryURL: persistentURL))
            state.continuation.finish()
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?,
    ) {
        guard let error else { return }

        if let urlError = error as? URLError {
            recordNetworkError?(urlError)
        }

        if let state = removeState(for: task) {
            if let urlError = error as? URLError, urlError.code == .cancelled {
                state.continuation.finish()
            } else {
                state.continuation.finish(throwing: error)
            }
        }
    }

    #if canImport(ObjectiveC)
    @objc(urlSession:task:didReceiveResponse:completionHandler:)
    #endif
    func handleTaskResponse(
        _ session: URLSession,
        task: URLSessionTask,
        response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void,
    ) {
        if let downloadTask = task as? URLSessionDownloadTask {
            handleDownloadResponse(
                session,
                downloadTask: downloadTask,
                response: response,
                completionHandler: completionHandler,
            )
        } else {
            completionHandler(.allow)
        }
    }
}

extension StorytellerDownloadDelegate: @unchecked Sendable {}

func logStorytellerError(_ message: String, error: Error) {
    debugLog("[StorytellerActor] \(message): \(error)")
}

func logDetailedDecodingError(_ error: DecodingError, data: Data) {
    switch error {
        case .typeMismatch(let type, let context):
            debugLog("[StorytellerActor] Type mismatch for type \(type)")
            debugLog(
                "[StorytellerActor] Coding path: \(context.codingPath.map { $0.stringValue }.joined(separator: " -> "))"
            )
            debugLog("[StorytellerActor] Context: \(context.debugDescription)")
            printJSONSnippet(data: data, codingPath: context.codingPath)
        case .valueNotFound(let type, let context):
            debugLog("[StorytellerActor] Value not found for type \(type)")
            debugLog(
                "[StorytellerActor] Coding path: \(context.codingPath.map { $0.stringValue }.joined(separator: " -> "))"
            )
            debugLog("[StorytellerActor] Context: \(context.debugDescription)")
            printJSONSnippet(data: data, codingPath: context.codingPath)
        case .keyNotFound(let key, let context):
            debugLog("[StorytellerActor] Key not found: \(key.stringValue)")
            debugLog(
                "[StorytellerActor] Coding path: \(context.codingPath.map { $0.stringValue }.joined(separator: " -> "))"
            )
            debugLog("[StorytellerActor] Context: \(context.debugDescription)")
        case .dataCorrupted(let context):
            debugLog("[StorytellerActor] Data corrupted")
            debugLog(
                "[StorytellerActor] Coding path: \(context.codingPath.map { $0.stringValue }.joined(separator: " -> "))"
            )
            debugLog("[StorytellerActor] Context: \(context.debugDescription)")
            printJSONSnippet(data: data, codingPath: context.codingPath)
        @unknown default:
            debugLog("[StorytellerActor] Unknown decoding error: \(error)")
    }
}

func printJSONSnippet(data: Data, codingPath: [CodingKey]) {
    guard let jsonData = try? JSONSerialization.jsonObject(with: data)
    else {
        debugLog("[StorytellerActor] Could not parse JSON for snippet")
        return
    }

    var current: Any = jsonData
    var pathSoFar: [String] = []

    for key in codingPath {
        pathSoFar.append(key.stringValue)
        if let dict = current as? [String: Any], let next = dict[key.stringValue] {
            current = next
        } else if let array = current as? [Any], let index = key.intValue, index < array.count {
            current = array[index]
        } else {
            debugLog(
                "[StorytellerActor] Could not navigate to path: \(pathSoFar.joined(separator: " -> "))"
            )
            return
        }
    }

    if let snippetData = try? JSONSerialization.data(
        withJSONObject: current,
        options: [.prettyPrinted, .sortedKeys],
    ),
        let snippetString = String(data: snippetData, encoding: .utf8)
    {
        debugLog(
            "[StorytellerActor] JSON at error location (\(pathSoFar.joined(separator: " -> "))):"
        )
        let lines = snippetString.split(separator: "\n")
        for (index, line) in lines.prefix(20).enumerated() {
            debugLog("[StorytellerActor]   \(line)")
            if index == 19 && lines.count > 20 {
                debugLog("[StorytellerActor]   ... (\(lines.count - 20) more lines)")
            }
        }
    }
}

func parseFilename(fromContentDisposition contentDisposition: String?) -> String? {
    guard let contentDisposition else { return nil }
    let components = contentDisposition.split(separator: ";")
    var foundFile: String? = nil
    for component in components {
        let trimmed = component.trimmingCharacters(in: .whitespaces)
        if trimmed.lowercased().hasPrefix("filename*=") {
            // RFC 5987 encoded
            let value = trimmed.dropFirst("filename*=".count)
            if let encoded = value.split(separator: "''", maxSplits: 1).last,
                let decoded = encoded.removingPercentEncoding
            {
                return decoded
            }
        }
        if trimmed.lowercased().hasPrefix("filename=") {
            let value = trimmed.dropFirst("filename=".count)
            foundFile = value.trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        }
    }
    return foundFile ?? nil
}
