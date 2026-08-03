#if os(iOS) || os(macOS) || os(tvOS)
import SwiftUI

// CGPoint conveniences over the shared Double-based RadarGeometry in Kit.
extension RadarGeometry {
    fileprivate static func point(center: CGPoint, radius: CGFloat, angle: Double) -> CGPoint {
        let point = point(centerX: center.x, centerY: center.y, radius: radius, angle: angle)
        return CGPoint(x: point.x, y: point.y)
    }

    fileprivate static func nearestAxis(to location: CGPoint, center: CGPoint, count: Int) -> Int? {
        nearestAxis(toX: location.x, y: location.y, centerX: center.x, centerY: center.y, count: count)
    }

    fileprivate static func value(
        at location: CGPoint,
        center: CGPoint,
        axisIndex: Int,
        count: Int,
        outerRadius: CGFloat,
    ) -> Double {
        value(
            atX: location.x,
            y: location.y,
            centerX: center.x,
            centerY: center.y,
            axisIndex: axisIndex,
            count: count,
            outerRadius: outerRadius,
        )
    }
}

struct RatingRadarStyle {
    var outerRadius: CGFloat
    var labelPadding: CGFloat
    var gridColor: Color
    var gridLineWidth: CGFloat
    var outerRingLineWidth: CGFloat
    var valueFill: Color
    var valueStroke: Color
    var valueStrokeWidth: CGFloat = 2
    /// Nil draws no drag handles, which is also what makes the chart read as display-only.
    var handleRadius: CGFloat?
    var labelOffset: CGFloat
    var labelFont: Font
    var labelColor: Color
    var valueFont: Font
    var valueColor: Color
    var emphasizedLabelFont: Font?
    var emphasizedLabelColor: Color?
    var emphasizedValueColor: Color?

    var side: CGFloat { (outerRadius + labelPadding) * 2 }

    static func editor(
        accent: Color,
        gridColor: Color = Color.primary.opacity(0.16),
        labelColor: Color = .secondary,
    ) -> Self {
        Self(
            outerRadius: 98,
            labelPadding: 42,
            gridColor: gridColor,
            gridLineWidth: 0.6,
            outerRingLineWidth: 1.2,
            valueFill: accent.opacity(0.45),
            valueStroke: accent,
            handleRadius: 7,
            labelOffset: 24,
            labelFont: .caption,
            labelColor: labelColor,
            valueFont: .caption2,
            valueColor: accent,
        )
    }

    static var television: Self {
        Self(
            outerRadius: 84,
            labelPadding: 52,
            gridColor: .white.opacity(0.14),
            gridLineWidth: 1,
            outerRingLineWidth: 1,
            valueFill: .white.opacity(0.22),
            valueStroke: .white.opacity(0.85),
            handleRadius: nil,
            labelOffset: 34,
            labelFont: .system(size: 18),
            labelColor: .white.opacity(0.55),
            valueFont: .system(size: 16),
            valueColor: .white.opacity(0.4),
            emphasizedLabelFont: .system(size: 18, weight: .semibold),
            emphasizedLabelColor: .white,
            emphasizedValueColor: .white.opacity(0.8),
        )
    }
}

struct RatingRadarChart: View {
    let dimensions: [RatingDimension]
    let scores: [String: Double]
    let style: RatingRadarStyle
    var emphasizedID: String? = nil
    var onScoreChange: ((String, Double) -> Void)? = nil

    private var center: CGPoint { CGPoint(x: style.side / 2, y: style.side / 2) }

    var body: some View {
        Canvas { context, _ in
            guard dimensions.count >= 3 else { return }
            drawGrid(in: &context)
            drawValues(in: &context)
        }
        .frame(width: style.side, height: style.side)
        .overlay { labels }
        .contentShape(Rectangle())
        .modifier(
            RadarDragHandling(center: center, outerRadius: style.outerRadius, apply: apply)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Detailed rating chart")
    }

    private func apply(_ location: CGPoint) {
        guard let onScoreChange,
            let axis = RadarGeometry.nearestAxis(
                to: location,
                center: center,
                count: dimensions.count,
            )
        else { return }
        onScoreChange(
            dimensions[axis].id,
            RadarGeometry.value(
                at: location,
                center: center,
                axisIndex: axis,
                count: dimensions.count,
                outerRadius: style.outerRadius,
            )
        )
    }

    private func polygon(radius: (Int) -> CGFloat) -> Path {
        var path = Path()
        for index in 0..<dimensions.count {
            let point = RadarGeometry.point(
                center: center,
                radius: radius(index),
                angle: RadarGeometry.axisAngle(index, count: dimensions.count),
            )
            if index == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
        }
        path.closeSubpath()
        return path
    }

    private func drawGrid(in context: inout GraphicsContext) {
        for ring in 1...5 {
            let radius = style.outerRadius * CGFloat(ring) / 5
            context.stroke(
                polygon { _ in radius },
                with: .color(style.gridColor),
                lineWidth: ring == 5 ? style.outerRingLineWidth : style.gridLineWidth,
            )
        }
        for index in 0..<dimensions.count {
            var spoke = Path()
            spoke.move(to: center)
            spoke.addLine(
                to: RadarGeometry.point(
                    center: center,
                    radius: style.outerRadius,
                    angle: RadarGeometry.axisAngle(index, count: dimensions.count),
                )
            )
            context.stroke(spoke, with: .color(style.gridColor), lineWidth: style.gridLineWidth)
        }
    }

    private func drawValues(in context: inout GraphicsContext) {
        let valuePath = polygon { index in
            style.outerRadius * CGFloat(score(at: index) / RatingDimension.scoreMaximum)
        }
        context.fill(valuePath, with: .color(style.valueFill))
        context.stroke(
            valuePath,
            with: .color(style.valueStroke),
            lineWidth: style.valueStrokeWidth,
        )

        guard let handleRadius = style.handleRadius else { return }
        for index in 0..<dimensions.count {
            let point = RadarGeometry.point(
                center: center,
                radius: style.outerRadius
                    * CGFloat(score(at: index) / RatingDimension.scoreMaximum),
                angle: RadarGeometry.axisAngle(index, count: dimensions.count),
            )
            let handle = CGRect(
                x: point.x - handleRadius,
                y: point.y - handleRadius,
                width: handleRadius * 2,
                height: handleRadius * 2,
            )
            context.fill(Path(ellipseIn: handle), with: .color(style.valueStroke))
        }
    }

    private var labels: some View {
        ForEach(Array(dimensions.enumerated()), id: \.element.id) { index, dimension in
            let emphasized = dimension.id == emphasizedID
            let point = RadarGeometry.point(
                center: center,
                radius: style.outerRadius + style.labelOffset,
                angle: RadarGeometry.axisAngle(index, count: dimensions.count),
            )
            VStack(spacing: 1) {
                Text(dimension.label)
                    .font(
                        emphasized ? (style.emphasizedLabelFont ?? style.labelFont) : style.labelFont
                    )
                    .foregroundStyle(
                        emphasized ? (style.emphasizedLabelColor ?? style.labelColor) : style.labelColor
                    )
                Text(UserBookRating.format(score(at: index)))
                    .font(style.valueFont)
                    .monospacedDigit()
                    .foregroundStyle(
                        emphasized ? (style.emphasizedValueColor ?? style.valueColor) : style.valueColor
                    )
            }
            .lineLimit(1)
            .fixedSize()
            .position(point)
        }
    }

    private func score(at index: Int) -> Double {
        scores[dimensions[index].id] ?? 0
    }
}

/// tvOS has no `DragGesture`, so the interactive half of the chart is compiled out there
/// rather than duplicating the drawing code into a separate display-only chart.
private struct RadarDragHandling: ViewModifier {
    let center: CGPoint
    let outerRadius: CGFloat
    let apply: (CGPoint) -> Void

    func body(content: Content) -> some View {
        #if os(tvOS)
        content
        #else
        content.gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { apply($0.location) }
                .onEnded { apply($0.location) }
        )
        #endif
    }
}

#endif
