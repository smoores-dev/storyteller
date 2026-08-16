#if os(macOS)
import SwiftUI

struct SidebarSpineList: View {
    let viewModel: EbookPlayerViewModel
    let sidebarModel: EbookSidebarModel
    let theme: EbookSidebarTheme

    @State private var scrollPosition: String?
    @Environment(\.openWindow) private var openWindow

    private var sections: [SectionInfo] {
        viewModel.bookStructure
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(sections) { section in
                    row(for: section)
                        .id(section.id)
                }
            }
            .scrollTargetLayout()
            .padding(.vertical, 6)
        }
        .scrollPosition(id: $scrollPosition, anchor: .center)
        .onAppear(perform: revealSelected)
        .onChange(of: viewModel.currentSectionIndex) { _, _ in revealSelected() }
    }

    private func row(for section: SectionInfo) -> some View {
        let isSelected = viewModel.currentSectionIndex == section.index
        return Button {
            viewModel.progressManager?.handleUserChapterSelected(section.index)
        } label: {
            HStack(spacing: 10) {
                Text(String(format: "%02d", section.index + 1))
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(theme.tertiary)

                Text((section.id as NSString).lastPathComponent)
                    .font(.system(size: 13, design: .monospaced))
                    .fontWeight(isSelected ? .semibold : .regular)
                    .foregroundStyle(theme.foreground)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if let size = sidebarModel.spineFileSizes[section.id] {
                    Text(ByteCountFormatter.string(
                        fromByteCount: Int64(size),
                        countStyle: .file,
                    ))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(theme.secondary)
                }

                if let bookID = viewModel.bookData?.metadata.id {
                    Button {
                        openWindow(
                            id: "EbookChapterReference",
                            value: ChapterReferenceRequest(
                                bookID: bookID,
                                sectionIndex: section.index,
                            ),
                        )
                    } label: {
                        Image(systemName: "arrow.up.forward.square")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(theme.secondary)
                            .padding(4)
                            .background(
                                RoundedRectangle(cornerRadius: 5, style: .continuous)
                                    .fill(theme.foreground.opacity(0.07))
                            )
                    }
                    .buttonStyle(.plain)
                    .help("Open in reference window")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 7)
            .contentShape(Rectangle())
            .background(isSelected ? theme.rowHighlight : Color.clear)
        }
        .buttonStyle(.plain)
        .contextMenu {
            if let bookID = viewModel.bookData?.metadata.id {
                Button("Open Reference Window") {
                    openWindow(
                        id: "EbookChapterReference",
                        value: ChapterReferenceRequest(
                            bookID: bookID,
                            sectionIndex: section.index,
                        ),
                    )
                }
            }
        }
    }

    private func revealSelected() {
        guard let index = viewModel.currentSectionIndex,
            let section = viewModel.bookStructure[safe: index]
        else { return }
        scrollPosition = section.id
    }
}
#endif
