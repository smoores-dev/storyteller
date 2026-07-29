import Foundation

public struct ServerUserPreferences: Codable, Sendable, Hashable {
    public enum ViewKind: String, Codable, Sendable, CaseIterable {
        case grid, list, table
    }

    public enum ColorMode: String, Codable, Sendable, CaseIterable {
        case full, medium, minimal

        public init?(serverValue: String) {
            switch serverValue {
                case "colorful":
                    self = .full
                case "subdued":
                    self = .minimal
                default:
                    guard let mode = ColorMode(rawValue: serverValue) else { return nil }
                    self = mode
            }
        }
    }

    public enum GridCoverDisplay: String, Codable, Sendable, CaseIterable {
        case auto, ebook, audiobook
    }

    public enum GridCardSize: String, Codable, Sendable, CaseIterable {
        case smallest, small, medium, large, largest
    }

    public enum DoubleCoverAlignment: String, Codable, Sendable, CaseIterable {
        case auto, straight
    }

    public enum BookDetailDisplay: String, Codable, Sendable, CaseIterable {
        case threeD = "3d"
        case cover
    }

    public enum RatingIcon: String, Codable, Sendable, CaseIterable {
        case star, heart
    }

    public enum BookOpenTarget: String, Codable, Sendable, CaseIterable {
        case panel, page
    }

    public static let neutralColorStrength = 0.65

    public var locale: String?
    public var defaultView: ViewKind?
    public var colorMode: ColorMode?
    public var colorIntensity: Double?
    public var gridCoverDisplay: GridCoverDisplay?
    public var gridCardSize: GridCardSize?
    public var doubleCoverAlignment: DoubleCoverAlignment?
    public var bookDetailDisplay: BookDetailDisplay?
    public var bookDetail3dView: Int?
    public var bookDetail3dViewAudio: Int?
    public var ratingIcon: RatingIcon?
    public var bookOpenTarget: BookOpenTarget?
    public var accentColor: String?
    public var ratingDimensions: [RatingDimension]?
    public var defaultStatusUuid: String?
    public var layoutAnimations: Bool?
    public var animatePanelOpen: Bool?

    public init() {}

    private enum CodingKeys: String, CodingKey {
        case locale
        case defaultView
        case colorMode
        case colorIntensity
        case gridCoverDisplay
        case gridCardSize
        case doubleCoverAlignment
        case bookDetailDisplay
        case bookDetail3dView
        case bookDetail3dViewAudio
        case ratingIcon
        case bookOpenTarget
        case accentColor
        case ratingDimensions
        case defaultStatusUuid
        case layoutAnimations
        case animatePanelOpen
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        locale = container.decodeLenient(String.self, forKey: .locale)
        defaultView = container.decodeLenientRaw(ViewKind.self, forKey: .defaultView)
        if let raw = container.decodeLenient(String.self, forKey: .colorMode) {
            colorMode = ColorMode(serverValue: raw)
        }
        colorIntensity = container.decodeLenient(Double.self, forKey: .colorIntensity)
        gridCoverDisplay = container.decodeLenientRaw(
            GridCoverDisplay.self,
            forKey: .gridCoverDisplay,
        )
        gridCardSize = container.decodeLenientRaw(GridCardSize.self, forKey: .gridCardSize)
        doubleCoverAlignment = container.decodeLenientRaw(
            DoubleCoverAlignment.self,
            forKey: .doubleCoverAlignment,
        )
        bookDetailDisplay = container.decodeLenientRaw(
            BookDetailDisplay.self,
            forKey: .bookDetailDisplay,
        )
        bookDetail3dView = container.decodeLenient(Int.self, forKey: .bookDetail3dView)
        bookDetail3dViewAudio = container.decodeLenient(Int.self, forKey: .bookDetail3dViewAudio)
        ratingIcon = container.decodeLenientRaw(RatingIcon.self, forKey: .ratingIcon)
        bookOpenTarget = container.decodeLenientRaw(BookOpenTarget.self, forKey: .bookOpenTarget)
        accentColor = container.decodeLenient(String.self, forKey: .accentColor)
        ratingDimensions = container.decodeLenient([RatingDimension].self, forKey: .ratingDimensions)
        defaultStatusUuid = container.decodeLenient(String.self, forKey: .defaultStatusUuid)
        layoutAnimations = container.decodeLenient(Bool.self, forKey: .layoutAnimations)
        animatePanelOpen = container.decodeLenient(Bool.self, forKey: .animatePanelOpen)
    }
}

extension KeyedDecodingContainer {
    fileprivate func decodeLenientRaw<T: RawRepresentable>(
        _ type: T.Type,
        forKey key: Key,
    ) -> T? where T.RawValue == String {
        guard let raw = decodeLenient(String.self, forKey: key) else { return nil }
        return T(rawValue: raw)
    }
}

public enum ServerUserPreferenceKey: String, Sendable, CaseIterable {
    case locale
    case defaultView
    case colorMode
    case colorIntensity
    case gridCoverDisplay
    case gridCardSize
    case doubleCoverAlignment
    case bookDetailDisplay
    case bookDetail3dView
    case bookDetail3dViewAudio
    case ratingIcon
    case bookOpenTarget
    case accentColor
    case ratingDimensions
    case defaultStatusUuid
    case layoutAnimations
    case animatePanelOpen
}
