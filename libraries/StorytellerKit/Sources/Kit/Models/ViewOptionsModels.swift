import Foundation

extension Comparable {
    public func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}

public enum LibraryLayoutStyle: String, CaseIterable, Identifiable, Sendable {
    case grid
    case compactGrid
    case table
    case fan

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .grid: "Grid"
            case .compactGrid: "Compact Grid"
            case .table: "Table"
            case .fan: "Fan"
        }
    }

    public var iconName: String {
        switch self {
            case .grid: "square.grid.2x2"
            case .compactGrid: "square.grid.3x3"
            case .table: "list.bullet"
            case .fan: "rectangle.stack"
        }
    }
}

public enum CoverSizeRange {
    public static let min: CGFloat = 80
    public static let max: CGFloat = 200
    public static let defaultValue: CGFloat = 125
}

/// Grid gutter presets, fixed while the column width flexes.
public enum GridSpacing: String, CaseIterable, Identifiable, Sendable {
    case compact
    case cozy
    case spacious

    public static let defaultValue: GridSpacing = .cozy

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .compact: "Compact"
            case .cozy: "Cozy"
            case .spacious: "Spacious"
        }
    }

    public var iconName: String {
        switch self {
            case .compact: "rectangle.arrowtriangle.2.inward"
            case .cozy: "rectangle"
            case .spacious: "rectangle.arrowtriangle.2.outward"
        }
    }

    public var points: CGFloat {
        switch self {
            case .compact: 8
            case .cozy: 16
            case .spacious: 24
        }
    }
}

public enum CategoryListSidebarDefaults {
    public static let width: CGFloat = 265
}

public enum CoverPreference: String, CaseIterable, Identifiable, Sendable {
    case preferEbook
    case preferAudiobook
    case storytellerDouble

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .preferEbook: "Prefer Ebook"
            case .preferAudiobook: "Prefer Audiobook"
            case .storytellerDouble: "Storyteller"
        }
    }

    public var preferredContainerAspectRatio: CGFloat {
        switch self {
            case .preferEbook, .storytellerDouble: 0.67
            case .preferAudiobook: 1.0
        }
    }
}

public enum ProgressIndicatorStyle: String, CaseIterable, Identifiable, Sendable {
    case line
    case circle
    case text
    case none

    public var id: String { rawValue }

    public static var selectableStyles: [ProgressIndicatorStyle] { [.line, .circle, .text] }

    public var label: String {
        switch self {
            case .line: "Line"
            case .circle: "Circle"
            case .text: "Text"
            case .none: "None"
        }
    }

    public var iconName: String {
        switch self {
            case .line: "minus"
            case .circle: "circle.dotted"
            case .text: "percent"
            case .none: "eye.slash"
        }
    }
}

public enum CategoryLayoutStyle: String, CaseIterable, Identifiable, Sendable {
    case list
    case fan
    case grid

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .list: "List"
            case .fan: "Carousel"
            case .grid: "Stacks"
        }
    }

    public var iconName: String {
        switch self {
            case .list: "list.bullet"
            case .fan: "rectangle.stack"
            case .grid: "square.grid.2x2"
        }
    }
}
