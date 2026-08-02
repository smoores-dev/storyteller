#if os(tvOS)
import SwiftUI

struct TVChapterListView: View {
    let viewModel: TVPlayerViewModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedIndex: Int?

    private var currentChapterArrayIndex: Int? {
        viewModel.chapters.firstIndex { $0.index == viewModel.currentSectionIndex }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(viewModel.chapters.enumerated()), id: \.offset) {
                        arrayIndex,
                        chapter in
                        Button {
                            Task {
                                await viewModel.jumpToChapter(chapter.index)
                            }
                            dismiss()
                        } label: {
                            HStack {
                                Text(chapter.label)
                                    .font(.headline)

                                Spacer()

                                if chapter.index == viewModel.currentSectionIndex {
                                    Image(systemName: "speaker.wave.2.fill")
                                        .foregroundStyle(.blue)
                                }
                            }
                            .padding()
                        }
                        .buttonStyle(.plain)
                        .focused($focusedIndex, equals: arrayIndex)
                    }
                }
            }
            .defaultFocus($focusedIndex, currentChapterArrayIndex)
            .navigationTitle("Chapters")
        }
    }
}
#endif
