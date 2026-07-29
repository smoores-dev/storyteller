#if os(iOS) || os(macOS)
import SwiftUI

@available(macOS 14.0, iOS 17.0, *)
struct EbookSearchPanel: View {
    @Bindable var searchManager: EbookSearchManager
    let onDismiss: () -> Void
    let onResultSelected: (SearchResult) -> Void

    var body: some View {
        VStack(spacing: 0) {
            searchHeader
            Divider()
            searchResultsContent
        }
    }

    private var searchHeader: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                searchBar

                #if os(iOS)
                Button("Done") { onDismiss() }
                    .padding(.trailing, 8)
                #endif
            }
            .padding(.horizontal)
            .padding(.top, 12)

            searchOptions
                .padding(.horizontal)
                .padding(.bottom, 8)
        }
    }

    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)

            TextField("Search in book...", text: $searchManager.searchQuery)
                .textFieldStyle(.plain)
                .onSubmit {
                    Task { await searchManager.startSearch(query: searchManager.searchQuery) }
                }

            if !searchManager.searchQuery.isEmpty {
                Button {
                    searchManager.searchQuery = ""
                    Task { await searchManager.clearSearch() }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            if searchManager.isSearching {
                ProgressView()
                    .controlSize(.small)
            }
        }
        .padding(8)
        .background(Color.secondary.opacity(0.1))
        .clipShape(.rect(cornerRadius: 8))
    }

    private var searchOptions: some View {
        HStack(spacing: 16) {
            Toggle("Match case", isOn: $searchManager.matchCase)
            Toggle("Whole words", isOn: $searchManager.matchWholeWords)
            Spacer()
        }
        .font(.caption)
        #if os(macOS)
        .toggleStyle(.checkbox)
        #endif
    }

    @ViewBuilder
    private var searchResultsContent: some View {
        if let error = searchManager.errorMessage {
            ContentUnavailableView(
                "Search Error",
                systemImage: "exclamationmark.triangle",
                description: Text(error),
            )
        } else if searchManager.searchResults.isEmpty && !searchManager.isSearching {
            ContentUnavailableView(
                "No Results",
                systemImage: "magnifyingglass",
                description: Text(
                    searchManager.searchQuery.isEmpty
                        ? "Enter a search term"
                        : (!searchManager.hasSearched
                            ? "Press Return to search"
                            : "No matches found for \"\(searchManager.searchQuery)\"")
                ),
            )
        } else {
            searchResultsList
        }
    }

    private var searchResultsList: some View {
        VStack(alignment: .leading, spacing: 0) {
            if searchManager.isSearching && searchManager.searchProgress < 1.0 {
                ProgressView(value: searchManager.searchProgress)
                    .padding(.horizontal)
                    .padding(.vertical, 8)
            }

            if searchManager.totalResultCount > 0 {
                Text(
                    "\(searchManager.totalResultCount) result\(searchManager.totalResultCount == 1 ? "" : "s")"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal)
                .padding(.vertical, 4)
            }

            List {
                ForEach(searchManager.searchResults) { section in
                    Section(header: Text(section.sectionLabel)) {
                        ForEach(section.results) { result in
                            Button {
                                onResultSelected(result)
                            } label: {
                                SearchResultRow(result: result)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .listStyle(.plain)
        }
    }
}

@available(macOS 14.0, iOS 17.0, *)
private struct SearchResultRow: View {
    let result: SearchResult

    var body: some View {
        HStack(spacing: 0) {
            Text(result.pre)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            Text(result.match)
                .fontWeight(.semibold)
                .foregroundStyle(.primary)

            Text(result.post)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .font(.subheadline)
        .padding(.vertical, 4)
    }
}

#endif
