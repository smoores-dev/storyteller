#if os(macOS)
import SwiftUI

struct HighlightEditorWindow: View {
    let request: HighlightEditorRequest?

    @Environment(\.dismiss) private var dismiss

    private var viewModel: EbookPlayerViewModel? {
        request.flatMap { EbookWindowRouter.shared.viewModel(for: $0.bookID) }
    }

    private var editHighlight: Highlight? {
        guard let request, let highlightID = request.highlightID, let viewModel else {
            return nil
        }
        return viewModel.highlights.first { $0.id == highlightID }
    }

    private var selection: TextSelectionMessage? {
        guard let request, request.highlightID == nil, let viewModel,
            let pending = viewModel.pendingSelection,
            pending.cfi == request.selectionCfi
        else { return nil }
        return pending
    }

    var body: some View {
        Group {
            if let viewModel, let highlight = editHighlight {
                VStack(spacing: 0) {
                    HighlightCreationSheet(
                        settingsVM: viewModel.settingsVM,
                        selectedText: highlight.text,
                        onSave: { color, note in
                            Task {
                                await viewModel.saveEditedHighlight(
                                    highlight,
                                    color: color,
                                    note: note,
                                )
                                viewModel.cancelPendingEdit()
                            }
                            dismiss()
                        },
                        onCancel: {
                            viewModel.cancelPendingEdit()
                            dismiss()
                        },
                        title: "Edit Highlight",
                        initialColor: highlight.color,
                        initialNote: highlight.note ?? "",
                    )

                    Divider()
                    HStack {
                        Button("Delete", role: .destructive) {
                            Task {
                                await viewModel.deleteHighlight(highlight)
                                viewModel.cancelPendingEdit()
                            }
                            dismiss()
                        }
                        Spacer()
                    }
                    .padding(12)
                }
            } else if let viewModel, let selection {
                HighlightCreationSheet(
                    settingsVM: viewModel.settingsVM,
                    selectedText: selection.text,
                    onSave: { color, note in
                        Task {
                            await viewModel.addHighlight(
                                from: selection,
                                color: color,
                                note: note,
                            )
                        }
                        dismiss()
                    },
                    onCancel: {
                        viewModel.cancelPendingSelection()
                        dismiss()
                    },
                )
            } else {
                ContentUnavailableView(
                    "Highlight Unavailable",
                    systemImage: "highlighter",
                    description: Text("The selection is gone or the reader window is closed."),
                )
                .frame(width: 400, height: 300)
            }
        }
        .background(WindowFloatingConfigurator())
    }
}
#endif
