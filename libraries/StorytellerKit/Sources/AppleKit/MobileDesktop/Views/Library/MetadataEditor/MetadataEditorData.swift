#if os(iOS) || os(macOS)
import Foundation
import SwiftUI

enum MetadataCoverScope: String, CaseIterable, Identifiable {
    case audiobook
    case ebook

    var id: String { rawValue }

    var isAudio: Bool { self == .audiobook }
    var label: String { isAudio ? "Audiobook Cover" : "Ebook Cover" }
    var aspectRatio: CGFloat { isAudio ? 1.0 : 2.0 / 3.0 }
    var variant: MediaViewModel.CoverVariant { isAudio ? .audioSquare : .standard }
}

public struct MetadataEditorData: Codable, Hashable, Identifiable {
    public let bookIds: [BookID]
    public let sessionId: UUID
    public var id: UUID { sessionId }

    public init(bookIds: [BookID], sessionId: UUID = UUID()) {
        self.bookIds = bookIds
        self.sessionId = sessionId
    }

}

#endif
