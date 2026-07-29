#if os(watchOS)
import StorytellerKit
import SwiftUI

struct WatchPlayerView: View {
    @State private var viewModel = WatchPlayerViewModel()
    @State private var currentPage: PlayerPage = .controls

    let book: BookMetadata

    enum PlayerPage {
        case chapters
        case controls
        case text
    }

    var body: some View {
        Group {
            if viewModel.isLoadingPosition {
                loadingView
            } else {
                switch currentPage {
                    case .chapters:
                        ChapterListView(viewModel: viewModel) { sectionIndex in
                            Task {
                                await viewModel.jumpToChapter(sectionIndex)
                                currentPage = .controls
                            }
                        }
                    case .controls:
                        AudioControlsPage(
                            viewModel: viewModel,
                            onChapters: { currentPage = .chapters },
                            onText: { currentPage = .text },
                        )
                    case .text:
                        TextReaderPage(viewModel: viewModel, onBack: { currentPage = .controls })
                }
            }
        }
        .task {
            await viewModel.loadBook(book)
        }
        .onDisappear {
            viewModel.cleanup()
        }
        .alert(
            "Server Has Newer Position",
            isPresented: $viewModel.showServerPositionDialog,
        ) {
            Button("Go to New Position") {
                viewModel.acceptServerPosition()
            }
            Button("Stay Here", role: .cancel) {
                viewModel.declineServerPosition()
            }
        } message: {
            Text("Another device has a more recent reading location.")
        }
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Loading...")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct ChapterListView: View {
    @Bindable var viewModel: WatchPlayerViewModel
    let onSelectChapter: (Int) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            List {
                ForEach(viewModel.chapters) { chapter in
                    Button {
                        onSelectChapter(chapter.index)
                    } label: {
                        HStack {
                            Text(chapter.label)
                                .lineLimit(2)
                            Spacer()
                            if chapter.index == viewModel.currentSectionIndex {
                                Image(systemName: "speaker.wave.2.fill")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .id(chapter.index)
                }
            }
            .onAppear {
                proxy.scrollTo(viewModel.currentSectionIndex, anchor: .center)
            }
        }
        .navigationTitle("Chapters")
    }
}

private struct AudioControlsPage: View {
    @Bindable var viewModel: WatchPlayerViewModel
    @State private var crownVolume: Double = 1.0
    @State private var showVolumeOverlay = false
    @State private var showSpeedPicker = false
    @State private var volumeHideTask: DispatchWorkItem?
    @FocusState private var isFocused: Bool

    let onChapters: () -> Void
    let onText: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Text(viewModel.chapterTitle)
                .font(.footnote)
                .foregroundStyle(.white)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
                .padding(.bottom, 16)

            controlsRow

            statsRow
                .padding(.top, 16)

            Spacer(minLength: 20)

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
            viewModel.setVolume(newValue)
            showVolumeOverlay = true
            volumeHideTask?.cancel()
            let task = DispatchWorkItem { showVolumeOverlay = false }
            volumeHideTask = task
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: task)
        }
        .onAppear {
            crownVolume = viewModel.volume
            isFocused = true
        }
        .navigationTitle(viewModel.bookTitle)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var controlsRow: some View {
        HStack(spacing: 0) {
            Button {
                viewModel.skipBackward()
            } label: {
                Image(systemName: "gobackward.30")
                    .font(.title2)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(.plain)

            playButtonWithProgress
                .frame(width: 58, height: 58)

            Button {
                viewModel.skipForward()
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
                .trim(from: 0, to: viewModel.chapterProgress)
                .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                .rotationEffect(.degrees(-90))

            Button {
                viewModel.playPause()
            } label: {
                Image(systemName: viewModel.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 26))
            }
            .buttonStyle(.plain)
        }
    }

    private var statsRow: some View {
        HStack {
            HStack(spacing: 3) {
                Image(systemName: "bookmark.fill")
                    .font(.system(size: 9))
                Text(formatMinutesSeconds(viewModel.chapterDuration - viewModel.currentTime))
                    .font(.system(size: 11, design: .monospaced))
            }
            .foregroundStyle(.secondary)

            Spacer()

            HStack(spacing: 3) {
                Text(formatHoursMinutes(viewModel.bookDuration - viewModel.bookElapsed))
                    .font(.system(size: 11, design: .monospaced))
                Image(systemName: "book.fill")
                    .font(.system(size: 9))
            }
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
    }

    private func formatMinutesSeconds(_ seconds: Double) -> String {
        let total = max(0, Int(seconds))
        let mins = total / 60
        let secs = total % 60
        return "\(mins)m\(secs)s"
    }

    private func formatHoursMinutes(_ seconds: Double) -> String {
        let total = max(0, Int(seconds))
        let hrs = total / 3600
        let mins = (total % 3600) / 60
        return "\(hrs)h\(mins)m"
    }

    private var bottomNav: some View {
        HStack(spacing: 0) {
            Button {
                onChapters()
            } label: {
                Image(systemName: "list.bullet")
                    .font(.title3)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)

            Button {
                onText()
            } label: {
                Image(systemName: "text.alignleft")
                    .font(.title3)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)

            Button {
                showSpeedPicker = true
            } label: {
                Text(speedLabel)
                    .font(.title3)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .sheet(isPresented: $showSpeedPicker) {
                SpeedPickerSheet(currentRate: viewModel.playbackRate) { rate in
                    viewModel.setPlaybackRate(rate)
                    showSpeedPicker = false
                }
            }
        }
        .foregroundStyle(.secondary)
    }

    private var speedLabel: String {
        let rate = viewModel.playbackRate
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

private struct TextReaderPage: View {
    @Bindable var viewModel: WatchPlayerViewModel
    let onBack: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(viewModel.currentLineText)
                    .font(.body)
                if !viewModel.nextLineText.isEmpty {
                    Text(viewModel.nextLineText)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
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
        .navigationTitle("Text")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct SpeedPickerSheet: View {
    let currentRate: Double
    let onSelect: (Double) -> Void

    private let speeds: [Double] = [
        0.75, 1.0, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 5.0,
    ]

    private var currentSpeedIndex: Int {
        speeds.firstIndex { abs($0 - currentRate) < 0.01 } ?? 1
    }

    var body: some View {
        ScrollViewReader { proxy in
            List {
                ForEach(Array(speeds.enumerated()), id: \.offset) { index, speed in
                    Button {
                        Task {
                            try? await SettingsActor.shared.updateConfig(
                                defaultPlaybackSpeed: speed
                            )
                        }
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
