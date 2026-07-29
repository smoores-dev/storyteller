#if os(tvOS)
import StorytellerKit
import SwiftUI

struct TVBookDetailView: View {
    @Environment(MediaViewModel.self) private var mediaViewModel
    let book: BookMetadata
    @State private var navigateToPlayer = false
    @State private var showingRatingEditor = false
    @State private var personalRating = BookPersonalRatingModel()
    @FocusState private var focusedControl: FocusControl?

    private enum FocusControl: Hashable {
        case rating
        case actions
    }

    private static let columnHeight: CGFloat = 540

    var body: some View {
        ZStack {
            backgroundArtwork

            HStack(alignment: .top, spacing: 68) {
                coverImage
                bookDetails
                    .focusSection()
                Spacer(minLength: 0)
                // The focus engine only enters a section whose frame crosses the band
                // extending out from the focused control, and the card alone sits well above
                // the download button, so the section is stretched while the card is not.
                infoPanel
                    .frame(height: Self.columnHeight, alignment: .top)
                    .focusSection()
            }
            .padding(.horizontal, 100)
            .padding(.top, 132)
            .padding(.bottom, 72)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black)
        .defaultFocus($focusedControl, .actions)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(isPresented: $navigateToPlayer) {
            TVPlayerView(book: book)
        }
        .sheet(isPresented: $showingRatingEditor) {
            TVBookRatingEditor(book: book, model: personalRating)
        }
        .task(id: book.id) {
            await personalRating.prepare(for: book.id, isServerBook: isServerBook)
        }
    }

    private var backgroundArtwork: some View {
        let variant = mediaViewModel.coverVariant(for: book)
        let coverState = mediaViewModel.coverState(for: book, variant: variant)

        return ZStack {
            if let image = coverState.image {
                image
                    .resizable()
                    .interpolation(.high)
                    .scaledToFill()
                    .blur(radius: 36)
                    .saturation(0.75)
                    .opacity(0.45)
            }

            LinearGradient(
                colors: [
                    Color.black.opacity(0.66),
                    Color.black.opacity(0.82),
                    Color.black.opacity(0.92),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing,
            )
        }
        .ignoresSafeArea()
    }

    private var coverImage: some View {
        let variant = mediaViewModel.coverVariant(for: book)
        let coverState = mediaViewModel.coverState(for: book, variant: variant)

        return Group {
            if let image = coverState.image {
                image
                    .resizable()
                    .interpolation(.high)
                    .aspectRatio(contentMode: .fit)
            } else {
                placeholderCover
            }
        }
        .frame(width: 360, height: Self.columnHeight)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.55), radius: 20, x: 0, y: 14)
        .task(id: taskIdentifier(variant: variant)) {
            mediaViewModel.ensureCoverLoaded(for: book, variant: variant)
        }
    }

    private var placeholderCover: some View {
        ZStack {
            Color.gray.opacity(0.3)
            Image(systemName: "book.closed")
                .font(.system(size: 80))
                .foregroundStyle(.secondary)
        }
    }

    private var bookDetails: some View {
        VStack(alignment: .leading, spacing: 26) {
            VStack(alignment: .leading, spacing: 10) {
                Text(book.title)
                    .font(.system(size: 52, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)

                if let subtitle = trimmed(book.subtitle) {
                    Text(subtitle)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.74))
                        .lineLimit(2)
                }

                if hasMetadata {
                    metadataLines
                }
            }

            if let description = cleanedDescription {
                Text(description)
                    .font(.system(size: 28, weight: .regular))
                    .foregroundStyle(.white.opacity(0.78))
                    .lineSpacing(3)
                    .lineLimit(5)
                    .fixedSize(horizontal: false, vertical: true)
            }

            let progress = mediaViewModel.progress(for: book.id)
            progressBlock(progress: progress)

            if book.hasAvailableReadaloud {
                readaloudActions
            }
        }
        .frame(maxWidth: 740, alignment: .leading)
    }

    private func progressBlock(progress: Double) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("Reading Progress: \(Int(progress * 100))%")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.white.opacity(0.64))
                .lineLimit(1)

            ProgressView(value: progress)
                .frame(width: 360)
                .tint(.white)
                .opacity(progress > 0 ? 1 : 0.42)
        }
    }

    private var readaloudActions: some View {
        let isDownloaded = mediaViewModel.isCategoryDownloaded(.synced, for: book)
        let isDownloading = mediaViewModel.isCategoryDownloadInProgress(
            for: book,
            category: .synced,
        )
        let progress = mediaViewModel.downloadProgressFraction(for: book, category: .synced)

        return VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 18) {
                primaryReadaloudButton(isDownloaded: isDownloaded, isDownloading: isDownloading)

                if isDownloaded {
                    Button {
                        mediaViewModel.deleteDownload(for: book, category: .synced)
                    } label: {
                        Label("Delete", systemImage: "trash")
                            .frame(width: 236)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                } else if isDownloading {
                    Button {
                        mediaViewModel.cancelDownload(for: book, category: .synced)
                    } label: {
                        Label("Cancel", systemImage: "xmark")
                            .frame(width: 236)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                }
            }
            .frame(height: 74, alignment: .leading)

            downloadProgressView(progress: progress)
                .opacity(isDownloading ? 1 : 0)
        }
        .animation(.easeInOut(duration: 0.18), value: isDownloading)
    }

    private func primaryReadaloudButton(isDownloaded: Bool, isDownloading: Bool) -> some View {
        primaryReadaloudButtonContent(isDownloaded: isDownloaded, isDownloading: isDownloading)
            .focused($focusedControl, equals: .actions)
    }

    private func primaryReadaloudButtonContent(
        isDownloaded: Bool,
        isDownloading: Bool,
    ) -> some View {
        Group {
            if isDownloaded {
                Button {
                    navigateToPlayer = true
                } label: {
                    Label("Play", systemImage: "play.fill")
                        .frame(width: 236)
                }
            } else if isDownloading {
                Button {
                } label: {
                    Label("Downloading", systemImage: "arrow.down.circle")
                        .frame(width: 236)
                }
                .disabled(true)
            } else {
                Button {
                    mediaViewModel.startDownload(for: book, category: .synced)
                } label: {
                    Label("Download", systemImage: "arrow.down.circle")
                        .frame(width: 236)
                }
            }
        }
        .buttonStyle(.bordered)
    }

    private func downloadProgressView(progress: Double?) -> some View {
        let fraction = min(max(progress ?? 0, 0), 1)

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Download Progress")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.64))

                Spacer(minLength: 24)

                Text("\(Int(fraction * 100))%")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(.white.opacity(0.82))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(width: 80, alignment: .trailing)
            }
            .frame(width: 500)

            ProgressView(value: fraction)
                .frame(width: 500)
                .tint(.white)
        }
        .frame(width: 500, alignment: .leading)
    }

    private var cleanedDescription: String? {
        guard let description = trimmed(book.description) else { return nil }
        return trimmed(BookDescriptionText.plain(from: description))
    }

    private var authorLine: String? {
        creatorLine(book.authors) ?? creatorLine(book.creators)
    }

    private var narratorLine: String? {
        creatorLine(book.narrators)
    }

    private var ratingValue: Double? {
        guard let rating = personalRating.isLoaded ? personalRating.starRating : book.rating,
            rating > 0
        else { return nil }
        return rating
    }

    private var seriesLine: String? {
        guard let series = book.series?.first else { return nil }
        if let position = series.formattedPosition {
            return "\(series.name), #\(position)"
        }
        return series.name
    }

    private var hasMetadata: Bool {
        narratorLine != nil || authorLine != nil || seriesLine != nil
    }

    private var isServerBook: Bool {
        mediaViewModel.isServerBook(book.id)
    }

    private var metadataLines: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let narratorLine {
                metadataLine(label: "Narrated by", value: narratorLine)
            }

            if let authorLine {
                metadataLine(label: "Written by", value: authorLine)
            }

            if let seriesLine {
                metadataLine(label: "Part of", value: seriesLine)
            }
        }
        .font(.system(size: 21, weight: .medium))
        .lineLimit(1)
    }

    @ViewBuilder
    private var infoPanel: some View {
        let rows = infoRows
        if !rows.isEmpty || isServerBook {
            VStack(alignment: .leading, spacing: 0) {
                if !rows.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(rows, id: \.label) { row in
                            HStack(spacing: 16) {
                                Text(row.label)
                                    .foregroundStyle(.white.opacity(0.42))
                                Spacer(minLength: 12)
                                Text(row.value)
                                    .foregroundStyle(.white.opacity(0.86))
                            }
                        }
                    }
                    .font(.system(size: 20, weight: .medium))
                    .lineLimit(1)
                    .padding(.horizontal, 24)
                    .padding(.top, 22)
                    .padding(.bottom, isServerBook ? 18 : 22)
                }

                if isServerBook {
                    if !rows.isEmpty {
                        Rectangle()
                            .fill(.white.opacity(0.1))
                            .frame(height: 1)
                            .padding(.horizontal, 24)
                    }
                    ratingButton
                }
            }
            .frame(width: 320)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(.white.opacity(0.07))
            )
        }
    }

    private var ratingButton: some View {
        Button {
            showingRatingEditor = true
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    Text("User Rating")
                        .font(.system(size: 20, weight: .medium))
                    Spacer(minLength: 8)
                    Image(systemName: "pencil")
                        .font(.system(size: 18, weight: .semibold))
                }

                HStack(spacing: 5) {
                    RatingStarStrip(
                        value: ratingValue,
                        starSize: 22,
                        spacing: 5,
                        fillColor: .white,
                        emptyColor: .white.opacity(0.3),
                    )

                    if let ratingValue {
                        Text(UserBookRating.format(ratingValue))
                            .font(.system(size: 19).monospacedDigit())
                            .padding(.leading, 6)
                            .opacity(0.7)
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 18)
        }
        .buttonStyle(.plain)
        .focused($focusedControl, equals: .rating)
        .accessibilityLabel("Rate this book")
    }

    private var infoRows: [(label: String, value: String)] {
        var rows: [(label: String, value: String)] = []
        if let pages = book.pageCountValue, pages > 0 {
            rows.append((label: "Pages", value: "\(pages)"))
        }
        let duration = book.durationDisplay
        if !duration.isEmpty {
            rows.append((label: "Length", value: duration))
        }
        if let remaining = remainingValue {
            rows.append((label: "Remaining", value: remaining))
        }
        let size = book.fileSizeDisplay
        if !size.isEmpty {
            rows.append((label: "Size", value: size))
        }
        return rows
    }

    private var remainingValue: String? {
        let progress = mediaViewModel.progress(for: book.id)
        guard progress > 0.001, progress < 0.999 else { return nil }
        if let duration = book.durationValue, duration > 0 {
            let seconds = Int((duration * (1 - progress)).rounded())
            return BookMetadata.formatDuration(seconds: seconds)
        }
        if let pages = book.pageCountValue, pages > 0 {
            let left = Int((Double(pages) * (1 - progress)).rounded())
            return "\(left) \(left == 1 ? "page" : "pages")"
        }
        return nil
    }


    private func metadataLine(label: String, value: String) -> Text {
        Text("\(label) ")
            .foregroundStyle(.white.opacity(0.42))
            + Text(value)
            .foregroundStyle(.white.opacity(0.76))
    }

    private func creatorLine(_ creators: [BookCreator]?) -> String? {
        let names = creators?.compactMap { trimmed($0.name) } ?? []
        guard !names.isEmpty else { return nil }
        return names.prefix(2).joined(separator: ", ")
    }

    private func trimmed(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedValue.isEmpty ? nil : trimmedValue
    }

    private func taskIdentifier(variant: MediaViewModel.CoverVariant) -> String {
        let variantId = variant == .standard ? "standard" : "audio"
        return "\(book.id)-\(variantId)-\(mediaViewModel.connectionStatus)"
    }
}
#endif
