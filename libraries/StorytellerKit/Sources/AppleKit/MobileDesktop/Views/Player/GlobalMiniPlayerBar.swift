#if os(iOS)
import StorytellerKit
import SwiftUI
import Observation
import UIKit

/// One app-wide subscription to the audio session snapshot, shared by the
/// per-tab mini player bars.
@MainActor
@Observable
final class AudioSessionMonitor {
    static let shared = AudioSessionMonitor()

    private(set) var snapshot: AudioSessionSnapshot?
    private(set) var coverImage: UIImage?
    private(set) var coverPalette: CoverDerivedPalette?
    @ObservationIgnored private var started = false
    @ObservationIgnored private var coverBookID: BookID?

    private init() {}

    func start() {
        guard !started else { return }
        started = true
        observePlayback()
    }

    private func observePlayback() {
        let snapshot = withObservationTracking {
            ActiveReadingSession.shared.current?.playbackSnapshot
        } onChange: { [weak self] in
            Task { @MainActor in self?.observePlayback() }
        }
        apply(snapshot)
    }

    private func apply(_ snapshot: AudioSessionSnapshot?) {
        self.snapshot = snapshot
        guard let bookID = snapshot?.kind.bookID else {
            coverBookID = nil
            coverImage = nil
            coverPalette = nil
            return
        }
        guard bookID != coverBookID else { return }
        coverBookID = bookID
        coverImage = nil
        coverPalette = nil
        Task { @MainActor in
            var data = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: true)
            if data == nil {
                data = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: false)
            }
            guard self.coverBookID == bookID else { return }
            self.coverImage = data.flatMap(UIImage.init(data:))
            guard let image = self.coverImage,
                let derived = CoverDerivedPalette.make(from: image)
            else { return }
            let library = await SettingsActor.shared.config.library
            guard self.coverBookID == bookID else { return }
            self.coverPalette = derived.adjusted(for: library)
        }
    }
}

struct GlobalMiniPlayerBar: View {
    private var monitor = AudioSessionMonitor.shared
    private var presenter = PlayerPresenter.shared
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        content
            .onAppear { monitor.start() }
    }

    private var resolvedPalette: CoverDerivedPalette? {
        monitor.coverPalette?.resolved(for: colorScheme)
    }

    private var accent: Color? {
        monitor.coverPalette?.ratingAccent(for: colorScheme)
    }

    @ViewBuilder
    private var content: some View {
        if let snapshot = monitor.snapshot, presenter.card == nil {
            barContent(snapshot)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func barContent(_ snapshot: AudioSessionSnapshot) -> some View {
        HStack(spacing: 12) {
            HStack(spacing: 12) {
                if let cover = monitor.coverImage {
                    Image(uiImage: cover)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 40, height: 40)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                } else {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Color.secondary.opacity(0.2))
                        .frame(width: 40, height: 40)
                        .overlay(
                            Image(systemName: "book.fill")
                                .font(.body)
                                .foregroundStyle(.secondary)
                        )
                }

                VStack(alignment: .leading, spacing: 2) {
                    if let title = snapshot.title {
                        Text(title)
                            .font(.editorialTitle(15))
                            .lineLimit(1)
                    }
                    if let chapter = snapshot.chapterLabel {
                        Text(chapter)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                presenter.expandMiniPlayer()
            }

            Button {
                Task { try? await ActiveReadingSession.shared.current?.togglePlayback() }
            } label: {
                Image(systemName: snapshot.isPlaying ? "pause.fill" : "play.fill")
                    .font(.title3)
                    .foregroundStyle(
                        accent != nil ? (resolvedPalette?.contentBackground ?? .primary) : .primary
                    )
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(accent ?? Color.primary.opacity(0.1)))
            }
            .buttonStyle(.plain)

            Button {
                presenter.stopSession()
            } label: {
                Image(systemName: "xmark")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 40)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Stop playback")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .modifier(MiniPlayerGlassModifier(tint: resolvedPalette?.surface))
        .padding(.horizontal, 8)
        .padding(.bottom, 4)
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: snapshot.isPlaying)
    }
}

private struct MiniPlayerGlassModifier: ViewModifier {
    var tint: Color?
    private let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)

    func body(content: Content) -> some View {
        let washed = content.background(
            shape.fill((tint ?? Color.clear).opacity(tint == nil ? 0 : 0.92))
        )
        if #available(iOS 26.0, *) {
            washed.glassEffect(.regular.interactive(), in: shape)
        } else {
            washed
                .background(shape.fill(.regularMaterial))
                .clipShape(shape)
                .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
        }
    }
}
#endif
