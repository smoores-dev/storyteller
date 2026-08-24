// Port of okmain 0.2.0 src/sample.rs: block-averaged downsampling into an
// Oklab structure-of-arrays.

struct OkmainSampledOklab {
    var width: Int
    var height: Int
    var l: [Float] = []
    var a: [Float] = []
    var b: [Float] = []

    var count: Int { l.count }
}

enum OkmainSampler {
    static let maxSampleSize = 250_000

    static func blockSize(width: Int, height: Int) -> Int {
        let total = width * height
        if total <= maxSampleSize { return 1 }
        let n = Int((Double(total) / Double(maxSampleSize)).squareRoot().rounded(.up))
        return (n + 3) & ~3
    }

    static func sample(width: Int, height: Int, rgb: [UInt8]) -> OkmainSampledOklab {
        let n = blockSize(width: width, height: height)
        let blocksX = (width + n - 1) / n
        let blocksY = (height + n - 1) / n

        var result = OkmainSampledOklab(width: blocksX, height: blocksY)
        result.l.reserveCapacity(blocksX * blocksY)
        result.a.reserveCapacity(blocksX * blocksY)
        result.b.reserveCapacity(blocksX * blocksY)

        var accR = [Float](repeating: 0, count: blocksX)
        var accG = [Float](repeating: 0, count: blocksX)
        var accB = [Float](repeating: 0, count: blocksX)
        var accCount = [UInt32](repeating: 0, count: blocksX)

        for by in 0..<blocksY {
            let yStart = by * n
            let yEnd = min(yStart + n, height)

            for y in yStart..<yEnd {
                let rowOffset = y * width * 3
                for bx in 0..<blocksX {
                    let xStart = bx * n
                    let xEnd = min(xStart + n, width)
                    for x in xStart..<xEnd {
                        let offset = rowOffset + x * 3
                        accR[bx] += OkmainColorSpace.srgb8ToFloat(rgb[offset])
                        accG[bx] += OkmainColorSpace.srgb8ToFloat(rgb[offset + 1])
                        accB[bx] += OkmainColorSpace.srgb8ToFloat(rgb[offset + 2])
                        accCount[bx] += 1
                    }
                }
            }

            for bx in 0..<blocksX {
                let count = Float(accCount[bx])
                let oklab = OkmainColorSpace.linearSrgbToOklab(
                    r: accR[bx] / count,
                    g: accG[bx] / count,
                    b: accB[bx] / count,
                )
                result.l.append(oklab.l)
                result.a.append(oklab.a)
                result.b.append(oklab.b)

                accR[bx] = 0
                accG[bx] = 0
                accB[bx] = 0
                accCount[bx] = 0
            }
        }

        return result
    }
}
