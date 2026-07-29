#if os(iOS) || os(macOS)
import SwiftUI

typealias MetadataEditorAction = @MainActor @Sendable ([BookID]) -> Void

private struct MetadataEditorActionKey: EnvironmentKey {
    static let defaultValue: MetadataEditorAction? = nil
}

extension EnvironmentValues {
    var editMetadataAction: MetadataEditorAction? {
        get { self[MetadataEditorActionKey.self] }
        set { self[MetadataEditorActionKey.self] = newValue }
    }
}

#endif
