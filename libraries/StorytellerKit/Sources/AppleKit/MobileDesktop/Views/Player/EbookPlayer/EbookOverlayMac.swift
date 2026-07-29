#if os(iOS) || os(macOS)
import SwiftUI

struct EbookOverlayMac: View {
    let readingBarConfig: StorytellerGlobalConfig.ReadingBar
    let progressData: ProgressData?
    let isPlaying: Bool
    let playbackRate: Double
    let isLightBackground: Bool
    let backgroundColor: Color
    @Binding var chapterProgress: Double

    let onPrevChapter: () -> Void
    let onSkipBackward: () -> Void
    let onPlayPause: () -> Void
    let onSkipForward: () -> Void
    let onNextChapter: () -> Void
    let onProgressSeek: ((Double) -> Void)?

    @State private var isDraggingSlider = false
    @State private var draggedSliderValue: Double = 0.0
    @State private var seekDebounceUntil: Date?

    private var overlayColor: Color {
        isLightBackground ? .black : .white
    }

    private var overlayButtonBackground: Color {
        isLightBackground ? .black : .white
    }

    private var usesFullWidthBar: Bool {
        readingBarConfig.showPlayerControls || readingBarConfig.showProgressBar
    }

    var body: some View {
        if usesFullWidthBar {
            fullWidthBar
        } else {
            cornerStats
        }
    }

    private var fullWidthBar: some View {
        VStack(spacing: 4) {
            if readingBarConfig.showPlayerControls {
                transportControls
            }

            if readingBarConfig.showProgressBar || hasStatsToDisplay {
                HStack(spacing: 16) {
                    if hasStatsToDisplay {
                        leftStatsColumn
                            .frame(minWidth: 100, alignment: .leading)
                    }

                    if readingBarConfig.showProgressBar {
                        seekBarWithTimes
                    } else if hasStatsToDisplay {
                        Spacer()
                    }

                    if hasStatsToDisplay {
                        rightStatsColumn
                            .frame(minWidth: 60, alignment: .trailing)
                    }
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .background(backgroundColor.ignoresSafeArea(edges: .bottom))
    }

    private var cornerStats: some View {
        HStack(alignment: .bottom) {
            if hasLeftStats {
                leftStatsColumn
                    .padding(.leading, 20)
                    .padding(.trailing, 12)
                    .padding(.top, 8)
                    .padding(.bottom, 8)
                    .background(backgroundColor.ignoresSafeArea(edges: .bottom))
            }

            Spacer()

            if hasRightStats {
                rightStatsColumn
                    .padding(.leading, 12)
                    .padding(.trailing, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 8)
                    .background(backgroundColor.ignoresSafeArea(edges: .bottom))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var transportControls: some View {
        let buttonSize: CGFloat = 28
        let iconSize: CGFloat = 12

        return HStack(alignment: .center, spacing: 8) {
            Button(action: onPrevChapter) {
                Image(systemName: "backward.end.fill")
                    .font(.system(size: iconSize))
                    .foregroundStyle(overlayColor.opacity(readingBarConfig.overlayTransparency))
                    .frame(width: buttonSize, height: buttonSize)
                    .background(
                        Circle()
                            .fill(
                                overlayButtonBackground.opacity(
                                    0.2 * readingBarConfig.overlayTransparency
                                )
                            )
                    )
            }
            .buttonStyle(.plain)
            .help("Restart chapter / Previous chapter")

            Button(action: onSkipBackward) {
                Image(systemName: "arrow.counterclockwise")
                    .font(.system(size: iconSize))
                    .foregroundStyle(overlayColor.opacity(readingBarConfig.overlayTransparency))
                    .frame(width: buttonSize, height: buttonSize)
                    .background(
                        Circle()
                            .fill(
                                overlayButtonBackground.opacity(
                                    0.2 * readingBarConfig.overlayTransparency
                                )
                            )
                    )
            }
            .buttonStyle(.plain)
            .help("Previous sentence")

            Button(action: onPlayPause) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: iconSize))
                    .foregroundStyle(overlayColor.opacity(readingBarConfig.overlayTransparency))
                    .frame(width: buttonSize * 1.2, height: buttonSize * 1.2)
                    .background(
                        Circle()
                            .fill(
                                overlayButtonBackground.opacity(
                                    0.3 * readingBarConfig.overlayTransparency
                                )
                            )
                    )
            }
            .buttonStyle(.plain)
            .help("Play/pause")

            Button(action: onSkipForward) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: iconSize))
                    .foregroundStyle(overlayColor.opacity(readingBarConfig.overlayTransparency))
                    .frame(width: buttonSize, height: buttonSize)
                    .background(
                        Circle()
                            .fill(
                                overlayButtonBackground.opacity(
                                    0.2 * readingBarConfig.overlayTransparency
                                )
                            )
                    )
            }
            .buttonStyle(.plain)
            .help("Next sentence")

            Button(action: onNextChapter) {
                Image(systemName: "forward.end.fill")
                    .font(.system(size: iconSize))
                    .foregroundStyle(overlayColor.opacity(readingBarConfig.overlayTransparency))
                    .frame(width: buttonSize, height: buttonSize)
                    .background(
                        Circle()
                            .fill(
                                overlayButtonBackground.opacity(
                                    0.2 * readingBarConfig.overlayTransparency
                                )
                            )
                    )
            }
            .buttonStyle(.plain)
            .help("Next chapter")
        }
    }

    private var seekBar: some View {
        let sliderBinding = Binding(
            get: {
                if isDraggingSlider {
                    return draggedSliderValue
                }

                if let debounceUntil = seekDebounceUntil, Date() < debounceUntil {
                    return draggedSliderValue
                }

                let audioFraction = chapterAudioFraction(
                    current: progressData?.chapterCurrentSecondsAudio,
                    total: progressData?.chapterTotalSecondsAudio,
                )
                let pagesFraction = chapterPagesFraction(
                    current: progressData?.chapterCurrentPage,
                    total: progressData?.chapterTotalPages,
                )

                let fraction: Double
                if isPlaying, let audio = audioFraction {
                    fraction = audio
                } else if let pages = pagesFraction {
                    fraction = pages
                } else if let audio = audioFraction {
                    fraction = audio
                } else {
                    fraction = chapterProgress
                }

                return min(max(fraction, 0), 1)
            },
            set: { newValue in
                let clampedValue = min(max(newValue, 0), 1)
                isDraggingSlider = true
                draggedSliderValue = clampedValue
                chapterProgress = clampedValue
                onProgressSeek?(clampedValue)
            },
        )

        return Slider(
            value: sliderBinding,
            in: 0...1,
            onEditingChanged: { editing in
                isDraggingSlider = editing
                if editing {
                    seekDebounceUntil = nil
                    let audioFraction = chapterAudioFraction(
                        current: progressData?.chapterCurrentSecondsAudio,
                        total: progressData?.chapterTotalSecondsAudio,
                    )
                    let pagesFraction = chapterPagesFraction(
                        current: progressData?.chapterCurrentPage,
                        total: progressData?.chapterTotalPages,
                    )

                    let initialFraction: Double
                    if isPlaying, let audio = audioFraction {
                        initialFraction = audio
                    } else if let pages = pagesFraction {
                        initialFraction = pages
                    } else if let audio = audioFraction {
                        initialFraction = audio
                    } else {
                        initialFraction = chapterProgress
                    }

                    draggedSliderValue = min(max(initialFraction, 0), 1)
                } else {
                    seekDebounceUntil = Date().addingTimeInterval(0.5)
                }
            },
        )
        .tint(overlayColor.opacity(0.9 * readingBarConfig.overlayTransparency))
        .opacity(readingBarConfig.overlayTransparency)
    }

    private var seekBarWithTimes: some View {
        let chapterElapsed = normalizedSeconds(progressData?.chapterCurrentSecondsAudio) ?? 0
        let baseChapterTotal = normalizedSeconds(progressData?.chapterTotalSecondsAudio) ?? 0
        let chapterTotal = max(baseChapterTotal, chapterElapsed)
        let rawRemaining = max(chapterTotal - chapterElapsed, 0)
        let chapterRemainingAtRate = timeRemaining(
            atRate: playbackRate,
            total: chapterTotal,
            elapsed: chapterElapsed,
        )

        return VStack(alignment: .leading, spacing: 4) {
            seekBar

            HStack {
                Text(formatOptionalTime(chapterElapsed))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(
                        overlayColor.opacity(0.7 * readingBarConfig.overlayTransparency)
                    )
                Spacer()
                Text(
                    "-\(formatOptionalTime(chapterRemainingAtRate ?? rawRemaining)) (\(formatPlaybackRate(playbackRate)))"
                )
                .font(.caption2)
                .foregroundStyle(overlayColor.opacity(0.6 * readingBarConfig.overlayTransparency))
                Spacer()
                Text(formatOptionalTime(chapterTotal))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(
                        overlayColor.opacity(0.7 * readingBarConfig.overlayTransparency)
                    )
            }
        }
    }

    private var hasStatsToDisplay: Bool {
        hasLeftStats || hasRightStats
    }

    private var hasLeftStats: Bool {
        (readingBarConfig.showTimeRemainingInBook && bookTimeRemaining != nil)
            || (readingBarConfig.showTimeRemainingInChapter && chapterTimeRemaining != nil)
    }

    private var hasRightStats: Bool {
        (readingBarConfig.showProgress && bookFraction != nil)
            || (readingBarConfig.showPageNumber && progressData?.chapterCurrentPage != nil
                && progressData?.chapterTotalPages != nil)
    }

    private var leftStatsColumn: some View {
        VStack(alignment: .leading, spacing: 2) {
            if readingBarConfig.showTimeRemainingInBook, let timeRemaining = bookTimeRemaining {
                HStack(spacing: 4) {
                    Image(systemName: "book.fill")
                        .font(.caption2)
                    Text(formatTimeHoursMinutes(timeRemaining))
                        .font(.caption2.monospacedDigit())
                }
                .foregroundStyle(overlayColor.opacity(0.7 * readingBarConfig.overlayTransparency))
            }

            if readingBarConfig.showTimeRemainingInChapter, let timeRemaining = chapterTimeRemaining
            {
                HStack(spacing: 4) {
                    Image(systemName: "bookmark.fill")
                        .font(.caption2)
                    Text(formatTimeMinutesSeconds(timeRemaining))
                        .font(.caption2.monospacedDigit())
                }
                .foregroundStyle(overlayColor.opacity(0.7 * readingBarConfig.overlayTransparency))
            }
        }
    }

    private var rightStatsColumn: some View {
        VStack(alignment: .trailing, spacing: 2) {
            if readingBarConfig.showProgress, let bookFraction = bookFraction {
                HStack(spacing: 4) {
                    Text(formatPercent(bookFraction))
                        .font(.caption2.monospacedDigit())
                    Image(systemName: "book.fill")
                        .font(.caption2)
                }
                .foregroundStyle(overlayColor.opacity(0.7 * readingBarConfig.overlayTransparency))
            }

            if readingBarConfig.showPageNumber, let current = progressData?.chapterCurrentPage,
                let total = progressData?.chapterTotalPages, total > 0
            {
                HStack(spacing: 4) {
                    Text("\(current)/\(total)")
                        .font(.caption2.monospacedDigit())
                    Image(systemName: "bookmark.fill")
                        .font(.caption2)
                }
                .foregroundStyle(overlayColor.opacity(0.7 * readingBarConfig.overlayTransparency))
            }
        }
    }

    private var bookFraction: Double? {
        guard let fraction = progressData?.bookCurrentFraction, fraction.isFinite else {
            return nil
        }
        return min(max(fraction, 0), 1)
    }

    private var bookTimeRemaining: TimeInterval? {
        guard let bookTotal = normalizedSeconds(progressData?.bookTotalSecondsAudio),
            let bookElapsed = normalizedSeconds(progressData?.bookCurrentSecondsAudio)
        else {
            return nil
        }
        let remaining = max(bookTotal - bookElapsed, 0)
        guard playbackRate > 0 else { return nil }
        return remaining / playbackRate
    }

    private var chapterTimeRemaining: TimeInterval? {
        guard let chapterTotal = normalizedSeconds(progressData?.chapterTotalSecondsAudio),
            let chapterElapsed = normalizedSeconds(progressData?.chapterCurrentSecondsAudio)
        else {
            return nil
        }
        let remaining = max(chapterTotal - chapterElapsed, 0)
        guard playbackRate > 0 else { return nil }
        return remaining / playbackRate
    }
}

#endif
