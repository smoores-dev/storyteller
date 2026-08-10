import Foundation

public enum KitResources {
    public static func webResourcesDirectory() throws -> URL {
        // Bundle.module traps on Android: the SwiftPM resource bundle is not
        // packaged into the APK. Android serves web resources from APK assets.
        #if os(Android)
            throw NSError(
                domain: "KitResources",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Resource bundle unavailable on Android"],
            )
        #else
            guard let url = Bundle.module.url(forResource: "WebResources", withExtension: nil) else {
                throw NSError(
                    domain: "KitResources",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to find bundled WebResources"],
                )
            }
            return url
        #endif
    }

    public static func fontsDirectory() -> URL? {
        #if os(Android)
            // The Android shell extracts APK assets/reader-fonts into
            // filesDir/reader-fonts at startup (StorytellerApplication.kt).
            return StorytellerPlatform.applicationStorage?
                .applicationSupportDirectory
                .appendingPathComponent("reader-fonts", isDirectory: true)
        #else
            Bundle.module.url(forResource: "fonts", withExtension: nil)
        #endif
    }
}
