// Port of okmain 0.2.0 src/kmeans/{plus_plus_init,lloyds,adaptive}.rs:
// greedy k-means++ init, Lloyd's loop, and the adaptive re-run that lowers k
// while centroids land too close together.

enum OkmainKMeans {
    static let maxCentroids = 4
    static let adaptiveMinCentroidDistanceSquared: Float = 0.005
    static let lloydsMaxIterations = 300
    static let lloydsConvergenceTolerance: Float = 1e-3
    static let greedyInitCandidates = 3

    struct AdaptiveResult {
        var centroids: [OkmainOklab]
        var assignments: [Int]
    }

    static func squaredDistance(
        _ cl: Float, _ ca: Float, _ cb: Float,
        _ l: Float, _ a: Float, _ b: Float,
    ) -> Float {
        let dl = cl - l
        let da = ca - a
        let db = cb - b
        return (db * db).addingProduct(da, da).addingProduct(dl, dl)
    }

    static func findCentroids(
        rng: inout OkmainRng,
        sample: OkmainSampledOklab,
    ) -> AdaptiveResult {
        var k = maxCentroids
        while true {
            let result = lloydsFindCentroids(rng: &rng, sample: sample, k: k)
            if countSimilarClusters(result.centroids) == 0 || k <= 1 {
                return AdaptiveResult(
                    centroids: result.centroids,
                    assignments: result.assignments,
                )
            }
            k -= 1
        }
    }

    private static func countSimilarClusters(_ centroids: [OkmainOklab]) -> Int {
        var count = 0
        for i in 0..<centroids.count {
            for j in (i + 1)..<centroids.count
            where squaredDistanceOklab(centroids[i], centroids[j])
                < adaptiveMinCentroidDistanceSquared {
                count += 1
            }
        }
        return count
    }

    private static func squaredDistanceOklab(_ x: OkmainOklab, _ y: OkmainOklab) -> Float {
        let dl = x.l - y.l
        let da = x.a - y.a
        let db = x.b - y.b
        return (db * db).addingProduct(da, da).addingProduct(dl, dl)
    }

    struct LloydsResult {
        var centroids: [OkmainOklab]
        var assignments: [Int]
    }

    private static func lloydsFindCentroids(
        rng: inout OkmainRng,
        sample: OkmainSampledOklab,
        k: Int,
    ) -> LloydsResult {
        let n = sample.count
        let k = min(k, n)

        let initPoints = findInitial(rng: &rng, sample: sample, k: k)

        var cl = [Float](repeating: .greatestFiniteMagnitude, count: maxCentroids)
        var ca = [Float](repeating: .greatestFiniteMagnitude, count: maxCentroids)
        var cb = [Float](repeating: .greatestFiniteMagnitude, count: maxCentroids)
        for (j, index) in initPoints.enumerated() {
            cl[j] = sample.l[index]
            ca[j] = sample.a[index]
            cb[j] = sample.b[index]
        }

        var assignments = [UInt8](repeating: 0, count: n)
        lloydsLoop(
            rng: &rng, sample: sample, k: k,
            assignments: &assignments, cl: &cl, ca: &ca, cb: &cb,
        )

        var centroids = [OkmainOklab]()
        centroids.reserveCapacity(k)
        for j in 0..<k {
            centroids.append(OkmainOklab(l: cl[j], a: ca[j], b: cb[j]))
        }
        return LloydsResult(
            centroids: centroids,
            assignments: assignments.map(Int.init),
        )
    }

    private static func lloydsLoop(
        rng: inout OkmainRng,
        sample: OkmainSampledOklab,
        k: Int,
        assignments: inout [UInt8],
        cl: inout [Float], ca: inout [Float], cb: inout [Float],
    ) {
        for _ in 0..<lloydsMaxIterations {
            assignPoints(sample: sample, cl: cl, ca: ca, cb: cb, assignments: &assignments)
            let (shiftSquared, counts) = updateCentroids(
                sample: sample, assignments: assignments, cl: &cl, ca: &ca, cb: &cb,
            )

            for i in 0..<k where counts[i] == 0 {
                let randomPoint = rng.nextInt(upperBound: sample.count)
                cl[i] = sample.l[randomPoint]
                ca[i] = sample.a[randomPoint]
                cb[i] = sample.b[randomPoint]
            }

            if shiftSquared < lloydsConvergenceTolerance { return }
        }
    }

    private static func assignPoints(
        sample: OkmainSampledOklab,
        cl: [Float], ca: [Float], cb: [Float],
        assignments: inout [UInt8],
    ) {
        for i in 0..<assignments.count {
            var minDistance = Float.greatestFiniteMagnitude
            var minIndex = 0
            for j in 0..<maxCentroids {
                let d = squaredDistance(
                    cl[j], ca[j], cb[j],
                    sample.l[i], sample.a[i], sample.b[i],
                )
                if d < minDistance {
                    minDistance = d
                    minIndex = j
                }
            }
            assignments[i] = UInt8(minIndex)
        }
    }

    private static func updateCentroids(
        sample: OkmainSampledOklab,
        assignments: [UInt8],
        cl: inout [Float], ca: inout [Float], cb: inout [Float],
    ) -> (shiftSquared: Float, counts: [UInt32]) {
        var countsF = [Float](repeating: 0, count: maxCentroids)
        var sumsL = [Float](repeating: 0, count: maxCentroids)
        var sumsA = [Float](repeating: 0, count: maxCentroids)
        var sumsB = [Float](repeating: 0, count: maxCentroids)

        for (i, assigned) in assignments.enumerated() {
            let l = sample.l[i]
            let a = sample.a[i]
            let b = sample.b[i]
            for k in 0..<maxCentroids {
                let mask: Float = assigned == UInt8(k) ? 1 : 0
                countsF[k] += mask
                sumsL[k] = sumsL[k].addingProduct(mask, l)
                sumsA[k] = sumsA[k].addingProduct(mask, a)
                sumsB[k] = sumsB[k].addingProduct(mask, b)
            }
        }

        var counts = [UInt32](repeating: 0, count: maxCentroids)
        for i in 0..<maxCentroids {
            counts[i] = UInt32(countsF[i])
        }

        var shiftSquared: Float = 0
        for i in 0..<maxCentroids where counts[i] != 0 {
            let newL = sumsL[i] / countsF[i]
            let newA = sumsA[i] / countsF[i]
            let newB = sumsB[i] / countsF[i]

            let dl = cl[i] - newL
            let da = ca[i] - newA
            let db = cb[i] - newB

            cl[i] = newL
            ca[i] = newA
            cb[i] = newB

            shiftSquared += (db * db).addingProduct(da, da).addingProduct(dl, dl)
        }

        return (shiftSquared, counts)
    }

    private static func findInitial(
        rng: inout OkmainRng,
        sample: OkmainSampledOklab,
        k: Int,
    ) -> [Int] {
        let n = sample.count
        let k = min(k, n)
        let l = sample.l
        let a = sample.a
        let b = sample.b

        var initPoints = [Int]()
        initPoints.reserveCapacity(k)
        let c0 = rng.nextInt(upperBound: n)
        initPoints.append(c0)

        let c0l = l[c0]
        let c0a = a[c0]
        let c0b = b[c0]
        var minDistances = [Float](repeating: 0, count: n)
        var minDistancesSum: Float = 0
        for i in 0..<n {
            let d = squaredDistance(l[i], a[i], b[i], c0l, c0a, c0b)
            minDistances[i] = d
            minDistancesSum += d
        }

        var candidateMinDistances = [[Float]](
            repeating: [Float](repeating: 0, count: n),
            count: greedyInitCandidates,
        )

        for _ in 1..<k {
            var candidates = [Int](repeating: 0, count: greedyInitCandidates)
            for j in 0..<greedyInitCandidates {
                candidates[j] = sampleByDistance(
                    rng: &rng, minDistances: minDistances, sum: minDistancesSum,
                )
            }

            let candidatesL = candidates.map { l[$0] }
            let candidatesA = candidates.map { a[$0] }
            let candidatesB = candidates.map { b[$0] }

            var potentials = [Float](repeating: 0, count: greedyInitCandidates)

            for i in 0..<n {
                let li = l[i]
                let ai = a[i]
                let bi = b[i]
                let currentMin = minDistances[i]
                for j in 0..<greedyInitCandidates {
                    let d = min(
                        squaredDistance(candidatesL[j], candidatesA[j], candidatesB[j], li, ai, bi),
                        currentMin,
                    )
                    candidateMinDistances[j][i] = d
                    potentials[j] += d
                }
            }

            var bestPotential = Float.infinity
            var best = 0
            for (j, potential) in potentials.enumerated() where potential < bestPotential {
                bestPotential = potential
                best = j
            }

            swap(&minDistances, &candidateMinDistances[best])
            minDistancesSum = bestPotential
            initPoints.append(candidates[best])
        }

        return initPoints
    }

    private static func sampleByDistance(
        rng: inout OkmainRng,
        minDistances: [Float],
        sum: Float,
    ) -> Int {
        let randomThreshold = rng.nextFloat() * sum
        var cumsum: Float = 0
        for (i, distance) in minDistances.enumerated() {
            cumsum += distance
            if cumsum > randomThreshold { return i }
        }
        return minDistances.count - 1
    }
}
