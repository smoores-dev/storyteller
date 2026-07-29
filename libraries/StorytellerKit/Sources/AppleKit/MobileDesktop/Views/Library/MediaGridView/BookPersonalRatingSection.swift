#if os(iOS) || os(macOS)
import SwiftUI

struct ThemedRatingStars: View {
    let value: Double?
    var starSize: CGFloat = 15
    var spacing: CGFloat = 4
    let fillColor: Color
    let emptyColor: Color
    var resetToken: Int = 0
    var onCommit: ((Double) -> Void)? = nil

    @State private var previewValue: Double?

    private var displayValue: Double {
        if let previewValue { return previewValue }
        guard let value else { return 0 }
        return PersonalRatingLogic.snapToHalf(value)
    }

    var body: some View {
        RatingStarStrip(
            value: displayValue,
            starSize: starSize,
            spacing: spacing,
            fillColor: fillColor,
            emptyColor: emptyColor,
        )
        .contentShape(Rectangle())
        .overlay {
            if onCommit != nil {
                GeometryReader { proxy in
                    Color.clear
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { gesture in
                                    previewValue = starValue(
                                        at: gesture.location.x,
                                        width: proxy.size.width,
                                    )
                                }
                                .onEnded { gesture in
                                    let committed = starValue(
                                        at: gesture.location.x,
                                        width: proxy.size.width,
                                    )
                                    previewValue = committed
                                    onCommit?(committed)
                                }
                        )
                }
            }
        }
        .onChange(of: value) { _, _ in previewValue = nil }
        .onChange(of: resetToken) { _, _ in previewValue = nil }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            value.map { "Rating, \(UserBookRating.format($0)) out of 5" } ?? "Not rated"
        )
        .accessibilityHint(onCommit != nil ? "Drag to set a rating" : "")
    }

    private func starValue(at x: CGFloat, width: CGFloat) -> Double {
        guard width > 0 else { return 0 }
        return PersonalRatingLogic.snapToHalf(Double(x / width) * 5)
    }
}

struct BookRatingEditorSheet: View {
    let model: BookPersonalRatingModel

    @Environment(\.dismiss) private var dismiss
    @Environment(\.bookDetailPalette) private var palette
    @Environment(\.colorScheme) private var colorScheme

    @State private var draftStars: Double?
    @State private var starsEdited = false
    @State private var useAverageChosen = false
    @State private var draftScores: [String: Double] = [:]
    @State private var hasDimensions = false
    @State private var dimensionsEdited = false
    @State private var draftReview = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var accent: Color {
        guard let palette else { return .accentColor }
        return palette.ratingAccent(for: colorScheme)
    }

    private var draftAverage: Double? {
        hasDimensions ? UserBookRating.average(of: draftScores) : nil
    }

    private var displayedStars: Double? {
        if starsEdited { return draftStars }
        if useAverageChosen { return draftAverage }
        return model.starRating
    }

    private var showsUseAverage: Bool {
        guard let average = draftAverage else { return false }
        return UserBookRating.isManualOverride(rating: displayedStars, average: average)
    }

    private var reviewChanged: Bool {
        draftReview.trimmingCharacters(in: .whitespacesAndNewlines) != (model.review ?? "")
    }

    private var isDirty: Bool {
        starsEdited || useAverageChosen || dimensionsEdited || reviewChanged
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    starsRow
                    useAverageSlot
                    dimensionsArea
                    reviewArea
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Divider()
            footer
        }
        #if os(macOS)
        .frame(width: 420, height: 680)
        #endif
        .onAppear { seedFromModel() }
    }

    private var header: some View {
        HStack {
            Text("User Rating & Review")
                .font(.headline)
            Spacer()
            if model.isSaving || isSaving {
                ProgressView()
                    .controlSize(.small)
            }
            Menu {
                Button("Remove Rating", systemImage: "trash", role: .destructive) {
                    Task {
                        if await model.removeRating() {
                            dismiss()
                        } else {
                            errorMessage = model.errorMessage
                        }
                    }
                }
                .disabled(model.record == nil)
            } label: {
                Image(systemName: "ellipsis.circle")
                    .foregroundStyle(.secondary)
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
            .accessibilityLabel("Rating options")
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }

    private var starsRow: some View {
        HStack(spacing: 10) {
            ThemedRatingStars(
                value: displayedStars,
                starSize: 24,
                spacing: 6,
                fillColor: accent,
                emptyColor: accent.opacity(0.3),
            ) { value in
                draftStars = value
                starsEdited = true
                useAverageChosen = false
            }
            if let displayedStars {
                Text(UserBookRating.format(displayedStars))
                    .font(.callout.weight(.medium))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// Fixed-height so appearing or disappearing mid-drag never shifts the radar below it.
    private var useAverageSlot: some View {
        HStack(spacing: 8) {
            if showsUseAverage, let average = draftAverage {
                Text("Detailed average is \(UserBookRating.format(average))")
                    .foregroundStyle(.secondary)
                Button("Use Average") {
                    starsEdited = false
                    useAverageChosen = true
                }
                .buttonStyle(.plain)
                .foregroundStyle(accent)
            }
        }
        .font(.caption.weight(.medium))
        .frame(height: 14)
    }

    @ViewBuilder
    private var dimensionsArea: some View {
        if hasDimensions {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Detailed Rating")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button {
                        hasDimensions = false
                        dimensionsEdited = true
                        useAverageChosen = false
                    } label: {
                        Image(systemName: "trash")
                            .font(.caption.weight(.semibold))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Remove detailed rating")
                    #if os(macOS)
                    .help("Remove detailed rating")
                    #endif
                }

                RatingRadarChart(
                    dimensions: model.displayDimensions,
                    scores: draftScores,
                    style: .editor(accent: accent),
                    onScoreChange: { id, value in
                        draftScores[id] = value
                        dimensionsEdited = true
                        useAverageChosen = false
                    },
                )
                .frame(maxWidth: .infinity)
            }
        } else {
            Button {
                draftScores = PersonalRatingLogic.seedScores(
                    for: model.displayDimensions,
                    from: displayedStars,
                )
                hasDimensions = true
                dimensionsEdited = true
            } label: {
                Label("Add Detailed Rating", systemImage: "pentagon")
            }
            .buttonStyle(.plain)
            .font(.callout.weight(.medium))
            .foregroundStyle(accent)
        }
    }

    private var reviewArea: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Review")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            TextEditor(text: $draftReview)
                .font(.body)
                .frame(minHeight: 110, maxHeight: 150)
                .scrollContentBackground(.hidden)
                .padding(6)
                .background(
                    Color.primary.opacity(0.05),
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous),
                )
                .overlay(alignment: .topLeading) {
                    if draftReview.isEmpty {
                        Text("Write a review...")
                            .font(.body)
                            .foregroundStyle(.tertiary)
                            .padding(.top, 14)
                            .padding(.leading, 11)
                            .allowsHitTesting(false)
                    }
                }
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Spacer()
            Button("Cancel") { dismiss() }
                .keyboardShortcut(.cancelAction)
            Button("Save") { Task { await save() } }
                .keyboardShortcut(.defaultAction)
                .disabled(!isDirty || isSaving || model.isSaving)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }

    private func seedFromModel() {
        draftStars = model.starRating
        starsEdited = false
        useAverageChosen = false
        let stored = model.dimensions
        hasDimensions = stored != nil
        dimensionsEdited = false
        var values: [String: Double] = [:]
        for dimension in model.displayDimensions {
            values[dimension.id] = stored?[dimension.id] ?? 0
        }
        draftScores = values
        draftReview = model.review ?? ""
        errorMessage = nil
    }

    private func save() async {
        let trimmedReview = draftReview.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            var update = PersonalRatingLogic.buildUpdate(
                starsEdited: starsEdited && !useAverageChosen,
                stars: draftStars,
                sendDimensions: dimensionsEdited || useAverageChosen,
                dimensions: hasDimensions ? draftScores : nil,
                reviewChanged: reviewChanged,
                review: trimmedReview,
            )
        else {
            dismiss()
            return
        }

        isSaving = true
        defer { isSaving = false }

        if !PersonalRatingLogic.hasProvidedValue(update) {
            guard
                let resolved = PersonalRatingLogic.resolveAllNullUpdate(
                    update,
                    currentRating: model.starRating,
                    currentReview: model.review,
                    currentDimensions: model.dimensions,
                )
            else {
                if await model.removeRating() {
                    dismiss()
                } else {
                    errorMessage = model.errorMessage
                }
                return
            }
            update = resolved
        }

        if await model.save(update) {
            dismiss()
        } else {
            errorMessage = model.errorMessage
        }
    }
}

#endif
