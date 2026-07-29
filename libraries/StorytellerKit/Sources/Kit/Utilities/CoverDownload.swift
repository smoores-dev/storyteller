import Foundation

#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct DownloadedCover: Sendable {
    public let data: Data
    public let filename: String
    public let contentType: String?
    public let url: URL
    public let width: Int?
    public let height: Int?
}

public enum CoverDownloadError: Error, LocalizedError {
    case invalidURL(String)
    case unexpectedStatus(Int)
    case unexpectedContentType(String)
    case emptyResponse
    case notAnImage

    public var errorDescription: String? {
        switch self {
            case .invalidURL(let value): return "Not a valid URL: \(value)"
            case .unexpectedStatus(let code): return "HTTP \(code)"
            case .unexpectedContentType(let type): return "Unexpected content type \(type)"
            case .emptyResponse: return "Empty response"
            case .notAnImage: return "Response was not a valid image"
        }
    }
}

public enum CoverDownload {
    public static func fetch(_ candidate: CoverCandidate) async throws -> DownloadedCover {
        try await fetch(
            url: candidate.url,
            provider: candidate.provider,
            fallbackFilename: candidate.filename,
        )
    }

    /// A provider's images may sit behind different auth than its API, so the download goes through
    /// here rather than leaving each caller to work out the headers.
    public static func fetch(
        url: URL,
        provider: CoverProvider? = nil,
        fallbackFilename: String = "cover.jpg",
    ) async throws -> DownloadedCover {
        var request = URLRequest(url: url)
        for (field, value) in await imageHeaders(for: provider) {
            request.setValue(value, forHTTPHeaderField: field)
        }

        let (data, response) = try await URLSession.shared.data(for: request)

        if let httpResponse = response as? HTTPURLResponse,
            !(200..<300).contains(httpResponse.statusCode)
        {
            throw CoverDownloadError.unexpectedStatus(httpResponse.statusCode)
        }
        let contentType = response.mimeType?.lowercased()
        if let contentType, !contentType.hasPrefix("image/") {
            throw CoverDownloadError.unexpectedContentType(contentType)
        }
        guard !data.isEmpty else { throw CoverDownloadError.emptyResponse }
        guard let format = ImageBytes.format(of: data) else { throw CoverDownloadError.notAnImage }

        let dimensions = ImageBytes.dimensions(of: data)
        return DownloadedCover(
            data: data,
            filename: filename(from: url, format: format, fallback: fallbackFilename),
            contentType: contentType ?? format.contentType,
            url: url,
            width: dimensions?.width ?? CoverSearch.inferredResolution(from: url)?.width,
            height: dimensions?.height ?? CoverSearch.inferredResolution(from: url)?.height,
        )
    }

    /// Neither provider's image host authenticates today, so this is empty. It is the hook for the
    /// one that eventually does.
    private static func imageHeaders(for provider: CoverProvider?) async -> [String: String] {
        switch provider {
            case .apple, .hardcover, nil: return [:]
        }
    }

    private static func filename(
        from url: URL,
        format: ImageBytes.Format,
        fallback: String,
    ) -> String {
        let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "webp", "heic"]
        if imageExtensions.contains(url.pathExtension.lowercased()) {
            return url.lastPathComponent
        }
        let stem = (fallback as NSString).deletingPathExtension
        return "\(stem).\(format.fileExtension)"
    }
}

/// Byte-level image sniffing, so validation and sizing do not need an image framework and work the
/// same on every platform.
public enum ImageBytes {
    public enum Format: String, Sendable {
        case jpeg
        case png
        case gif
        case webp
        case heic

        public var fileExtension: String {
            switch self {
                case .jpeg: return "jpg"
                case .png: return "png"
                case .gif: return "gif"
                case .webp: return "webp"
                case .heic: return "heic"
            }
        }

        public var contentType: String {
            switch self {
                case .jpeg: return "image/jpeg"
                case .png: return "image/png"
                case .gif: return "image/gif"
                case .webp: return "image/webp"
                case .heic: return "image/heic"
            }
        }
    }

    public static func format(of data: Data) -> Format? {
        let bytes = [UInt8](data.prefix(16))
        guard bytes.count >= 12 else { return nil }
        if bytes[0] == 0xFF, bytes[1] == 0xD8, bytes[2] == 0xFF { return .jpeg }
        if bytes[0] == 0x89, bytes[1] == 0x50, bytes[2] == 0x4E, bytes[3] == 0x47 { return .png }
        if bytes[0] == 0x47, bytes[1] == 0x49, bytes[2] == 0x46 { return .gif }
        if bytes[0] == 0x52, bytes[1] == 0x49, bytes[2] == 0x46, bytes[3] == 0x46,
            bytes[8] == 0x57, bytes[9] == 0x45, bytes[10] == 0x42, bytes[11] == 0x50
        {
            return .webp
        }
        if bytes[4] == 0x66, bytes[5] == 0x74, bytes[6] == 0x79, bytes[7] == 0x70 { return .heic }
        return nil
    }

    /// JPEG and PNG cover every cover either provider serves today; other formats report no size
    /// rather than pulling in a decoder.
    public static func dimensions(of data: Data) -> (width: Int, height: Int)? {
        switch format(of: data) {
            case .png: return pngDimensions(data)
            case .jpeg: return jpegDimensions(data)
            default: return nil
        }
    }

    private static func pngDimensions(_ data: Data) -> (width: Int, height: Int)? {
        let bytes = [UInt8](data.prefix(24))
        guard bytes.count >= 24 else { return nil }
        let width =
            Int(bytes[16]) << 24 | Int(bytes[17]) << 16 | Int(bytes[18]) << 8 | Int(bytes[19])
        let height =
            Int(bytes[20]) << 24 | Int(bytes[21]) << 16 | Int(bytes[22]) << 8 | Int(bytes[23])
        return (width, height)
    }

    private static func jpegDimensions(_ data: Data) -> (width: Int, height: Int)? {
        let bytes = [UInt8](data)
        var index = 2
        while index + 9 < bytes.count {
            guard bytes[index] == 0xFF else {
                index += 1
                continue
            }
            let marker = bytes[index + 1]
            // SOF0-SOF15 carry the frame dimensions; DHT/JPG/DAC share the range and do not.
            if marker >= 0xC0, marker <= 0xCF, marker != 0xC4, marker != 0xC8, marker != 0xCC {
                let height = Int(bytes[index + 5]) << 8 | Int(bytes[index + 6])
                let width = Int(bytes[index + 7]) << 8 | Int(bytes[index + 8])
                return (width, height)
            }
            let segmentLength = Int(bytes[index + 2]) << 8 | Int(bytes[index + 3])
            guard segmentLength > 0 else { return nil }
            index += 2 + segmentLength
        }
        return nil
    }
}
