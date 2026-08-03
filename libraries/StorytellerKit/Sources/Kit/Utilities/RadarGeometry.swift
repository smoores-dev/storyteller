import Foundation

/// Radar-chart axis math shared by the Apple editor chart and the Android bridge.
/// Coordinates are plain Doubles so the type builds on platforms without CoreGraphics.
public enum RadarGeometry {
    public static let deadZone: Double = 8

    public static func axisAngle(_ index: Int, count: Int) -> Double {
        -Double.pi / 2 + Double(index) * (2 * .pi / Double(count))
    }

    public static func point(
        centerX: Double,
        centerY: Double,
        radius: Double,
        angle: Double,
    ) -> (x: Double, y: Double) {
        (x: centerX + radius * cos(angle), y: centerY + radius * sin(angle))
    }

    public static func nearestAxis(
        toX x: Double,
        y: Double,
        centerX: Double,
        centerY: Double,
        count: Int,
    ) -> Int? {
        guard count > 0 else { return nil }
        let dx = x - centerX
        let dy = y - centerY
        guard (dx * dx + dy * dy).squareRoot() > deadZone else { return nil }
        let angle = atan2(dy, dx)
        var best = 0
        var bestDelta = Double.infinity
        for index in 0..<count {
            var delta = abs(angle - axisAngle(index, count: count))
            delta = min(delta, 2 * .pi - delta)
            if delta < bestDelta {
                bestDelta = delta
                best = index
            }
        }
        return best
    }

    public static func value(
        atX x: Double,
        y: Double,
        centerX: Double,
        centerY: Double,
        axisIndex: Int,
        count: Int,
        outerRadius: Double,
        maximum: Double = RatingDimension.scoreMaximum,
        step: Double = 1,
    ) -> Double {
        let angle = axisAngle(axisIndex, count: count)
        let projection = (x - centerX) * cos(angle) + (y - centerY) * sin(angle)
        let raw = projection / outerRadius * maximum
        let snapped = (raw / step).rounded() * step
        return min(max(snapped, 0), maximum)
    }
}
