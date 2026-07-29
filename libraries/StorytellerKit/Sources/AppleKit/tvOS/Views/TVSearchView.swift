#if os(tvOS)
import StorytellerKit
import SwiftUI

struct TVSearchView: View {
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Binding var navigationPath: NavigationPath
    @State private var searchText = ""

    var body: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                if searchText.isEmpty {
                    emptySearchView
                } else if filteredBooks.isEmpty {
                    noResultsView
                } else {
                    resultsGridView
                }
            }
            .navigationDestination(for: BookMetadata.self) { book in
                TVBookDetailView(book: book)
            }
        }
        .searchable(text: $searchText, prompt: "Search books")
    }

    private var emptySearchView: some View {
        VStack(spacing: 20) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 80))
                .foregroundStyle(.secondary)
            Text("Search Your Library")
                .font(.title)
            Text("Search by title, author, or series")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var noResultsView: some View {
        VStack(spacing: 20) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 80))
                .foregroundStyle(.secondary)
            Text("No Results")
                .font(.title)
            Text("No books match \"\(searchText)\"")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var filteredBooks: [BookMetadata] {
        guard !searchText.isEmpty else { return [] }
        return mediaViewModel.library.bookMetaData
            .filter { $0.hasAvailableReadaloud }
            .filter { book in
                book.title.localizedCaseInsensitiveContains(searchText)
                    || book.authors?.contains {
                        $0.name?.localizedCaseInsensitiveContains(searchText) == true
                    } == true
                    || book.series?.contains {
                        $0.name.localizedCaseInsensitiveContains(searchText)
                    } == true
            }
            .sorted { $0.title.articleStrippedCompare($1.title) == .orderedAscending }
    }

    private var resultsGridView: some View {
        ScrollView {
            LazyVGrid(
                columns: [
                    GridItem(.adaptive(minimum: 260, maximum: 320), spacing: 30)
                ],
                spacing: 30,
            ) {
                ForEach(filteredBooks, id: \.id) { book in
                    NavigationLink(value: book) {
                        TVBookCardView(
                            book: book,
                            isDownloaded: isBookDownloaded(book),
                            downloadProgress: downloadProgress(for: book),
                        )
                    }
                    .buttonStyle(.card)
                }
            }
            .padding(.horizontal, 60)
            .padding(.top, 20)
            .padding(.bottom, 60)
        }
    }

    private func isBookDownloaded(_ book: BookMetadata) -> Bool {
        mediaViewModel.isCategoryDownloaded(.synced, for: book)
            || mediaViewModel.isCategoryDownloaded(.audio, for: book)
    }

    private func downloadProgress(for book: BookMetadata) -> Double? {
        if mediaViewModel.isCategoryDownloadInProgress(for: book, category: .synced) {
            return mediaViewModel.downloadProgressFraction(for: book, category: .synced)
        }
        if mediaViewModel.isCategoryDownloadInProgress(for: book, category: .audio) {
            return mediaViewModel.downloadProgressFraction(for: book, category: .audio)
        }
        return nil
    }
}
#endif
