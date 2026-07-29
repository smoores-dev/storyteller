#if os(iOS) || os(macOS)
import Foundation
import SwiftUI

@MainActor
@Observable
final class AudnexusImportViewModel {
    var searchQuery: String = ""
    var region: String = "us"
    var searchResults: [AudnexusSearchResult] = []
    var selectedAsin: String?
    var fetchedDetails: AudnexusBookDetails?
    var isSearching = false
    var isFetching = false
    var hasSearched = false
    var error: String?

    var selectedFields: Set<String> = []

    // Audnexus has no general contributors/roles, so "creators" is intentionally absent from the
    // defaults; the metadata editor's Hardcover fallback still fills that field when it has a match.
    static let defaultFields: Set<String> = [
        "title", "subtitle", "description", "language", "publicationDate",
        "authors", "narrators", "series", "tags",
    ]

    static let regions = ["us", "uk", "de", "fr", "ca", "au", "it", "es", "jp", "in"]

    private static let selectedFieldsKey = "audnexusImport.selectedFields"
    private static let regionKey = "audnexusImport.region"

    func loadPreferences() {
        if let saved = UserDefaults.standard.stringArray(forKey: Self.selectedFieldsKey) {
            selectedFields = Set(saved)
        } else {
            selectedFields = Self.defaultFields
        }
        if let savedRegion = UserDefaults.standard.string(forKey: Self.regionKey),
            Self.regions.contains(savedRegion)
        {
            region = savedRegion
        }
    }

    func persistFieldSelection() {
        UserDefaults.standard.set(Array(selectedFields), forKey: Self.selectedFieldsKey)
    }

    func persistRegion() {
        UserDefaults.standard.set(region, forKey: Self.regionKey)
    }

    func prefill(title: String, author: String?) {
        let author = author?.trimmingCharacters(in: .whitespacesAndNewlines)
        searchQuery = [title, author]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    func search() async {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return }

        isSearching = true
        error = nil
        selectedAsin = nil
        fetchedDetails = nil

        do {
            searchResults = try await AudnexusActor.shared.searchBooks(
                title: query,
                author: nil,
                region: region,
            )
            hasSearched = true
            if searchResults.isEmpty {
                error = "No audiobook results found for \"\(query)\""
            }
        } catch {
            self.error = Self.message(for: error)
            searchResults = []
            hasSearched = true
        }

        isSearching = false

        if let first = searchResults.first {
            await selectResult(first)
        }
    }

    func selectResult(_ result: AudnexusSearchResult) async {
        selectedAsin = result.asin
        fetchedDetails = nil
        isFetching = true
        error = nil
        do {
            fetchedDetails = try await AudnexusActor.shared.fetchBookDetails(
                asin: result.asin,
                region: region,
            )
        } catch {
            self.error = Self.message(for: error)
        }
        isFetching = false
    }

    /// Reuses the metadata editor's existing Hardcover import pipeline: the details go under both
    /// `.text` and `.audiobook` so narrator fields (routed to the audiobook source) also apply.
    func buildImports() -> [MetadataEditorViewModel.HardcoverImportSource: BookMetadataCandidate]? {
        guard let details = fetchedDetails else { return nil }
        let converted = details.asMetadataCandidate
        return [.text: converted, .audiobook: converted]
    }

    private static func message(for error: Error) -> String {
        switch error {
            case HTTPRequestError.notFound:
                return "Not found on Audnexus/Audible"
            case HTTPRequestError.unauthorized:
                return "Audible declined the request"
            default:
                return error.localizedDescription
        }
    }
}

#endif
