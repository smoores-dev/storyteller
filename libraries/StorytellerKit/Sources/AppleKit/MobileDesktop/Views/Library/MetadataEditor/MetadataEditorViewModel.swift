#if os(iOS) || os(macOS)
import Foundation
import SwiftUI

@MainActor
@Observable
final class MetadataEditorViewModel {
    enum HardcoverImportSource: String, CaseIterable, Identifiable {
        case text
        case audiobook

        var id: String { rawValue }

        var label: String {
            switch self {
                case .text: return "Text / Ebook"
                case .audiobook: return "Audiobook"
            }
        }
    }

    struct EditableCreator: Identifiable, Hashable {
        let id = UUID()
        var name: String
        var fileAs: String
        var role: String
        var uuid: String?
    }

    struct EditableSeries: Identifiable, Hashable {
        let id = UUID()
        var name: String
        var position: String
        var featured: Bool
        var uuid: String?
    }

    struct EditableIdentifier: Identifiable, Hashable {
        enum Scope: String, CaseIterable, Hashable {
            case book, ebook, audiobook, readaloud

            var label: String {
                switch self {
                    case .book: return "Book"
                    case .ebook: return "Ebook"
                    case .audiobook: return "Audiobook"
                    case .readaloud: return "Readaloud"
                }
            }
        }

        let id = UUID()
        // Nil until save for freshly imported rows whose type does not exist on the
        // server yet; save resolves by kind/name and creates a named type if needed.
        var typeUuid: String?
        var kind: String?
        var typeName: String
        var value: String
        var scope: Scope

        var displayText: String { "\(typeName) \(value)" }
    }

    struct EditableBook: Identifiable {
        let id: BookID
        var originalMetadata: BookMetadata

        var title: String
        var subtitle: String
        var description: String
        var language: String
        var publicationDate: String
        var status: String
        var statusUuid: String
        var authors: [String]
        var narrators: [String]
        var creators: [EditableCreator]
        var series: [EditableSeries]
        var tags: [String]
        var collectionUuids: [String]

        var dirtyFields: Set<String> = []
        var hardcoverImports: [HardcoverImportSource: BookMetadataCandidate] = [:]
        var identifiers: [EditableIdentifier] = []
        var originalIdentifiers: [EditableIdentifier] = []
        var identifiersLoaded = false
        var replacementEbookCover: (data: Data, filename: String)?
        var replacementAudiobookCover: (data: Data, filename: String)?

        var displayTitle: String {
            title.isEmpty ? "(Untitled)" : title
        }

        init(from metadata: BookMetadata) {
            self.id = metadata.id
            self.originalMetadata = metadata
            self.title = metadata.title
            self.subtitle = metadata.subtitle ?? ""
            self.description = metadata.description ?? ""
            self.language = metadata.language ?? ""
            self.publicationDate = Self.dateOnly(metadata.publicationDate) ?? ""
            self.status = metadata.status?.name ?? ""
            self.statusUuid = metadata.status?.uuid ?? ""
            self.authors = metadata.authors?.compactMap { $0.name } ?? []
            self.narrators = metadata.narrators?.compactMap { $0.name } ?? []
            self.creators =
                metadata.creators?.map { creator in
                    EditableCreator(
                        name: creator.name ?? "",
                        fileAs: creator.fileAs ?? "",
                        role: creator.role ?? "",
                        uuid: creator.uuid,
                    )
                } ?? []
            self.series =
                metadata.series?.map { s in
                    EditableSeries(
                        name: s.name,
                        position: s.position.map {
                            $0.truncatingRemainder(dividingBy: 1) == 0
                                ? String(Int($0)) : String($0)
                        } ?? "",
                        featured: s.featured == 1,
                        uuid: s.uuid,
                    )
                } ?? []
            self.tags = metadata.tags?.map { $0.name } ?? []
            self.collectionUuids = metadata.collections?.compactMap { $0.uuid } ?? []
        }

        static func dateOnly(_ isoDate: String?) -> String? {
            guard let isoDate, !isoDate.isEmpty else { return nil }
            if isoDate.contains("T") { return String(isoDate.prefix(10)) }
            return isoDate
        }

        var hasDirtyFields: Bool {
            !dirtyFields.isEmpty || replacementEbookCover != nil || replacementAudiobookCover != nil
        }

        func identifiers(scope: EditableIdentifier.Scope) -> [EditableIdentifier] {
            identifiers.filter { $0.scope == scope }
        }

        var identifiersDisplayList: [String] {
            identifiers.map(\.displayText)
        }

        func stringList(for field: String) -> [String] {
            switch field {
                case "authors": return authors
                case "narrators": return narrators
                case "tags": return tags
                default: return []
            }
        }

    }

    struct CollectionChoice: Identifiable, Hashable {
        let id: Int
        let uuid: String
        let name: String
    }

    struct FieldDiffDisplay {
        let original: String
        let current: String
    }

    var books: [EditableBook] = []
    var selectedBookId: BookID?
    var isSaving = false
    var saveError: String?
    var saveResults: [BookID: Bool] = [:]
    var itunesResultsByBookId: [BookID: [ITunesCoverResult]] = [:]
    var searchingItunesBookIds: Set<BookID> = []
    var libraryAuthorNames: [String] = []
    var libraryNarratorNames: [String] = []
    var libraryCreatorNamesByRole: [String: [String]] = [:]
    var libraryTagNames: [String] = []
    var libraryCollectionsBySourceID: [BookSourceID: [BookCollectionSummary]] = [:]
    var availableStatusesBySourceID: [BookSourceID: [BookStatus]] = [:]
    var deletedCollectionUuidsBySourceID: [BookSourceID: Set<String>] = [:]
    var identifierTypesBySourceID: [BookSourceID: [IdentifierType]] = [:]
    // Nil until probed; false when the server 404s the identifier endpoints.
    var identifierSupportBySourceID: [BookSourceID: Bool] = [:]

    var selectedBook: EditableBook? {
        get { books.first { $0.id == selectedBookId } }
        set {
            guard let newValue, let index = books.firstIndex(where: { $0.id == newValue.id }) else {
                return
            }
            books[index] = newValue
        }
    }

    func addBooks(ids: [BookID], from library: BookLibrary) {
        updateLibraryAuthors(from: library)
        updateLibraryNarrators(from: library)
        updateLibraryCreators(from: library)
        updateLibraryTags(from: library)
        updateLibraryCollections(from: library)

        for id in ids {
            guard !books.contains(where: { $0.id == id }) else { continue }
            guard let metadata = library.bookMetaData.first(where: { $0.id == id }) else {
                continue
            }
            books.append(EditableBook(from: metadata))
        }
        if selectedBookId == nil {
            selectedBookId = books.first?.id
        }
    }

    private func updateLibraryAuthors(from library: BookLibrary) {
        var authorsByKey: [String: String] = [:]
        for book in library.bookMetaData {
            for author in book.authors ?? [] {
                guard let name = author.name else { continue }
                let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                let key = trimmed.lowercased()
                if authorsByKey[key] == nil {
                    authorsByKey[key] = trimmed
                }
            }
        }
        libraryAuthorNames = authorsByKey.values.sorted {
            $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
        }
    }

    private func updateLibraryNarrators(from library: BookLibrary) {
        var narratorsByKey: [String: String] = [:]
        for book in library.bookMetaData {
            for narrator in book.narrators ?? [] {
                guard let name = narrator.name else { continue }
                let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                let key = trimmed.lowercased()
                if narratorsByKey[key] == nil {
                    narratorsByKey[key] = trimmed
                }
            }
        }
        libraryNarratorNames = narratorsByKey.values.sorted {
            $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
        }
    }

    private func updateLibraryCreators(from library: BookLibrary) {
        var namesByRole: [String: [String: String]] = [:]
        for book in library.bookMetaData {
            for creator in book.creators ?? [] {
                guard let name = creator.name else { continue }
                let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmedName.isEmpty else { continue }

                let roleKey = Self.creatorRoleSuggestionKey(creator.role ?? "")
                guard !roleKey.isEmpty else { continue }

                let nameKey = trimmedName.lowercased()
                if namesByRole[roleKey] == nil {
                    namesByRole[roleKey] = [:]
                }
                if namesByRole[roleKey]?[nameKey] == nil {
                    namesByRole[roleKey]?[nameKey] = trimmedName
                }
            }
        }

        libraryCreatorNamesByRole = namesByRole.mapValues { names in
            names.values.sorted {
                $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
            }
        }
    }

    static func creatorRoleSuggestionKey(_ role: String) -> String {
        let trimmed = role.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != "Role" else { return "" }
        return trimmed.lowercased()
    }

    static func isAuthorOrNarratorCreatorRole(_ roleKey: String) -> Bool {
        roleKey == "author" || roleKey == "narrator"
    }

    private func updateLibraryTags(from library: BookLibrary) {
        var tagsByKey: [String: String] = [:]
        for book in library.bookMetaData {
            for tag in book.tagNames {
                let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                let key = trimmed.lowercased()
                if tagsByKey[key] == nil {
                    tagsByKey[key] = trimmed
                }
            }
        }
        libraryTagNames = tagsByKey.values.sorted {
            $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
        }
    }

    private func updateLibraryCollections(from library: BookLibrary) {
        var collectionsBySourceAndKey: [BookSourceID: [String: BookCollectionSummary]] = [:]
        for book in library.bookMetaData {
            for collection in book.collections ?? [] {
                if let uuid = collection.uuid,
                    deletedCollectionUuidsBySourceID[book.id.sourceID, default: []].contains(uuid)
                {
                    continue
                }
                let key = collection.uuid ?? collection.name.lowercased()
                if collectionsBySourceAndKey[book.id.sourceID]?[key] == nil {
                    collectionsBySourceAndKey[book.id.sourceID, default: [:]][key] = collection
                }
            }
        }
        libraryCollectionsBySourceID = collectionsBySourceAndKey.mapValues { collections in
            collections.values.sorted {
                $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
        }
    }

    func refreshLibraryCollectionsFromServer(for bookId: BookID) async {
        let sourceID = bookId.sourceID
        guard let collections = await BookServiceActor.shared.fetchCollections(sourceID: sourceID)
        else { return }

        libraryCollectionsBySourceID[sourceID] =
            collections
            .filter { !deletedCollectionUuidsBySourceID[sourceID, default: []].contains($0.uuid) }
            .map {
                BookCollectionSummary(
                    uuid: $0.uuid,
                    name: $0.name,
                    description: $0.description,
                    isPublic: $0.isPublic,
                    importPath: $0.importPath,
                    createdAt: $0.createdAt,
                    updatedAt: $0.updatedAt,
                )
            }
    }

    func createCollection(named name: String, for bookId: BookID) async -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let sourceID = bookId.sourceID

        let created = await BookServiceActor.shared.createCollection(
            StorytellerCollectionCreatePayload(
                name: trimmed,
                description: "",
                isPublic: false,
                users: nil,
            ),
            sourceID: sourceID,
        )
        guard let created else { return nil }

        upsertLibraryCollection(
            sourceID: sourceID,
            uuid: created.uuid,
            name: created.name,
            description: created.description,
            isPublic: created.isPublic,
            importPath: created.importPath,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
        )
        deletedCollectionUuidsBySourceID[sourceID, default: []].remove(created.uuid)
        await BookServiceActor.shared.fetchLibraryInformation()
        return created.uuid
    }

    func deleteCollection(uuid: String, for bookId: BookID) async -> Bool {
        let sourceID = bookId.sourceID
        guard await BookServiceActor.shared.deleteCollection(uuid: uuid, sourceID: sourceID)
        else { return false }

        deletedCollectionUuidsBySourceID[sourceID, default: []].insert(uuid)
        removeLibraryCollection(sourceID: sourceID, uuid: uuid)
        for index in books.indices where books[index].id.sourceID == sourceID {
            books[index].collectionUuids.removeAll { $0 == uuid }
        }
        await BookServiceActor.shared.fetchLibraryInformation()
        return true
    }

    private func upsertLibraryCollection(
        sourceID: BookSourceID,
        uuid: String,
        name: String,
        description: String?,
        isPublic: Bool?,
        importPath: String?,
        createdAt: String?,
        updatedAt: String?,
    ) {
        let summary = BookCollectionSummary(
            uuid: uuid,
            name: name,
            description: description,
            isPublic: isPublic,
            importPath: importPath,
            createdAt: createdAt,
            updatedAt: updatedAt,
        )
        libraryCollectionsBySourceID[sourceID, default: []].removeAll { $0.uuid == uuid }
        libraryCollectionsBySourceID[sourceID, default: []].append(summary)
        sortLibraryCollections(sourceID: sourceID)
    }

    private func removeLibraryCollection(sourceID: BookSourceID, uuid: String) {
        libraryCollectionsBySourceID[sourceID, default: []].removeAll { $0.uuid == uuid }
    }

    private func sortLibraryCollections(sourceID: BookSourceID) {
        libraryCollectionsBySourceID[sourceID, default: []].sort {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    func libraryCollectionNamesByUuid(for bookID: BookID) -> [String: String] {
        Dictionary(
            uniqueKeysWithValues: libraryCollectionsBySourceID[bookID.sourceID, default: []]
                .compactMap { collection in
                    guard let uuid = collection.uuid else { return nil }
                    return (uuid, collection.name)
                }
        )
    }

    func libraryCollectionChoices(for bookID: BookID) -> [CollectionChoice] {
        libraryCollectionsBySourceID[bookID.sourceID, default: []]
            .enumerated().compactMap { index, collection in
                guard let uuid = collection.uuid else { return nil }
                return CollectionChoice(id: index, uuid: uuid, name: collection.name)
            }
    }

    func availableStatuses(for bookID: BookID) -> [BookStatus] {
        availableStatusesBySourceID[bookID.sourceID] ?? []
    }

    func setAvailableStatuses(_ statuses: [BookStatus], sourceID: BookSourceID) {
        availableStatusesBySourceID[sourceID] = statuses
    }

    func removeBooks(ids: Set<BookID>) {
        guard !ids.isEmpty else { return }
        let previousSelected = selectedBookId
        books.removeAll { ids.contains($0.id) }
        for id in ids {
            itunesResultsByBookId[id] = nil
            searchingItunesBookIds.remove(id)
        }

        if let previousSelected, !ids.contains(previousSelected),
            books.contains(where: { $0.id == previousSelected })
        {
            selectedBookId = previousSelected
        } else {
            selectedBookId = books.first?.id
        }
    }

    func clearTransientImportState() {
        itunesResultsByBookId.removeAll()
        searchingItunesBookIds.removeAll()
    }

    func markDirty(field: String, for bookId: BookID) {
        guard let index = books.firstIndex(where: { $0.id == bookId }) else { return }
        let book = books[index]
        let orig = book.originalMetadata

        let isChanged: Bool
        switch field {
            case "title": isChanged = book.title != orig.title
            case "subtitle": isChanged = book.subtitle != (orig.subtitle ?? "")
            case "description": isChanged = book.description != (orig.description ?? "")
            case "language": isChanged = book.language != (orig.language ?? "")
            case "publicationDate":
                isChanged =
                    book.publicationDate != (EditableBook.dateOnly(orig.publicationDate) ?? "")
            case "status": isChanged = book.statusUuid != (orig.status?.uuid ?? "")
            case "authors":
                isChanged = book.authors != (orig.authors?.compactMap { $0.name } ?? [])
            case "narrators":
                isChanged = book.narrators != (orig.narrators?.compactMap { $0.name } ?? [])
            case "tags":
                isChanged =
                    Self.normalizedTags(book.tags)
                    != Self.normalizedTags(orig.tags?.map { $0.name } ?? [])
            case "creators":
                let origCreators = orig.creators ?? []
                if book.creators.count != origCreators.count {
                    isChanged = true
                } else {
                    isChanged = zip(book.creators, origCreators).contains { edited, original in
                        edited.name != (original.name ?? "")
                            || edited.role != (original.role ?? "")
                            || edited.fileAs != (original.fileAs ?? "")
                    }
                }
            case "series":
                let origSeries = orig.series ?? []
                if book.series.count != origSeries.count {
                    isChanged = true
                } else {
                    isChanged = zip(book.series, origSeries).contains { edited, original in
                        edited.name != original.name
                            || edited.position
                                != (original.position.map {
                                    $0.truncatingRemainder(dividingBy: 1) == 0
                                        ? String(Int($0)) : String($0)
                                } ?? "")
                            || edited.featured != (original.featured == 1)
                    }
                }
            case "collections":
                isChanged = book.collectionUuids != (orig.collections?.compactMap { $0.uuid } ?? [])
            case "identifiers":
                isChanged =
                    book.identifiers.map { [$0.typeName, $0.value, $0.scope.rawValue] }
                    != book.originalIdentifiers.map { [$0.typeName, $0.value, $0.scope.rawValue] }
            default:
                isChanged = true
        }

        if isChanged {
            books[index].dirtyFields.insert(field)
        } else {
            books[index].dirtyFields.remove(field)
        }
    }

    func isDirty(field: String, for bookId: BookID) -> Bool {
        books.first { $0.id == bookId }?.dirtyFields.contains(field) ?? false
    }

    func fieldDiffDisplay(field: String, for bookId: BookID) -> FieldDiffDisplay? {
        guard let book = books.first(where: { $0.id == bookId }) else { return nil }
        let original = originalDisplayValue(field: field, for: book)
        let current = currentDisplayValue(field: field, for: book)
        guard original != current else { return nil }
        return FieldDiffDisplay(original: original, current: current)
    }

    private func originalDisplayValue(field: String, for book: EditableBook) -> String {
        let original = book.originalMetadata
        switch field {
            case "title":
                return displayValue(original.title)
            case "subtitle":
                return displayValue(original.subtitle ?? "")
            case "description":
                return displayValue(original.description ?? "")
            case "language":
                return displayValue(original.language ?? "")
            case "publicationDate":
                return displayValue(EditableBook.dateOnly(original.publicationDate) ?? "")
            case "status":
                return displayValue(original.status?.name ?? "")
            case "authors":
                return displayList(original.authors?.compactMap(\.name) ?? [])
            case "narrators":
                return displayList(original.narrators?.compactMap(\.name) ?? [])
            case "tags":
                return displayList(Self.normalizedTags(original.tags?.map(\.name) ?? []))
            case "creators":
                return displayList(
                    original.creators?.map { creator in
                        creatorDisplay(
                            name: creator.name ?? "",
                            role: creator.role ?? "",
                            fileAs: creator.fileAs ?? "",
                        )
                    } ?? []
                )
            case "series":
                return displayList(
                    original.series?.map { series in
                        seriesDisplay(
                            name: series.name,
                            position: series.formattedPosition ?? "",
                            featured: series.featured == 1,
                        )
                    } ?? []
                )
            case "collections":
                return displayList(original.collections?.map(\.name) ?? [])
            case "identifiers":
                return displayList(book.originalIdentifiers.map(\.displayText))
            default:
                return "(empty)"
        }
    }

    private func currentDisplayValue(field: String, for book: EditableBook) -> String {
        switch field {
            case "title":
                return displayValue(book.title)
            case "subtitle":
                return displayValue(book.subtitle)
            case "description":
                return displayValue(book.description)
            case "language":
                return displayValue(book.language)
            case "publicationDate":
                return displayValue(book.publicationDate)
            case "status":
                return displayValue(book.status)
            case "authors":
                return displayList(book.authors)
            case "narrators":
                return displayList(book.narrators)
            case "tags":
                return displayList(Self.normalizedTags(book.tags))
            case "creators":
                return displayList(
                    book.creators.map { creator in
                        creatorDisplay(
                            name: creator.name,
                            role: creator.role,
                            fileAs: creator.fileAs,
                        )
                    }
                )
            case "series":
                return displayList(
                    book.series.map { series in
                        seriesDisplay(
                            name: series.name,
                            position: series.position,
                            featured: series.featured,
                        )
                    }
                )
            case "collections":
                let namesByUuid = libraryCollectionNamesByUuid(for: book.id)
                return displayList(
                    book.collectionUuids.map { uuid in
                        namesByUuid[uuid] ?? uuid
                    }
                )
            case "identifiers":
                return displayList(book.identifiersDisplayList)
            default:
                return "(empty)"
        }
    }

    private func displayValue(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "(empty)" : value
    }

    private func displayList(_ values: [String]) -> String {
        let cleaned =
            values
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return cleaned.isEmpty ? "(empty)" : cleaned.joined(separator: "\n")
    }

    private static func normalizedTags(_ tags: [String]) -> [String] {
        var seen = Set<String>()
        var normalized: [String] = []
        for tag in tags {
            let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !seen.contains(trimmed) else { continue }
            seen.insert(trimmed)
            normalized.append(trimmed)
        }
        return normalized.sorted {
            $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
        }
    }

    private func creatorDisplay(name: String, role: String, fileAs: String) -> String {
        var parts: [String] = []
        if !role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append(role)
        }
        parts.append(
            name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "(unnamed)" : name
        )
        if !fileAs.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append("file as: \(fileAs)")
        }
        return parts.joined(separator: " | ")
    }

    private func seriesDisplay(name: String, position: String, featured: Bool) -> String {
        var parts = [
            name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "(unnamed)" : name
        ]
        if !position.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append("position: \(position)")
        }
        if featured {
            parts.append("featured")
        }
        return parts.joined(separator: " | ")
    }

    var hasAnyDirtyBooks: Bool {
        books.contains { $0.hasDirtyFields }
    }

    struct ValidationError {
        let field: String
        let message: String
    }

    func validationErrors(for bookId: BookID) -> [ValidationError] {
        guard let book = books.first(where: { $0.id == bookId }) else { return [] }
        var errors: [ValidationError] = []

        if book.dirtyFields.contains("title")
            && book.title.trimmingCharacters(in: .whitespaces).isEmpty
        {
            errors.append(ValidationError(field: "title", message: "Title cannot be empty"))
        }

        for (index, series) in book.series.enumerated() {
            let pos = series.position.trimmingCharacters(in: .whitespaces)
            if !pos.isEmpty && Double(pos) == nil {
                errors.append(
                    ValidationError(
                        field: "series.\(index).position",
                        message: "Series position '\(pos)' is not a number",
                    )
                )
            }
        }

        if book.dirtyFields.contains("status") {
            let statusUuid = book.statusUuid.trimmingCharacters(in: .whitespacesAndNewlines)
            let validStatusUuids = Set(availableStatuses(for: book.id).compactMap(\.uuid))
            if statusUuid.isEmpty || !validStatusUuids.contains(statusUuid) {
                errors.append(
                    ValidationError(
                        field: "status",
                        message: "Select a valid Storyteller status",
                    )
                )
            }
        }

        if book.dirtyFields.contains("publicationDate") {
            let pubDate = book.publicationDate.trimmingCharacters(in: .whitespacesAndNewlines)
            if !pubDate.isEmpty {
                let dateRegex = /^\d{4}-\d{2}-\d{2}$/
                let isValidDate = pubDate.wholeMatch(of: dateRegex) != nil
                let isValidFull = StorytellerDate.parse(pubDate, field: .publicationDate) != nil
                if !isValidDate && !isValidFull {
                    errors.append(
                        ValidationError(
                            field: "publicationDate",
                            message: "Publication date must be yyyy-mm-dd format",
                        )
                    )
                }
            }
        }

        return errors
    }

    func hasValidationErrors(for bookId: BookID) -> Bool {
        !validationErrors(for: bookId).isEmpty
    }

    var hasAnyValidationErrors: Bool {
        books.contains { hasValidationErrors(for: $0.id) }
    }

    private func coverUploads(for book: EditableBook) -> (
        text: StorytellerCoverUpload?, audio: StorytellerCoverUpload?
    ) {
        let text = book.replacementEbookCover.map {
            StorytellerCoverUpload(filename: $0.filename, data: $0.data, contentType: nil)
        }
        let audio = book.replacementAudiobookCover.map {
            StorytellerCoverUpload(filename: $0.filename, data: $0.data, contentType: nil)
        }
        return (text, audio)
    }

    func buildPayload(for book: EditableBook) -> StorytellerBookUpdatePayload? {
        guard book.hasDirtyFields else { return nil }
        var payload = StorytellerBookUpdatePayload(uuid: book.id.uuid)

        if book.dirtyFields.contains("title") {
            payload.title = book.title
        }
        if book.dirtyFields.contains("subtitle") {
            payload.subtitle = book.subtitle
        }
        if book.dirtyFields.contains("description") {
            payload.description = book.description
        }
        if book.dirtyFields.contains("language") {
            payload.language = book.language
        }
        if book.dirtyFields.contains("publicationDate") {
            let trimmed = book.publicationDate.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                payload.publicationDate = .null
            } else if trimmed.contains("T") {
                payload.publicationDate = .value(trimmed)
            } else {
                payload.publicationDate = .value(trimmed + "T12:00:00.000Z")
            }
        }
        if book.dirtyFields.contains("status") {
            payload.status = book.statusUuid
        }
        let anyCreatorFieldDirty = !book.dirtyFields.isDisjoint(
            with: ["authors", "narrators", "creators"])
        if anyCreatorFieldDirty {
            payload.authors = book.authors.filter {
                !$0.trimmingCharacters(in: .whitespaces).isEmpty
            }
            payload.narrators = book.narrators.filter {
                !$0.trimmingCharacters(in: .whitespaces).isEmpty
            }
            var originalCreatorNamesByUuid: [String: String] = [:]
            for creator in book.originalMetadata.creators ?? [] {
                guard let uuid = creator.uuid else { continue }
                originalCreatorNamesByUuid[uuid] = creator.name ?? ""
            }
            payload.creators = book.creators.compactMap { creator in
                let name = creator.name.trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty else { return nil }
                let role = creator.role.trimmingCharacters(in: .whitespaces)
                guard !role.isEmpty && role != "Role" else { return nil }
                let originalName = creator.uuid.flatMap { originalCreatorNamesByUuid[$0] } ?? ""
                let uuid = originalName == name ? creator.uuid : nil
                return StorytellerCreatorRelationUpdate(
                    uuid: uuid,
                    id: nil,
                    name: name,
                    fileAs: creator.fileAs.isEmpty ? name : creator.fileAs,
                    role: role,
                )
            }
        }
        if book.dirtyFields.contains("series") {
            var originalSeriesNamesByUuid: [String: String] = [:]
            for series in book.originalMetadata.series ?? [] {
                guard let uuid = series.uuid else { continue }
                originalSeriesNamesByUuid[uuid] = series.name
            }
            payload.series = book.series.compactMap { s in
                let name = s.name.trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty else { return nil }
                let originalName = s.uuid.flatMap { originalSeriesNamesByUuid[$0] } ?? ""
                let uuid = originalName == name ? s.uuid : nil
                return StorytellerSeriesRelationUpdate(
                    uuid: uuid,
                    name: name,
                    featured: s.featured,
                    position: Double(s.position),
                )
            }
        }
        if book.dirtyFields.contains("tags") {
            payload.tags = Self.normalizedTags(book.tags)
        }
        if book.dirtyFields.contains("collections") {
            payload.collections = book.collectionUuids
        }

        return payload
    }

    func saveAll(mediaViewModel _: MediaViewModel) async {
        isSaving = true
        saveError = nil
        saveResults = [:]

        for book in books where book.hasDirtyFields {
            let result = await saveBook(book)
            if let updatedMetadata = result.metadata {
                saveResults[book.id] = true
                if let index = books.firstIndex(where: { $0.id == book.id }) {
                    books[index].originalMetadata = updatedMetadata
                    if result.metadataSaved {
                        books[index].dirtyFields.removeAll()
                    }
                    if result.coversSaved {
                        books[index].replacementEbookCover = nil
                        books[index].replacementAudiobookCover = nil
                    }
                    if result.identifiersSaved {
                        books[index].originalIdentifiers = books[index].identifiers
                        books[index].dirtyFields.remove("identifiers")
                    } else {
                        books[index].dirtyFields.insert("identifiers")
                        saveError = "\(book.displayTitle): Could not save identifiers."
                    }
                }
            } else {
                saveResults[book.id] = false
                let serverError = await BookServiceActor.shared.lastUpdateBookError(
                    sourceID: book.id.sourceID
                )
                saveError =
                    "\(book.displayTitle): \(serverError ?? "Unknown error")"
            }
        }

        isSaving = false
    }

    func saveSingle(_ bookId: BookID, mediaViewModel _: MediaViewModel) async {
        guard let book = books.first(where: { $0.id == bookId }),
            book.hasDirtyFields
        else { return }

        isSaving = true
        saveError = nil

        let result = await saveBook(book)
        if let updatedMetadata = result.metadata {
            saveResults[bookId] = true
            if let index = books.firstIndex(where: { $0.id == bookId }) {
                books[index].originalMetadata = updatedMetadata
                if result.metadataSaved {
                    books[index].dirtyFields.removeAll()
                }
                if result.coversSaved {
                    books[index].replacementEbookCover = nil
                    books[index].replacementAudiobookCover = nil
                }
                if result.identifiersSaved {
                    books[index].originalIdentifiers = books[index].identifiers
                    books[index].dirtyFields.remove("identifiers")
                } else {
                    books[index].dirtyFields.insert("identifiers")
                    saveError = "\(book.displayTitle): Could not save identifiers."
                }
            }
        } else {
            saveResults[bookId] = false
            let serverError = await BookServiceActor.shared.lastUpdateBookError(
                sourceID: book.id.sourceID
            )
            saveError =
                "\(book.displayTitle): \(serverError ?? "Unknown error")"
        }

        isSaving = false
    }

    private struct SaveBookResult {
        let metadata: BookMetadata?
        let metadataSaved: Bool
        let textCoverSaved: Bool
        let audioCoverSaved: Bool
        let identifiersSaved: Bool

        var coversSaved: Bool {
            textCoverSaved || audioCoverSaved
        }
    }

    private func saveBook(_ book: EditableBook) async -> SaveBookResult {
        let covers = coverUploads(for: book)
        // Identifiers save through their own PUT; an update call with nothing but
        // them dirty would send an empty field mask, which updateBook rejects.
        let hasMetadataChanges = !book.dirtyFields.subtracting(["identifiers"]).isEmpty
        let needsUpdateCall = hasMetadataChanges || covers.text != nil || covers.audio != nil

        let result: BookMetadata?
        if needsUpdateCall {
            let payload =
                buildPayload(for: book) ?? StorytellerBookUpdatePayload(uuid: book.id.uuid)
            result = await BookServiceActor.shared.updateBook(
                payload,
                bookID: book.id,
                textCover: covers.text,
                audioCover: covers.audio,
            )
        } else {
            result = book.originalMetadata
        }
        var identifiersSaved = true
        if result != nil, book.dirtyFields.contains("identifiers") {
            // The wholesale PUT needs the server rows loaded first, or it would wipe
            // everything the editor never saw.
            if !book.identifiersLoaded {
                await loadIdentifiers(for: book.id)
            }
            if let refreshed = books.first(where: { $0.id == book.id }),
                refreshed.identifiersLoaded
            {
                identifiersSaved = await saveIdentifiers(for: refreshed)
            } else {
                identifiersSaved = false
            }
        }
        return SaveBookResult(
            metadata: result,
            metadataSaved: hasMetadataChanges && result != nil,
            textCoverSaved: covers.text != nil && result != nil,
            audioCoverSaved: covers.audio != nil && result != nil,
            identifiersSaved: identifiersSaved,
        )
    }

    func identifiersSupported(for bookId: BookID) -> Bool {
        identifierSupportBySourceID[bookId.sourceID] ?? false
    }

    /// Pulls the book's full identifier set (all scopes) into editable rows, and the
    /// source's identifier types once per source.
    func loadIdentifiers(for bookId: BookID) async {
        guard let book = books.first(where: { $0.id == bookId }), !book.identifiersLoaded else {
            return
        }
        let sourceID = bookId.sourceID

        if identifierSupportBySourceID[sourceID] == nil {
            let types = await BookServiceActor.shared.fetchIdentifierTypes(sourceID: sourceID)
            identifierSupportBySourceID[sourceID] = types != nil
            identifierTypesBySourceID[sourceID] = types ?? []
        }
        guard identifierSupportBySourceID[sourceID] == true else { return }
        guard let relations = await BookServiceActor.shared.fetchBookIdentifiers(for: bookId)
        else { return }

        guard let index = books.firstIndex(where: { $0.id == bookId }) else { return }
        let types = identifierTypesBySourceID[sourceID] ?? []
        let typesByUuid = Dictionary(types.map { ($0.uuid, $0) }) { first, _ in first }
        let rows = relations.map { relation -> EditableIdentifier in
            let type = typesByUuid[relation.identifierTypeUuid]
            let scope: EditableIdentifier.Scope =
                if relation.ebookUuid != nil {
                    .ebook
                } else if relation.audiobookUuid != nil {
                    .audiobook
                } else if relation.readaloudUuid != nil {
                    .readaloud
                } else {
                    .book
                }
            return EditableIdentifier(
                typeUuid: relation.identifierTypeUuid,
                kind: type?.kind,
                typeName: type?.name ?? "Unknown",
                value: relation.value,
                scope: scope,
            )
        }
        // Rows imported before the load finished must survive it; server rows win on
        // (type, value) collisions.
        let pendingRows = books[index].identifiers.filter { pending in
            !rows.contains { loaded in
                loaded.value.caseInsensitiveCompare(pending.value) == .orderedSame
                    && loaded.typeName.compare(pending.typeName, options: .caseInsensitive)
                        == .orderedSame
            }
        }
        books[index].identifiers = rows + pendingRows
        books[index].originalIdentifiers = rows
        books[index].identifiersLoaded = true
        markDirty(field: "identifiers", for: bookId)
    }

    func refreshIdentifierTypes(for sourceID: BookSourceID) async {
        guard let types = await BookServiceActor.shared.fetchIdentifierTypes(sourceID: sourceID)
        else { return }
        identifierTypesBySourceID[sourceID] = types
    }

    func createIdentifierType(
        named name: String,
        urlTemplate: String?,
        sourceID: BookSourceID,
    ) async -> Bool {
        guard
            let created = await BookServiceActor.shared.createIdentifierType(
                name: name,
                urlTemplate: urlTemplate,
                sourceID: sourceID,
            )
        else { return false }
        var types = identifierTypesBySourceID[sourceID] ?? []
        if !types.contains(where: { $0.uuid == created.uuid }) {
            types.append(created)
        }
        identifierTypesBySourceID[sourceID] = types
        return true
    }

    func deleteIdentifierType(_ type: IdentifierType, sourceID: BookSourceID) async -> Bool {
        guard
            await BookServiceActor.shared.deleteIdentifierType(
                typeUUID: type.uuid,
                sourceID: sourceID,
            )
        else { return false }
        identifierTypesBySourceID[sourceID]?.removeAll { $0.uuid == type.uuid }
        // The server cascades identifiers of the deleted type away; mirror that in
        // the loaded editor rows.
        for index in books.indices where books[index].id.sourceID == sourceID {
            books[index].identifiers.removeAll { $0.typeUuid == type.uuid }
            books[index].originalIdentifiers.removeAll { $0.typeUuid == type.uuid }
            markDirty(field: "identifiers", for: books[index].id)
        }
        return true
    }

    /// Wholesale-replaces the book's identifier set from the editor rows via
    /// `PUT /books/{id}/identifiers`, creating named types the server lacks.
    private func saveIdentifiers(for book: EditableBook) async -> Bool {
        let sourceID = book.id.sourceID
        var types = identifierTypesBySourceID[sourceID] ?? []

        var relations: [IdentifierRelationPayload] = []
        for row in book.identifiers {
            let value = row.value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { continue }

            var typeUuid = row.typeUuid
            if typeUuid == nil {
                typeUuid = IdentifierImportAssembly.resolveTypeUuid(
                    kind: row.kind ?? "",
                    name: row.typeName,
                    in: types,
                )
            }
            if typeUuid == nil {
                guard
                    let created = await BookServiceActor.shared.createIdentifierType(
                        name: row.typeName,
                        sourceID: sourceID,
                    )
                else { return false }
                types.append(created)
                identifierTypesBySourceID[sourceID] = types
                typeUuid = created.uuid
            }
            guard let typeUuid else { continue }

            var ebookUuid: String?
            var audiobookUuid: String?
            var readaloudUuid: String?
            switch row.scope {
                case .book:
                    break
                case .ebook:
                    ebookUuid = book.originalMetadata.ebook?.uuid
                case .audiobook:
                    audiobookUuid = book.originalMetadata.audiobook?.uuid
                case .readaloud:
                    readaloudUuid = book.originalMetadata.readaloud?.uuid
            }

            relations.append(
                IdentifierRelationPayload(
                    identifierTypeUuid: typeUuid,
                    value: value,
                    ebookUuid: ebookUuid,
                    audiobookUuid: audiobookUuid,
                    readaloudUuid: readaloudUuid,
                )
            )
        }

        return await BookServiceActor.shared.replaceBookIdentifiers(
            for: book.id,
            identifiers: relations,
        )
    }

    struct IdentifierImportChanges {
        let removedRowIds: [UUID]
        let additions: [BookImportedIdentifier]
    }

    /// Applies the import sheet's identifier outcome as ordinary editor-row edits, so
    /// the result stays reviewable in the form before save.
    func applyIdentifierChanges(_ changes: IdentifierImportChanges, for bookId: BookID) {
        guard let index = books.firstIndex(where: { $0.id == bookId }) else { return }
        var mutated = false

        if !changes.removedRowIds.isEmpty {
            let removedIds = Set(changes.removedRowIds)
            let countBefore = books[index].identifiers.count
            books[index].identifiers.removeAll { removedIds.contains($0.id) }
            mutated = books[index].identifiers.count != countBefore
        }

        let types = identifierTypesBySourceID[bookId.sourceID] ?? []
        for imported in changes.additions {
            let duplicate = books[index].identifiers.contains { row in
                row.value.caseInsensitiveCompare(imported.value) == .orderedSame
                    && (row.kind == imported.kind
                        || row.typeName.compare(imported.typeName, options: .caseInsensitive)
                            == .orderedSame)
            }
            guard !duplicate else { continue }

            var scope: EditableIdentifier.Scope =
                switch imported.target {
                    case .book: .book
                    case .ebook: .ebook
                    case .audiobook: .audiobook
                }
            if scope == .ebook, books[index].originalMetadata.ebook?.uuid == nil {
                scope = .book
            }
            if scope == .audiobook, books[index].originalMetadata.audiobook?.uuid == nil {
                scope = .book
            }

            books[index].identifiers.append(
                EditableIdentifier(
                    typeUuid: IdentifierImportAssembly.resolveTypeUuid(
                        kind: imported.kind,
                        name: imported.typeName,
                        in: types,
                    ),
                    kind: imported.kind,
                    typeName: imported.typeName,
                    value: imported.value,
                    scope: scope,
                )
            )
            mutated = true
        }

        if mutated {
            markDirty(field: "identifiers", for: bookId)
        }
    }

    func applyImport(
        imports: [HardcoverImportSource: BookMetadataCandidate],
        fields: Set<String>,
        for bookId: BookID,
    ) {
        guard !imports.isEmpty else { return }
        for (source, details) in imports {
            applyImport(details: details, source: source, fields: fields, for: bookId)
        }
    }

    func applyImport(
        details: BookMetadataCandidate,
        source: HardcoverImportSource = .text,
        fields: Set<String>,
        for bookId: BookID,
    ) {
        guard let index = books.firstIndex(where: { $0.id == bookId }) else { return }

        books[index].hardcoverImports[source] = details

        let shouldApplyToCurrent = { (field: String) -> Bool in
            fields.contains(field) && Self.defaultHardcoverSource(for: field) == source
        }

        if shouldApplyToCurrent("title"), let value = details.title, !value.isEmpty,
            value != books[index].title
        {
            books[index].title = value
            markDirty(field: "title", for: bookId)
        }
        if shouldApplyToCurrent("subtitle"), let value = details.subtitle, !value.isEmpty,
            value != books[index].subtitle
        {
            books[index].subtitle = value
            markDirty(field: "subtitle", for: bookId)
        }
        if shouldApplyToCurrent("description"), let value = details.description, !value.isEmpty,
            value != books[index].description
        {
            books[index].description = value
            markDirty(field: "description", for: bookId)
        }
        if shouldApplyToCurrent("language"), let value = details.language, !value.isEmpty {
            let code = Self.languageNameToCode(value)
            if code != books[index].language {
                books[index].language = code
                markDirty(field: "language", for: bookId)
            }
        }
        if shouldApplyToCurrent("publicationDate"), let value = details.releaseDate, !value.isEmpty
        {
            let dateOnly = EditableBook.dateOnly(value) ?? value
            if dateOnly != books[index].publicationDate {
                books[index].publicationDate = dateOnly
                markDirty(field: "publicationDate", for: bookId)
            }
        }

        // List fields replace outright: the import UI is a per-field source picker where choosing a
        // column means "use this column's value", so the selected source's list wins wholesale.
        if shouldApplyToCurrent("authors"), !details.authors.isEmpty,
            books[index].authors != details.authors
        {
            books[index].authors = details.authors
            markDirty(field: "authors", for: bookId)
        }

        if shouldApplyToCurrent("narrators"), !details.narrators.isEmpty,
            books[index].narrators != details.narrators
        {
            books[index].narrators = details.narrators
            markDirty(field: "narrators", for: bookId)
        }

        if shouldApplyToCurrent("creators"), !details.creators.isEmpty {
            let newCreators = details.creators.map {
                EditableCreator(name: $0.name, fileAs: "", role: $0.role)
            }
            let oldKey = books[index].creators.map { "\($0.name)|\($0.role)" }
            let newKey = newCreators.map { "\($0.name)|\($0.role)" }
            if oldKey != newKey {
                books[index].creators = newCreators
                markDirty(field: "creators", for: bookId)
            }
        }

        if shouldApplyToCurrent("series"), !details.series.isEmpty {
            let newSeries = details.series.map { s -> EditableSeries in
                let posStr: String =
                    s.position.map {
                        $0.truncatingRemainder(dividingBy: 1) == 0
                            ? String(Int($0)) : String($0)
                    } ?? ""
                return EditableSeries(name: s.name, position: posStr, featured: s.featured)
            }
            let oldKey = books[index].series.map { "\($0.name)|\($0.position)|\($0.featured)" }
            let newKey = newSeries.map { "\($0.name)|\($0.position)|\($0.featured)" }
            if oldKey != newKey {
                books[index].series = newSeries
                markDirty(field: "series", for: bookId)
            }
        }

        if source == .text, !details.tags.isEmpty {
            let selectedTagNames = selectedHardcoverTagNames(from: fields, details: details)
            if !selectedTagNames.isEmpty {
                let current = Self.normalizedTags(books[index].tags)
                let currentKeys = Set(current.map { $0.lowercased() })
                let additions = selectedTagNames.filter { !currentKeys.contains($0.lowercased()) }
                if !additions.isEmpty {
                    books[index].tags = Self.normalizedTags(current + additions)
                    markDirty(field: "tags", for: bookId)
                }
            } else if shouldApplyToCurrent("tags") {
                let tagNames = Self.normalizedTags(details.tags.map(\.name))
                if Self.normalizedTags(books[index].tags) != tagNames {
                    books[index].tags = tagNames
                    markDirty(field: "tags", for: bookId)
                }
            }
        }
    }

    private func selectedHardcoverTagNames(
        from fields: Set<String>,
        details: BookMetadataCandidate,
    ) -> [String] {
        let prefix = "tags:"
        let selectedKeys = Set(
            fields.compactMap { field -> String? in
                guard field.hasPrefix(prefix) else { return nil }
                return String(field.dropFirst(prefix.count)).trimmingCharacters(
                    in: .whitespacesAndNewlines
                )
                .lowercased()
            }
        )
        guard !selectedKeys.isEmpty else { return [] }
        return details.tags.compactMap { tag in
            let key = tag.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return selectedKeys.contains(key) ? tag.name : nil
        }
    }

    static func defaultHardcoverSource(for field: String) -> HardcoverImportSource {
        field == "narrators" ? .audiobook : .text
    }

    private static func languageNameToCode(_ name: String) -> String {
        let target = name.lowercased()
        let english = Locale(identifier: "en")
        for code in Locale.isoLanguageCodes {
            if let localized = english.localizedString(forLanguageCode: code),
                localized.lowercased() == target
            {
                return code
            }
        }
        return name
    }

    func rawHardcoverDataDump(for bookId: BookID) -> String {
        guard let book = books.first(where: { $0.id == bookId }) else {
            return "No book selected."
        }
        guard !book.hardcoverImports.isEmpty else {
            return "No Hardcover data has been imported for this book."
        }

        var parts: [String] = []
        parts.append("Hardcover imported data for \(book.displayTitle)")

        for source in HardcoverImportSource.allCases {
            guard let details = book.hardcoverImports[source] else { continue }
            parts.append("\n\n=== \(source.label) ===")
            if let rawJSON = details.rawJSON {
                parts.append(rawJSON)
            } else {
                parts.append(Self.fallbackHardcoverDump(details))
            }
        }

        return parts.joined(separator: "\n")
    }

    private static func fallbackHardcoverDump(_ details: BookMetadataCandidate) -> String {
        var lines: [String] = []
        func row(_ name: String, _ value: String?) {
            guard let value, !value.isEmpty else { return }
            lines.append("\(name): \(value)")
        }
        row("Title", details.title)
        row("Subtitle", details.subtitle)
        row("Description", details.description)
        row("Release Date", details.releaseDate)
        row("Language", details.language)
        if let rating = details.rating { lines.append("Rating: \(rating)") }
        if !details.authors.isEmpty {
            lines.append("Authors: \(details.authors.joined(separator: ", "))")
        }
        if !details.narrators.isEmpty {
            lines.append("Narrators: \(details.narrators.joined(separator: ", "))")
        }
        if !details.creators.isEmpty {
            let creators = details.creators.map { "\($0.name) (\($0.role))" }
            lines.append("Creators: \(creators.joined(separator: ", "))")
        }
        if !details.series.isEmpty {
            lines.append("Series: \(details.series.map(\.name).joined(separator: ", "))")
        }
        if !details.tags.isEmpty {
            let tags = details.tags.map { "\($0.name) [\($0.count)]" }
            lines.append("Tags: \(tags.joined(separator: ", "))")
        }
        if !details.editions.isEmpty {
            lines.append("\nEditions:")
            for edition in details.editions {
                lines.append("- \(edition.id): \(edition.title ?? "(untitled)")")
                row("  Format", edition.format)
                row("  Edition Info", edition.editionInfo)
                row("  Release Date", edition.releaseDate)
                row("  Language", edition.language)
                row("  Publisher", edition.publisher)
                row("  ISBN-13", edition.isbn13)
                row("  ISBN-10", edition.isbn10)
                row("  ASIN", edition.asin)
            }
        }
        return lines.joined(separator: "\n")
    }

    func revertFieldToOriginal(field: String, for bookId: BookID) {
        guard let index = books.firstIndex(where: { $0.id == bookId }) else { return }
        let orig = books[index].originalMetadata

        switch field {
            case "title":
                books[index].title = orig.title
            case "subtitle":
                books[index].subtitle = orig.subtitle ?? ""
            case "description":
                books[index].description = orig.description ?? ""
            case "language":
                books[index].language = orig.language ?? ""
            case "publicationDate":
                books[index].publicationDate = EditableBook.dateOnly(orig.publicationDate) ?? ""
            case "status":
                books[index].status = orig.status?.name ?? ""
                books[index].statusUuid = orig.status?.uuid ?? ""
            case "authors":
                books[index].authors = orig.authors?.compactMap { $0.name } ?? []
            case "narrators":
                books[index].narrators = orig.narrators?.compactMap { $0.name } ?? []
            case "creators":
                books[index].creators =
                    orig.creators?.map { creator in
                        EditableCreator(
                            name: creator.name ?? "",
                            fileAs: creator.fileAs ?? "",
                            role: creator.role ?? "",
                            uuid: creator.uuid,
                        )
                    } ?? []
            case "series":
                books[index].series =
                    orig.series?.map { s in
                        EditableSeries(
                            name: s.name,
                            position: s.position.map {
                                $0.truncatingRemainder(dividingBy: 1) == 0
                                    ? String(Int($0)) : String($0)
                            } ?? "",
                            featured: s.featured == 1,
                            uuid: s.uuid,
                        )
                    } ?? []
            case "tags":
                books[index].tags = Self.normalizedTags(orig.tags?.map { $0.name } ?? [])
            case "collections":
                books[index].collectionUuids = orig.collections?.compactMap { $0.uuid } ?? []
            case "identifiers":
                books[index].identifiers = books[index].originalIdentifiers
            default:
                break
        }

        books[index].dirtyFields.remove(field)
    }

    func revertAllFields(for bookId: BookID) {
        guard let index = books.firstIndex(where: { $0.id == bookId }) else { return }
        let orig = books[index].originalMetadata
        books[index].title = orig.title
        books[index].subtitle = orig.subtitle ?? ""
        books[index].description = orig.description ?? ""
        books[index].language = orig.language ?? ""
        books[index].publicationDate = EditableBook.dateOnly(orig.publicationDate) ?? ""
        books[index].status = orig.status?.name ?? ""
        books[index].statusUuid = orig.status?.uuid ?? ""
        books[index].authors = orig.authors?.compactMap { $0.name } ?? []
        books[index].narrators = orig.narrators?.compactMap { $0.name } ?? []
        books[index].creators =
            orig.creators?.map { creator in
                EditableCreator(
                    name: creator.name ?? "",
                    fileAs: creator.fileAs ?? "",
                    role: creator.role ?? "",
                    uuid: creator.uuid,
                )
            } ?? []
        books[index].series =
            orig.series?.map { s in
                EditableSeries(
                    name: s.name,
                    position: s.position.map {
                        $0.truncatingRemainder(dividingBy: 1) == 0
                            ? String(Int($0)) : String($0)
                    } ?? "",
                    featured: s.featured == 1,
                    uuid: s.uuid,
                )
            } ?? []
        books[index].tags = Self.normalizedTags(orig.tags?.map { $0.name } ?? [])
        books[index].collectionUuids = orig.collections?.compactMap { $0.uuid } ?? []
        books[index].identifiers = books[index].originalIdentifiers
        books[index].dirtyFields.removeAll()
        books[index].replacementEbookCover = nil
        books[index].replacementAudiobookCover = nil
    }

}

#endif
