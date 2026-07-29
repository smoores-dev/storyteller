#if os(tvOS)
import StorytellerKit
import SwiftUI

struct TVSpeedPickerView: View {
    let viewModel: TVPlayerViewModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedIndex: Int?

    private let speeds: [Double] = [
        0.75, 1.0, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 5.0,
    ]

    private var currentSpeedIndex: Int? {
        speeds.firstIndex { abs($0 - viewModel.playbackRate) < 0.01 }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(speeds.enumerated()), id: \.offset) { index, speed in
                        Button {
                            viewModel.setPlaybackRate(speed)
                            Task {
                                try? await SettingsActor.shared.updateConfig(
                                    defaultPlaybackSpeed: speed
                                )
                            }
                            dismiss()
                        } label: {
                            HStack {
                                Text(formatSpeedPickerLabel(speed, includeNormalLabel: true))
                                    .font(.headline)

                                Spacer()

                                if abs(speed - viewModel.playbackRate) < 0.01 {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.blue)
                                }
                            }
                            .padding()
                        }
                        .buttonStyle(.plain)
                        .focused($focusedIndex, equals: index)
                    }
                }
            }
            .defaultFocus($focusedIndex, currentSpeedIndex)
            .navigationTitle("Playback Speed")
        }
    }

}
#endif
