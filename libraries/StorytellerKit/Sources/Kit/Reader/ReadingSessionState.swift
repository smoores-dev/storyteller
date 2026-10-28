import Foundation

public enum ReadingSyncResult: Sendable, Equatable {
    case synced
    case deferred(String)
    case failed(String)
}

@StorytellerUIActor
struct ReaderOperation {
    enum Purpose {
        case user(SyncReason)
        case projection
    }
    let id = UUID().uuidString
    var documentID: String?
    let target: ReaderTarget
    let purpose: Purpose
    let revision: UInt64
    var sent = false
}

@StorytellerUIActor
struct ReadingNavigation {
    var nativeLocation: ReaderLocation?
    var snapshot: ReaderSnapshot?
    var pending: ReaderOperation?
    var browseLocation: BookLocator?
    var confirmed: (documentID: String, target: ReaderTarget)?
    var audioOperation: UInt64?
    var revision: UInt64 = 0
    var lastChapterRestart: Date?
    var foreground = true
    var syncTask: Task<ReadingSyncResult, Never>?
    var syncRequestID = UUID()
    var retryCount = 0
    var retry: Task<Void, Never>?
    var followTimer: Task<Void, Never>?
    var lastGesture: (documentID: String, id: String)?
    var peer: (locator: BookLocator, expires: Date, rate: Double)?
}
