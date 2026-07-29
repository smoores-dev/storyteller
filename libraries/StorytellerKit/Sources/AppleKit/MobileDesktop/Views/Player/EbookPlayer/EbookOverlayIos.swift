#if os(iOS) || os(macOS)
import SwiftUI

/// iOS stats overlay showing progress and time remaining
/// Supports both bottom position (default) and top position (when mini player covers bottom)
struct EbookOverlayIos: View {
    let showProgress: Bool
    let showTimeRemainingInBook: Bool
    let showTimeRemainingInChapter: Bool
    let showPageNumber: Bool
    let showSkipBackward: Bool
    let showSkipForward: Bool
    let showPlayPause: Bool
    let overlayTransparency: Double
    let bookFraction: Double?
    let bookTimeRemaining: TimeInterval?
    let chapterTimeRemaining: TimeInterval?
    let currentPage: Int?
    let totalPages: Int?
    let isPlaying: Bool
    let hasAudioNarration: Bool
    let backgroundColor: Color
    let positionAtTop: Bool
    let onSkipBackward: () -> Void
    let onTogglePlaying: () -> Void
    let onSkipForward: () -> Void

    private var hasTimeStatsToDisplay: Bool {
        hasAudioNarration && (showTimeRemainingInBook || showTimeRemainingInChapter)
    }

    private var hasBookStatsToDisplay: Bool {
        (showProgress && bookFraction != nil)
            || (showPageNumber && currentPage != nil && totalPages != nil && totalPages! > 0)
    }

    private var hasPlaybackControlsToDisplay: Bool {
        hasAudioNarration && (showSkipBackward || showPlayPause || showSkipForward)
    }

    private var hasStatsToDisplay: Bool {
        hasBookStatsToDisplay || hasTimeStatsToDisplay
    }

    private var hasOverlayContent: Bool {
        hasStatsToDisplay || hasPlaybackControlsToDisplay
    }

    var body: some View {
        if positionAtTop {
            topPositionedLayout
        } else {
            bottomPositionedLayout
        }
    }

    private var topPositionedLayout: some View {
        VStack {
            HStack(alignment: .top) {
                if hasBookStatsToDisplay {
                    bookStatsWithIcons
                }
                Spacer()
                if hasTimeStatsToDisplay {
                    timeStatsWithIcons
                }
            }
            .padding(.horizontal, 38)
            .padding(.top, 16)
            .padding(.bottom, 8)
            .frame(maxWidth: .infinity)
            .background(alignment: .top) {
                if hasStatsToDisplay {
                    backgroundColor.ignoresSafeArea(edges: .top)
                }
            }

            Spacer()
        }
        .ignoresSafeArea(.all)
    }

    private var bookStatsWithIcons: some View {
        VStack(alignment: .leading, spacing: 2) {
            if showProgress, let bookFraction = bookFraction {
                HStack(spacing: 4) {
                    Image(systemName: "book.fill")
                        .font(.caption2)
                    Text(formatPercent(bookFraction))
                        .font(.caption2.monospacedDigit())
                }
                .foregroundStyle(.gray.opacity(overlayTransparency))
            }

            if showPageNumber, let current = currentPage, let total = totalPages, total > 0 {
                HStack(spacing: 4) {
                    Image(systemName: "bookmark.fill")
                        .font(.caption2)
                    Text("Page \(current) of \(total)")
                        .font(.caption2.monospacedDigit())
                }
                .foregroundStyle(.gray.opacity(overlayTransparency))
            }
        }
    }

    private var timeStatsWithIcons: some View {
        VStack(alignment: .trailing, spacing: 2) {
            if showTimeRemainingInBook {
                HStack(spacing: 4) {
                    Text(formatTimeHoursMinutes(bookTimeRemaining))
                        .font(.caption2.monospacedDigit())
                    Image(systemName: "book.fill")
                        .font(.caption2)
                }
                .foregroundStyle(.gray.opacity(overlayTransparency))
            }

            if showTimeRemainingInChapter {
                HStack(spacing: 4) {
                    Text(formatTimeMinutesSeconds(chapterTimeRemaining))
                        .font(.caption2.monospacedDigit())
                    Image(systemName: "bookmark.fill")
                        .font(.caption2)
                }
                .foregroundStyle(.gray.opacity(overlayTransparency))
            }
        }
    }

    private var bottomPositionedLayout: some View {
        VStack {
            Spacer()
            ZStack {
                HStack {
                    if hasBookStatsToDisplay {
                        bookStatsWithIcons
                    }
                    Spacer()
                    if hasTimeStatsToDisplay {
                        timeStatsWithIcons
                    }
                }

                if hasPlaybackControlsToDisplay {
                    playbackControls
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
            .background(alignment: .bottom) {
                if hasOverlayContent {
                    backgroundColor.ignoresSafeArea(edges: .bottom)
                }
            }
        }
        .ignoresSafeArea(.all)
    }

    private var playbackControls: some View {
        HStack(spacing: 16) {
            if showSkipBackward {
                skipButton(systemName: "arrow.counterclockwise", action: onSkipBackward)
            }

            if showPlayPause {
                playPauseButton
            }

            if showSkipForward {
                skipButton(systemName: "arrow.clockwise", action: onSkipForward)
            }
        }
    }

    private var playPauseButton: some View {
        Button(action: onTogglePlaying) {
            Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 20))
                .foregroundStyle(.gray.opacity(overlayTransparency))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func skipButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 16))
                .foregroundStyle(.gray.opacity(overlayTransparency))
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func formatPercent(_ value: Double) -> String {
        String(format: "%.0f%%", max(min(value, 1), 0) * 100)
    }
}

#endif
