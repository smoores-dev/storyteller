#if os(iOS) || os(macOS)
import SwiftUI

struct GroupedBooksCardView: View {
    let title: String
    let books: [BookMetadata]
    let mediaKind: MediaKind
    let coverPreference: CoverPreference
    let showBookCountBadge: Bool
    var pinId: String? = nil
    let onTap: () -> Void
    @Environment(MediaViewModel.self) private var mediaViewModel
    @State private var isHovered = false

    private let tileWidth: CGFloat = 125
    private let cardPadding: CGFloat = 4
    private var coverWidth: CGFloat { max(tileWidth - (cardPadding * 2), tileWidth * 0.90) }
    private let titleContainerHeight: CGFloat = 32

    private var containerAspectRatio: CGFloat { coverPreference.preferredContainerAspectRatio }
    private var coverHeight: CGFloat { coverWidth / containerAspectRatio }

    private var maxCardHeight: CGFloat {
        let topPadding: CGFloat = 6
        let bottomPadding: CGFloat = 12
        return topPadding + coverHeight + titleContainerHeight + bottomPadding
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 0) {
                fanCoverStack
                    .frame(width: coverWidth, height: coverHeight)
                    .overlay(alignment: .bottomTrailing) {
                        if showBookCountBadge {
                            Text("\(books.count)")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.96))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 3)
                                .background(.black.opacity(0.7), in: Capsule())
                                .padding(.trailing, 6)
                                .padding(.bottom, 12)
                        }
                    }

                Spacer()
                    .frame(height: 0)

                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                    .padding(.horizontal, 8)
                    .frame(height: titleContainerHeight, alignment: .top)
            }
            .padding(.top, 6)
            .padding(.horizontal, cardPadding)
            .padding(.bottom, 12)
            .frame(width: tileWidth, height: maxCardHeight, alignment: .top)
        }
        .buttonStyle(.plain)
        #if os(macOS)
        .onHover { hovering in
            withAnimation(.easeOut(duration: 0.25)) {
                isHovered = hovering
            }
        }
        #endif
    }

    @ViewBuilder
    private var fanCoverStack: some View {
        let displayBooks = Array(books.prefix(3))
        let placeholderColor = Color(white: 0.2)

        let fanSpread: CGFloat = isHovered ? 18 : 6
        let fanRotation: Double = isHovered ? 8 : 3
        let centerOffset = CGFloat(displayBooks.count - 1) * fanSpread / 2

        GeometryReader { geometry in
            let availableWidth = geometry.size.width
            let availableHeight = geometry.size.height
            let singleCoverHeight = availableHeight * (isHovered ? 0.98 : 0.95)
            let singleCoverWidth = singleCoverHeight * containerAspectRatio

            ZStack {
                ForEach(Array(displayBooks.reversed().enumerated()), id: \.offset) { index, book in
                    let coverVariant = resolveCoverVariant(for: book)
                    let coverState = mediaViewModel.coverState(for: book, variant: coverVariant)
                    let position = displayBooks.count - 1 - index
                    let xOffset = CGFloat(position) * fanSpread - centerOffset
                    let rotation = Double(position - (displayBooks.count - 1) / 2) * fanRotation

                    ZStack {
                        placeholderColor
                        if let image = coverState.image {
                            image
                                .resizable()
                                .interpolation(.high)
                                .scaledToFill()
                        }
                    }
                    .frame(width: singleCoverWidth, height: singleCoverHeight)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .stableCoverRendering()
                    .shadow(color: .black.opacity(0.2), radius: 3, x: 0, y: 2)
                    .rotationEffect(.degrees(rotation))
                    .offset(x: xOffset)
                    .task {
                        mediaViewModel.ensureCoverLoaded(for: book, variant: coverVariant)
                    }
                    .onDisappear {
                        mediaViewModel.cancelCoverLoad(for: book, variant: coverVariant)
                    }
                }
            }
            .frame(width: availableWidth, height: availableHeight, alignment: .top)
        }
    }

    private func resolveCoverVariant(for item: BookMetadata) -> MediaViewModel.CoverVariant {
        mediaViewModel.coverVariant(for: item, preference: coverPreference)
    }
}

#endif
