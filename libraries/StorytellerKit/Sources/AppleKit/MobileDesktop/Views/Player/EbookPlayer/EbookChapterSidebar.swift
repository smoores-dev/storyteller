#if os(iOS) || os(macOS)
import SwiftUI

struct EbookChapterSidebar: View {
    let chapters: [ChapterItem]
    let selectedChapterId: String?
    let backgroundColor: Color
    let onChapterSelected: (ChapterItem) -> Void

    var body: some View {
        VStack(spacing: 0) {
            Text("Chapters")
                .font(.headline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)

            Divider()

            ChapterSelectionList(
                chapters: chapters,
                selectedChapterId: selectedChapterId,
            ) { chapter in
                onChapterSelected(chapter)
            }
        }
        .background(backgroundColor)
    }
}

#endif
