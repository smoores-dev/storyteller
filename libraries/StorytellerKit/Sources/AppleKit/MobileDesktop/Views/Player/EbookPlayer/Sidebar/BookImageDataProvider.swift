#if os(macOS)
import AppKit
import Foundation
import ImageIO
import ZIPFoundation

final class BookImageDataProvider: @unchecked Sendable {
    private let extractedRoot: URL?
    private let archiveURL: URL?
    private let thumbnailCache = NSCache<NSString, NSImage>()
    private let imageCache = NSCache<NSString, NSImage>()
    private let pixelSizeCache = NSCache<NSString, NSValue>()

    init(extractedRoot: URL?, archiveURL: URL?) {
        self.extractedRoot = extractedRoot
        self.archiveURL = archiveURL
        thumbnailCache.countLimit = 300
        imageCache.countLimit = 12
    }

    func imageData(for item: BookImageItem) -> Data? {
        if let extractedRoot {
            let url = extractedRoot.appendingPathComponent(item.imagePath)
            if let data = try? Data(contentsOf: url) {
                return data
            }
        }
        guard let archiveURL,
            let archive = try? Archive(url: archiveURL, accessMode: .read),
            let entry = archive[item.imagePath]
        else { return nil }
        var data = Data()
        _ = try? archive.extract(entry, skipCRC32: true) { chunk in
            data.append(chunk)
        }
        return data.isEmpty ? nil : data
    }

    func fullImage(for item: BookImageItem) -> NSImage? {
        let key = item.id as NSString
        if let cached = imageCache.object(forKey: key) {
            return cached
        }
        guard let data = imageData(for: item), let image = NSImage(data: data) else {
            return nil
        }
        imageCache.setObject(image, forKey: key)
        return image
    }

    // NSImage.size is DPI-scaled, so pixel counts come from the source properties instead.
    func pixelSize(for item: BookImageItem) -> CGSize? {
        let key = item.id as NSString
        if let cached = pixelSizeCache.object(forKey: key) {
            return cached.sizeValue
        }
        guard let data = imageData(for: item),
            let source = CGImageSourceCreateWithData(data as CFData, nil),
            let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)
                as? [CFString: Any],
            let width = properties[kCGImagePropertyPixelWidth] as? Int,
            let height = properties[kCGImagePropertyPixelHeight] as? Int
        else { return nil }
        let size = CGSize(width: width, height: height)
        pixelSizeCache.setObject(NSValue(size: size), forKey: key)
        return size
    }

    func thumbnail(for item: BookImageItem, maxPixelSize: CGFloat) -> NSImage? {
        let key = item.id as NSString
        if let cached = thumbnailCache.object(forKey: key) {
            return cached
        }
        guard let data = imageData(for: item),
            let source = CGImageSourceCreateWithData(data as CFData, nil)
        else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: Int(maxPixelSize),
        ]
        guard
            let cgImage = CGImageSourceCreateThumbnailAtIndex(
                source,
                0,
                options as CFDictionary,
            )
        else { return nil }
        let image = NSImage(
            cgImage: cgImage,
            size: NSSize(width: cgImage.width, height: cgImage.height),
        )
        thumbnailCache.setObject(image, forKey: key)
        return image
    }
}
#endif
