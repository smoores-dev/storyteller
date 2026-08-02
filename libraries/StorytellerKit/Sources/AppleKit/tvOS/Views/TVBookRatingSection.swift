#if os(tvOS)
import SwiftUI

struct TVBookRatingEditor: View {
    let book: BookMetadata
    let model: BookPersonalRatingModel

    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var draftStars: Double?
    @State private var draftScores: [String: Double] = [:]
    @State private var starsDirty = false
    @State private var dimensionsDirty = false
    @State private var isSaving = false
    @FocusState private var focusedRow: RowID?

    private enum RowID: Hashable {
        case overall
        case dimension(String)
        case cancel
    }

    /// Ends at Cancel so a downward swipe off the last dimension lands on the action row;
    /// Cancel to Save is left to the focus engine.
    private var rowOrder: [RowID] {
        [.overall] + model.displayDimensions.map { .dimension($0.id) } + [.cancel]
    }

    private var focusedDimensionID: String? {
        if case .dimension(let id) = focusedRow { return id }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                VStack(spacing: 3) {
                    Text("User Rating")
                        .font(.system(size: 30, weight: .bold))
                    Text(book.title)
                        .font(.system(size: 19))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                RatingRadarChart(
                    dimensions: model.displayDimensions,
                    scores: draftScores,
                    style: .television,
                    emphasizedID: focusedDimensionID,
                )
                .frame(maxWidth: .infinity)

                VStack(spacing: 0) {
                    overallRow
                    ForEach(model.displayDimensions, id: \.id) { dimension in
                        dimensionRow(for: dimension)
                    }
                }

                if let message = model.errorMessage {
                    Text(message)
                        .font(.system(size: 17))
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity)
                }

                actionRow
            }
            .padding(.vertical, 20)
            .padding(.horizontal, 36)
        }
        .defaultFocus($focusedRow, .overall)
        .disabled(isSaving)
        .task(id: book.id) {
            await model.prepare(
                for: book.id,
                isServerBook: mediaViewModel.isServerBook(book.id),
            )
            syncDrafts()
        }
        .onChange(of: model.saveGeneration) { _, _ in
            syncDrafts()
        }
    }

    private var actionRow: some View {
        HStack(spacing: 18) {
            Button("Cancel") { dismiss() }
                .focused($focusedRow, equals: .cancel)

            Button("Save") { save() }
                .buttonStyle(.borderedProminent)
        }
        .padding(.top, 4)
    }

    private var overallRow: some View {
        row(id: .overall) { tint in
            Text("Overall")
                .font(.system(size: 24, weight: .medium))

            Spacer()

            RatingStarStrip(
                value: draftStars,
                starSize: 21,
                spacing: 5,
                fillColor: tint,
                emptyColor: tint.opacity(0.25),
            )

            valueText(draftStars.map { UserBookRating.format($0) } ?? "-", tint: tint)
        }
    }

    private func dimensionRow(for dimension: RatingDimension) -> some View {
        let score = draftScores[dimension.id] ?? 0
        return row(id: .dimension(dimension.id)) { tint in
            Text(dimension.label)
                .font(.system(size: 24, weight: .medium))
                .lineLimit(1)

            Spacer()

            Capsule()
                .fill(tint.opacity(0.2))
                .overlay(alignment: .leading) {
                    Capsule()
                        .fill(tint.opacity(0.85))
                        .frame(width: 176 * score / RatingDimension.scoreMaximum)
                }
                .frame(width: 176, height: 9)

            valueText(UserBookRating.format(score), tint: tint)
        }
    }

    /// Rows draw their own selection: the stock focus platter inflates well past the row
    /// bounds at a capsule radius, which reads as a bubble popping out of the list.
    private func row<Content: View>(
        id: RowID,
        action: @escaping () -> Void = {},
        @ViewBuilder content: (Color) -> Content,
    ) -> some View {
        let focused = focusedRow == id
        let tint: Color = focused ? .black : .white
        return Button(action: action) {
            HStack(spacing: 16) {
                content(tint)
            }
            .foregroundStyle(tint)
            .padding(.horizontal, 20)
            .padding(.vertical, 13)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(focused ? Color.white : Color.clear)
            )
        }
        .buttonStyle(RatingRowButtonStyle())
        .focused($focusedRow, equals: id)
        .onMoveCommand { direction in
            handleMove(direction, for: id)
        }
    }

    private func valueText(_ value: String, tint: Color) -> some View {
        Text(value)
            .font(.system(size: 22).monospacedDigit())
            .foregroundStyle(tint.opacity(0.6))
            .lineLimit(1)
            .frame(width: 64, alignment: .trailing)
    }

    private func handleMove(_ direction: MoveCommandDirection, for id: RowID) {
        switch direction {
            case .left:
                adjust(id, direction: -1)
            case .right:
                adjust(id, direction: 1)
            case .up:
                moveFocus(from: id, offset: -1)
            case .down:
                moveFocus(from: id, offset: 1)
            @unknown default:
                break
        }
    }

    private func adjust(_ id: RowID, direction: Double) {
        switch id {
            case .overall:
                adjustStars(by: 0.5 * direction)
            case .dimension(let key):
                adjustDimension(key, by: direction)
            case .cancel:
                break
        }
    }

    private func moveFocus(from id: RowID, offset: Int) {
        guard let index = rowOrder.firstIndex(of: id) else { return }
        let target = index + offset
        guard rowOrder.indices.contains(target) else { return }
        focusedRow = rowOrder[target]
    }

    private func adjustStars(by delta: Double) {
        let next = PersonalRatingLogic.snapToHalf((draftStars ?? 0) + delta)
        guard next != draftStars else { return }
        draftStars = next
        starsDirty = true
    }

    private func adjustDimension(_ id: String, by delta: Double) {
        let current = draftScores[id] ?? 0
        let next = min(
            max(current + delta, RatingDimension.scoreMinimum),
            RatingDimension.scoreMaximum,
        )
        guard next != current else { return }
        draftScores[id] = next
        dimensionsDirty = true
    }

    private func pendingUpdate() -> UserBookRatingUpdate? {
        PersonalRatingLogic.buildUpdate(
            starsEdited: starsDirty,
            stars: draftStars,
            sendDimensions: dimensionsDirty,
            dimensions: draftScores,
            reviewChanged: false,
            review: "",
        )
    }

    private func save() {
        guard let update = pendingUpdate() else {
            dismiss()
            return
        }
        isSaving = true
        Task {
            let saved = await model.save(update)
            isSaving = false
            guard saved else { return }
            starsDirty = false
            dimensionsDirty = false
            dismiss()
        }
    }

    private func syncDrafts() {
        guard !starsDirty, !dimensionsDirty else { return }
        draftStars = model.starRating
        var values: [String: Double] = [:]
        for dimension in model.displayDimensions {
            values[dimension.id] = model.dimensions?[dimension.id] ?? 0
        }
        draftScores = values
    }
}

private struct RatingRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.75 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
#endif
