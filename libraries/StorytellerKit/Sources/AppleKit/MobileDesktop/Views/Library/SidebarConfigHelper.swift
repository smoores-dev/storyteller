#if os(iOS) || os(macOS)
import Foundation

struct SidebarConfigItem: Codable, Identifiable, Equatable {
    var id: String
    var alias: String?
    var visible: Bool
    var permanent: Bool

    init(id: String, alias: String? = nil, visible: Bool = true, permanent: Bool = true) {
        self.id = id
        self.alias = alias
        self.visible = visible
        self.permanent = permanent
    }
}

struct SidebarConfigGroup: Codable, Identifiable, Equatable {
    var id: UUID
    var name: String
    var items: [SidebarConfigItem]
    var expanded: Bool

    init(id: UUID = UUID(), name: String, items: [SidebarConfigItem] = [], expanded: Bool = true) {
        self.id = id
        self.name = name
        self.items = items
        self.expanded = expanded
    }
}

enum SidebarConfigHelper {
    static let newPinLocationMarker = "@@newPinLocation"
    private static let configKey = "sidebar.config"

    static var config: [SidebarConfigGroup] {
        get {
            if let json = UserDefaults.standard.string(forKey: configKey),
                let data = json.data(using: .utf8),
                let groups = try? JSONDecoder().decode([SidebarConfigGroup].self, from: data),
                !groups.isEmpty
            {
                let normalized = normalize(groups)
                if normalized != groups {
                    saveConfig(normalized)
                }
                return normalized
            }
            let migrated = migrateFromLegacy()
            if !migrated.isEmpty {
                saveConfig(migrated)
                return migrated
            }
            return defaultConfig()
        }
        set {
            saveConfig(newValue)
        }
    }

    private static func saveConfig(_ value: [SidebarConfigGroup]) {
        guard let data = try? JSONEncoder().encode(value),
            let json = String(data: data, encoding: .utf8)
        else { return }
        UserDefaults.standard.set(json, forKey: configKey)
    }

    private static func normalize(_ groups: [SidebarConfigGroup]) -> [SidebarConfigGroup] {
        var normalized = groups.map { group in
            var normalized = group
            normalized.items.removeAll {
                $0.id == "importLocalFile" || $0.id == "storytellerServer"
            }
            return normalized
        }
        // Configs saved before Book Reports existed never re-read defaultConfig(), so
        // surface the new entry in whichever group holds the Library category views.
        let hasBookReports = normalized.contains { group in
            group.items.contains { $0.id == "bookReports" }
        }
        if !hasBookReports,
            let libraryIndex = normalized.firstIndex(where: { group in
                group.items.contains { $0.id == "sourceView.ebook" }
            })
        {
            normalized[libraryIndex].items.append(
                SidebarConfigItem(id: "bookReports", permanent: true)
            )
        }
        return normalized
    }

    static func defaultConfig() -> [SidebarConfigGroup] {
        let sections = LibrarySidebarDefaults.getSections()
        var groups: [SidebarConfigGroup] = []

        if let homeSection = sections.first(where: { $0.id == "section.home" }) {
            var items = homeSection.items.map {
                SidebarConfigItem(id: $0.content.stableIdentifier, permanent: true)
            }
            items.append(SidebarConfigItem(id: "downloaded", permanent: true))
            groups.append(SidebarConfigGroup(name: "Home", items: items))
        }

        if let librarySection = sections.first(where: { $0.id == "section.library" }) {
            let items = librarySection.items.map {
                SidebarConfigItem(id: $0.content.stableIdentifier, permanent: true)
            }
            groups.append(SidebarConfigGroup(name: "Library", items: items))
        }

        groups.append(
            SidebarConfigGroup(
                name: "Pins",
                items: [
                    SidebarConfigItem(id: newPinLocationMarker, visible: false, permanent: true)
                ],
                expanded: true,
            )
        )

        if let collectionsSection = sections.first(where: { $0.id == "section.collections" }) {
            let items = collectionsSection.items.map {
                SidebarConfigItem(id: $0.content.stableIdentifier, permanent: true)
            }
            groups.append(SidebarConfigGroup(name: "Collections", items: items))
        }

        if let mediaSourcesSection = sections.first(where: { $0.id == "section.mediaSources" }) {
            let items = mediaSourcesSection.items
                .filter { $0.content.stableIdentifier != "downloaded" }
                .filter { $0.content.stableIdentifier != "storytellerServer" }
                .map { SidebarConfigItem(id: $0.content.stableIdentifier, permanent: true) }
            groups.append(SidebarConfigGroup(name: "Media Sources", items: items))
        }

        return groups
    }

    static func migrateFromLegacy() -> [SidebarConfigGroup] {
        let legacyPinGroupsKey = "sidebar.pinGroups"
        let legacyPinnedItemsKey = "sidebar.pinnedItems"
        let legacyHiddenItemsKey = "sidebar.hiddenItems"

        var oldPinGroups: [PinGroup] = []
        if let json = UserDefaults.standard.string(forKey: legacyPinGroupsKey),
            let data = json.data(using: .utf8),
            let groups = try? JSONDecoder().decode([PinGroup].self, from: data)
        {
            oldPinGroups = groups
        } else if let json = UserDefaults.standard.string(forKey: legacyPinnedItemsKey),
            let data = json.data(using: .utf8),
            let ids = try? JSONDecoder().decode([String].self, from: data),
            !ids.isEmpty
        {
            let items = ids.map { PinItem(id: $0) }
            oldPinGroups = [PinGroup(name: "Pins", items: items)]
        }

        var hiddenIds: Set<String> = []
        if let json = UserDefaults.standard.string(forKey: legacyHiddenItemsKey),
            let data = json.data(using: .utf8),
            let ids = try? JSONDecoder().decode([String].self, from: data)
        {
            hiddenIds = Set(ids)
        }

        guard !oldPinGroups.isEmpty || !hiddenIds.isEmpty else {
            return []
        }

        var groups = defaultConfig()

        for i in groups.indices {
            for j in groups[i].items.indices {
                let itemId = groups[i].items[j].id
                if hiddenIds.contains(itemId) {
                    groups[i].items[j].visible = false
                }
            }
        }

        if !oldPinGroups.isEmpty {
            if let pinsIndex = groups.firstIndex(where: { $0.name == "Pins" }) {
                groups.remove(at: pinsIndex)

                var insertIndex = pinsIndex
                for oldGroup in oldPinGroups {
                    var configItems = oldGroup.items.map {
                        SidebarConfigItem(
                            id: $0.id,
                            alias: $0.alias,
                            visible: $0.visible,
                            permanent: false,
                        )
                    }
                    configItems.append(
                        SidebarConfigItem(
                            id: newPinLocationMarker,
                            visible: false,
                            permanent: true,
                        )
                    )
                    let newGroup = SidebarConfigGroup(
                        id: oldGroup.id,
                        name: oldGroup.name,
                        items: configItems,
                        expanded: oldGroup.expanded,
                    )
                    groups.insert(newGroup, at: insertIndex)
                    insertIndex += 1
                }
            }
        }

        return groups
    }

    static var defaultItemLookup: [String: SidebarItemDescription] {
        var lookup: [String: SidebarItemDescription] = [:]
        for section in LibrarySidebarDefaults.getSections() {
            for item in section.items {
                lookup[item.content.stableIdentifier] = item
            }
        }
        return lookup
    }
}

#endif
