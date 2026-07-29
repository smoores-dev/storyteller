#if os(tvOS)
import StorytellerKit
import SwiftUI

struct TVBookCardView: View {
    @Environment(MediaViewModel.self) private var mediaViewModel
    let book: BookMetadata
    let isDownloaded: Bool
    let downloadProgress: Double?

    var body: some View {
        let variant = mediaViewModel.coverVariant(for: book)
        let coverState = mediaViewModel.coverState(for: book, variant: variant)

        ZStack {
            if let image = coverState.image {
                image
                    .resizable()
                    .interpolation(.high)
                    .antialiased(true)
                    .aspectRatio(contentMode: .fit)
                    .compositingGroup()
                    .drawingGroup(opaque: false, colorMode: .linear)
            } else {
                placeholderCover
            }

            if let progress = downloadProgress {
                downloadOverlay(progress: progress)
            }

            if isDownloaded {
                downloadedBadge
            }
        }
        .frame(width: 240, height: 360)
        .background(Color.black.opacity(0.3))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .task(id: taskIdentifier(variant: variant)) {
            mediaViewModel.ensureCoverLoaded(for: book, variant: variant)
        }
    }

    private func taskIdentifier(variant: MediaViewModel.CoverVariant) -> String {
        let variantId = variant == .standard ? "standard" : "audio"
        return "\(book.id)-\(variantId)-\(mediaViewModel.connectionStatus)"
    }

    private var placeholderCover: some View {
        ZStack {
            Color.gray.opacity(0.3)
            Image(systemName: "book.closed")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)
        }
    }

    private func downloadOverlay(progress: Double) -> some View {
        ZStack {
            Color.black.opacity(0.6)
            VStack(spacing: 12) {
                ProgressView(value: progress)
                    .progressViewStyle(.circular)
                    .scaleEffect(1.5)
                Text("\(Int(progress * 100))%")
                    .font(.caption)
                    .foregroundStyle(.white)
            }
        }
    }

    private var downloadedBadge: some View {
        VStack {
            HStack {
                Spacer()
                Image(systemName: "checkmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.green)
                    .background(Circle().fill(.white).padding(2))
                    .padding(8)
            }
            Spacer()
        }
    }
}
#endif
