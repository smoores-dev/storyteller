import Foundation

enum AudioMediaTypes {
    static let fileExtensions: Set<String> = [
        "aac", "flac", "m4a", "m4b", "mp3", "ogg", "oga", "opus", "wav",
    ]

    static func isAudioFile(_ url: URL) -> Bool {
        fileExtensions.contains(url.pathExtension.lowercased())
    }
}
