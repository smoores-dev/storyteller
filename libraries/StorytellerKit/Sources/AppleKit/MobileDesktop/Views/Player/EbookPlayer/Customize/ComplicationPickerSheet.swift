#if os(iOS) || os(macOS)
import SwiftUI

struct ComplicationPickerSheet: View {
    let slot: SlotRef
    let current: PlayerComplication
    let display: MiniPlayerDisplayModel
    let onSelect: (PlayerComplication) -> Void
    var onConfigureTitleBlock: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if current == .titleBlock, let onConfigureTitleBlock {
                    Section {
                        Button {
                            dismiss()
                            onConfigureTitleBlock()
                        } label: {
                            HStack {
                                Label("Title Block Options", systemImage: "slider.horizontal.3")
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    } footer: {
                        Text("Pick the cover and the two lines this block shows.")
                    }
                }

                section(nil, [.none])
                section("Playback", SlotLayout.playbackControls(for: slot.region))
                section("Reader Controls", SlotLayout.readerControls(for: slot.region))
                section("Stats", SlotLayout.statComplications(for: slot.region))
            }
            .navigationTitle("Complication")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        #if os(iOS)
        .presentationDetents([.medium])
        #else
        .frame(width: 380, height: 460)
        #endif
    }

    @ViewBuilder
    private func section(_ title: String?, _ options: [PlayerComplication]) -> some View {
        if !options.isEmpty {
            Section {
                ForEach(options, id: \.self) { comp in
                    Button {
                        onSelect(comp)
                        dismiss()
                    } label: {
                        HStack(spacing: 12) {
                            thumb(for: comp)
                            Text(comp.displayName)
                                .foregroundStyle(.primary)
                            Spacer()
                            if comp == current {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                }
            } header: {
                if let title {
                    Text(title)
                }
            }
        }
    }

    private func thumb(for comp: PlayerComplication) -> some View {
        Group {
            if comp == .none {
                Image(systemName: "circle.dashed")
                    .foregroundStyle(.secondary)
            } else {
                PlayerComplicationView(
                    complication: comp,
                    display: display,
                    actions: .noop,
                    style: .pickerThumb,
                )
                .allowsHitTesting(false)
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 8)
            }
        }
        .frame(minWidth: 68, minHeight: 36)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.secondary.opacity(0.12))
        )
    }
}

#if os(iOS)
struct LeadingStylePickerSheet: View {
    @Bindable var settingsVM: SettingsViewModel
    let display: MiniPlayerDisplayModel
    @Environment(\.dismiss) private var dismiss

    @State private var editingSecondCycle = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    styleRow(
                        style: .single,
                        title: "One View",
                        subtitle: "Tap expands the full player",
                    )
                    styleRow(
                        style: .cycle,
                        title: "Two Views",
                        subtitle: "Tap flips between two custom views",
                    )
                } header: {
                    Text("Title Block")
                }

                cycleEditorSections
            }
            .navigationTitle("Title Block")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear { editingSecondCycle = settingsVM.miniPlayerCycleShowingSecond }
    }

    private var isCycling: Bool {
        settingsVM.miniPlayerLeadingStyle == .cycle
    }

    private var cycleBinding: Binding<MiniPlayerCycleBlock> {
        Binding(
            get: {
                isCycling && editingSecondCycle
                    ? settingsVM.miniPlayerCycleSecond : settingsVM.miniPlayerCycleFirst
            },
            set: { newValue in
                if isCycling && editingSecondCycle {
                    settingsVM.miniPlayerCycleSecond = newValue
                } else {
                    settingsVM.miniPlayerCycleFirst = newValue
                }
                settingsVM.save()
            },
        )
    }

    @ViewBuilder
    private var cycleEditorSections: some View {
        Section {
            if isCycling {
                Picker("Cycle", selection: $editingSecondCycle) {
                    Text("First View").tag(false)
                    Text("Second View").tag(true)
                }
                .pickerStyle(.segmented)
                .listRowSeparator(.hidden)
            }

            cyclePreview
                .listRowSeparator(.hidden)

            Toggle("Show Cover", isOn: cycleBinding.showCover)

            componentPicker(title: "Line 1", selection: cycleBinding.line1)
            componentPicker(title: "Line 2", selection: cycleBinding.line2)
        } header: {
            Text(isCycling ? "Views" : "View")
        } footer: {
            Text(
                isCycling
                    ? "Each view builds from the pieces you pick here. "
                        + "Tapping the block in the reader flips between the two views."
                    : "The view builds from the pieces you pick here."
            )
        }
        .onChange(of: editingSecondCycle) { _, newValue in
            settingsVM.miniPlayerCycleShowingSecond = newValue
            settingsVM.save()
        }
    }

    private var cyclePreview: some View {
        let block = cycleBinding.wrappedValue
        return HStack(spacing: 12) {
            if block.showCover {
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
                if block.line1 != .none {
                    Text(cycleComponentDisplayText(block.line1, display: display))
                        .font(.subheadline.weight(.medium))
                        .lineLimit(1)
                }
                if block.line2 != .none {
                    Text(cycleComponentDisplayText(block.line2, display: display))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.secondary.opacity(0.1))
        )
    }

    private func componentPicker(
        title: String,
        selection: Binding<MiniPlayerCycleComponent>,
    ) -> some View {
        Picker(title, selection: selection) {
            ForEach(availableComponents, id: \.self) { component in
                Text(component.displayName).tag(component)
            }
        }
        .pickerStyle(.menu)
    }

    private var availableComponents: [MiniPlayerCycleComponent] {
        MiniPlayerCycleComponent.allCases.filter {
            display.hasAudioNarration || !$0.requiresAudio
        }
    }

    private func styleRow(
        style: MiniPlayerLeadingStyle,
        title: String,
        subtitle: String,
    ) -> some View {
        Button {
            settingsVM.miniPlayerLeadingStyle = style
            settingsVM.save()
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .foregroundStyle(.primary)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if settingsVM.miniPlayerLeadingStyle == style {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
    }
}
#endif
#endif
