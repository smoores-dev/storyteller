#if os(iOS) || os(macOS)
import SwiftUI

struct SeriesStackView: View {
    let books: [BookMetadata]
    let mediaKind: MediaKind
    let availableWidth: CGFloat
    let showAudioIndicator: Bool
    let coverPreference: CoverPreference
    let onSelect: (BookMetadata) -> Void
    var onInfo: ((BookMetadata) -> Void)? = nil
    @Environment(MediaViewModel.self) private var mediaViewModel
    #if os(macOS)
    @State private var hoveredBookID: BookMetadata.ID? = nil
    #endif
    @State private var currentPage: Int = 0
    @State private var isExiting: Bool = false
    @State private var exitDirection: CGFloat = -1

    private let coverHeight: CGFloat = 220
    private let minOverlapRatio: CGFloat = 0.0
    private let maxOverlapRatio: CGFloat = 0.90
    private let pageSize: Int = 10

    private var totalPages: Int {
        max(1, (books.count + pageSize - 1) / pageSize)
    }

    private var currentPageBooks: [BookMetadata] {
        let startIndex = currentPage * pageSize
        let endIndex = min(startIndex + pageSize, books.count)
        guard startIndex < books.count else { return [] }
        return Array(books[startIndex..<endIndex])
    }

    private var showPagination: Bool {
        books.count > pageSize
    }

    var body: some View {
        let safeAvailableWidth = max(availableWidth, 100)
        let displayBooks = currentPageBooks
        let layout = calculateLayout(for: displayBooks, availableWidth: safeAvailableWidth)

        VStack(spacing: 8) {
            ZStack(alignment: .leading) {
                ForEach(Array(displayBooks.enumerated()), id: \.element.id) { index, book in
                    coverView(
                        for: book,
                        index: index,
                        layout: layout,
                        totalCount: displayBooks.count,
                    )
                }
            }
            .frame(width: layout.totalWidth, height: coverHeight, alignment: .leading)

            if showPagination {
                paginationControls
            }
        }
    }

    private var exitXOffset: CGFloat {
        isExiting ? exitDirection * 800 : 0
    }

    private var exitRotationY: Double {
        isExiting ? Double(exitDirection) * -90 : 0
    }

    private func changePage(by delta: Int) {
        let newPage = currentPage + delta
        guard newPage >= 0, newPage < totalPages, !isExiting else { return }

        exitDirection = delta > 0 ? -1 : 1
        withAnimation(.easeIn(duration: 0.25)) {
            isExiting = true
        } completion: {
            currentPage = newPage
            exitDirection = -exitDirection
            withAnimation(.easeOut(duration: 0.25)) {
                isExiting = false
            }
        }
    }

    private var paginationControls: some View {
        HStack(spacing: 12) {
            Button {
                changePage(by: -1)
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(currentPage > 0 ? .primary : .tertiary)
            }
            .buttonStyle(.plain)
            .disabled(currentPage == 0 || isExiting)

            Text("\(currentPage + 1)/\(totalPages)")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
                .monospacedDigit()

            Button {
                changePage(by: 1)
            } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(currentPage < totalPages - 1 ? .primary : .tertiary)
            }
            .buttonStyle(.plain)
            .disabled(currentPage >= totalPages - 1 || isExiting)
        }
    }

    private func coverView(for book: BookMetadata, index: Int, layout: LayoutInfo, totalCount: Int)
        -> some View
    {
        let coverVariant = resolveCoverVariant(for: book)
        let coverWidth = coverHeight * coverVariant.preferredAspectRatio
        let placeholderColor = Color(white: 0.2)
        let coverState = mediaViewModel.coverState(for: book, variant: coverVariant)
        #if os(macOS)
        let isHovered = hoveredBookID == book.id
        #endif

        return Button {
            onSelect(book)
        } label: {
            ZStack {
                placeholderColor

                if let image = coverState.image {
                    image
                        .resizable()
                        .interpolation(.high)
                        .scaledToFill()
                        .frame(width: coverWidth, height: coverHeight)
                        .clipped()
                }
            }
            .frame(width: coverWidth, height: coverHeight)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .stableCoverRendering()
            .overlay(alignment: .bottomTrailing) {
                if showAudioIndicator {
                    AudioIndicatorBadge(item: book, coverVariant: coverVariant)
                        .padding(2)
                }
            }
            .shadow(color: .black.opacity(0.2), radius: 4, x: 0, y: 2)
            .contentShape(Rectangle())
            #if os(macOS)
            .scaleEffect(isHovered ? 1.08 : 1.0, anchor: .bottom)
            .animation(.easeOut(duration: 0.2), value: isHovered)
            #endif
        }
        .buttonStyle(.plain)
        #if os(macOS)
        .zIndex(isHovered ? 1000 : Double(totalCount - index))
        .onHover { hovering in
            hoveredBookID = hovering ? book.id : nil
        }
        .contextMenu {
            BookContextMenuContent(item: book, onInfo: onInfo)
        }
        #else
        .zIndex(Double(totalCount - index))
        #endif
        .rotation3DEffect(
            .degrees(exitRotationY),
            axis: (x: 0, y: 1, z: 0),
            anchor: .center,
            perspective: 0.4,
        )
        .offset(x: layout.offset(for: index) + exitXOffset)
        .task {
            mediaViewModel.ensureCoverLoaded(for: book, variant: coverVariant)
        }
        .onDisappear {
            mediaViewModel.cancelCoverLoad(for: book, variant: coverVariant)
        }
    }

    private func calculateLayout(for pageBooks: [BookMetadata], availableWidth: CGFloat)
        -> LayoutInfo
    {
        guard !pageBooks.isEmpty else {
            return LayoutInfo(offsets: [], totalWidth: 0)
        }

        var coverWidths: [CGFloat] = []
        for book in pageBooks {
            let variant = resolveCoverVariant(for: book)
            let width = coverHeight * variant.preferredAspectRatio
            coverWidths.append(width)
        }

        guard pageBooks.count > 1 else {
            return LayoutInfo(offsets: [0], totalWidth: coverWidths[0])
        }

        let minVisibleRatio = 1.0 - minOverlapRatio
        let maxVisibleRatio = 1.0 - maxOverlapRatio

        let idealWidth =
            coverWidths.dropLast().reduce(0) { $0 + $1 * minVisibleRatio } + coverWidths.last!

        let maxCompressedWidth =
            coverWidths.dropLast().reduce(0) { $0 + $1 * maxVisibleRatio } + coverWidths.last!

        var offsets: [CGFloat] = []
        var currentOffset: CGFloat = 0
        var totalWidth: CGFloat

        if availableWidth >= idealWidth {
            for (index, width) in coverWidths.enumerated() {
                offsets.append(currentOffset)
                if index < coverWidths.count - 1 {
                    currentOffset += width * minVisibleRatio
                }
            }
            totalWidth = idealWidth
        } else if availableWidth <= maxCompressedWidth {
            for (index, width) in coverWidths.enumerated() {
                offsets.append(currentOffset)
                if index < coverWidths.count - 1 {
                    currentOffset += width * maxVisibleRatio
                }
            }
            totalWidth = maxCompressedWidth
        } else {
            let targetWidth = availableWidth
            let availableRange = idealWidth - maxCompressedWidth
            let progress = (targetWidth - maxCompressedWidth) / availableRange
            let visibleRatio = maxVisibleRatio + (minVisibleRatio - maxVisibleRatio) * progress

            for (index, width) in coverWidths.enumerated() {
                offsets.append(currentOffset)
                if index < coverWidths.count - 1 {
                    currentOffset += width * visibleRatio
                }
            }
            totalWidth = currentOffset + coverWidths.last!
        }

        return LayoutInfo(offsets: offsets, totalWidth: min(totalWidth, availableWidth))
    }

    private struct LayoutInfo {
        let offsets: [CGFloat]
        let totalWidth: CGFloat

        func offset(for index: Int) -> CGFloat {
            guard index < offsets.count else { return 0 }
            return offsets[index]
        }
    }

    private func resolveCoverVariant(for item: BookMetadata) -> MediaViewModel.CoverVariant {
        mediaViewModel.coverVariant(for: item, preference: coverPreference)
    }
}

#endif
