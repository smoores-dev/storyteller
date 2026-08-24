import Foundation

public enum CoverColorDerivation {
    public static let algorithmVersion = 3

    public static let maxDerivationPixels = 4_000_000

    public static func key(bookID: BookID, audio: Bool) -> String {
        "\(bookID.sourceID)|\(bookID.uuid)|\(audio)-v\(algorithmVersion)"
    }

    public static func keys(bookID: BookID) -> [String] {
        [key(bookID: bookID, audio: false), key(bookID: bookID, audio: true)]
    }

    public static func cachedColors(forKey key: String) -> [OkmainColor]? {
        mirrorLock.lock()
        defer { mirrorLock.unlock() }
        return mirror[key]
    }

    static func setCachedColors(_ colors: [OkmainColor], forKey key: String) {
        mirrorLock.lock()
        defer { mirrorLock.unlock() }
        mirror[key] = colors
    }

    static func mergeMirror(with entries: [String: [OkmainColor]]) {
        mirrorLock.lock()
        defer { mirrorLock.unlock() }
        mirror.merge(entries) { existing, _ in existing }
    }

    static func clearMirror() {
        mirrorLock.lock()
        defer { mirrorLock.unlock() }
        mirror = [:]
    }

    static func removeMirror(keys: [String]) {
        mirrorLock.lock()
        defer { mirrorLock.unlock() }
        for key in keys {
            mirror.removeValue(forKey: key)
        }
    }

    private static let mirrorLock = NSLock()
    nonisolated(unsafe) private static var mirror: [String: [OkmainColor]] = [:]
}
