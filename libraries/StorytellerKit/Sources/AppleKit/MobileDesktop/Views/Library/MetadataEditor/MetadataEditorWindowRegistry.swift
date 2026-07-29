#if os(iOS) || os(macOS)
import SwiftUI

#if os(macOS)
import AppKit

@MainActor
enum MetadataEditorWindowRegistry {
    private static weak var window: NSWindow?
    private static var addBookIdsHandler: (([BookID]) -> Void)?

    static func register(addBookIds: @escaping ([BookID]) -> Void) {
        addBookIdsHandler = addBookIds
    }

    static func updateWindow(_ window: NSWindow?) {
        self.window = window
    }

    static func unregister() {
        window = nil
        addBookIdsHandler = nil
    }

    static func addToExistingWindow(_ bookIds: [BookID]) -> Bool {
        guard let addBookIdsHandler else { return false }
        addBookIdsHandler(bookIds)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return true
    }
}
#endif

#endif
