// Port of rand_xoshiro 0.8 Xoshiro256PlusPlus seeded via SplitMix64, plus the
// rand 0.10 sampling adapters okmain relies on (f32 in [0,1), Canon's method
// for integer ranges). Bit-exact with the Rust crates.

struct OkmainSplitMix64 {
    private var x: UInt64

    init(seed: UInt64) {
        x = seed
    }

    mutating func nextUInt64() -> UInt64 {
        x = x &+ 0x9E37_79B9_7F4A_7C15
        var z = x
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

struct OkmainRng {
    private var s0: UInt64
    private var s1: UInt64
    private var s2: UInt64
    private var s3: UInt64

    init(seed: UInt64) {
        var mix = OkmainSplitMix64(seed: seed)
        s0 = mix.nextUInt64()
        s1 = mix.nextUInt64()
        s2 = mix.nextUInt64()
        s3 = mix.nextUInt64()
    }

    mutating func nextUInt64() -> UInt64 {
        let result = rotl(s0 &+ s3, 23) &+ s0
        let t = s1 << 17
        s2 ^= s0
        s3 ^= s1
        s1 ^= s2
        s0 ^= s3
        s2 ^= t
        s3 = rotl(s3, 45)
        return result
    }

    mutating func nextUInt32() -> UInt32 {
        UInt32(truncatingIfNeeded: nextUInt64() >> 32)
    }

    mutating func nextFloat() -> Float {
        Float(nextUInt32() >> 8) * (1.0 / 16_777_216.0)
    }

    /// rand 0.10 `random_range(0..upperBound)` for usize when the bound fits in
    /// u32: Canon's method, biased variant.
    mutating func nextInt(upperBound: Int) -> Int {
        precondition(upperBound > 0 && upperBound <= UInt32.max)
        let range = UInt32(upperBound)
        var (result, loOrder) = widening(nextUInt32(), range)
        if loOrder > (0 &- range) {
            let (newHiOrder, _) = widening(nextUInt32(), range)
            let overflow = loOrder.addingReportingOverflow(newHiOrder).overflow
            if overflow { result &+= 1 }
        }
        return Int(result)
    }

    private func widening(_ a: UInt32, _ b: UInt32) -> (high: UInt32, low: UInt32) {
        let product = UInt64(a) &* UInt64(b)
        return (UInt32(truncatingIfNeeded: product >> 32), UInt32(truncatingIfNeeded: product))
    }

    private func rotl(_ value: UInt64, _ amount: UInt64) -> UInt64 {
        (value << amount) | (value >> (64 - amount))
    }
}
