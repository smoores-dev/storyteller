import Foundation

public enum KitResources {
    public static func webResourcesDirectory() throws -> URL {
        guard let url = Bundle.module.url(forResource: "WebResources", withExtension: nil) else {
            throw NSError(
                domain: "KitResources",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Failed to find bundled WebResources"],
            )
        }
        return url
    }

    public static func fontsDirectory() -> URL? {
        Bundle.module.url(forResource: "fonts", withExtension: nil)
    }
}
