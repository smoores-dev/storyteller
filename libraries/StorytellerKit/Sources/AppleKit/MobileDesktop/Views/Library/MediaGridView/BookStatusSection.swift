#if os(iOS) || os(macOS)
import SwiftUI

struct BookStatusSection: View {
    enum Presentation {
        case section
        case toolbarMenu
    }

    let item: BookMetadata
    var showsHeading = true
    var presentation: Presentation = .section
    @Environment(MediaViewModel.self) private var mediaViewModel: MediaViewModel

    @State private var selectedStatusName: String?
    @State private var isUpdating = false
    @State private var showOfflineError = false

    private var currentItem: BookMetadata {
        mediaViewModel.library.bookMetaData.first { $0.id == item.id } ?? item
    }

    private var sortedStatuses: [BookStatus] {
        mediaViewModel.availableStatusesBySourceID[currentItem.sourceID] ?? []
    }

    var body: some View {
        Group {
            switch presentation {
                case .section:
                    VStack(alignment: .leading, spacing: 8) {
                        if showsHeading {
                            HStack {
                                Text("Status")
                                    .font(.callout)
                                    .fontWeight(.medium)
                                Spacer()
                                if isUpdating {
                                    ProgressView()
                                        .controlSize(.small)
                                }
                            }
                        }

                        HStack {
                            if !showsHeading {
                                Text("Status")
                                    .font(.callout)
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            statusPicker
                            if !showsHeading && isUpdating {
                                ProgressView()
                                    .controlSize(.small)
                            }
                        }
                    }
                case .toolbarMenu:
                    statusMenu
            }
        }
        .onAppear {
            selectedStatusName = currentItem.status?.name
        }
        .onChange(of: currentItem.status?.name) { _, newValue in
            selectedStatusName = newValue
        }
        .alert("Cannot Change Status", isPresented: $showOfflineError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Please connect to the Storyteller server to change the book status.")
        }
    }

    private var statusMenu: some View {
        Menu {
            Section("Reading Status") {
                if sortedStatuses.isEmpty {
                    Text(currentItem.status?.name ?? "No statuses available")
                } else {
                    ForEach(sortedStatuses, id: \.name) { status in
                        Button {
                            selectStatus(status.name)
                        } label: {
                            if selectedStatusName == status.name {
                                Label(status.name, systemImage: "checkmark")
                            } else {
                                Text(status.name)
                            }
                        }
                        .disabled(selectedStatusName == status.name)
                    }
                }
            }
        } label: {
            ZStack {
                if isUpdating {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                } else {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 12, weight: .semibold))
                }
            }
            .frame(width: 24, height: 24)
            .background(.white.opacity(0.12), in: Circle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .disabled(isUpdating)
        .help("Reading status: \(currentItem.status?.name ?? "Unknown")")
        .accessibilityLabel("Set reading status")
    }

    @ViewBuilder
    private var statusPicker: some View {
        if sortedStatuses.isEmpty {
            Text(currentItem.status?.name ?? "Unknown")
                .font(.body)
                .foregroundStyle(.secondary)
        } else {
            Picker("", selection: $selectedStatusName) {
                ForEach(sortedStatuses, id: \.name) { status in
                    Text(status.name).tag(Optional(status.name))
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .disabled(isUpdating)
            .onChange(of: selectedStatusName) { oldValue, newValue in
                guard let newValue, newValue != oldValue, oldValue != nil else { return }
                Task { await updateStatus(to: newValue) }
            }
        }
    }

    private func updateStatus(to statusName: String) async {
        let sourceID = currentItem.sourceID
        guard
            await BookServiceActor.shared.connectionStatus(sourceID: sourceID) == .connected
        else {
            showOfflineError = true
            selectedStatusName = currentItem.status?.name
            return
        }

        isUpdating = true
        defer { isUpdating = false }

        let success = await BookServiceActor.shared.updateStatus(
            forBooks: [item.id],
            toStatusNamed: statusName,
        )

        if !success {
            selectedStatusName = currentItem.status?.name
        }
    }

    private func selectStatus(_ statusName: String) {
        guard statusName != selectedStatusName else { return }
        selectedStatusName = statusName
        Task { await updateStatus(to: statusName) }
    }
}

#endif
