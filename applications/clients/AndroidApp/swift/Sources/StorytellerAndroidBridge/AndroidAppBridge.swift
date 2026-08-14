// Kotlin-to-Storyteller entry points exported through JExtract.
import Foundation
import StorytellerKit

public func bootstrapAndroid(filesDirectory: String) async throws {
    try AndroidPlatformBootstrap.bootstrap(filesDirectory: filesDirectory)
    guard await StorytellerRuntime.start() else {
        throw AndroidBridgeError.runtimeStartupFailed
    }
}

public func androidNetworkAvailabilityDidChange(_ available: Bool) async throws {
    try requireAndroidBootstrap()
    await BookServiceActor.shared.networkAvailabilityDidChange(available)
}

public func liveSyncStatusJSON(requestID: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let status = await LiveReadingSyncActor.shared.status()
        return try encodeJSON(
            AndroidLiveSyncStatus(
                isActive: status.isActive,
                packetsSent: status.packetsSent,
                packetsReceived: status.packetsReceived,
                peerCount: status.peerCount,
                lastError: status.lastError,
            )
        )
    }
}

private struct AndroidLiveSyncStatus: Encodable {
    let isActive: Bool
    let packetsSent: Int
    let packetsReceived: Int
    let peerCount: Int
    let lastError: String?
}

// The log buffer is static state, deliberately reachable before bootstrap so
// startup failures stay inspectable.
public func debugLogJSON(requestID: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try encodeJSON(
            AndroidDebugLog(
                verbose: DebugLogBuffer.shared.isVerbose,
                messages: DebugLogBuffer.shared.getMessages(),
            )
        )
    }
}

public func clearDebugLog(requestID: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        DebugLogBuffer.shared.clear()
        return "{}"
    }
}

public func setVerboseLogging(requestID: String, enabled: Bool) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        DebugLogBuffer.shared.setVerbose(enabled)
        return "{}"
    }
}

private struct AndroidDebugLog: Encodable {
    let verbose: Bool
    let messages: [String]
}

public func liveSyncPeerFound(instanceID: String, host: String, port: Int32) async {
    AndroidNsdPeerDiscovery.shared.handlePeerFound(
        id: instanceID,
        host: host,
        port: UInt16(truncatingIfNeeded: port),
    )
}

public func liveSyncPeerLost(instanceID: String) async {
    AndroidNsdPeerDiscovery.shared.handlePeerLost(id: instanceID)
}

public func androidAppDidBecomeActive() async throws {
    try requireAndroidBootstrap()
    await BookServiceActor.shared.setActive(true, source: .app)
    await BookServiceActor.shared.startPeriodicLibraryRefresh()
}

public func androidAppDidEnterBackground() async throws {
    try requireAndroidBootstrap()
    await BookServiceActor.shared.stopPeriodicLibraryRefresh()
    await BookServiceActor.shared.setActive(false, source: .app)
}

public func storytellerSettingsJSON(requestID: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        return try await encodeStorytellerSettings()
    }
}

public func saveStorytellerSettings(
    requestID: String,
    serverURL: String,
    username: String,
    password: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try await saveStorytellerCredentials(
            serverURL: serverURL,
            username: username,
            password: password,
        )
        _ = await BookServiceActor.shared.librarySnapshot(policy: .refresh)
        return try await encodeStorytellerSettings()
    }
}

public func saveAndConnectStorytellerSettings(
    requestID: String,
    serverURL: String,
    username: String,
    password: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try await saveStorytellerCredentials(
            serverURL: serverURL,
            username: username,
            password: password,
        )
        var connected = false
        if let source = await BookServiceActor.shared.bookSources.first(where: {
            $0.kind == .storyteller
        }) {
            connected = await BookServiceActor.shared.connectBookSource(sourceID: source.id)
        }
        return try await encodeStorytellerSettings(connected: connected)
    }
}

private func saveStorytellerCredentials(
    serverURL: String,
    username: String,
    password: String,
) async throws {
    try requireAndroidBootstrap()

    let normalizedServerURL = try normalizeServerURL(serverURL)
    let trimmedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedUsername.isEmpty else {
        throw AndroidBridgeError.missingUsername
    }
    let existing = await BookServiceActor.shared.bookSources.first {
        $0.kind == .storyteller
    }
    let resolvedPassword: String
    if !password.isEmpty {
        resolvedPassword = password
    } else if let existing,
        let credentials = await BookServiceActor.shared.credentials(for: existing.id)
    {
        resolvedPassword = credentials.password
    } else {
        throw AndroidBridgeError.missingPassword
    }
    let configuration = BookSourceConfiguration(
        kind: .storyteller,
        name: existing?.name ?? "Storyteller",
        serverURL: normalizedServerURL,
        username: trimmedUsername,
        password: resolvedPassword,
    )

    let saved: Bool
    if let existing {
        saved = await BookServiceActor.shared.updateBookSource(
            id: existing.id,
            configuration: configuration,
        )
    } else {
        saved = await BookServiceActor.shared.createBookSource(configuration) != nil
    }
    guard saved else {
        throw AndroidBridgeError.couldNotSaveStorytellerSettings
    }

    await installAndroidConnectionObserver()
}

public func appSettingsJSON(requestID: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        return try await encodeAppSettings()
    }
}

public func saveAppSettings(requestID: String, json: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let update = try JSONDecoder().decode(
            AndroidAppSettingsUpdate.self,
            from: Data(json.utf8),
        )
        try await SettingsActor.shared.updateConfig(
            progressSyncIntervalSeconds: update.progressSyncIntervalSeconds,
            metadataRefreshIntervalSeconds: update.metadataRefreshIntervalSeconds,
            autoSyncToNewerServerPosition: update.autoSyncToNewerServerPosition,
            liveReadingSyncEnabled: update.liveReadingSyncEnabled,
            colorMode: update.colorMode,
            colorIntensity: update.colorIntensity,
            doubleCoverAlignment: update.doubleCoverAlignment,
            experimentalSettings: update.experimentalSettings,
        )
        await LiveReadingSyncActor.shared.reconcileWithSettings()
        return try await encodeAppSettings()
    }
}

private struct AndroidAppSettingsUpdate: Decodable {
    var progressSyncIntervalSeconds: Double?
    var metadataRefreshIntervalSeconds: Double?
    var autoSyncToNewerServerPosition: Bool?
    var liveReadingSyncEnabled: Bool?
    var colorMode: String?
    var colorIntensity: Double?
    var doubleCoverAlignment: String?
    var experimentalSettings: Bool?
}

private struct AndroidAppSettings: Encodable {
    let progressSyncIntervalSeconds: Double
    let metadataRefreshIntervalSeconds: Double
    let autoSyncToNewerServerPosition: Bool
    let liveReadingSyncEnabled: Bool
    let colorMode: String
    let colorIntensity: Double
    let doubleCoverAlignment: String
    let experimentalSettings: Bool
}

private func encodeAppSettings() async throws -> String {
    let config = await SettingsActor.shared.config
    let sync = config.sync
    let library = config.library
    return try encodeJSON(
        AndroidAppSettings(
            progressSyncIntervalSeconds: sync.progressSyncIntervalSeconds,
            metadataRefreshIntervalSeconds: sync.metadataRefreshIntervalSeconds,
            autoSyncToNewerServerPosition: sync.autoSyncToNewerServerPosition,
            liveReadingSyncEnabled: sync.liveReadingSyncEnabled,
            colorMode: library.colorMode,
            colorIntensity: library.colorIntensity,
            doubleCoverAlignment: library.doubleCoverAlignment,
            experimentalSettings: library.experimentalSettings,
        )
    )
}

public func librarySnapshotJSON(requestID: String, refresh: Bool) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try await makeLibrarySnapshotJSON(refresh: refresh)
    }
}

public func bookDetailsJSON(
    requestID: String,
    bookID: String,
    sourceID: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let id = BookID(sourceID: sourceID, uuid: bookID)
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        guard let book = snapshot.books.first(where: { $0.id == id }) else {
            throw AndroidBridgeError.bookNotFound(bookID)
        }
        return try encodeJSON(
            AndroidBookDetails(
                version: book.updatedAt ?? "",
                description: book.description.map { BookDescriptionText.plain(from: $0) },
                publicationDateDisplay: StorytellerDate.full(book.publicationDateValue),
                createdAtDisplay: StorytellerDate.dateTimeWithZone(book.createdAtValue),
                updatedAtDisplay: StorytellerDate.dateTimeWithZone(
                    StorytellerDate.parse(
                        book.updatedAt,
                        field: .updatedAt,
                        context: book.title,
                    )
                ),
            )
        )
    }
}

public func bookRatingContextJSON(
    requestID: String,
    bookID: String,
    sourceID: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let id = BookID(sourceID: sourceID, uuid: bookID)
        let source = await BookServiceActor.shared.bookSources.first { $0.id == sourceID }
        guard source?.kind == .storyteller else {
            return try encodeJSON(
                AndroidRatingContext(
                    editable: false,
                    record: nil,
                    dimensions: [],
                    reviewerName: nil,
                )
            )
        }
        async let fetchedRating = BookServiceActor.shared.fetchBookRating(for: id)
        async let fetchedPreferences = BookServiceActor.shared.fetchUserPreferences(
            sourceID: sourceID
        )
        async let fetchedCredentials = BookServiceActor.shared.credentials(for: sourceID)
        let (record, preferences, credentials) = await (
            fetchedRating, fetchedPreferences, fetchedCredentials,
        )
        let dimensions = PersonalRatingLogic.displayDimensions(
            preferred: preferences?.ratingDimensions,
            existingScores: record?.dimensions,
        )
        return try encodeJSON(
            AndroidRatingContext(
                editable: true,
                record: record.map(AndroidUserRating.init),
                dimensions: dimensions.map {
                    AndroidRatingDimension(id: $0.id, label: $0.label)
                },
                reviewerName: PersonalRatingLogic.reviewerDisplayName(credentials?.username),
            )
        )
    }
}

public func saveBookRating(
    requestID: String,
    bookID: String,
    sourceID: String,
    draftJSON: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let draft = try JSONDecoder().decode(
            AndroidRatingDraft.self,
            from: Data(draftJSON.utf8),
        )
        let id = BookID(sourceID: sourceID, uuid: bookID)
        guard
            var update = PersonalRatingLogic.buildUpdate(
                starsEdited: draft.starsEdited,
                stars: draft.stars,
                sendDimensions: draft.sendDimensions,
                dimensions: draft.dimensions,
                reviewChanged: draft.reviewChanged,
                review: draft.review,
            )
        else {
            return try encodeJSON(
                AndroidRatingSaveResult(outcome: "unchanged", record: nil, message: nil)
            )
        }

        if !PersonalRatingLogic.hasProvidedValue(update) {
            let current = await BookServiceActor.shared.fetchBookRating(for: id)
            guard
                let resolved = PersonalRatingLogic.resolveAllNullUpdate(
                    update,
                    currentRating: current?.rating,
                    currentReview: normalizedRatingReview(current),
                    currentDimensions: normalizedRatingDimensions(current),
                )
            else {
                let removed = await BookServiceActor.shared.deleteBookRating(for: id)
                return try encodeJSON(
                    AndroidRatingSaveResult(
                        outcome: removed ? "cleared" : "failed",
                        record: nil,
                        message: removed ? nil : "Could not remove the rating.",
                    )
                )
            }
            update = resolved
        }

        switch await BookServiceActor.shared.updateBookRating(for: id, update: update) {
            case .saved(let row):
                return try encodeJSON(
                    AndroidRatingSaveResult(
                        outcome: "saved",
                        record: AndroidUserRating(row),
                        message: nil,
                    )
                )
            case .cleared:
                return try encodeJSON(
                    AndroidRatingSaveResult(outcome: "cleared", record: nil, message: nil)
                )
            case .failed(let message):
                return try encodeJSON(
                    AndroidRatingSaveResult(
                        outcome: "failed",
                        record: nil,
                        message: message ?? "The rating could not be saved.",
                    )
                )
        }
    }
}

public func deleteBookRating(
    requestID: String,
    bookID: String,
    sourceID: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let id = BookID(sourceID: sourceID, uuid: bookID)
        let removed = await BookServiceActor.shared.deleteBookRating(for: id)
        return try encodeJSON(
            AndroidRatingSaveResult(
                outcome: removed ? "cleared" : "failed",
                record: nil,
                message: removed ? nil : "Could not remove the rating.",
            )
        )
    }
}

private func normalizedRatingReview(_ record: UserBookRating?) -> String? {
    guard let review = record?.review?.trimmingCharacters(in: .whitespacesAndNewlines),
        !review.isEmpty
    else { return nil }
    return review
}

private func normalizedRatingDimensions(_ record: UserBookRating?) -> [String: Double]? {
    guard let dimensions = record?.dimensions, !dimensions.isEmpty else { return nil }
    return dimensions
}

private struct AndroidRatingDimension: Encodable {
    let id: String
    let label: String
}

private struct AndroidUserRating: Encodable {
    let rating: Double?
    let review: String?
    let dimensions: [String: Double]?

    init(_ record: UserBookRating) {
        rating = record.rating
        review = record.review
        dimensions = record.dimensions
    }
}

private struct AndroidRatingContext: Encodable {
    let editable: Bool
    let record: AndroidUserRating?
    let dimensions: [AndroidRatingDimension]
    let reviewerName: String?
}

private struct AndroidRatingDraft: Decodable {
    let starsEdited: Bool
    let stars: Double?
    let sendDimensions: Bool
    let dimensions: [String: Double]?
    let reviewChanged: Bool
    let review: String
}

private struct AndroidRatingSaveResult: Encodable {
    let outcome: String
    let record: AndroidUserRating?
    let message: String?
}

public func bulkActionOptionsJSON(requestID: String, bookIDsJSON: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let ids = try decodeAndroidBookIDs(bookIDsJSON)
        let idSet = Set(ids)
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        let selected = snapshot.books.filter { idSet.contains($0.id) }

        let sourceIDs = Set(selected.map(\.sourceID))
        var storytellerSourceID: BookSourceID?
        if sourceIDs.count == 1, let sourceID = sourceIDs.first,
            await BookServiceActor.shared.bookSources
                .first(where: { $0.id == sourceID })?.kind == .storyteller
        {
            storytellerSourceID = sourceID
        }
        guard let sourceID = storytellerSourceID else {
            return try encodeJSON(
                AndroidBulkOptions(
                    singleServerSourceID: nil,
                    statuses: [],
                    collections: [],
                    removableCollections: [],
                    removableTags: [],
                    removableCreators: [:],
                )
            )
        }

        async let fetchedStatuses = BookServiceActor.shared.getAvailableStatuses(
            sourceID: sourceID
        )
        async let fetchedCollections = BookServiceActor.shared.fetchCollections(
            sourceID: sourceID
        )
        let (statuses, collections) = await (fetchedStatuses, fetchedCollections)

        var collectionsByUUID: [String: String] = [:]
        var tagsByUUID: [String: String] = [:]
        var creatorsByRole: [String: [String: String]] = [:]
        for book in selected {
            for summary in book.collections ?? [] {
                if let uuid = summary.uuid { collectionsByUUID[uuid] = summary.name }
            }
            for tag in book.tags ?? [] {
                if let uuid = tag.uuid { tagsByUUID[uuid] = tag.name }
            }
            for role in CreatorRole.allCases {
                let roled = (book.creators ?? []).filter { $0.role == role.rawValue }
                let named: [BookCreator]
                switch role {
                    case .author: named = (book.authors ?? []) + roled
                    case .narrator: named = (book.narrators ?? []) + roled
                    case .translator: named = roled
                }
                for creator in named {
                    if let uuid = creator.uuid, let name = creator.name {
                        creatorsByRole[role.rawValue, default: [:]][uuid] = name
                    }
                }
            }
        }

        return try encodeJSON(
            AndroidBulkOptions(
                singleServerSourceID: sourceID,
                statuses: statuses.map {
                    AndroidNamedUUID(uuid: $0.uuid, name: $0.name)
                },
                collections: (collections ?? []).map {
                    AndroidNamedUUID(uuid: $0.uuid, name: $0.name)
                },
                removableCollections: sortedNamedUUIDs(collectionsByUUID),
                removableTags: sortedNamedUUIDs(tagsByUUID),
                removableCreators: creatorsByRole.mapValues(sortedNamedUUIDs),
            )
        )
    }
}

public func bulkBookAction(requestID: String, actionJSON: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let action = try JSONDecoder().decode(
            AndroidBulkAction.self,
            from: Data(actionJSON.utf8),
        )
        let ids = action.bookIDs.map { BookID(sourceID: $0.sourceID, uuid: $0.uuid) }
        let service = BookServiceActor.shared
        let success: Bool
        switch action.action {
            case "addTags":
                success = await service.addTags(action.names ?? [], toBooks: ids)
            case "removeTags":
                guard let sourceID = action.sourceID else { throw AndroidBridgeError.invalidBulkAction }
                success = await service.removeTags(
                    action.uuids ?? [],
                    fromBooks: ids,
                    sourceID: sourceID,
                )
            case "addToCollections":
                guard let sourceID = action.sourceID else { throw AndroidBridgeError.invalidBulkAction }
                success = await service.addBooks(
                    ids,
                    toCollectionUUIDs: action.uuids ?? [],
                    sourceID: sourceID,
                )
            case "removeFromCollections":
                guard let sourceID = action.sourceID else { throw AndroidBridgeError.invalidBulkAction }
                success = await service.removeBooks(
                    ids,
                    fromCollectionUUIDs: action.uuids ?? [],
                    sourceID: sourceID,
                )
            case "addCreators":
                guard let sourceID = action.sourceID,
                    let role = CreatorRole(rawValue: action.role ?? "")
                else { throw AndroidBridgeError.invalidBulkAction }
                success = await service.addCreators(
                    action.names ?? [],
                    toBooks: ids,
                    role: role,
                    sourceID: sourceID,
                )
            case "removeCreators":
                guard let sourceID = action.sourceID,
                    let role = CreatorRole(rawValue: action.role ?? "")
                else { throw AndroidBridgeError.invalidBulkAction }
                success = await service.removeCreators(
                    action.uuids ?? [],
                    fromBooks: ids,
                    role: role,
                    sourceID: sourceID,
                )
            case "setStatus":
                // Glowup servers key the bulk endpoint by status uuid; older servers
                // resolve through the name-based path.
                if let uuid = action.statusUUID,
                    await service.updateStatus(forBooks: ids, toStatusUUID: uuid)
                {
                    success = true
                } else if let name = action.statusName {
                    success = await service.updateStatus(forBooks: ids, toStatusNamed: name)
                } else {
                    success = false
                }
            case "delete":
                success = await service.deleteBooks(
                    ids,
                    preventReImport: action.preventReImport ?? false,
                )
            default:
                throw AndroidBridgeError.invalidBulkAction
        }
        return try encodeJSON(AndroidBulkActionResult(success: success))
    }
}

public func alignmentReportJSON(
    requestID: String,
    bookID: String,
    sourceID: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let id = BookID(sourceID: sourceID, uuid: bookID)
        guard let report = await BookServiceActor.shared.fetchAlignmentReport(for: id) else {
            throw AndroidBridgeError.alignmentReportUnavailable
        }
        return try encodeJSON(report)
    }
}

public func saveAlignmentOverrides(
    requestID: String,
    bookID: String,
    sourceID: String,
    overridesJSON: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let state = try JSONDecoder().decode(
            AndroidAlignmentOverrideState.self,
            from: Data(overridesJSON.utf8),
        )
        let id = BookID(sourceID: sourceID, uuid: bookID)
        let overrides = AlignmentOverridesAssembly.assemble(
            markedOkChapters: state.markedOkChapters,
            excludedChapters: state.excludedChapters,
            intendedUnalignedChapters: state.intendedUnalignedChapters,
            excludedAudioFiles: state.excludedAudioFiles,
        )
        let success = await BookServiceActor.shared.updateAlignmentOverrides(
            for: id,
            overrides: overrides,
        )
        return try encodeJSON(AndroidBulkActionResult(success: success))
    }
}

private struct AndroidAlignmentOverrideState: Decodable {
    let markedOkChapters: [String: Bool]
    let excludedChapters: [String: Bool]
    let intendedUnalignedChapters: [String: Bool]
    let excludedAudioFiles: [String: Bool]
}

public func quickEditContextJSON(
    requestID: String,
    bookID: String,
    sourceID: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        guard await BookServiceActor.shared.bookSources
            .first(where: { $0.id == sourceID })?.kind == .storyteller
        else {
            return try encodeJSON(
                AndroidQuickEditContext(
                    editable: false,
                    hint: "Only books on a Storyteller server can be edited.",
                )
            )
        }
        switch await BookServiceActor.shared.checkBookUpdatePermission(sourceID: sourceID) {
            case .allowed:
                return try encodeJSON(AndroidQuickEditContext(editable: true, hint: nil))
            case .denied:
                return try encodeJSON(
                    AndroidQuickEditContext(
                        editable: false,
                        hint:
                            "Your account does not have permission to edit metadata on this server.",
                    )
                )
            case .error(let message):
                return try encodeJSON(
                    AndroidQuickEditContext(
                        editable: false,
                        hint: "Could not verify server permissions: \(message)",
                    )
                )
        }
    }
}

public func updateBookMetadata(
    requestID: String,
    bookID: String,
    sourceID: String,
    fieldsJSON: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let fields = try JSONDecoder().decode(
            AndroidQuickEditFields.self,
            from: Data(fieldsJSON.utf8),
        )
        let id = BookID(sourceID: sourceID, uuid: bookID)
        var payload = StorytellerBookUpdatePayload(uuid: bookID)

        fields.title.map { payload.title = $0 }
        fields.subtitle.map { payload.subtitle = $0 }
        fields.description.map { payload.description = $0 }
        fields.authors.map { payload.authors = InlineMetadataParsing.nameList(from: $0) }
        fields.narrators.map { payload.narrators = InlineMetadataParsing.nameList(from: $0) }
        fields.tags.map { payload.tags = InlineMetadataParsing.nameList(from: $0) }

        if let seriesName = fields.seriesName {
            let trimmed = seriesName.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                payload.series = []
            } else {
                let snapshot = await BookServiceActor.shared.librarySnapshot(
                    policy: .cachedOnly
                )
                let existing = snapshot.books.first { $0.id == id }?.series?
                    .first { $0.name == trimmed }
                let position = fields.seriesPosition
                    .flatMap { $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 }
                    .flatMap(Double.init)
                payload.series = [
                    StorytellerSeriesRelationUpdate(
                        uuid: existing?.uuid,
                        name: trimmed,
                        featured: nil,
                        position: position,
                    )
                ]
            }
        }

        if let publicationDate = fields.publicationDate {
            let trimmed = publicationDate.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                payload.publicationDate = .null
            } else if let wire = InlineMetadataParsing.publicationDateWireValue(trimmed) {
                payload.publicationDate = .value(wire)
            } else {
                return try encodeJSON(
                    AndroidQuickEditResult(
                        outcome: "invalid",
                        field: "publicationDate",
                        message: "Enter a year (2020) or a date (2020-01-15)",
                    )
                )
            }
        }

        if await BookServiceActor.shared.updateBook(payload, bookID: id) != nil {
            return try encodeJSON(
                AndroidQuickEditResult(outcome: "saved", field: nil, message: nil)
            )
        }
        let message = await BookServiceActor.shared.lastUpdateBookError(sourceID: sourceID)
        return try encodeJSON(
            AndroidQuickEditResult(
                outcome: "failed",
                field: nil,
                message: message ?? "The changes could not be saved.",
            )
        )
    }
}

private struct AndroidQuickEditContext: Encodable {
    let editable: Bool
    let hint: String?
}

private struct AndroidQuickEditFields: Decodable {
    var title: String?
    var subtitle: String?
    var description: String?
    var authors: String?
    var narrators: String?
    var seriesName: String?
    var seriesPosition: String?
    var publicationDate: String?
    var tags: String?
}

private struct AndroidQuickEditResult: Encodable {
    let outcome: String
    let field: String?
    let message: String?
}

public func bookIdentifierContextJSON(
    requestID: String,
    bookID: String,
    sourceID: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let id = BookID(sourceID: sourceID, uuid: bookID)
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        let book = snapshot.books.first { $0.id == id }
        let displayRows = (book?.displayIdentifiers ?? []).map {
            AndroidIdentifierDisplayRow(
                label: $0.identifier.displayName,
                value: $0.identifier.value,
                url: $0.url?.absoluteString,
                audiobookScoped: $0.audiobookScoped,
            )
        }

        guard await BookServiceActor.shared.bookSources
            .first(where: { $0.id == sourceID })?.kind == .storyteller
        else {
            return try encodeJSON(
                AndroidIdentifierContext(
                    editable: false,
                    failureMessage: nil,
                    displayRows: displayRows,
                    rows: [],
                    types: [],
                    scopes: ["book"],
                )
            )
        }

        var failureMessage: String?
        switch await BookServiceActor.shared.checkBookUpdatePermission(sourceID: sourceID) {
            case .allowed:
                break
            case .denied:
                failureMessage =
                    "Your account does not have permission to edit identifiers on this server."
            case .error(let message):
                failureMessage = "Could not verify server permissions: \(message)"
        }
        if let failureMessage {
            return try encodeJSON(
                AndroidIdentifierContext(
                    editable: false,
                    failureMessage: failureMessage,
                    displayRows: displayRows,
                    rows: [],
                    types: [],
                    scopes: ["book"],
                )
            )
        }

        async let identifiersFetch = BookServiceActor.shared.fetchBookIdentifiers(for: id)
        async let typesFetch = BookServiceActor.shared.fetchIdentifierTypes(sourceID: sourceID)
        let (identifiers, fetchedTypes) = await (identifiersFetch, typesFetch)

        guard let fetchedTypes else {
            return try encodeJSON(
                AndroidIdentifierContext(
                    editable: false,
                    failureMessage: "This server does not support identifiers.",
                    displayRows: displayRows,
                    rows: [],
                    types: [],
                    scopes: ["book"],
                )
            )
        }

        var scopes = ["book"]
        if book?.ebook?.uuid != nil { scopes.append("ebook") }
        if book?.audiobook?.uuid != nil { scopes.append("audiobook") }
        if book?.readaloud?.uuid != nil { scopes.append("readaloud") }

        let rows = (identifiers ?? []).map { relation -> AndroidIdentifierRow in
            let scope =
                relation.ebookUuid != nil
                ? "ebook"
                : relation.audiobookUuid != nil
                    ? "audiobook" : relation.readaloudUuid != nil ? "readaloud" : "book"
            return AndroidIdentifierRow(
                typeUuid: relation.identifierTypeUuid,
                value: relation.value,
                scope: scope,
                formatUuid: relation.ebookUuid ?? relation.audiobookUuid
                    ?? relation.readaloudUuid,
            )
        }

        return try encodeJSON(
            AndroidIdentifierContext(
                editable: true,
                failureMessage: nil,
                displayRows: displayRows,
                rows: rows,
                types: fetchedTypes
                    .map { AndroidIdentifierType(uuid: $0.uuid, displayName: $0.displayName) }
                    .sorted {
                        $0.displayName.localizedCaseInsensitiveCompare($1.displayName)
                            == .orderedAscending
                    },
                scopes: scopes,
            )
        )
    }
}

public func saveBookIdentifiers(
    requestID: String,
    bookID: String,
    sourceID: String,
    rowsJSON: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let id = BookID(sourceID: sourceID, uuid: bookID)
        let rows = try JSONDecoder().decode(
            [AndroidIdentifierRow].self,
            from: Data(rowsJSON.utf8),
        )
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        let book = snapshot.books.first { $0.id == id }

        func formatUuid(for scope: String) -> String? {
            switch scope {
                case "ebook": return book?.ebook?.uuid
                case "audiobook": return book?.audiobook?.uuid
                case "readaloud": return book?.readaloud?.uuid
                default: return nil
            }
        }

        let payload = rows.compactMap { row -> IdentifierRelationPayload? in
            let value = row.value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let typeUuid = row.typeUuid, !value.isEmpty else { return nil }
            let uuid = row.formatUuid ?? formatUuid(for: row.scope)
            return IdentifierRelationPayload(
                identifierTypeUuid: typeUuid,
                value: value,
                ebookUuid: row.scope == "ebook" ? uuid : nil,
                audiobookUuid: row.scope == "audiobook" ? uuid : nil,
                readaloudUuid: row.scope == "readaloud" ? uuid : nil,
            )
        }
        let success = await BookServiceActor.shared.replaceBookIdentifiers(
            for: id,
            identifiers: payload,
        )
        return try encodeJSON(AndroidBulkActionResult(success: success))
    }
}

public func createIdentifierType(
    requestID: String,
    sourceID: String,
    name: String,
    urlTemplate: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let trimmedTemplate = urlTemplate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            let created = await BookServiceActor.shared.createIdentifierType(
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                urlTemplate: trimmedTemplate.isEmpty ? nil : trimmedTemplate,
                sourceID: sourceID,
            )
        else {
            throw AndroidBridgeError.identifierTypeCreationFailed
        }
        return try encodeJSON(
            AndroidIdentifierType(uuid: created.uuid, displayName: created.displayName)
        )
    }
}

private struct AndroidIdentifierDisplayRow: Encodable {
    let label: String
    let value: String
    let url: String?
    let audiobookScoped: Bool
}

private struct AndroidIdentifierRow: Codable {
    let typeUuid: String?
    let value: String
    let scope: String
    let formatUuid: String?
}

private struct AndroidIdentifierType: Encodable {
    let uuid: String
    let displayName: String
}

private struct AndroidIdentifierContext: Encodable {
    let editable: Bool
    let failureMessage: String?
    let displayRows: [AndroidIdentifierDisplayRow]
    let rows: [AndroidIdentifierRow]
    let types: [AndroidIdentifierType]
    let scopes: [String]
}

private func decodeAndroidBookIDs(_ json: String) throws -> [BookID] {
    let refs = try JSONDecoder().decode([AndroidBookIDRef].self, from: Data(json.utf8))
    return refs.map { BookID(sourceID: $0.sourceID, uuid: $0.uuid) }
}

private func sortedNamedUUIDs(_ byUUID: [String: String]) -> [AndroidNamedUUID] {
    byUUID
        .map { AndroidNamedUUID(uuid: $0.key, name: $0.value) }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
}

private struct AndroidBookIDRef: Decodable {
    let uuid: String
    let sourceID: String
}

private struct AndroidNamedUUID: Encodable {
    let uuid: String?
    let name: String
}

private struct AndroidBulkOptions: Encodable {
    let singleServerSourceID: String?
    let statuses: [AndroidNamedUUID]
    let collections: [AndroidNamedUUID]
    let removableCollections: [AndroidNamedUUID]
    let removableTags: [AndroidNamedUUID]
    let removableCreators: [String: [AndroidNamedUUID]]
}

private struct AndroidBulkAction: Decodable {
    let action: String
    let bookIDs: [AndroidBookIDRef]
    let sourceID: String?
    let names: [String]?
    let uuids: [String]?
    let role: String?
    let statusUUID: String?
    let statusName: String?
    let preventReImport: Bool?
}

private struct AndroidBulkActionResult: Encodable {
    let success: Bool
}

private func makeLibrarySnapshotJSON(refresh: Bool) async throws -> String {
    try requireAndroidBootstrap()

    let snapshot = await BookServiceActor.shared.librarySnapshot(
        policy: refresh ? .refresh : .cachedOnly
    )
    let progress = await ProgressSyncActor.shared.getAllBookProgress()
    let downloads = await DownloadManager.shared.incompleteDownloads
    let downloadsByBookID = Dictionary(grouping: downloads, by: \.bookID)
    var books: [AndroidBook] = []
    books.reserveCapacity(snapshot.books.count)

    for book in snapshot.books {
        let sourceID = book.sourceID

        let paths = snapshot.mediaPaths[book.id]
        let cachedPaths = snapshot.cachedMediaPaths[book.id]
        if let owner = paths?.playbackOwner {
            debugLog(
                "[AutoClassify] \(book.title): owner=\(owner.rawValue) "
                    + "audio=\(paths?.audioPath != nil) synced=\(paths?.syncedPath != nil) "
                    + "availAudio=\(book.hasAvailableAudiobook) availReadaloud=\(book.hasAvailableReadaloud)"
            )
        }
        let media = [
            androidMedia(
                bookID: book.id,
                category: .ebook,
                info: AndroidMediaInfo(asset: book.ebook),
                available: book.hasAvailableEbook,
                paths: paths,
                cachedPaths: cachedPaths,
                downloadsByBookID: downloadsByBookID,
            ),
            androidMedia(
                bookID: book.id,
                category: .audio,
                info: AndroidMediaInfo(asset: book.audiobook),
                available: book.hasAvailableAudiobook,
                paths: paths,
                cachedPaths: cachedPaths,
                downloadsByBookID: downloadsByBookID,
            ),
            androidMedia(
                bookID: book.id,
                category: .synced,
                info: AndroidMediaInfo(readaloud: book.readaloud),
                available: book.hasAvailableReadaloud,
                paths: paths,
                cachedPaths: cachedPaths,
                downloadsByBookID: downloadsByBookID,
            ),
        ].compactMap { $0 }

        books.append(
            AndroidBook(
                id: book.uuid,
                sourceID: sourceID,
                title: book.title,
                subtitle: book.subtitle,
                authors: book.authors?.compactMap(\.name).joined(separator: ", ") ?? "",
                authorNames: book.authors?.compactMap(\.name) ?? [],
                narrators: book.narrators?.compactMap(\.name) ?? [],
                series: book.series?.map {
                    AndroidSeries(name: $0.name, position: $0.position.map(Double.init))
                } ?? [],
                tags: book.tagNames,
                collections: book.collections?.map(\.name) ?? [],
                language: book.language,
                rating: book.rating,
                progress: book.status?.name.lowercased() == "read"
                    ? 1
                    : (progress[book.id]?.progressFraction ?? 0),
                pageCount: book.pageCountValue,
                durationDisplay: book.durationDisplay,
                durationSeconds: book.sortableDuration,
                sortTitle: book.sortableTitle,
                sortAuthor: book.sortableAuthor,
                sortNarrator: book.sortableNarrator,
                sortSeriesName: book.sortableSeries.name,
                sortSeriesPosition: Double(book.sortableSeries.position),
                sortAdded: book.sortableAdded,
                sortLastRead: book.sortableLastRead,
                sortPublicationDate: book.sortablePublicationDate,
                publicationYear: book.sortablePublicationYear,
                status: book.status?.name,
                fileSizeBytes: book.sortableFileSize,
                coverVersion: book.updatedAt ?? "",
                media: media,
                playbackOwner: paths?.playbackOwner?.rawValue,
                showOnItem: Dictionary(
                    uniqueKeysWithValues: ShowOnItemField.explicitFields.map {
                        ($0.rawValue, $0.displayValue(for: book))
                    }
                ),
                alignmentSummary: book.alignmentSummary,
            )
        )
    }

    let status = connectionFields(await androidStorytellerConnectionStatus())
    let homeSections = HomeSectionDeriver.sections(
        books: snapshot.books,
        progress: progress,
    ).map { section in
        AndroidHomeSection(
            kind: section.kind.rawValue,
            title: section.kind.title,
            bookIDs: section.books.map(\.id),
        )
    }
    return try encodeJSON(
        AndroidLibrary(
            books: books,
            homeSections: homeSections,
            sourceStatus: status.status,
            sourceMessage: status.message,
        )
    )
}

public func coverResponseBytes(
    requestID: String,
    bookID: String,
    sourceID: String,
    version: String,
    audio: Bool,
    width: Int32,
    height: Int32,
    refresh: Bool,
) async {
    do {
        try requireAndroidBootstrap()
        guard width > 0, height > 0 else {
            throw AndroidBridgeError.invalidCoverSize
        }

        let id = BookID(sourceID: sourceID, uuid: bookID)
        let response = await BookServiceActor.shared.loadCover(
            for: id,
            audio: audio,
            width: Int(width),
            height: Int(height),
            version: version.isEmpty ? nil : version,
            allowNetwork: await BookServiceActor.shared.connectionStatus(sourceID: id.sourceID)
                == .connected,
            policy: refresh ? .forceRefresh : .cachedThenFetch,
        )

        switch response {
            case .cached(let data):
                deliverAndroidCoverPayload(
                    requestID: requestID,
                    data: data,
                    shouldPersist: false,
                )
            case .fetched(let cover):
                deliverAndroidCoverPayload(
                    requestID: requestID,
                    data: cover.data,
                    shouldPersist: true,
                )
            case .missing, .skippedOffline:
                deliverAndroidCoverPayload(
                    requestID: requestID,
                    data: Data(),
                    shouldPersist: false,
                )
        }
    } catch {
        deliverAndroidCoverError(requestID: requestID, error: error)
    }
}

public func persistCoverBytes(
    bookID: String,
    sourceID: String,
    audio: Bool,
    data: [UInt8],
) async throws {
    try requireAndroidBootstrap()
    await BookServiceActor.shared.persistCachedCover(
        bookID: BookID(sourceID: sourceID, uuid: bookID),
        audio: audio,
        data: Data(data),
    )
}

public func coverSurfaceColorARGB(
    rgbaBase64: String,
    dark: Bool,
    colorMode: String,
    colorIntensity: Double,
) throws -> Int32 {
    guard let data = Data(base64Encoded: rgbaBase64) else {
        throw AndroidBridgeError.invalidCoverPixels
    }
    let palette = adjustedPaletteValues(
        rgbaPixels: Array(data),
        colorMode: colorMode,
        colorIntensity: colorIntensity,
    )
    return Int32(bitPattern: argb(dark ? palette.surface : palette.lightSurface))
}

public func coverPaletteJSON(
    rgbaBase64: String,
    dark: Bool,
    colorMode: String,
    colorIntensity: Double,
) throws -> String {
    guard let data = Data(base64Encoded: rgbaBase64) else {
        throw AndroidBridgeError.invalidCoverPixels
    }
    let palette = adjustedPaletteValues(
        rgbaPixels: Array(data),
        colorMode: colorMode,
        colorIntensity: colorIntensity,
    )
    return try encodeJSON(
        AndroidCoverPalette(
            surface: argb(dark ? palette.surface : palette.lightSurface),
            accent: argb(palette.accent),
            brightAccent: argb(palette.brightAccent),
            deepAccent: argb(palette.deepAccent),
            mutedAccent: argb(palette.mutedAccent),
            accentBackground: argb(palette.accentBackground),
            contentBackground: argb(
                dark ? palette.contentBackground : palette.lightContentBackground
            ),
            cardBackground: argb(dark ? palette.cardBackground : palette.lightCardBackground),
            cardBorder: argb(dark ? palette.cardBorder : palette.lightCardBorder),
            ratingAccent: argb(dark ? palette.brightAccent : palette.deepAccent),
        )
    )
}

private func adjustedPaletteValues(
    rgbaPixels: [UInt8],
    colorMode: String,
    colorIntensity: Double,
) -> CoverDerivedPaletteValues {
    let mode = CoverColorMode(rawValue: colorMode) ?? .full
    let surfaceHSB = CoverColorAverager.surfaceHSB(rgbaPixels: rgbaPixels)
        ?? CoverPaletteAdjustment.fallbackSurfaceHSB
    return CoverPaletteAdjustment.adjustedValues(
        surfaceHSB: surfaceHSB,
        mode: mode,
        intensity: colorIntensity,
    )
}

private func argb(_ color: CoverPaletteColor) -> UInt32 {
    let rgb = color.rgb8
    return UInt32(color.alpha8) << 24 | UInt32(rgb.red) << 16 | UInt32(rgb.green) << 8
        | UInt32(rgb.blue)
}

public func downloadBook(
    bookID: String,
    sourceID: String,
    category: String,
) async throws {
    try requireAndroidBootstrap()
    let bookID = BookID(sourceID: sourceID, uuid: bookID)

    guard let mediaCategory = LocalMediaCategory(rawValue: category) else {
        throw AndroidBridgeError.invalidMediaCategory(category)
    }

    let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
    guard let book = snapshot.books.first(where: { $0.id == bookID }) else {
        throw AndroidBridgeError.bookNotFound(bookID.uuid)
    }
    let available =
        switch mediaCategory {
            case .ebook: book.hasAvailableEbook
            case .audio: book.hasAvailableAudiobook
            case .synced: book.hasAvailableReadaloud
        }
    guard available else {
        throw AndroidBridgeError.mediaUnavailable(category: category, bookID: bookID.uuid)
    }

    await DownloadManager.shared.startDownload(for: book, category: mediaCategory)
}

public func cancelBookDownload(
    bookID: String,
    sourceID: String,
    category: String,
) async throws {
    try requireAndroidBootstrap()
    let bookID = BookID(sourceID: sourceID, uuid: bookID)

    guard let mediaCategory = LocalMediaCategory(rawValue: category) else {
        throw AndroidBridgeError.invalidMediaCategory(category)
    }
    await DownloadManager.shared.cancelDownload(for: bookID, category: mediaCategory)
}

public func deleteBookDownload(
    bookID: String,
    sourceID: String,
    category: String,
) async throws {
    try requireAndroidBootstrap()
    let bookID = BookID(sourceID: sourceID, uuid: bookID)

    guard let mediaCategory = LocalMediaCategory(rawValue: category) else {
        throw AndroidBridgeError.invalidMediaCategory(category)
    }
    try await BookServiceActor.shared.deleteCachedMedia(
        for: bookID,
        category: mediaCategory,
    )
}

public func openAudiobook(bookID: String, sourceID: String) async throws {
    try requireAndroidBootstrap()
    try await AndroidAudiobookSession.shared.open(
        bookID: BookID(sourceID: sourceID, uuid: bookID)
    )
}

public func closeAudiobook() async {
    await AndroidAudiobookSession.shared.close()
}

public func controlAudiobook(command: String, value: Double, text: String) async throws {
    try requireAndroidBootstrap()
    try await AndroidAudiobookSession.shared.control(
        command: command,
        value: value,
        text: text,
    )
}

public func openHeadlessPlayback(
    bookID: String,
    sourceID: String,
    category: String,
) async throws {
    try requireAndroidBootstrap()
    guard let mediaCategory = LocalMediaCategory(rawValue: category) else {
        throw AndroidBridgeError.invalidMediaCategory(category)
    }
    try await AndroidAudiobookSession.shared.openHeadless(
        bookID: BookID(sourceID: sourceID, uuid: bookID),
        category: mediaCategory,
    )
}

public func cyclePlaybackRate() async throws {
    try requireAndroidBootstrap()
    await AudioSessionActor.shared.cyclePlaybackRate()
}

public func sessionTogglePlayPause() async throws {
    try requireAndroidBootstrap()
    try await AudioSessionActor.shared.transport(.togglePlayPause)
}

public func sessionClose() async throws {
    try requireAndroidBootstrap()
    if case .readaloud(let bookID) = await AudioSessionActor.shared.currentSessionKind() {
        await ReadingSessionStore.shared.endIfViewDetached(for: bookID)
    }
    await AudioSessionActor.shared.closeCurrent()
}

public func openReader(
    requestID: String,
    bookID: String,
    sourceID: String,
    mode: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        return try await AndroidReaderSession.shared.open(
            bookID: BookID(sourceID: sourceID, uuid: bookID),
            mode: mode,
        )
    }
}

public func closeReader() async {
    await AndroidReaderSession.shared.close()
}

public func readerMessageFromJS(name: String, body: String) async {
    await AndroidReaderSession.shared.handleMessage(name: name, body: body)
}

public func readerJSResult(requestID: String, result: String, error: String) async {
    await AndroidReaderSession.shared.completeJSRequest(
        requestID: requestID,
        result: result,
        error: error,
    )
}

public func readingTimelineJSON(requestID: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        return try await AndroidReaderSession.shared.readingTimelineJSON()
    }
}

public func clearReadingTimeline(requestID: String, visitIDsJSON: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let ids = (try? JSONDecoder().decode([String].self, from: Data(visitIDsJSON.utf8))) ?? []
        await AndroidReaderSession.shared.clearReadingTimeline(visitIDs: ids)
        return "{}"
    }
}

public func readerControl(command: String, value: Double, text: String) async throws {
    try requireAndroidBootstrap()
    try await AndroidReaderSession.shared.control(command: command, value: value, text: text)
}

public func startLibraryObservation() async throws {
    try requireAndroidBootstrap()
    guard androidObserverStore.claimInstallation() else { return }

    _ = await BookServiceActor.shared.addLibraryCacheObserver {
        notifyAndroidLibrarySnapshotDidChange()
    }
    _ = await ProgressSyncActor.shared.addObserver {
        Task {
            notifyAndroidLibrarySnapshotDidChange()
        }
    }
    _ = await DownloadManager.shared.addObserver { records in
        let updates = records.map { record in
            AndroidDownloadUpdate(
                bookID: record.bookID.uuid,
                sourceID: record.bookID.sourceID,
                category: record.category.rawValue,
                state: downloadStateName(record.state) ?? "queued",
                progress: downloadProgress(record),
            )
        }
        guard let payload = try? encodeJSON(updates) else { return }
        notifyAndroidDownloadStateDidChange(payload)
    }
    await AndroidSessionState.startObserving()
    await installAndroidConnectionObserver()
}

private struct AndroidBook: Encodable {
    let id: String
    let sourceID: String
    let title: String
    let subtitle: String?
    let authors: String
    let authorNames: [String]
    let narrators: [String]
    let series: [AndroidSeries]
    let tags: [String]
    let collections: [String]
    let language: String?
    let rating: Double?
    let progress: Double
    let pageCount: Int?
    let durationDisplay: String
    let durationSeconds: Double
    let sortTitle: String
    let sortAuthor: String
    let sortNarrator: String
    let sortSeriesName: String
    let sortSeriesPosition: Double
    let sortAdded: String
    let sortLastRead: String
    let sortPublicationDate: String
    let publicationYear: String
    let status: String?
    let fileSizeBytes: Int
    let coverVersion: String
    let media: [AndroidMedia]
    let playbackOwner: String?
    let showOnItem: [String: String]
    let alignmentSummary: AlignmentSummary?
}

private struct AndroidBookDetails: Encodable {
    let version: String
    let description: String?
    let publicationDateDisplay: String
    let createdAtDisplay: String
    let updatedAtDisplay: String
}

private struct AndroidSeries: Encodable {
    let name: String
    let position: Double?
}

private struct AndroidMedia: Encodable {
    let category: String
    let format: String?
    let pageCount: Int?
    let durationDisplay: String
    let fileSizeDisplay: String
    let status: String?
    let downloaded: Bool
    let removable: Bool
    let downloadState: String?
    let downloadProgress: Double?
}

private struct AndroidDownloadUpdate: Encodable {
    let bookID: String
    let sourceID: String
    let category: String
    let state: String
    let progress: Double?
}

private struct AndroidSourceStatus: Encodable {
    let status: String
    let message: String?
}

private struct AndroidMediaInfo {
    let format: String?
    let pageCount: Int?
    let durationDisplay: String
    let fileSizeDisplay: String
    let status: String?

    init(asset: BookAsset?) {
        if let path = asset?.filepath {
            let value = URL(fileURLWithPath: path).pathExtension.uppercased()
            format = value.isEmpty ? nil : value
        } else {
            format = nil
        }
        pageCount = asset?.pageCount
        if let duration = asset?.duration, duration > 0 {
            durationDisplay = BookMetadata.formatDuration(seconds: Int(duration.rounded()))
        } else {
            durationDisplay = ""
        }
        if let size = asset?.fileSize, size > 0 {
            fileSizeDisplay = BookMetadata.formatFileSize(bytes: size)
        } else {
            fileSizeDisplay = ""
        }
        status = nil
    }

    init(readaloud: BookReadaloud?) {
        format = nil
        pageCount = readaloud?.pageCount
        if let duration = readaloud?.duration, duration > 0 {
            durationDisplay = BookMetadata.formatDuration(seconds: Int(duration.rounded()))
        } else {
            durationDisplay = ""
        }
        if let size = readaloud?.fileSize, size > 0 {
            fileSizeDisplay = BookMetadata.formatFileSize(bytes: size)
        } else {
            fileSizeDisplay = ""
        }
        status = readaloud?.status
    }
}

private struct AndroidCoverPalette: Encodable {
    let surface: UInt32
    let accent: UInt32
    let brightAccent: UInt32
    let deepAccent: UInt32
    let mutedAccent: UInt32
    let accentBackground: UInt32
    let contentBackground: UInt32
    let cardBackground: UInt32
    let cardBorder: UInt32
    let ratingAccent: UInt32
}

private struct AndroidHomeSection: Encodable {
    let kind: String
    let title: String
    let bookIDs: [BookID]
}

private struct AndroidLibrary: Encodable {
    let books: [AndroidBook]
    let homeSections: [AndroidHomeSection]
    let sourceStatus: String
    let sourceMessage: String?
}

private struct AndroidStorytellerSettings: Encodable {
    let configured: Bool
    let sourceID: String?
    let serverURL: String?
    let username: String?
    let connectionStatus: String
    let connectionMessage: String?
    let connected: Bool?
}

private final class AndroidObserverStore: @unchecked Sendable {
    private let lock = NSLock()
    private var observersInstalled = false

    func claimInstallation() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !observersInstalled else { return false }
        observersInstalled = true
        return true
    }
}

private let androidObserverStore = AndroidObserverStore()

private func installAndroidConnectionObserver() async {
    await BookServiceActor.shared.request_notify {
        Task {
            let fields = connectionFields(await androidStorytellerConnectionStatus())
            guard
                let payload = try? encodeJSON(
                    AndroidSourceStatus(status: fields.status, message: fields.message)
                )
            else { return }
            notifyAndroidSourceStatusDidChange(payload)
        }
    }
}

private func androidStorytellerConnectionStatus() async -> ConnectionStatus {
    guard
        let source = await BookServiceActor.shared.bookSources.first(where: {
            $0.kind == .storyteller
        })
    else {
        return .disconnected
    }
    return await BookServiceActor.shared.connectionStatus(sourceID: source.id)
}

private func encodeStorytellerSettings(connected: Bool? = nil) async throws -> String {
    let source = await BookServiceActor.shared.bookSources.first {
        $0.kind == .storyteller
    }
    let credentials: (url: String, username: String, password: String)?
    let connection: ConnectionStatus

    if let source {
        credentials = await BookServiceActor.shared.credentials(for: source.id)
        connection = await BookServiceActor.shared.connectionStatus(sourceID: source.id)
    } else {
        credentials = nil
        connection = .disconnected
    }

    let status = connectionFields(connection)
    return try encodeJSON(
        AndroidStorytellerSettings(
            configured: source != nil && credentials != nil,
            sourceID: source?.id,
            serverURL: credentials?.url,
            username: credentials?.username,
            connectionStatus: status.status,
            connectionMessage: status.message,
            connected: connected,
        )
    )
}

private func requireAndroidBootstrap() throws {
    guard AndroidPlatformBootstrap.isBootstrapped else {
        throw AndroidBridgeError.notBootstrapped
    }
}

private func normalizeServerURL(_ value: String) throws -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
        throw AndroidBridgeError.invalidServerURL(value)
    }
    let normalized = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
    guard let url = URL(string: normalized),
        let scheme = url.scheme?.lowercased(),
        scheme == "http" || scheme == "https",
        url.host != nil
    else {
        throw AndroidBridgeError.invalidServerURL(value)
    }
    return normalized
}

private func connectionFields(_ connection: ConnectionStatus) -> (
    status: String,
    message: String?
) {
    switch connection {
        case .disconnected:
            return ("disconnected", nil)
        case .connecting:
            return ("connecting", nil)
        case .connected:
            return ("connected", nil)
        case .error(let message):
            return ("error", message)
    }
}

private func downloadStateName(_ state: DownloadState?) -> String? {
    switch state {
        case .queued: return "queued"
        case .downloading: return "downloading"
        case .paused: return "paused"
        case .failed: return "failed"
        case .importing: return "importing"
        case .completed: return "completed"
        case nil: return nil
    }
}

private func downloadProgress(_ record: DownloadRecord?) -> Double? {
    guard let record, record.isActive else { return nil }
    return record.progressFraction
}

private func androidMedia(
    bookID: BookID,
    category: LocalMediaCategory,
    info: AndroidMediaInfo,
    available: Bool,
    paths: MediaPaths?,
    cachedPaths: MediaPaths?,
    downloadsByBookID: [BookID: [DownloadRecord]],
) -> AndroidMedia? {
    guard available else { return nil }
    let record = downloadsByBookID[bookID]?.first { $0.category == category }
    return AndroidMedia(
        category: category.rawValue,
        format: info.format,
        pageCount: info.pageCount,
        durationDisplay: info.durationDisplay,
        fileSizeDisplay: info.fileSizeDisplay,
        status: info.status,
        downloaded: paths?.path(for: category) != nil,
        removable: cachedPaths?.path(for: category) != nil,
        downloadState: downloadStateName(record?.state),
        downloadProgress: downloadProgress(record),
    )
}

private func encodeJSON<T: Encodable>(_ value: T) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return String(decoding: try encoder.encode(value), as: UTF8.self)
}

enum AndroidBridgeError: Error, LocalizedError, CustomStringConvertible {
    case notBootstrapped
    case runtimeStartupFailed
    case alreadyBootstrapped(existing: String, requested: String)
    case invalidServerURL(String)
    case missingUsername
    case missingPassword
    case couldNotSaveStorytellerSettings
    case invalidCoverSize
    case invalidCoverPixels
    case invalidMediaCategory(String)
    case bookNotFound(String)
    case mediaUnavailable(category: String, bookID: String)
    case localMediaUnavailable(category: String, bookID: String)
    case audiobookNotOpen
    case invalidAudiobookCommand(String)
    case secureStorageFailure(String)
    case readerNotOpen
    case invalidReaderCommand(String)
    case readerPrepareFailed(String)
    case readerJSFailed(String)
    case invalidBulkAction
    case identifierTypeCreationFailed
    case alignmentReportUnavailable

    var errorDescription: String? {
        switch self {
            case .notBootstrapped:
                return "Storyteller's Android platform has not been bootstrapped."
            case .runtimeStartupFailed:
                return "Storyteller could not migrate its stored library data."
            case .alreadyBootstrapped(let existing, let requested):
                return "Storyteller was already bootstrapped with \(existing), not \(requested)."
            case .invalidServerURL(let value):
                return "Invalid Storyteller server URL: \(value)"
            case .missingUsername:
                return "A Storyteller username is required."
            case .missingPassword:
                return "A Storyteller password is required."
            case .couldNotSaveStorytellerSettings:
                return "Could not save the Storyteller server settings."
            case .invalidCoverSize:
                return "Cover width and height must be greater than zero."
            case .invalidCoverPixels:
                return "Cover pixels must be base64-encoded RGBA bytes."
            case .invalidMediaCategory(let category):
                return "Unsupported media category: \(category)"
            case .bookNotFound(let bookID):
                return "Book \(bookID) is no longer in the library."
            case .mediaUnavailable(let category, let bookID):
                return "Book \(bookID) has no \(category) available to download."
            case .localMediaUnavailable(let category, let bookID):
                return "Book \(bookID) has no downloaded \(category)."
            case .audiobookNotOpen:
                return "No audiobook is open."
            case .invalidAudiobookCommand(let command):
                return "Unknown audiobook command: \(command)"
            case .secureStorageFailure(let account):
                return "Android secure storage failed for account \(account)."
            case .readerNotOpen:
                return "No reader is open."
            case .invalidReaderCommand(let command):
                return "Unknown reader command: \(command)"
            case .readerPrepareFailed(let bookID):
                return "Could not prepare book \(bookID) for reading."
            case .readerJSFailed(let message):
                return "Reader JS evaluation failed: \(message)"
            case .invalidBulkAction:
                return "The bulk action request was malformed."
            case .identifierTypeCreationFailed:
                return "Could not create the identifier type."
            case .alignmentReportUnavailable:
                return "The alignment report could not be loaded."
        }
    }

    var description: String {
        errorDescription ?? "Android bridge error"
    }
}
