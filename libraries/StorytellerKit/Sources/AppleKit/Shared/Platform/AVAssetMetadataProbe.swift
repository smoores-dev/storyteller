#if canImport(AVFoundation)
import AVFoundation
import Foundation

public enum AudioMetadataProbeError: Error, LocalizedError {
    case notPlayable

    public var errorDescription: String? {
        switch self {
            case .notPlayable:
                return "Failed to load audiobook metadata or chapters."
        }
    }
}

public struct AVAssetMetadataProbe: AudioMetadataProbing {
    public init() {}

    public func duration(of url: URL) async throws -> TimeInterval {
        let asset = AVURLAsset(url: url)
        guard try await asset.load(.isPlayable) else {
            throw AudioMetadataProbeError.notPlayable
        }
        let duration = try await asset.load(.duration)
        let seconds = CMTimeGetSeconds(duration)
        return seconds.isFinite && seconds > 0 ? seconds : 0
    }

    public func chapters(of url: URL) async throws -> [ProbedAudioChapter] {
        let asset = AVURLAsset(url: url)

        let languages: [Locale]
        do {
            languages = try await asset.load(.availableChapterLocales)
        } catch {
            return []
        }

        guard let locale = languages.first else {
            return []
        }

        let chapterMetadataGroups = try await asset.loadChapterMetadataGroups(
            withTitleLocale: locale,
            containingItemsWithCommonKeys: [.commonKeyTitle],
        )

        var chapters: [ProbedAudioChapter] = []

        for group in chapterMetadataGroups {
            let startTime = CMTimeGetSeconds(group.timeRange.start)
            let duration = CMTimeGetSeconds(group.timeRange.duration)

            var chapterTitle: String?

            for item in group.items {
                if let key = item.commonKey, key == .commonKeyTitle {
                    if let value = try? await item.load(.value) {
                        if let stringValue = value as? String {
                            chapterTitle = stringValue
                        } else if let dataValue = value as? Data,
                            let stringValue = String(data: dataValue, encoding: .utf8)
                        {
                            chapterTitle = stringValue
                        }
                    }
                }
            }

            chapters.append(
                ProbedAudioChapter(
                    title: chapterTitle,
                    start: startTime,
                    duration: duration,
                )
            )
        }

        return chapters
    }
}
#endif
