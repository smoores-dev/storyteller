// Port of okmain 0.2.0 src/lib.rs: validation, center-priority mask, and
// coverage/chroma scoring over the k-means centroids.

public struct OkmainColor: Equatable, Sendable {
    public let red: UInt8
    public let green: UInt8
    public let blue: UInt8

    public init(red: UInt8, green: UInt8, blue: UInt8) {
        self.red = red
        self.green = green
        self.blue = blue
    }
}

public struct OkmainConfig: Sendable {
    public var maskSaturatedThreshold: Float = 0.3
    public var maskWeight: Float = 1.0
    public var maskWeightedCountsWeight: Float = 0.3
    public var chromaWeight: Float = 0.7

    public init() {}

    var isValid: Bool {
        maskSaturatedThreshold >= 0 && maskSaturatedThreshold < 0.5
            && maskWeight >= 0 && maskWeight <= 1
            && maskWeightedCountsWeight >= 0 && maskWeightedCountsWeight <= 1
            && chromaWeight >= 0 && chromaWeight <= 1
            && abs(maskWeightedCountsWeight + chromaWeight - 1) < 1e-5
    }
}

/// Dominant colors of an image, most dominant first. Same algorithm and same
/// results as the server's okmain-based extraction.
public enum Okmain {
    static let randomSeed: UInt64 = 314_159
    static let maxSrgbOklabChroma: Float = 0.32

    /// `rgb` is tightly packed `RGBRGBRGB...` bytes in sRGB. Returns nil for
    /// invalid input (empty, mismatched size, dimensions outside 1...65535) or
    /// an invalid config.
    public static func colors(
        width: Int,
        height: Int,
        rgb: [UInt8],
        config: OkmainConfig = OkmainConfig(),
    ) -> [OkmainColor]? {
        guard
            config.isValid,
            width > 0, height > 0,
            width <= 65_535, height <= 65_535,
            !rgb.isEmpty,
            rgb.count == width * height * 3
        else { return nil }

        var rng = OkmainRng(seed: randomSeed)
        let sample = OkmainSampler.sample(width: width, height: height, rgb: rgb)
        let result = OkmainKMeans.findCentroids(rng: &rng, sample: sample)

        var weightedCounts = [Float](repeating: 0, count: result.centroids.count)
        for (i, assignment) in result.assignments.enumerated() {
            let x = i % sample.width
            let y = i / sample.width
            let maskValue = distanceMask(
                saturatedThreshold: config.maskSaturatedThreshold,
                width: sample.width, height: sample.height,
                x: x, y: y,
            )
            let w = 1 - config.maskWeight * (1 - maskValue)
            weightedCounts[assignment] += w
        }

        var total: Float = 0
        for wc in weightedCounts { total += wc }
        if total > 0 {
            for i in 0..<weightedCounts.count {
                weightedCounts[i] /= total
            }
        }

        var scores = [Float]()
        scores.reserveCapacity(result.centroids.count)
        for (i, oklab) in result.centroids.enumerated() {
            let countsScore = weightedCounts[i] * config.maskWeightedCountsWeight
            let chroma = (oklab.b * oklab.b).addingProduct(oklab.a, oklab.a).squareRoot()
                / maxSrgbOklabChroma
            scores.append(countsScore + chroma * config.chromaWeight)
        }

        let order = scores.indices.sorted { i, j in
            scores[i] == scores[j] ? i < j : scores[i] > scores[j]
        }

        return order.map { i in
            let rgb = OkmainColorSpace.oklabToSrgb(result.centroids[i])
            return OkmainColor(red: rgb.r, green: rgb.g, blue: rgb.b)
        }
    }

    static func distanceMask(
        saturatedThreshold: Float,
        width: Int,
        height: Int,
        x: Int,
        y: Int,
    ) -> Float {
        let widthF = Float(width)
        let heightF = Float(height)
        var xF = Float(x)
        var yF = Float(y)

        let middleX = widthF / 2
        if xF > middleX { xF = widthF - xF }
        let middleY = heightF / 2
        if yF > middleY { yF = heightF - yF }

        let xThreshold = widthF * saturatedThreshold
        let yThreshold = heightF * saturatedThreshold

        let xContribution = min(0.1 + 0.9 * (xF / xThreshold), 1)
        let yContribution = min(0.1 + 0.9 * (yF / yThreshold), 1)

        return min(xContribution, yContribution)
    }
}
