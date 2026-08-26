#if os(iOS) || os(macOS)
import CoreGraphics
import Foundation
import ImageIO
import ZIPFoundation

#if os(macOS)
import AppKit
typealias BookPlatformImage = NSImage
#else
import UIKit
typealias BookPlatformImage = UIImage
#endif

final class BookImageDataProvider: @unchecked Sendable {
    private let extractedRoot: URL?
    private let archiveURL: URL?
    private let thumbnailCache = NSCache<NSString, BookPlatformImage>()
    private let imageCache = NSCache<NSString, BookPlatformImage>()
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

    func fullImage(for item: BookImageItem) -> BookPlatformImage? {
        let key = item.id as NSString
        if let cached = imageCache.object(forKey: key) {
            return cached
        }
        guard let data = imageData(for: item),
            let image = BookPlatformImage(data: data)
        else { return nil }
        imageCache.setObject(image, forKey: key)
        return image
    }

    // NSImage.size is DPI-scaled, so pixel counts come from the source properties instead.
    func pixelSize(for item: BookImageItem) -> CGSize? {
        let key = item.id as NSString
        if let cached = pixelSizeCache.object(forKey: key) {
            return cached.bookSizeValue
        }
        guard let data = imageData(for: item),
            let source = CGImageSourceCreateWithData(data as CFData, nil),
            let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)
                as? [CFString: Any],
            let width = properties[kCGImagePropertyPixelWidth] as? Int,
            let height = properties[kCGImagePropertyPixelHeight] as? Int
        else { return nil }
        let size = CGSize(width: width, height: height)
        pixelSizeCache.setObject(NSValue(bookSize: size), forKey: key)
        return size
    }

    func thumbnail(for item: BookImageItem, maxPixelSize: CGFloat) -> BookPlatformImage? {
        let key = "\(item.id)#\(Int(maxPixelSize))" as NSString
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
        #if os(macOS)
        let image = NSImage(
            cgImage: cgImage,
            size: NSSize(width: cgImage.width, height: cgImage.height),
        )
        #else
        let image = UIImage(cgImage: cgImage)
        #endif
        thumbnailCache.setObject(image, forKey: key)
        return image
    }
}

enum BookImageFormatting {
    static func dimensions(_ size: CGSize) -> String {
        "\(Int(size.width))\u{00D7}\(Int(size.height))"
    }
}

extension NSValue {
    fileprivate convenience init(bookSize: CGSize) {
        #if os(macOS)
        self.init(size: bookSize)
        #else
        self.init(cgSize: bookSize)
        #endif
    }

    fileprivate var bookSizeValue: CGSize {
        #if os(macOS)
        return sizeValue
        #else
        return cgSizeValue
        #endif
    }
}
#endif
