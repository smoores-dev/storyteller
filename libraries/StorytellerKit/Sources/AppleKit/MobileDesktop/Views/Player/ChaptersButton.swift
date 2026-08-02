#if os(iOS) || os(macOS)
import SwiftUI

public struct ChaptersButton: View {
    private let chapters: [ChapterItem]
    private let selectedChapterId: String?
    private let onChapterSelected: (ChapterItem) -> Void
    private let backgroundColor: Color
    private let foregroundColor: Color
    private let transparency: Double
    private let showLabel: Bool
    private let buttonSize: CGFloat
    private let showBackground: Bool

    @State private var showSheet = false

    public init(
        chapters: [ChapterItem],
        selectedChapterId: String? = nil,
        onChapterSelected: @escaping (ChapterItem) -> Void,
        backgroundColor: Color = Color.secondary,
        foregroundColor: Color = Color.primary,
        transparency: Double = 1.0,
        showLabel: Bool = true,
        buttonSize: CGFloat = 38,
        showBackground: Bool = true,
    ) {
        self.chapters = chapters
        self.selectedChapterId = selectedChapterId
        self.onChapterSelected = onChapterSelected
        self.backgroundColor = backgroundColor
        self.foregroundColor = foregroundColor
        self.transparency = transparency
        self.showLabel = showLabel
        self.buttonSize = buttonSize
        self.showBackground = showBackground
    }

    public var body: some View {
        VStack(spacing: 6) {
            #if os(iOS)
            Button(action: { showSheet = true }) {
                buttonLabel
            }
            .buttonStyle(.plain)
            .sheet(isPresented: $showSheet) {
                chaptersSheet
            }
            #else
            Button(action: { showSheet = true }) {
                buttonLabel
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showSheet, arrowEdge: .bottom) {
                chapterSelectionList
                    .frame(width: 360, height: 420)
            }
            #endif

            if showLabel {
                Text("Chapters")
                    .font(.footnote)
                    .foregroundStyle(foregroundColor.opacity(0.7 * transparency))
            }
        }
    }

    private var buttonLabel: some View {
        Image(systemName: "list.bullet")
            .font(.callout.weight(.semibold))
            .foregroundStyle(foregroundColor.opacity(transparency))
            .frame(width: buttonSize, height: buttonSize)
            .background(
                Group {
                    if showBackground {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(backgroundColor.opacity(0.12 * transparency))
                    }
                }
            )
    }

    private var chapterSelectionList: some View {
        ChapterSelectionList(
            chapters: chapters,
            selectedChapterId: selectedChapterId,
        ) { chapter in
            onChapterSelected(chapter)
            showSheet = false
        }
    }

    #if os(iOS)
    private var chaptersSheet: some View {
        NavigationStack {
            chapterSelectionList
                .navigationTitle("Chapters")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") {
                            showSheet = false
                        }
                    }
                }
        }
        .presentationDetents([.medium, .large])
    }
    #endif
}

struct ChapterSelectionList: View {
    let chapters: [ChapterItem]
    let selectedChapterId: String?
    let onChapterSelected: (ChapterItem) -> Void

    @State private var scrollPosition: String?

    init(
        chapters: [ChapterItem],
        selectedChapterId: String?,
        onChapterSelected: @escaping (ChapterItem) -> Void,
    ) {
        self.chapters = chapters
        self.selectedChapterId = selectedChapterId
        self.onChapterSelected = onChapterSelected
        _scrollPosition = State(initialValue: selectedChapterId)
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(chapters, id: \.id) { chapter in
                    Button(action: { onChapterSelected(chapter) }) {
                        HStack {
                            Text(chapter.label)
                                .font(.body)
                                .foregroundStyle(.primary)
                                .padding(.leading, CGFloat(chapter.level) * 16)
                            Spacer()
                            if selectedChapterId == chapter.id {
                                Image(systemName: "checkmark")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(Color.accentColor)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 7)
                        .contentShape(Rectangle())
                        .background(
                            chapter.id == selectedChapterId
                                ? Color.accentColor.opacity(0.14)
                                : Color.clear
                        )
                    }
                    .buttonStyle(.plain)
                    .id(chapter.id)

                    Divider()
                }
            }
            .scrollTargetLayout()
        }
        .scrollPosition(id: $scrollPosition, anchor: .center)
        .onAppear(perform: revealSelectedChapter)
        .onChange(of: selectedChapterId) { _, _ in revealSelectedChapter() }
        .onChange(of: chapters) { _, _ in revealSelectedChapter() }
    }

    private func revealSelectedChapter() {
        guard let selectedChapterId,
            chapters.contains(where: { $0.id == selectedChapterId })
        else { return }
        scrollPosition = selectedChapterId
    }
}

#endif
