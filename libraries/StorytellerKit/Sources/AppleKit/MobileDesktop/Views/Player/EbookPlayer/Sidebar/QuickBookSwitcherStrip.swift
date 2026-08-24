#if os(macOS)
import SwiftUI

struct QuickBookSwitcherStrip: View {
    let currentBookID: BookID?
    let theme: EbookSidebarTheme
    let onSelect: (PlayerBookData) -> Void

    @Environment(MediaViewModel.self) private var mediaViewModel: MediaViewModel?
    @AppStorage("QuickBookSwitcherCollapsed") private var isCollapsed = false

    private static let maxBooks = 5

    private var recents: [BookMetadata] {
        guard let mediaViewModel else { return [] }
        let ordered = HomeSectionDeriver.sections(
            kinds: [.currentlyReading],
            books: mediaViewModel.library.bookMetaData,
            progress: mediaViewModel.bookProgressCache,
            limit: .max,
        ).first?.books ?? []
        return ordered.lazy
            .filter { book in
                mediaViewModel.isCategoryDownloaded(.synced, for: book)
                    || mediaViewModel.isCategoryDownloaded(.ebook, for: book)
            }
            .prefix(Self.maxBooks)
            .map { $0 }
    }

    var body: some View {
        if let mediaViewModel {
            let recents = self.recents
            if !recents.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("QUICK BOOK SWITCHER")
                            .font(.caption2.weight(.semibold))
                            .kerning(0.8)
                            .foregroundStyle(theme.tertiary)
                        Spacer()
                        Image(systemName: "chevron.down")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(theme.tertiary)
                            .rotationEffect(.degrees(isCollapsed ? -90 : 0))
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: 0.18)) {
                            isCollapsed.toggle()
                        }
                    }
                    .help(isCollapsed ? "Show quick book switcher" : "Hide quick book switcher")

                    if !isCollapsed {
                        HStack(alignment: .top, spacing: 8) {
                            ForEach(recents) { book in
                                bookCell(book, mediaViewModel: mediaViewModel)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
        }
    }

    private func bookCell(_ book: BookMetadata, mediaViewModel: MediaViewModel) -> some View {
        let isCurrent = book.id == currentBookID
        return Button {
            guard !isCurrent else { return }
            let category: LocalMediaCategory =
                mediaViewModel.isCategoryDownloaded(.synced, for: book) ? .synced : .ebook
            Task {
                let data = await mediaViewModel.makePlayerBookDataLoadingCovers(
                    for: book,
                    category: category,
                )
                onSelect(data)
            }
        } label: {
            VStack(spacing: 4) {
                Group {
                    if let cover = mediaViewModel.coverImage(for: book, variant: .standard) {
                        cover
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } else {
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(theme.foreground.opacity(0.1))
                            .overlay(
                                Image(systemName: "book.closed")
                                    .font(.caption)
                                    .foregroundStyle(theme.tertiary)
                            )
                    }
                }
                .frame(width: 44, height: 62)
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .strokeBorder(
                            isCurrent ? theme.accent : Color.clear,
                            lineWidth: 2,
                        )
                )

                Text(book.title)
                    .font(.caption2)
                    .foregroundStyle(isCurrent ? theme.foreground : theme.secondary)
                    .lineLimit(1)
                    .frame(width: 48)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(book.title)
        .onAppear {
            mediaViewModel.ensureCoverLoaded(for: book, variant: .standard)
        }
    }
}
#endif
