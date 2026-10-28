#if os(tvOS)
import StorytellerKit
import SwiftUI

struct TVDownloadsView: View {
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Binding var navigationPath: NavigationPath

    var body: some View {
        let downloadedBooks = mediaViewModel.library.bookMetaData.filter { book in
            mediaViewModel.isCategoryDownloaded(.synced, for: book)
                || mediaViewModel.isCategoryDownloaded(.audio, for: book)
        }

        NavigationStack(path: $navigationPath) {
            Group {
                if !mediaViewModel.isReady {
                    ProgressView("Loading...")
                } else if downloadedBooks.isEmpty {
                    emptyStateView
                } else {
                    booksGridView(books: downloadedBooks)
                }
            }
            .libraryRefreshDemand(model: mediaViewModel)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: BookMetadata.self) { book in
                TVBookDetailView(book: book)
            }
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "arrow.down.circle")
                .font(.system(size: 80))
                .foregroundStyle(.secondary)
            Text("No Downloads")
                .font(.title)
            Text("Download books from the Library tab to listen offline")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func booksGridView(books: [BookMetadata]) -> some View {
        let sorted = books.sorted {
            $0.title.articleStrippedCompare($1.title) == .orderedAscending
        }

        return ScrollView {
            LazyVGrid(
                columns: [
                    GridItem(.adaptive(minimum: 260, maximum: 320), spacing: 30)
                ],
                spacing: 30,
            ) {
                ForEach(sorted, id: \.id) { book in
                    NavigationLink(value: book) {
                        TVBookCardView(
                            book: book,
                            isDownloaded: true,
                            downloadProgress: nil,
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
}
#endif
