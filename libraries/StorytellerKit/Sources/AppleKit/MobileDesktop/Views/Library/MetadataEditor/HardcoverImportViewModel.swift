#if os(iOS) || os(macOS)
import Foundation
import SwiftUI

@MainActor
@Observable
final class HardcoverImportViewModel {
    var searchQuery: String = ""
    var searchResults: [HardcoverSearchResult] = []
    var selectedResult: HardcoverSearchResult?
    var fetchedDetails: BookMetadataCandidate?
    var isSearching = false
    var isFetching = false
    var error: String?

    var tokenInput: String = ""
    var hasToken = false
    var isEditingToken = false

    var infoDetails: [Int: BookMetadataCandidate] = [:]
    var infoFetchingId: Int?

    func fetchInfo(for result: HardcoverSearchResult) async {
        guard infoDetails[result.id] == nil else { return }
        infoFetchingId = result.id
        do {
            let details = try await HardcoverActor.shared.fetchBookDetails(id: result.id)
            infoDetails[result.id] = details
        } catch {
            self.error = error.localizedDescription
        }
        infoFetchingId = nil
    }

    var selectedFields: Set<String> = []

    private static let defaultFields: Set<String> = [
        "title", "subtitle", "description", "language", "publicationDate",
        "authors", "narrators", "creators", "series", "tags",
    ]

    private static let selectedFieldsKey = "hardcoverImport.selectedFields"

    func loadFieldSelection() {
        if let saved = UserDefaults.standard.stringArray(forKey: Self.selectedFieldsKey) {
            selectedFields = Set(saved)
        } else {
            selectedFields = Self.defaultFields
        }
    }

    func loadToken() async {
        do {
            if let token = try await AuthenticationActor.shared.loadHardcoverToken() {
                await HardcoverActor.shared.setToken(token)
                hasToken = true
            }
        } catch {
            self.error = "Failed to load token: \(error.localizedDescription)"
        }
    }

    func saveToken() async {
        var trimmed = tokenInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.lowercased().hasPrefix("bearer") {
            trimmed = String(trimmed.dropFirst(6)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard !trimmed.isEmpty else { return }
        do {
            try await AuthenticationActor.shared.saveHardcoverToken(trimmed)
            await HardcoverActor.shared.setToken(trimmed)
            hasToken = true
            isEditingToken = false
            tokenInput = ""
            error = nil
        } catch {
            self.error = "Failed to save token: \(error.localizedDescription)"
        }
    }

    func clearToken() async {
        do {
            try await AuthenticationActor.shared.deleteHardcoverToken()
            await HardcoverActor.shared.setToken(nil)
            hasToken = false
            isEditingToken = false
            tokenInput = ""
        } catch {
            self.error = "Failed to clear token: \(error.localizedDescription)"
        }
    }

    var hasSearched = false

    func search() async {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return }

        isSearching = true
        error = nil
        selectedResult = nil
        fetchedDetails = nil
        selectedEditionId = nil
        selectedTextEditionId = nil
        selectedAudiobookEditionId = nil
        selectedTextDetails = nil
        selectedAudiobookDetails = nil

        do {
            searchResults = try await HardcoverActor.shared.searchBooks(query: query)
            hasSearched = true
            if searchResults.isEmpty {
                error = "No results found for \"\(query)\""
            }
        } catch {
            self.error = error.localizedDescription
            searchResults = []
            hasSearched = true
        }

        isSearching = false

        if let first = searchResults.first {
            await selectResult(first)
        }
    }

    var selectedEditionId: Int?
    var selectedTextEditionId: Int?
    var selectedAudiobookEditionId: Int?
    var selectedTextDetails: BookMetadataCandidate?
    var selectedAudiobookDetails: BookMetadataCandidate?

    var selectedImports: [MetadataEditorViewModel.HardcoverImportSource: BookMetadataCandidate] {
        var imports: [MetadataEditorViewModel.HardcoverImportSource: BookMetadataCandidate] = [:]
        if let selectedTextDetails {
            imports[.text] = selectedTextDetails
        } else if let fetchedDetails {
            imports[.text] = fetchedDetails
        }
        if let selectedAudiobookDetails {
            imports[.audiobook] = selectedAudiobookDetails
        }
        return imports
    }

    func clearAudiobookSelection() {
        selectedAudiobookEditionId = nil
        selectedAudiobookDetails = nil
        if selectedTextDetails == nil {
            selectedResult = nil
            selectedEditionId = nil
            fetchedDetails = nil
        }
    }

    func useFetchedDetailsForAudiobook() {
        selectedAudiobookEditionId = nil
        selectedAudiobookDetails = fetchedDetails
    }

    func selectResult(_ result: HardcoverSearchResult) async {
        selectedResult = result
        selectedEditionId = nil
        selectedTextEditionId = nil
        selectedAudiobookEditionId = nil
        selectedTextDetails = nil
        selectedAudiobookDetails = nil
        isFetching = true
        error = nil
        fetchedDetails = nil

        do {
            let details = try await HardcoverActor.shared.fetchBookDetails(id: result.id)
            infoDetails[result.id] = details
            fetchedDetails = details
            selectedTextDetails = details
            selectedTextEditionId = nil
        } catch {
            self.error = error.localizedDescription
        }

        isFetching = false
    }

    func selectEdition(
        _ edition: BookEditionCandidate,
        bookId: Int,
        source: MetadataEditorViewModel.HardcoverImportSource,
    ) {
        guard let details = detailsForEdition(edition, bookId: bookId) else { return }
        selectedEditionId = edition.id
        switch source {
            case .text:
                selectedTextEditionId = edition.id
            case .audiobook:
                selectedAudiobookEditionId = edition.id
        }

        fetchedDetails = details
        switch source {
            case .text:
                selectedTextDetails = details
            case .audiobook:
                selectedAudiobookDetails = details
        }
    }

    func detailsForEdition(
        _ edition: BookEditionCandidate,
        bookId: Int,
    ) -> BookMetadataCandidate? {
        guard let bookDetails = infoDetails[bookId] else { return nil }

        let releaseDate: String? = {
            guard let raw = edition.releaseDate else { return bookDetails.releaseDate }
            if let date = StorytellerDate.parse(raw, field: .releaseDate) {
                return StorytellerDate.isoFull(from: date)
            }
            return raw
        }()

        let details = BookMetadataCandidate(
            id: bookDetails.id,
            slug: bookDetails.slug,
            title: edition.title ?? bookDetails.title,
            subtitle: edition.subtitle ?? bookDetails.subtitle,
            description: bookDetails.description,
            releaseDate: releaseDate,
            rating: bookDetails.rating,
            language: edition.language ?? bookDetails.language,
            authors: bookDetails.authors,
            narrators: edition.narrators.isEmpty ? bookDetails.narrators : edition.narrators,
            creators: edition.otherContributors.isEmpty
                ? bookDetails.creators : edition.otherContributors,
            series: bookDetails.series,
            tags: bookDetails.tags,
            defaultAudioEdition: bookDetails.defaultAudioEdition,
            editions: bookDetails.editions,
            imageUrl: edition.imageUrl ?? bookDetails.imageUrl,
            imageWidth: edition.imageUrl != nil ? edition.imageWidth : bookDetails.imageWidth,
            imageHeight: edition.imageUrl != nil ? edition.imageHeight : bookDetails.imageHeight,
            rawJSON: bookDetails.rawJSON,
            importedIdentifiers: edition.importableIdentifiers,
        )
        return details
    }

    func prefill(title: String, author: String?) {
        var query = title
        if let author, !author.isEmpty {
            query += " \(author)"
        }
        searchQuery = query
    }
}

#endif
