#if os(iOS) || os(macOS)
import Foundation

struct HomeSectionConfigItem: Codable, Identifiable, Equatable {
    var id: String
    var visible: Bool
}

enum HomeSectionConfigHelper {
    private static let key = "home.sectionConfig"

    static let builtInIds = Set(HomeSectionKind.allCases.map(\.rawValue))

    static let defaultConfig = HomeSectionKind.allCases.map {
        HomeSectionConfigItem(id: $0.rawValue, visible: true)
    }

    static var config: [HomeSectionConfigItem] {
        guard let json = UserDefaults.standard.string(forKey: key),
            let data = json.data(using: .utf8),
            let items = try? JSONDecoder().decode([HomeSectionConfigItem].self, from: data),
            !items.isEmpty
        else {
            return defaultConfig
        }
        return items
    }

    static func save(_ items: [HomeSectionConfigItem]) {
        guard let data = try? JSONEncoder().encode(items),
            let json = String(data: data, encoding: .utf8)
        else { return }
        UserDefaults.standard.set(json, forKey: key)
    }

    static func syncWithPinnedItems(_ pinnedIds: [String]) {
        let homePinIds = pinnedIds.filter { $0.hasPrefix("pin.") }

        var current = config
        let existingIds = Set(current.map(\.id))

        let staleIds =
            current
            .filter { !builtInIds.contains($0.id) && !homePinIds.contains($0.id) }
            .map(\.id)

        let newIds = homePinIds.filter { !existingIds.contains($0) }

        guard !staleIds.isEmpty || !newIds.isEmpty else { return }

        current.removeAll { staleIds.contains($0.id) }
        for pinId in newIds {
            current.append(HomeSectionConfigItem(id: pinId, visible: false))
        }
        save(current)
    }

    static func displayName(for id: String) -> String {
        HomeSectionKind(rawValue: id)?.title ?? pinDisplayName(for: id) ?? id
    }

    static func systemImage(for id: String) -> String {
        switch id {
            case "currentlyReading": return "book"
            case "startReading": return "bookmark"
            case "recentlyAdded": return "clock"
            case "completed": return "checkmark.circle"
            default:
                return pinSystemImage(for: id) ?? "questionmark"
        }
    }

    private static func pinDisplayName(for id: String) -> String? {
        if id.hasPrefix("pin.sidebar:") {
            let stableId = String(id.dropFirst("pin.sidebar:".count))
            return SidebarConfigHelper.defaultItemLookup[stableId]?.name
        }
        if id.hasPrefix("pin.series:") { return String(id.dropFirst("pin.series:".count)) }
        if id.hasPrefix("pin.author:") { return String(id.dropFirst("pin.author:".count)) }
        if id.hasPrefix("pin.collection:") { return String(id.dropFirst("pin.collection:".count)) }
        if id.hasPrefix("pin.tag:") { return String(id.dropFirst("pin.tag:".count)) }
        if id.hasPrefix("pin.narrator:") { return String(id.dropFirst("pin.narrator:".count)) }
        if id.hasPrefix("pin.translator:") { return String(id.dropFirst("pin.translator:".count)) }
        if id.hasPrefix("pin.year:") { return String(id.dropFirst("pin.year:".count)) }
        if id.hasPrefix("pin.rating:") {
            let rating = String(id.dropFirst("pin.rating:".count))
            return RatingDisplayHelper.label(for: rating)
        }
        if id.hasPrefix("pin.status:") { return String(id.dropFirst("pin.status:".count)) }
        if id.hasPrefix("pin.smartShelf:") { return nil }
        return nil
    }

    private static func pinSystemImage(for id: String) -> String? {
        if id.hasPrefix("pin.sidebar:") {
            let stableId = String(id.dropFirst("pin.sidebar:".count))
            return SidebarConfigHelper.defaultItemLookup[stableId]?.systemImage
        }
        if id.hasPrefix("pin.series:") { return "books.vertical" }
        if id.hasPrefix("pin.author:") { return "person.2" }
        if id.hasPrefix("pin.collection:") { return "rectangle.stack" }
        if id.hasPrefix("pin.tag:") { return "tag" }
        if id.hasPrefix("pin.narrator:") { return "mic" }
        if id.hasPrefix("pin.translator:") { return "character.book.closed.fill" }
        if id.hasPrefix("pin.year:") { return "calendar" }
        if id.hasPrefix("pin.rating:") { return "star" }
        if id.hasPrefix("pin.status:") {
            let status = String(id.dropFirst("pin.status:".count))
            switch status.lowercased() {
                case "reading": return "arrow.right.circle.fill"
                case "to read": return "bookmark.fill"
                case "read": return "checkmark.circle.fill"
                default: return "questionmark.circle.fill"
            }
        }
        if id.hasPrefix("pin.smartShelf:") { return "sparkles.rectangle.stack" }
        return nil
    }
}

// Legacy types kept for migration only
struct PinItem: Codable, Identifiable, Equatable {
    var id: String
    var alias: String?
    var visible: Bool

    init(id: String, alias: String? = nil, visible: Bool = true) {
        self.id = id
        self.alias = alias
        self.visible = visible
    }
}

struct PinGroup: Codable, Identifiable, Equatable {
    var id: UUID
    var name: String
    var items: [PinItem]
    var expanded: Bool

    init(id: UUID = UUID(), name: String = "Pins", items: [PinItem] = [], expanded: Bool = true) {
        self.id = id
        self.name = name
        self.items = items
        self.expanded = expanded
    }
}

enum SidebarPinHelper {
    static var pinnedItemIds: [String] {
        SidebarConfigHelper.config.flatMap { group in
            group.items
                .filter { $0.id.hasPrefix("pin.") }
                .map(\.id)
        }
    }

    static func isPinned(_ id: String) -> Bool {
        pinnedItemIds.contains(id)
    }

    static func togglePin(_ id: String) {
        var groups = SidebarConfigHelper.config

        for i in groups.indices {
            if let itemIndex = groups[i].items.firstIndex(where: { $0.id == id }) {
                groups[i].items.remove(at: itemIndex)
                SidebarConfigHelper.config = groups
                return
            }
        }

        let newItem = SidebarConfigItem(id: id, visible: true, permanent: false)

        for i in groups.indices {
            if let markerIndex = groups[i].items.firstIndex(where: {
                $0.id == SidebarConfigHelper.newPinLocationMarker
            }) {
                groups[i].items.insert(newItem, at: markerIndex)
                SidebarConfigHelper.config = groups
                return
            }
        }

        // Fallback: no marker found, append to first group that looks like pins
        if let pinsIndex = groups.firstIndex(where: { $0.name == "Pins" }) {
            groups[pinsIndex].items.insert(newItem, at: 0)
        } else if !groups.isEmpty {
            groups[0].items.append(newItem)
        }
        SidebarConfigHelper.config = groups
    }

    static func addToDashboard(_ stableId: String) {
        let pinId = "pin.sidebar:\(stableId)"
        var groups = SidebarConfigHelper.config

        let newItem = SidebarConfigItem(id: pinId, visible: false, permanent: false)

        var inserted = false
        for i in groups.indices {
            if let markerIndex = groups[i].items.firstIndex(where: {
                $0.id == SidebarConfigHelper.newPinLocationMarker
            }) {
                groups[i].items.insert(newItem, at: markerIndex)
                inserted = true
                break
            }
        }
        if !inserted {
            if let pinsIndex = groups.firstIndex(where: { $0.name == "Pins" }) {
                groups[pinsIndex].items.insert(newItem, at: 0)
            } else if !groups.isEmpty {
                groups[0].items.append(newItem)
            }
        }
        SidebarConfigHelper.config = groups

        var homeConfig = HomeSectionConfigHelper.config
        if let idx = homeConfig.firstIndex(where: { $0.id == pinId }) {
            homeConfig[idx].visible = true
        } else {
            homeConfig.append(HomeSectionConfigItem(id: pinId, visible: true))
        }
        HomeSectionConfigHelper.save(homeConfig)
    }

    static func pinId(forSeries name: String) -> String { "pin.series:\(name)" }
    static func pinId(forCollection name: String) -> String { "pin.collection:\(name)" }
    static func pinId(forAuthor name: String) -> String { "pin.author:\(name)" }
    static func pinId(forNarrator name: String) -> String { "pin.narrator:\(name)" }
    static func pinId(forTranslator name: String) -> String { "pin.translator:\(name)" }
    static func pinId(forTag name: String) -> String { "pin.tag:\(name)" }
    static func pinId(forYear year: String) -> String { "pin.year:\(year)" }
    static func pinId(forRating rating: String) -> String { "pin.rating:\(rating)" }
    static func pinId(forStatus status: String) -> String { "pin.status:\(status)" }
    static func pinId(forSmartShelf id: UUID) -> String { "pin.smartShelf:\(id.uuidString)" }
}

#endif
