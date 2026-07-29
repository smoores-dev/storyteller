import Foundation

public struct CustomFontVariant: Sendable, Equatable, Identifiable {
    public let id: String
    public let weight: Int
    public let isItalic: Bool
    public let fileName: String
    public let fileURL: URL

    public init(weight: Int, isItalic: Bool, fileName: String, fileURL: URL) {
        self.id = fileName
        self.weight = weight
        self.isItalic = isItalic
        self.fileName = fileName
        self.fileURL = fileURL
    }

    public var styleDescription: String {
        let weightName = Self.weightName(weight)
        if isItalic {
            return weight == 400 ? "Italic" : "\(weightName) Italic"
        }
        return weightName
    }

    private static func weightName(_ weight: Int) -> String {
        switch weight {
            case ..<150: return "Thin"
            case 150..<250: return "Extra Light"
            case 250..<350: return "Light"
            case 350..<450: return "Regular"
            case 450..<550: return "Medium"
            case 550..<650: return "Semi Bold"
            case 650..<750: return "Bold"
            case 750..<850: return "Extra Bold"
            default: return "Black"
        }
    }
}

public struct CustomFontFamily: Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public var variants: [CustomFontVariant]

    public init(name: String, variants: [CustomFontVariant]) {
        self.id = name
        self.name = name
        self.variants = variants
    }
}

@globalActor
public actor CustomFontsActor {
    public static let shared = CustomFontsActor()

    private let fileManager: FileManager
    private let fontsDirectory: URL

    private var cachedFamilies: [CustomFontFamily] = []
    private var cachedFontFaceCSS: String = ""
    private var observers: [UUID: @Sendable @StorytellerUIActor () -> Void] = [:]

    public init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        self.fontsDirectory = Self.defaultFontsDirectory(fileManager: fileManager)

        do {
            try Self.ensureFontsDirectory(fontsDirectory, using: fileManager)
        } catch {
            debugLog("[CustomFontsActor] Failed to create fonts directory: \(error)")
        }
    }

    public var availableFamilies: [CustomFontFamily] {
        cachedFamilies
    }

    public var fontFaceCSS: String {
        cachedFontFaceCSS
    }

    @discardableResult
    public func addObserver(_ callback: @Sendable @StorytellerUIActor @escaping () -> Void) -> UUID {
        let id = UUID()
        observers[id] = callback
        return id
    }

    public func refreshFonts() async {
        cachedFamilies = scanForFontFamilies()
        cachedFontFaceCSS = generateFontFaceCSS()

        let observersList = Array(observers.values)
        Task { @StorytellerUIActor in
            for observer in observersList {
                observer()
            }
        }
    }

    public func importFont(from sourceURL: URL) async throws {
        let fileName = sourceURL.lastPathComponent
        let destinationURL = fontsDirectory.appendingPathComponent(fileName)

        #if !canImport(Darwin)
        let accessing = false
        #else
        let accessing = sourceURL.startAccessingSecurityScopedResource()
        #endif
        defer {
            if accessing {
                #if canImport(Darwin)
                sourceURL.stopAccessingSecurityScopedResource()
                #endif
            }
        }

        if fileManager.fileExists(atPath: destinationURL.path) {
            try fileManager.removeItem(at: destinationURL)
        }

        try fileManager.copyItem(at: sourceURL, to: destinationURL)
        await refreshFonts()
    }

    public func deleteVariant(_ variant: CustomFontVariant) async throws {
        if fileManager.fileExists(atPath: variant.fileURL.path) {
            try fileManager.removeItem(at: variant.fileURL)
        }
        await refreshFonts()
    }

    public func deleteFamily(_ family: CustomFontFamily) async throws {
        for variant in family.variants {
            if fileManager.fileExists(atPath: variant.fileURL.path) {
                try fileManager.removeItem(at: variant.fileURL)
            }
        }
        await refreshFonts()
    }

    private func scanForFontFamilies() -> [CustomFontFamily] {
        let fontExtensions = ["ttf", "otf", "woff", "woff2"]

        guard
            let contents = try? fileManager.contentsOfDirectory(
                at: fontsDirectory,
                includingPropertiesForKeys: [.isRegularFileKey],
                options: [.skipsHiddenFiles],
            )
        else {
            return []
        }

        var familyMap: [String: [CustomFontVariant]] = [:]

        for url in contents {
            let ext = url.pathExtension.lowercased()
            guard fontExtensions.contains(ext) else { continue }

            let fileName = url.lastPathComponent
            let metadata = fontMetadataFromFile(url)

            let familyName = metadata.familyName ?? url.deletingPathExtension().lastPathComponent
            let weight = metadata.weight
            let isItalic = metadata.isItalic

            let variant = CustomFontVariant(
                weight: weight,
                isItalic: isItalic,
                fileName: fileName,
                fileURL: url,
            )

            familyMap[familyName, default: []].append(variant)
        }

        return familyMap.map { name, variants in
            let sortedVariants = variants.sorted { lhs, rhs in
                if lhs.weight != rhs.weight {
                    return lhs.weight < rhs.weight
                }
                return !lhs.isItalic && rhs.isItalic
            }
            return CustomFontFamily(name: name, variants: sortedVariants)
        }.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func fontMetadataFromFile(_ url: URL) -> FontFileTraits {
        StorytellerPlatform.fontMetadata?.traits(ofFontAt: url)
            ?? FontFileTraits(familyName: nil, weight: 400, isItalic: false)
    }

    private func generateFontFaceCSS() -> String {
        var css = ""

        for family in cachedFamilies {
            for variant in family.variants {
                guard let fontData = try? Data(contentsOf: variant.fileURL) else {
                    continue
                }

                let base64 = fontData.base64EncodedString()
                let mimeType = mimeTypeForFont(variant.fileURL.pathExtension)
                let fontStyle = variant.isItalic ? "italic" : "normal"

                css += """
                    @font-face {
                        font-family: '\(family.name)';
                        src: url('data:\(mimeType);base64,\(base64)') \
                    format('\(formatForExtension(variant.fileURL.pathExtension))');
                        font-weight: \(variant.weight);
                        font-style: \(fontStyle);
                    }

                    """
            }
        }

        return css
    }

    private func mimeTypeForFont(_ ext: String) -> String {
        switch ext.lowercased() {
            case "ttf": return "font/ttf"
            case "otf": return "font/otf"
            case "woff": return "font/woff"
            case "woff2": return "font/woff2"
            default: return "font/ttf"
        }
    }

    private func formatForExtension(_ ext: String) -> String {
        switch ext.lowercased() {
            case "ttf": return "truetype"
            case "otf": return "opentype"
            case "woff": return "woff"
            case "woff2": return "woff2"
            default: return "truetype"
        }
    }

    private static func defaultFontsDirectory(fileManager: FileManager) -> URL {
        StorytellerPlatform.customFontsDirectory(fileManager: fileManager)
    }

    private static func ensureFontsDirectory(_ directory: URL, using fileManager: FileManager)
        throws
    {
        if !fileManager.fileExists(atPath: directory.path) {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        }
    }
}
