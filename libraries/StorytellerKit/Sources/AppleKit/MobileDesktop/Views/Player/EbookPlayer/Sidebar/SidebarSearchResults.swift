#if os(macOS)
import SwiftUI

struct SidebarSearchResults: View {
    let viewModel: EbookPlayerViewModel
    let theme: EbookSidebarTheme
    let query: String

    var body: some View {
        Group {
            if let manager = viewModel.searchManager {
                resultsList(manager)
            } else {
                ContentUnavailableView(
                    "Search Unavailable",
                    systemImage: "magnifyingglass",
                    description: Text("The book is still loading."),
                )
            }
        }
        .task(id: query) {
            guard let manager = viewModel.searchManager, !query.isEmpty else { return }
            await manager.startSearch(query: query)
        }
        .onDisappear {
            Task { await viewModel.searchManager?.clearSearch() }
        }
    }

    private func resultsList(_ manager: EbookSearchManager) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if manager.isSearching {
                    ProgressView(value: manager.searchProgress)
                        .progressViewStyle(.linear)
                        .tint(theme.accent)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                } else if manager.hasSearched {
                    Text(
                        manager.totalResultCount == 1
                            ? "1 result"
                            : "\(manager.totalResultCount) results"
                    )
                    .font(.caption)
                    .foregroundStyle(theme.tertiary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                }

                if let error = manager.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 16)
                }

                ForEach(manager.searchResults) { section in
                    if !section.results.isEmpty {
                        Text(section.sectionLabel.uppercased())
                            .font(.caption.weight(.semibold))
                            .kerning(0.8)
                            .foregroundStyle(theme.tertiary)
                            .lineLimit(1)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                            .padding(.bottom, 4)

                        ForEach(section.results) { result in
                            resultRow(result)
                        }
                    }
                }

                if !manager.isSearching && manager.hasSearched && manager.totalResultCount == 0 {
                    ContentUnavailableView(
                        "No Results",
                        systemImage: "magnifyingglass",
                        description: Text("No matches for \"\(query)\" in this book."),
                    )
                    .padding(.top, 20)
                }
            }
            .padding(.bottom, 10)
        }
    }

    private func resultRow(_ result: SearchResult) -> some View {
        Button {
            viewModel.handleSearchResultNavigation(result)
        } label: {
            (Text(result.pre)
                + Text(result.match).bold().foregroundColor(theme.accent)
                + Text(result.post))
                .font(.callout)
                .foregroundStyle(theme.secondary)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
#endif
