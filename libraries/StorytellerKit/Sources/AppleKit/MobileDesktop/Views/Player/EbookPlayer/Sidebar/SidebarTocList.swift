#if os(macOS)
import SwiftUI

struct SidebarTocList: View {
    let viewModel: EbookPlayerViewModel
    let sidebarModel: EbookSidebarModel
    let theme: EbookSidebarTheme

    @State private var scrollPosition: String?
    @Environment(\.openWindow) private var openWindow

    private enum Row: Identifiable {
        case header(id: String, label: String)
        case chapter(item: ChapterItem, number: Int, duration: Double?, sectionIndex: Int?)

        var id: String {
            switch self {
                case .header(let id, _): return id
                case .chapter(let item, _, _, _): return item.id
            }
        }
    }

    private var rows: [Row] {
        let entries = viewModel.tocEntries
        var result: [Row] = []
        var seenSections = Set<Int>()
        var number = 0

        if !entries.isEmpty {
            let minLevel = entries.map(\.level).min() ?? 0
            let hasDeeper = entries.contains { $0.level > minLevel }
            for (idx, entry) in entries.enumerated() {
                let isHeader =
                    hasDeeper && entry.level == minLevel
                    && (idx + 1 < entries.count && entries[idx + 1].level > minLevel)
                if isHeader {
                    result.append(.header(id: "toc-\(idx)", label: entry.label))
                    continue
                }
                number += 1
                var duration: Double?
                if !seenSections.contains(entry.sectionIndex) {
                    seenSections.insert(entry.sectionIndex)
                    duration = sidebarModel.sectionDurations[entry.sectionIndex]
                }
                result.append(
                    .chapter(
                        item: ChapterItem(
                            id: "toc-\(idx)",
                            label: entry.label,
                            href: entry.href,
                            level: entry.level,
                        ),
                        number: number,
                        duration: duration,
                        sectionIndex: entry.sectionIndex,
                    ))
            }
        } else {
            for item in viewModel.chapterList {
                number += 1
                let sectionIndex = viewModel.bookStructure.firstIndex { $0.id == item.href }
                result.append(
                    .chapter(
                        item: item,
                        number: number,
                        duration: sectionIndex.flatMap { sidebarModel.sectionDurations[$0] },
                        sectionIndex: sectionIndex,
                    ))
            }
        }

        return result
    }

    var body: some View {
        let rows = self.rows
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(rows) { row in
                    switch row {
                        case .header(_, let label):
                            Text(label.uppercased())
                                .font(.caption.weight(.semibold))
                                .kerning(0.8)
                                .foregroundStyle(theme.tertiary)
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 16)
                                .padding(.top, 14)
                                .padding(.bottom, 6)
                        case .chapter(let item, let number, let duration, let sectionIndex):
                            chapterRow(
                                item: item,
                                number: number,
                                duration: duration,
                                sectionIndex: sectionIndex,
                            )
                            .id(item.id)
                    }
                }
            }
            .scrollTargetLayout()
            .padding(.bottom, 8)
        }
        .scrollPosition(id: $scrollPosition, anchor: .center)
        .onAppear(perform: revealSelected)
        .onChange(of: viewModel.selectedChapterHref) { _, _ in revealSelected() }
    }

    private func chapterRow(
        item: ChapterItem,
        number: Int,
        duration: Double?,
        sectionIndex: Int?,
    ) -> some View {
        let isSelected = viewModel.selectedChapterHref == item.id
        return Button {
            viewModel.handleChapterSelection(item)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(number)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(theme.tertiary)
                    .frame(width: 22, alignment: .trailing)

                Text(item.label)
                    .font(.body)
                    .fontWeight(isSelected ? .semibold : .regular)
                    .foregroundStyle(theme.foreground)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if let duration {
                    Text(formatTime(duration))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(theme.secondary)
                }

                if let sectionIndex, let bookID = viewModel.bookData?.metadata.id {
                    Button {
                        openWindow(
                            id: "EbookChapterReference",
                            value: ChapterReferenceRequest(
                                bookID: bookID,
                                sectionIndex: sectionIndex,
                            ),
                        )
                    } label: {
                        Image(systemName: "arrow.up.forward.square")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(theme.secondary)
                            .padding(5)
                            .background(
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(theme.foreground.opacity(0.07))
                            )
                    }
                    .buttonStyle(.plain)
                    .help("Open in reference window")
                }
            }
            .padding(.leading, 16 + CGFloat(max(0, item.level - 1)) * 12)
            .padding(.trailing, 12)
            .padding(.vertical, 7)
            .contentShape(Rectangle())
            .background(isSelected ? theme.rowHighlight : Color.clear)
        }
        .buttonStyle(.plain)
        .contextMenu {
            if let sectionIndex, let bookID = viewModel.bookData?.metadata.id {
                Button("Open Reference Window") {
                    openWindow(
                        id: "EbookChapterReference",
                        value: ChapterReferenceRequest(
                            bookID: bookID,
                            sectionIndex: sectionIndex,
                        ),
                    )
                }
            }
        }
    }

    private func revealSelected() {
        guard let selected = viewModel.selectedChapterHref else { return }
        scrollPosition = selected
    }
}
#endif
