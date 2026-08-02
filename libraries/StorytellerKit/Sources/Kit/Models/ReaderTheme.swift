import Foundation

public enum ThemeAppearance: String, Codable, Sendable, CaseIterable {
    case light
    case dark
    case any
}

public struct ReaderTheme: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public var name: String
    public let isBuiltIn: Bool
    public var appearance: ThemeAppearance
    public var backgroundColor: String
    public var foregroundColor: String
    public var highlightColor: String
    public var highlightThickness: Double
    public var readaloudHighlightMode: String
    public var userHighlightColor1: String
    public var userHighlightColor2: String
    public var userHighlightColor3: String
    public var userHighlightColor4: String
    public var userHighlightColor5: String
    public var userHighlightColor6: String
    public var userHighlightLabel1: String
    public var userHighlightLabel2: String
    public var userHighlightLabel3: String
    public var userHighlightLabel4: String
    public var userHighlightLabel5: String
    public var userHighlightLabel6: String
    public var userHighlightMode: String
    public var customCSS: String?

    public init(
        id: String = UUID().uuidString,
        name: String,
        isBuiltIn: Bool = false,
        appearance: ThemeAppearance = .any,
        backgroundColor: String,
        foregroundColor: String,
        highlightColor: String,
        highlightThickness: Double = kDefaultHighlightThickness,
        readaloudHighlightMode: String = kDefaultReadaloudHighlightMode,
        userHighlightColor1: String = kDefaultUserHighlightColor1,
        userHighlightColor2: String = kDefaultUserHighlightColor2,
        userHighlightColor3: String = kDefaultUserHighlightColor3,
        userHighlightColor4: String = kDefaultUserHighlightColor4,
        userHighlightColor5: String = kDefaultUserHighlightColor5,
        userHighlightColor6: String = kDefaultUserHighlightColor6,
        userHighlightLabel1: String = kDefaultUserHighlightLabel1,
        userHighlightLabel2: String = kDefaultUserHighlightLabel2,
        userHighlightLabel3: String = kDefaultUserHighlightLabel3,
        userHighlightLabel4: String = kDefaultUserHighlightLabel4,
        userHighlightLabel5: String = kDefaultUserHighlightLabel5,
        userHighlightLabel6: String = kDefaultUserHighlightLabel6,
        userHighlightMode: String = kDefaultUserHighlightMode,
        customCSS: String? = nil,
    ) {
        self.id = id
        self.name = name
        self.isBuiltIn = isBuiltIn
        self.appearance = appearance
        self.backgroundColor = backgroundColor
        self.foregroundColor = foregroundColor
        self.highlightColor = highlightColor
        self.highlightThickness = highlightThickness
        self.readaloudHighlightMode = readaloudHighlightMode
        self.userHighlightColor1 = userHighlightColor1
        self.userHighlightColor2 = userHighlightColor2
        self.userHighlightColor3 = userHighlightColor3
        self.userHighlightColor4 = userHighlightColor4
        self.userHighlightColor5 = userHighlightColor5
        self.userHighlightColor6 = userHighlightColor6
        self.userHighlightLabel1 = userHighlightLabel1
        self.userHighlightLabel2 = userHighlightLabel2
        self.userHighlightLabel3 = userHighlightLabel3
        self.userHighlightLabel4 = userHighlightLabel4
        self.userHighlightLabel5 = userHighlightLabel5
        self.userHighlightLabel6 = userHighlightLabel6
        self.userHighlightMode = userHighlightMode
        self.customCSS = customCSS
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        isBuiltIn = try container.decode(Bool.self, forKey: .isBuiltIn)
        appearance = (try? container.decode(ThemeAppearance.self, forKey: .appearance)) ?? .any
        backgroundColor = try container.decode(String.self, forKey: .backgroundColor)
        foregroundColor = try container.decode(String.self, forKey: .foregroundColor)
        highlightColor = try container.decode(String.self, forKey: .highlightColor)
        highlightThickness = try container.decode(Double.self, forKey: .highlightThickness)
        readaloudHighlightMode = try container.decode(String.self, forKey: .readaloudHighlightMode)
        userHighlightColor1 = try container.decode(String.self, forKey: .userHighlightColor1)
        userHighlightColor2 = try container.decode(String.self, forKey: .userHighlightColor2)
        userHighlightColor3 = try container.decode(String.self, forKey: .userHighlightColor3)
        userHighlightColor4 = try container.decode(String.self, forKey: .userHighlightColor4)
        userHighlightColor5 = try container.decode(String.self, forKey: .userHighlightColor5)
        userHighlightColor6 = try container.decode(String.self, forKey: .userHighlightColor6)
        userHighlightLabel1 =
            (try? container.decode(String.self, forKey: .userHighlightLabel1))
            ?? kDefaultUserHighlightLabel1
        userHighlightLabel2 =
            (try? container.decode(String.self, forKey: .userHighlightLabel2))
            ?? kDefaultUserHighlightLabel2
        userHighlightLabel3 =
            (try? container.decode(String.self, forKey: .userHighlightLabel3))
            ?? kDefaultUserHighlightLabel3
        userHighlightLabel4 =
            (try? container.decode(String.self, forKey: .userHighlightLabel4))
            ?? kDefaultUserHighlightLabel4
        userHighlightLabel5 =
            (try? container.decode(String.self, forKey: .userHighlightLabel5))
            ?? kDefaultUserHighlightLabel5
        userHighlightLabel6 =
            (try? container.decode(String.self, forKey: .userHighlightLabel6))
            ?? kDefaultUserHighlightLabel6
        userHighlightMode = try container.decode(String.self, forKey: .userHighlightMode)
        customCSS = try? container.decode(String.self, forKey: .customCSS)
    }

    public func availableFor(colorScheme: String) -> Bool {
        switch appearance {
            case .any: return true
            case .light: return colorScheme == "light"
            case .dark: return colorScheme == "dark"
        }
    }
}

extension ReaderTheme {
    public static let builtInLight = ReaderTheme(
        id: "builtin-light",
        name: "Light",
        isBuiltIn: true,
        appearance: .light,
        backgroundColor: kDefaultBackgroundColorLight,
        foregroundColor: kDefaultForegroundColorLight,
        highlightColor: "#254DF4",
        readaloudHighlightMode: "text",
    )

    public static let builtInDark = ReaderTheme(
        id: "builtin-dark",
        name: "Dark",
        isBuiltIn: true,
        appearance: .dark,
        backgroundColor: kDefaultBackgroundColorDark,
        foregroundColor: kDefaultForegroundColorDark,
        highlightColor: "#65A8EE",
        readaloudHighlightMode: "text",
        userHighlightColor1: kDefaultUserHighlightColorsDark[0],
        userHighlightColor2: kDefaultUserHighlightColorsDark[1],
        userHighlightColor3: kDefaultUserHighlightColorsDark[2],
        userHighlightColor4: kDefaultUserHighlightColorsDark[3],
        userHighlightColor5: kDefaultUserHighlightColorsDark[4],
        userHighlightColor6: kDefaultUserHighlightColorsDark[5],
    )

    public static let allBuiltIn: [ReaderTheme] = [
        .builtInLight,
        .builtInDark,
    ]

    public static func effectiveBuiltIn(overrides: [ReaderTheme]) -> [ReaderTheme] {
        allBuiltIn.map { stock in
            guard var override = overrides.first(where: { $0.id == stock.id }) else {
                return stock
            }
            override.name = stock.name
            override.appearance = stock.appearance
            return override
        }
    }

    public static func resolve(
        id: String,
        customThemes: [ReaderTheme],
        builtInOverrides: [ReaderTheme] = [],
    ) -> ReaderTheme? {
        let builtIns = effectiveBuiltIn(overrides: builtInOverrides)
        if let builtIn = builtIns.first(where: { $0.id == id }) {
            return builtIn
        }
        // Migrate old built-in IDs
        if id.hasPrefix("builtin-light") {
            return builtIns.first { $0.id == builtInLight.id }
        }
        if id.hasPrefix("builtin-dark") {
            return builtIns.first { $0.id == builtInDark.id }
        }
        return customThemes.first(where: { $0.id == id })
    }

    public static func migrateThemeId(_ id: String) -> String {
        if id.hasPrefix("builtin-light") { return builtInLight.id }
        if id.hasPrefix("builtin-dark") { return builtInDark.id }
        return id
    }

    public static func themesForLightMode(
        customThemes: [ReaderTheme],
        builtInOverrides: [ReaderTheme] = [],
    ) -> [ReaderTheme] {
        effectiveBuiltIn(overrides: builtInOverrides).filter {
            $0.availableFor(colorScheme: "light")
        }
            + customThemes.filter { $0.availableFor(colorScheme: "light") }
    }

    public static func themesForDarkMode(
        customThemes: [ReaderTheme],
        builtInOverrides: [ReaderTheme] = [],
    ) -> [ReaderTheme] {
        effectiveBuiltIn(overrides: builtInOverrides).filter {
            $0.availableFor(colorScheme: "dark")
        }
            + customThemes.filter { $0.availableFor(colorScheme: "dark") }
    }
}

extension ReaderTheme: Hashable {
    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}
