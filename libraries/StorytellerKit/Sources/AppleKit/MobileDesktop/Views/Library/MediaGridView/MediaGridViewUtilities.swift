#if os(iOS) || os(macOS)
import SwiftUI

private struct StableCoverRenderingModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .compositingGroup()
            #if os(macOS)
        .drawingGroup(opaque: false, colorMode: .linear)
            #endif
    }
}

extension View {
    func stableCoverRendering() -> some View {
        modifier(StableCoverRenderingModifier())
    }
}

extension MediaViewModel.CoverVariant {
    var displayAspectRatio: CGFloat {
        switch self {
            case .standard: return 0.67
            case .audioSquare: return 1.0
        }
    }
}

struct RoundedCoverArtwork: View {
    let image: Image?
    let placeholderColor: Color
    let variant: MediaViewModel.CoverVariant
    let cornerRadius: CGFloat
    var progress: Double? = nil
    var progressBackgroundColor: Color = .black.opacity(0.78)

    var body: some View {
        GeometryReader { geometry in
            let artworkSize = fittedArtworkSize(
                containerSize: geometry.size,
                aspectRatio: variant.displayAspectRatio,
            )

            ZStack {
                if let image {
                    image
                        .resizable()
                        .interpolation(.high)
                        .scaledToFill()
                } else {
                    placeholderColor
                }
            }
            .frame(width: artworkSize.width, height: artworkSize.height)
            .stableCoverRendering()
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(alignment: .bottomTrailing) {
                if let progress, progress > 0 {
                    CircularProgressBadge(
                        progress: progress,
                        showsBackground: true,
                        backgroundColor: progressBackgroundColor,
                    )
                    .padding(4)
                }
            }
            .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
        }
    }

    private func fittedArtworkSize(containerSize: CGSize, aspectRatio: CGFloat) -> CGSize {
        guard containerSize.width > 0, containerSize.height > 0, aspectRatio > 0 else {
            return .zero
        }

        let containerAspectRatio = containerSize.width / containerSize.height
        if containerAspectRatio > aspectRatio {
            let height = containerSize.height
            return CGSize(width: height * aspectRatio, height: height)
        } else {
            let width = containerSize.width
            return CGSize(width: width, height: width / aspectRatio)
        }
    }
}

enum MediaGridViewUtilities {
    #if os(macOS)
    static func nextSelectableItem(
        from direction: MoveCommandDirection,
        in items: [BookMetadata],
        currentItemID: BookMetadata.ID?,
        columnCount: Int,
    ) -> BookMetadata? {
        guard !items.isEmpty else { return nil }

        let columns = max(columnCount, 1)
        let currentIndex: Int =
            if let currentItemID,
                let index = items.firstIndex(where: { $0.id == currentItemID })
            {
                index
            } else {
                -1
            }

        func clamp(_ index: Int) -> Int {
            min(max(index, 0), items.count - 1)
        }

        var targetIndex: Int?

        switch direction {
            case .up:
                if currentIndex == -1 {
                    targetIndex = clamp(0)
                } else {
                    let proposed = clamp(currentIndex - columns)
                    if proposed != currentIndex {
                        targetIndex = proposed
                    }
                }
            case .down:
                if currentIndex == -1 {
                    targetIndex = clamp(0)
                } else {
                    let proposed = clamp(currentIndex + columns)
                    if proposed != currentIndex {
                        targetIndex = proposed
                    }
                }
            case .left:
                if currentIndex == -1 {
                    targetIndex = clamp(0)
                } else if currentIndex > 0 {
                    targetIndex = clamp(currentIndex - 1)
                }
            case .right:
                if currentIndex == -1 {
                    targetIndex = clamp(0)
                } else if currentIndex < items.count - 1 {
                    targetIndex = clamp(currentIndex + 1)
                }
            default:
                break
        }

        guard let index = targetIndex, items.indices.contains(index) else { return nil }
        return items[index]
    }
    #endif

    static func mediaDownloadOptions(for item: BookMetadata) -> [MediaDownloadOption] {
        var options: [MediaDownloadOption] = []

        if item.hasAvailableEbook {
            options.append(
                .init(
                    category: .ebook,
                    title: "Ebook",
                    openTitle: "Read Ebook",
                    iconName: "book.fill",
                )
            )
        }

        if item.hasAvailableAudiobook {
            options.append(
                .init(
                    category: .audio,
                    title: "Audiobook",
                    openTitle: "Play Audiobook",
                    iconName: "headphones",
                )
            )
        }

        if item.hasAvailableReadaloud {
            options.append(
                .init(
                    category: .synced,
                    title: "Readaloud",
                    openTitle: "Read Readaloud",
                    iconName: "readalong",
                    iconType: .readaloud,
                )
            )
        }

        return options
    }

}

struct MediaDownloadOption: Identifiable {
    enum IconType: Equatable {
        case system(String)
        case custom(String)
        case readaloud
    }

    let id: LocalMediaCategory
    let category: LocalMediaCategory
    let title: String
    let openTitle: String
    let iconType: IconType

    init(
        category: LocalMediaCategory,
        title: String,
        openTitle: String,
        iconName: String,
        iconType: IconType = .system(""),
    ) {
        self.id = category
        self.category = category
        self.title = title
        self.openTitle = openTitle
        self.iconType = iconType == .system("") ? .system(iconName) : iconType
    }

    var downloadTitle: String {
        switch category {
            case .ebook:
                "Download Ebook"
            case .audio:
                "Download Audiobook"
            case .synced:
                "Download Readaloud"
        }
    }

    var deleteTitle: String {
        switch category {
            case .ebook:
                "Delete Ebook"
            case .audio:
                "Delete Audiobook"
            case .synced:
                "Delete Readaloud"
        }
    }
}

#endif
