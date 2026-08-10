#if os(iOS)
import SwiftUI

enum CustomizeCard: String, Identifiable {
    case textLayout
    case readaloud
    case menuBar
    case miniplayer
    case dock
    case theme

    var id: String { rawValue }
}

struct ProgressIndicatorLine: View {
    let progress: Double
    let thickness: Double

    var body: some View {
        GeometryReader { geometry in
            Rectangle()
                .fill(Color.gray.opacity(0.65))
                .frame(width: geometry.size.width * min(max(progress, 0), 1))
        }
        .frame(height: thickness)
        .allowsHitTesting(false)
    }
}

struct ProgressIndicatorSection: View {
    @Bindable var settingsVM: SettingsViewModel
    let toggleTitle: String
    let enabled: Binding<Bool>
    let scope: Binding<MiniPlayerProgressScope>
    let thickness: Binding<Double>

    var body: some View {
        Section {
            Toggle(isOn: enabled) {
                Label(toggleTitle, systemImage: "minus")
            }

            if enabled.wrappedValue {
                Picker("Shows Progress In", selection: scope) {
                    Text("Chapter").tag(MiniPlayerProgressScope.chapter)
                    Text("Book").tag(MiniPlayerProgressScope.book)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(
                        "Thickness: \(Int(thickness.wrappedValue))pt"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    Slider(
                        value: thickness,
                        in: 1...8,
                        step: 1,
                    )
                }
            }
        } header: {
            Text("Progress Indicator")
        } footer: {
            Text(
                "Small line indicator at very bottom of screen to show how far "
                    + "you are in chapter or book."
            )
        }
    }
}

struct CustomizeCardContainer<Content: View>: View {
    let title: String
    var onReset: (() -> Void)? = nil
    @ViewBuilder let content: () -> Content
    @Environment(\.dismiss) private var dismiss

    @State private var confirmingReset = false

    var body: some View {
        NavigationStack {
            content()
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if onReset != nil {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Reset") { confirmingReset = true }
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
                .confirmationDialog(
                    "Reset \(title) to defaults?",
                    isPresented: $confirmingReset,
                    titleVisibility: .visible,
                ) {
                    Button("Reset \(title)", role: .destructive) { onReset?() }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("Only the settings on this page change.")
                }
        }
    }
}
#endif
