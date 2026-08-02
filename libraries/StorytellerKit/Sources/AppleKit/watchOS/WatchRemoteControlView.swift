#if os(watchOS)
import StorytellerKit
import SwiftUI

struct WatchRemoteControlView: View {
    @Environment(WatchViewModel.self) private var viewModel
    @State private var showChapters = false

    var body: some View {
        Group {
            if showChapters, let state = viewModel.remotePlaybackState {
                RemoteChapterListView(
                    state: state,
                    viewModel: viewModel,
                    onBack: { showChapters = false },
                )
            } else if let state = viewModel.remotePlaybackState {
                RemoteControlsPage(
                    state: state,
                    viewModel: viewModel,
                    onChapters: { showChapters = true },
                )
            } else {
                emptyState
            }
        }
        .onAppear {
            viewModel.requestPlaybackState()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "iphone.slash")
                .font(.system(size: 32))
                .foregroundStyle(.secondary)

            Text("Nothing Playing")
                .font(.headline)

            Text("Start playback on iPhone,\nthen return here")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .navigationTitle("iPhone")
    }
}

private struct RemoteControlsPage: View {
    let state: RemotePlaybackState
    let viewModel: WatchViewModel
    let onChapters: () -> Void

    @State private var crownVolume: Double = 1.0
    @State private var showVolumeOverlay = false
    @State private var showSpeedPicker = false
    @State private var volumeHideTask: DispatchWorkItem?
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            Text(state.chapterTitle)
                .font(.footnote)
                .foregroundStyle(.white)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .padding(.top, 4)

            Spacer()

            controlsRow

            statsRow
                .padding(.top, 8)

            Spacer()

            bottomNav
        }
        .background(
            LinearGradient(
                colors: [Color.accentColor.opacity(0.3), Color.accentColor.opacity(0.1)],
                startPoint: .top,
                endPoint: .bottom,
            )
        )
        .overlay {
            if showVolumeOverlay {
                volumeOverlay
            }
        }
        .focusable(true)
        .focused($isFocused)
        .digitalCrownRotation(
            detent: $crownVolume,
            from: 0,
            through: 1,
            by: 0.02,
            sensitivity: .low,
            isContinuous: false,
            isHapticFeedbackEnabled: true,
        )
        .onChange(of: crownVolume) { _, newValue in
            viewModel.sendPlaybackCommand(.setVolume(volume: newValue))
            showVolumeOverlay = true
            volumeHideTask?.cancel()
            let task = DispatchWorkItem { showVolumeOverlay = false }
            volumeHideTask = task
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: task)
        }
        .onAppear {
            crownVolume = state.volume
            isFocused = true
        }
        .navigationTitle(state.bookTitle)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var controlsRow: some View {
        HStack(spacing: 0) {
            Button {
                viewModel.sendPlaybackCommand(.skipBackward)
            } label: {
                Image(systemName: "gobackward.30")
                    .font(.title2)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(.plain)

            playButtonWithProgress
                .frame(width: 58, height: 58)

            Button {
                viewModel.sendPlaybackCommand(.skipForward)
            } label: {
                Image(systemName: "goforward.30")
                    .font(.title2)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(.plain)
        }
        .frame(height: 60)
    }

    private var playButtonWithProgress: some View {
        ZStack {
            Circle()
                .stroke(Color.secondary.opacity(0.3), lineWidth: 3.5)

            Circle()
                .trim(from: 0, to: chapterProgress)
                .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                .rotationEffect(.degrees(-90))

            Button {
                viewModel.sendPlaybackCommand(.togglePlayPause)
            } label: {
                Image(systemName: state.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 26))
            }
            .buttonStyle(.plain)
        }
    }

    private var chapterProgress: Double {
        guard state.chapterDuration > 0 else { return 0 }
        return state.chapterElapsed / state.chapterDuration
    }

    private var statsRow: some View {
        HStack {
            HStack(spacing: 3) {
                Image(systemName: "bookmark.fill")
                    .font(.system(size: 9))
                Text(formatMinutesSeconds(state.chapterDuration - state.chapterElapsed))
                    .font(.system(size: 11, design: .monospaced))
            }
            .foregroundStyle(.secondary)

            Spacer()

            HStack(spacing: 3) {
                Image(systemName: "book.fill")
                    .font(.system(size: 9))
                Text(formatHoursMinutes(state.bookDuration - state.bookElapsed))
                    .font(.system(size: 11, design: .monospaced))
            }
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
    }

    private func formatMinutesSeconds(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds))
        let mins = total / 60
        let secs = total % 60
        return "\(mins)m\(secs)s"
    }

    private func formatHoursMinutes(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds))
        let hrs = total / 3600
        let mins = (total % 3600) / 60
        return "\(hrs)h\(mins)m"
    }

    private var bottomNav: some View {
        HStack(spacing: 20) {
            Button {
                onChapters()
            } label: {
                Image(systemName: "list.bullet")
                    .font(.body)
            }
            .buttonStyle(.plain)

            Button {
                showSpeedPicker = true
            } label: {
                Text(speedLabel)
                    .font(.body)
            }
            .buttonStyle(.plain)
            .sheet(isPresented: $showSpeedPicker) {
                SpeedPickerSheet(currentRate: state.playbackRate) { rate in
                    viewModel.sendPlaybackCommand(.setPlaybackRate(rate: rate))
                    showSpeedPicker = false
                }
            }
        }
        .foregroundStyle(.secondary)
        .padding(.bottom, 8)
    }

    private var speedLabel: String {
        let rate = state.playbackRate
        if rate == 1.0 {
            return "1x"
        } else if rate == floor(rate) {
            return "\(Int(rate))x"
        } else {
            return String(format: "%.1fx", rate)
        }
    }

    private var volumeOverlay: some View {
        VStack {
            HStack(spacing: 4) {
                Image(systemName: volumeIcon)
                    .font(.caption)
                Text("\(Int(crownVolume * 100))%")
                    .font(.caption.monospacedDigit())
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.green, in: Capsule())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .padding(.top, 4)
        .padding(.trailing, 4)
    }

    private var volumeIcon: String {
        if crownVolume == 0 {
            return "speaker.slash.fill"
        } else if crownVolume < 0.33 {
            return "speaker.wave.1.fill"
        } else if crownVolume < 0.66 {
            return "speaker.wave.2.fill"
        } else {
            return "speaker.wave.3.fill"
        }
    }
}

private struct RemoteChapterListView: View {
    let state: RemotePlaybackState
    let viewModel: WatchViewModel
    let onBack: () -> Void

    var body: some View {
        ScrollViewReader { proxy in
            List {
                ForEach(state.chapters, id: \.index) { chapter in
                    Button {
                        viewModel.sendPlaybackCommand(
                            .seekToChapter(sectionIndex: chapter.sectionIndex)
                        )
                        onBack()
                    } label: {
                        HStack {
                            Text(chapter.title)
                                .lineLimit(2)
                            Spacer()
                            if chapter.index == state.currentChapterIndex {
                                Image(systemName: "speaker.wave.2.fill")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .id(chapter.index)
                }
            }
            .onAppear {
                proxy.scrollTo(state.currentChapterIndex, anchor: .center)
            }
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    onBack()
                } label: {
                    Image(systemName: "chevron.left")
                }
            }
        }
        .navigationTitle("Chapters")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct SpeedPickerSheet: View {
    let currentRate: Double
    let onSelect: (Double) -> Void

    private let speeds: [Double] = [0.5, 0.75, 1.0, 1.1, 1.2, 1.25, 1.3, 1.5, 1.75, 2.0]

    private var currentSpeedIndex: Int {
        speeds.firstIndex { abs($0 - currentRate) < 0.01 } ?? 2
    }

    var body: some View {
        ScrollViewReader { proxy in
            List {
                ForEach(Array(speeds.enumerated()), id: \.offset) { index, speed in
                    Button {
                        onSelect(speed)
                    } label: {
                        HStack {
                            Text(formatSpeedPickerLabel(speed, includeNormalLabel: true))
                            Spacer()
                            if abs(currentRate - speed) < 0.01 {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                    .id(index)
                }
            }
            .onAppear {
                proxy.scrollTo(currentSpeedIndex, anchor: .center)
            }
        }
        .navigationTitle("Speed")
    }

}
#endif
