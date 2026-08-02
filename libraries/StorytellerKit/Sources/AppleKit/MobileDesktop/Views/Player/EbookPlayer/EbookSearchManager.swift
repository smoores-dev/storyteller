#if os(iOS) || os(macOS)
import Foundation

/// Grouped search results by section
struct SearchResultSection: Identifiable {
    let id = UUID()
    let sectionLabel: String
    var results: [SearchResult]
}

/// EbookSearchManager - Manages search state and results
@MainActor
@Observable
class EbookSearchManager {

    var isSearching: Bool = false
    var hasSearched: Bool = false
    var searchQuery: String = ""
    var searchProgress: Double = 0.0
    var searchResults: [SearchResultSection] = []
    var totalResultCount: Int = 0
    var errorMessage: String?

    var matchCase: Bool = false
    var matchWholeWords: Bool = false

    weak var commsBridge: ReaderCommsBridge?

    init(bridge: ReaderCommsBridge? = nil) {
        self.commsBridge = bridge
        setupBridgeCallbacks()
    }

    func setupBridgeCallbacks() {
        commsBridge?.onSearchResults = { [weak self] message in
            Task { @MainActor in
                self?.handleSearchResults(message)
            }
        }

        commsBridge?.onSearchProgress = { [weak self] message in
            Task { @MainActor in
                self?.searchProgress = message.progress
            }
        }

        commsBridge?.onSearchComplete = { [weak self] in
            Task { @MainActor in
                self?.isSearching = false
                self?.searchProgress = 1.0
            }
        }

        commsBridge?.onSearchError = { [weak self] message in
            Task { @MainActor in
                self?.isSearching = false
                self?.errorMessage = message.message
            }
        }
    }

    func startSearch(query: String) async {
        guard !query.isEmpty else { return }

        clearResults()
        searchQuery = query
        isSearching = true
        hasSearched = true
        errorMessage = nil

        do {
            try await commsBridge?.sendJsStartSearchCommand(
                query: query,
                matchCase: matchCase,
                matchDiacritics: false,
                matchWholeWords: matchWholeWords,
            )
        } catch {
            isSearching = false
            errorMessage = error.localizedDescription
        }
    }

    func clearSearch() async {
        clearResults()
        do {
            try await commsBridge?.sendJsClearSearchCommand()
        } catch {
            debugLog("[EbookSearchManager] Failed to clear search: \(error)")
        }
    }

    private func clearResults() {
        searchResults = []
        totalResultCount = 0
        searchProgress = 0.0
        errorMessage = nil
        hasSearched = false
    }

    private func handleSearchResults(_ message: SearchResultsMessage) {
        let section = SearchResultSection(
            sectionLabel: message.sectionLabel,
            results: message.results,
        )
        searchResults.append(section)
        totalResultCount += message.results.count
    }

    /// Navigate to a search result (view only, no audio sync)
    func navigateToResult(_ result: SearchResult) async {
        do {
            try await commsBridge?.sendJsGoToCFICommand(cfi: result.cfi)
        } catch {
            debugLog("[EbookSearchManager] Failed to navigate to result: \(error)")
        }
    }
}

#endif
