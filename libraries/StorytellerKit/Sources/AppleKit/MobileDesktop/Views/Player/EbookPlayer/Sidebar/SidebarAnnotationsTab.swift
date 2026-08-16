#if os(macOS)
import SwiftUI

enum EbookSidebarAnnotationsTab: String, CaseIterable {
    case highlights
    case bookmarks
    case notes

    var title: String {
        switch self {
            case .highlights: return "Highlights"
            case .bookmarks: return "Bookmarks"
            case .notes: return "Notes"
        }
    }
}

struct SidebarAnnotationsTab: View {
    let viewModel: EbookPlayerViewModel
    let sidebarModel: EbookSidebarModel
    let theme: EbookSidebarTheme

    @AppStorage("EbookPlayerSidebarAnnotationsTab")
    private var tabRaw = EbookSidebarAnnotationsTab.highlights.rawValue

    private var selectedTab: EbookSidebarAnnotationsTab {
        EbookSidebarAnnotationsTab(rawValue: tabRaw) ?? .highlights
    }

    private var items: [Highlight] {
        let base: [Highlight]
        switch selectedTab {
            case .highlights:
                base = viewModel.coloredHighlights
            case .bookmarks:
                base = viewModel.bookmarks
            case .notes:
                base = viewModel.coloredHighlights.filter { !($0.note ?? "").isEmpty }
        }
        let query = sidebarModel.annotationSearchText.lowercased()
        guard !query.isEmpty else { return base }
        return base.filter { highlight in
            highlight.text.lowercased().contains(query)
                || (highlight.note?.lowercased().contains(query) ?? false)
                || (highlight.chapterTitle?.lowercased().contains(query) ?? false)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            SidebarSubTabPicker(
                tabs: EbookSidebarAnnotationsTab.allCases.map { ($0, $0.title) },
                selected: selectedTab,
                theme: theme,
                onSelect: { tabRaw = $0.rawValue },
            )

            DebouncedSearchField(
                placeholder: "Search annotations",
                searchText: Bindable(sidebarModel).annotationSearchText,
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            let items = self.items
            if items.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(items) { highlight in
                            annotationRow(highlight)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 10)
                }
            }
        }
    }

    private var emptyState: some View {
        VStack {
            switch selectedTab {
                case .highlights:
                    ContentUnavailableView(
                        "No Highlights",
                        systemImage: "highlighter",
                        description: Text("Select text and right-click to create a highlight."),
                    )
                case .bookmarks:
                    ContentUnavailableView(
                        "No Bookmarks",
                        systemImage: "bookmark",
                        description: Text("Press Cmd-B to open bookmarks and add one."),
                    )
                case .notes:
                    ContentUnavailableView(
                        "No Notes",
                        systemImage: "note.text",
                        description: Text("Highlights with notes show up here."),
                    )
            }
            Spacer()
        }
        .padding(.top, 20)
    }

    private func resolvedColor(for highlight: Highlight) -> Color {
        guard let color = highlight.color else { return theme.secondary }
        let hex = viewModel.settingsVM.hexColor(for: color)
        return Color(hex: hex) ?? color.color
    }

    private func annotationRow(_ highlight: Highlight) -> some View {
        Button {
            Task { await viewModel.navigateToHighlight(highlight) }
        } label: {
            HStack(alignment: .top, spacing: 10) {
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(
                        highlight.isBookmark
                            ? theme.secondary.opacity(0.6)
                            : resolvedColor(for: highlight)
                    )
                    .frame(width: 3)

                VStack(alignment: .leading, spacing: 4) {
                    Text(highlight.displayText)
                        .font(.callout)
                        .foregroundStyle(theme.foreground)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)

                    if selectedTab == .notes, let note = highlight.note, !note.isEmpty {
                        Text(note)
                            .font(.caption)
                            .foregroundStyle(theme.secondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }

                    Text(locationLabel(for: highlight))
                        .font(.caption)
                        .foregroundStyle(theme.tertiary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "arrow.right")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(theme.secondary)
                    .padding(5)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(theme.foreground.opacity(0.07))
                    )
            }
            .padding(10)
            .contentShape(Rectangle())
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(theme.foreground.opacity(0.04))
            )
        }
        .buttonStyle(.plain)
        .contextMenu {
            if !highlight.isBookmark {
                Button("Edit") {
                    viewModel.pendingEditHighlight = highlight
                }
            }
            Button("Delete", role: .destructive) {
                Task { await viewModel.deleteHighlight(highlight) }
            }
        }
    }

    private func locationLabel(for highlight: Highlight) -> String {
        var parts: [String] = []
        if let chapter = highlight.chapterTitle, !chapter.isEmpty {
            parts.append(chapter)
        }
        if let page = highlight.locator.locations?.position {
            parts.append("p. \(page)")
        }
        if parts.isEmpty {
            parts.append(highlight.createdAt.formatted(date: .abbreviated, time: .shortened))
        }
        return parts.joined(separator: " - ")
    }
}
#endif
