import Foundation

#if canImport(CoreGraphics)
import CoreGraphics
#endif
#if canImport(CoreText)
import CoreText
#endif

public struct CoreTextFontTraitsProbe: FontMetadataProbing {
    public init() {}

    public func traits(ofFontAt url: URL) -> FontFileTraits? {
        #if canImport(CoreText)
        guard let fontDataProvider = CGDataProvider(url: url as CFURL),
            let cgFont = CGFont(fontDataProvider)
        else {
            return nil
        }

        let ctFont = CTFontCreateWithGraphicsFont(cgFont, 12, nil, nil)

        let familyName = CTFontCopyFamilyName(ctFont) as String?

        let traits = CTFontGetSymbolicTraits(ctFont)
        let isItalic = traits.contains(.traitItalic)

        let allTraits = CTFontCopyTraits(ctFont) as Dictionary
        let weightValue = (allTraits[kCTFontWeightTrait] as? CGFloat) ?? 0.0
        let weight = Self.cssWeightFromTrait(weightValue)

        return FontFileTraits(familyName: familyName, weight: weight, isItalic: isItalic)
        #else
        return nil
        #endif
    }

    #if canImport(CoreText)
    private static func cssWeightFromTrait(_ trait: CGFloat) -> Int {
        // CoreText weight trait ranges from -1.0 to 1.0
        // Map to CSS weights 100-900
        switch trait {
            case ..<(-0.7): return 100
            case -0.7..<(-0.4): return 200
            case -0.4..<(-0.2): return 300
            case -0.2..<0.1: return 400
            case 0.1..<0.25: return 500
            case 0.25..<0.4: return 600
            case 0.4..<0.6: return 700
            case 0.6..<0.8: return 800
            default: return 900
        }
    }
    #endif
}
