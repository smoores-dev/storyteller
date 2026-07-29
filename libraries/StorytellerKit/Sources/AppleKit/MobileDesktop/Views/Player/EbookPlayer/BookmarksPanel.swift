#if os(iOS) || os(macOS)
import SwiftUI

@available(macOS 14.0, iOS 17.0, *)
struct BookmarksPanel: View {
    let bookmarks: [Highlight]
    let highlights: [Highlight]
    let onNavigate: (Highlight) -> Void
    let onDelete: (Highlight) -> Void
    let onAddBookmark: () -> Void
    let highlightColorResolver: (HighlightColor?) -> Color

    @State private var selectedTab: Tab = .bookmarks
    @State private var selectedHighlight: Highlight?

    init(
        bookmarks: [Highlight],
        highlights: [Highlight],
        onDismiss _: @escaping () -> Void,
        onNavigate: @escaping (Highlight) -> Void,
        onDelete: @escaping (Highlight) -> Void,
        onAddBookmark: @escaping () -> Void,
        highlightColorResolver: @escaping (HighlightColor?) -> Color,
        initialTab: Tab = .bookmarks,
    ) {
        self.bookmarks = bookmarks
        self.highlights = highlights
        self.onNavigate = onNavigate
        self.onDelete = onDelete
        self.onAddBookmark = onAddBookmark
        self.highlightColorResolver = highlightColorResolver
        self._selectedTab = State(initialValue: initialTab)
    }

    enum Tab: String, CaseIterable {
        case bookmarks = "Bookmarks"
        case highlights = "Highlights"
    }

    private var emptyStateDescription: String {
        #if os(iOS)
        selectedTab == .bookmarks
            ? "Tap the button below to bookmark the current page"
            : "Long-press on text to create a highlight"
        #else
        selectedTab == .bookmarks
            ? "Click the button below to bookmark the current page"
            : "Select text and right-click to create a highlight"
        #endif
    }

    var body: some View {
        VStack(spacing: 0) {
            if let highlight = selectedHighlight {
                HighlightDetailView(
                    highlight: highlight,
                    highlightColorResolver: highlightColorResolver,
                    onBack: { selectedHighlight = nil },
                    onNavigate: {
                        onNavigate(highlight)
                    },
                    onDelete: {
                        onDelete(highlight)
                        selectedHighlight = nil
                    },
                )
            } else {
                tabPicker
                Divider()
                content
            }
        }
        #if os(macOS)
        .frame(width: 340, height: 450)
        #endif
    }

    private var tabPicker: some View {
        HStack(spacing: 0) {
            ForEach(Tab.allCases, id: \.self) { tab in
                Button {
                    selectedTab = tab
                } label: {
                    VStack(spacing: 4) {
                        HStack(spacing: 4) {
                            Text(tab.rawValue)
                                .font(.subheadline)
                                .fontWeight(selectedTab == tab ? .semibold : .regular)

                            let count = tab == .bookmarks ? bookmarks.count : highlights.count
                            if count > 0 {
                                Text("\(count)")
                                    .font(.caption2)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 1)
                                    .background(
                                        Capsule()
                                            .fill(
                                                selectedTab == tab
                                                    ? Color.accentColor
                                                    : Color.secondary.opacity(0.3)
                                            )
                                    )
                                    .foregroundStyle(selectedTab == tab ? .white : .secondary)
                            }
                        }
                        .foregroundStyle(selectedTab == tab ? .primary : .secondary)

                        Rectangle()
                            .fill(selectedTab == tab ? Color.accentColor : Color.clear)
                            .frame(height: 2)
                    }
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal)
        .padding(.top, 12)
    }

    @ViewBuilder
    private var content: some View {
        switch selectedTab {
            case .bookmarks:
                bookmarksContent
            case .highlights:
                highlightsContent
        }
    }

    @ViewBuilder
    private var bookmarksContent: some View {
        if bookmarks.isEmpty {
            VStack(spacing: 16) {
                ContentUnavailableView(
                    "No Bookmarks",
                    systemImage: "bookmark",
                    description: Text(emptyStateDescription),
                )

                Button {
                    onAddBookmark()
                } label: {
                    Label("Bookmark Current Page", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            List {
                Section {
                    Button {
                        onAddBookmark()
                    } label: {
                        Label("Bookmark Current Page", systemImage: "plus")
                            .foregroundStyle(Color.accentColor)
                    }
                }

                Section {
                    ForEach(bookmarks) { bookmark in
                        BookmarkRow(
                            highlight: bookmark,
                            onTap: { selectedHighlight = bookmark },
                            onNavigate: { onNavigate(bookmark) },
                            onDelete: { onDelete(bookmark) },
                        )
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                onDelete(bookmark)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #else
            .listStyle(.inset)
            #endif
        }
    }

    @ViewBuilder
    private var highlightsContent: some View {
        if highlights.isEmpty {
            VStack {
                ContentUnavailableView(
                    "No Highlights",
                    systemImage: "highlighter",
                    description: Text(emptyStateDescription),
                )
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            List {
                ForEach(highlights) { highlight in
                    HighlightRow(
                        highlight: highlight,
                        highlightColorResolver: highlightColorResolver,
                        onTap: { selectedHighlight = highlight },
                        onNavigate: { onNavigate(highlight) },
                        onDelete: { onDelete(highlight) },
                    )
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            onDelete(highlight)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #else
            .listStyle(.inset)
            #endif
        }
    }
}

@available(macOS 14.0, iOS 17.0, *)
private struct BookmarkRow: View {
    let highlight: Highlight
    let onTap: () -> Void
    let onNavigate: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 16) {
            Button(action: onTap) {
                HStack {
                    Image(systemName: "bookmark.fill")
                        .foregroundStyle(.blue)

                    VStack(alignment: .leading, spacing: 4) {
                        if let chapter = highlight.chapterTitle {
                            Text(chapter)
                                .font(.subheadline)
                                .lineLimit(2)
                        } else {
                            Text(highlight.displayText)
                                .font(.subheadline)
                                .lineLimit(2)
                        }

                        if let note = highlight.note, !note.isEmpty {
                            Text(note)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }

                        Text(highlight.createdAt, style: .date)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.body)
                        .foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button(action: onNavigate) {
                Image(systemName: "arrow.right.circle")
                    .font(.title3)
                    .foregroundStyle(Color.accentColor)
            }
            .buttonStyle(.plain)
            .help("Go to bookmark")

            Button(action: onDelete) {
                Image(systemName: "trash")
                    .font(.title3)
                    .foregroundStyle(.red)
            }
            .buttonStyle(.plain)
            .help("Delete")
        }
    }
}

@available(macOS 14.0, iOS 17.0, *)
private struct HighlightRow: View {
    let highlight: Highlight
    let highlightColorResolver: (HighlightColor?) -> Color
    let onTap: () -> Void
    let onNavigate: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 16) {
            Button(action: onTap) {
                HStack {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(highlightColorResolver(highlight.color))
                        .frame(width: 6)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(highlight.displayText)
                            .font(.subheadline)
                            .lineLimit(2)

                        if let note = highlight.note, !note.isEmpty {
                            Text(note)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }

                        HStack(spacing: 8) {
                            if let chapter = highlight.chapterTitle {
                                Text(chapter)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Text(highlight.createdAt, style: .date)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.body)
                        .foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button(action: onNavigate) {
                Image(systemName: "arrow.right.circle")
                    .font(.title3)
                    .foregroundStyle(Color.accentColor)
            }
            .buttonStyle(.plain)
            .help("Go to highlight")

            Button(action: onDelete) {
                Image(systemName: "trash")
                    .font(.title3)
                    .foregroundStyle(.red)
            }
            .buttonStyle(.plain)
            .help("Delete")
        }
    }
}

@available(macOS 14.0, iOS 17.0, *)
private struct HighlightDetailView: View {
    let highlight: Highlight
    let highlightColorResolver: (HighlightColor?) -> Color
    let onBack: () -> Void
    let onNavigate: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: onBack) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Back")
                    }
                    .font(.subheadline)
                }
                .buttonStyle(.plain)

                Spacer()

                Button(action: onDelete) {
                    Image(systemName: "trash")
                        .foregroundStyle(.red)
                }
                .buttonStyle(.plain)
            }
            .padding()

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .top, spacing: 12) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(highlightColorResolver(highlight.color))
                            .frame(width: 6)

                        Text(highlight.text)
                            .font(.body)
                            .textSelection(.enabled)
                    }

                    if let note = highlight.note, !note.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Note")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .textCase(.uppercase)

                            Text(note)
                                .font(.subheadline)
                                .textSelection(.enabled)
                        }
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.secondary.opacity(0.1))
                        .cornerRadius(8)
                    }

                    HStack(spacing: 8) {
                        if let chapter = highlight.chapterTitle {
                            Text(chapter)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Text(highlight.createdAt, style: .date)
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
                .padding()
            }

            Divider()

            Button(action: onNavigate) {
                Label("Go to Highlight", systemImage: "arrow.right.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .padding()
        }
    }
}

#endif
