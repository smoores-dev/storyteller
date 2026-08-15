import Foundation

#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct ProgressUploadRequest: Sendable {
    public let request: URLRequest
    public let body: Data

    public init(request: URLRequest, body: Data) {
        self.request = request
        self.body = body
    }
}

private struct ProgressUploadDescriptor: Codable {
    let bookID: BookID
    let timestampMillis: Int64

    var taskDescription: String? {
        guard let data = try? JSONEncoder().encode(self) else { return nil }
        return String(data: data, encoding: .utf8)
    }
    var spoolToken: String { String(timestampMillis) }

    init(bookID: BookID, timestamp: Double) {
        self.bookID = bookID
        self.timestampMillis = Int64(timestamp)
    }

    init?(taskDescription: String?) {
        guard let taskDescription,
            let descriptor = try? JSONDecoder().decode(
                Self.self,
                from: Data(taskDescription.utf8),
            )
        else { return nil }
        self = descriptor
    }
}

/// Uploads pending progress positions through a background URLSession so the
/// system completes the POSTs when connectivity is available, even while the
/// app is suspended or terminated. Pairs with ProgressSyncActor's offline
/// queue: the queue stays authoritative, uploads here just confirm entries.
public actor ProgressUploadManager {
    public static let shared = ProgressUploadManager()

    #if os(watchOS)
    public static let sessionIdentifier = "dev.smoores.storyteller.watch.progressupload"
    #else
    public static let sessionIdentifier = "dev.smoores.storyteller.progressupload"
    #endif

    private let delegate = ProgressUploadDelegate()
    private lazy var uploadSession: URLSession = {
        #if !canImport(Darwin)
        let config = URLSessionConfiguration.default
        #else
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        #endif
        #if canImport(Darwin)
        config.waitsForConnectivity = true
        config.sessionSendsLaunchEvents = true
        config.allowsCellularAccess = true
        config.isDiscretionary = false
        #endif
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 12 * 3600

        return URLSession(
            configuration: config,
            delegate: delegate,
            delegateQueue: nil,
        )
    }()

    private var backgroundCompletionHandler: (@Sendable () -> Void)?
    private var backstopScheduler: (@Sendable () async -> Void)?

    private init() {}

    /// Registered by the iOS app to schedule a BGAppRefresh backstop. A background
    /// upload that completes with a transient failure has no other wakeup: the app
    /// may have been launched solely by a watch relay and never sees an app-lifecycle
    /// transition, so without this the queue strands until the next relay or launch.
    public func setBackstopScheduler(_ scheduler: @escaping @Sendable () async -> Void) {
        backstopScheduler = scheduler
    }

    public func enqueuePendingUploads() async {
        let pending = await ProgressSyncActor.shared.getPendingProgressSyncs()
            .filter { !$0.syncedToStoryteller }
        guard !pending.isEmpty else { return }

        let outstanding = await outstandingTasks()

        for item in pending {
            let descriptor = ProgressUploadDescriptor(
                bookID: item.bookID,
                timestamp: item.timestamp,
            )

            // Keep at most one in-flight upload per book, newest position wins,
            // so a stale in-flight body can never land after a newer one
            var alreadyInFlight = false
            for task in outstanding {
                guard
                    let existing = ProgressUploadDescriptor(
                        taskDescription: task.taskDescription
                    ),
                    existing.bookID == descriptor.bookID
                else { continue }
                if existing.timestampMillis >= descriptor.timestampMillis {
                    alreadyInFlight = true
                } else {
                    task.cancel()
                }
            }
            if alreadyInFlight { continue }

            guard
                let upload = await BookServiceActor.shared.createAuthenticatedPositionUploadRequest(
                    bookID: item.bookID,
                    locator: item.locator,
                    timestamp: item.timestamp,
                )
            else {
                debugLog(
                    "[ProgressUploadManager] No upload request for \(item.bookID) (non-storyteller source or auth unavailable)"
                )
                continue
            }
            guard let taskDescription = descriptor.taskDescription else {
                debugLog(
                    "[ProgressUploadManager] Failed to encode upload descriptor for \(item.bookID)"
                )
                continue
            }

            do {
                let fileURL = try await FilesystemActor.shared.writeProgressUploadSpoolFile(
                    bookID: item.bookID,
                    token: descriptor.spoolToken,
                    data: upload.body,
                )
                let task = uploadSession.uploadTask(with: upload.request, fromFile: fileURL)
                task.taskDescription = taskDescription
                task.resume()
                debugLog(
                    "[ProgressUploadManager] Enqueued upload for \(item.bookID) ts=\(descriptor.timestampMillis)"
                )
            } catch {
                debugLog(
                    "[ProgressUploadManager] Failed to spool upload for \(item.bookID): \(error)"
                )
            }
        }

        // Reaching here means unsent work existed. Arm the backstop so the queue
        // still drains if no upload task was created (e.g. auth unavailable) or a
        // created task later fails with no app-lifecycle wakeup to retry.
        await scheduleBackstop()
    }

    func handleTaskCompletion(
        taskDescription: String?,
        statusCode: Int?,
        error: Error?,
    ) async {
        guard let descriptor = ProgressUploadDescriptor(taskDescription: taskDescription) else {
            return
        }

        await FilesystemActor.shared.removeProgressUploadSpoolFile(
            bookID: descriptor.bookID,
            token: descriptor.spoolToken,
        )

        if let error {
            if (error as NSError).code == NSURLErrorCancelled {
                debugLog(
                    "[ProgressUploadManager] Upload superseded for \(descriptor.bookID)"
                )
            } else {
                debugLog(
                    "[ProgressUploadManager] Upload failed for \(descriptor.bookID), leaving queued: \(error)"
                )
                await scheduleBackstop()
            }
            return
        }

        switch statusCode {
            case 204:
                await ProgressSyncActor.shared.confirmUpload(
                    bookID: descriptor.bookID,
                    timestamp: Double(descriptor.timestampMillis),
                )
                debugLog("[ProgressUploadManager] Upload confirmed for \(descriptor.bookID)")
            case 401:
                debugLog(
                    "[ProgressUploadManager] Upload unauthorized for \(descriptor.bookID); next enqueue re-authenticates"
                )
                await scheduleBackstop()
            case 404, 409:
                // Same permanent-failure semantics as sendProgressToServer: the queue
                // entry stays and foreground reconciliation against server positions
                // resolves it. No backstop: a retry cannot change a permanent rejection.
                debugLog(
                    "[ProgressUploadManager] Upload rejected (\(statusCode ?? 0)) for \(descriptor.bookID)"
                )
            default:
                debugLog(
                    "[ProgressUploadManager] Upload for \(descriptor.bookID) completed with status \(statusCode.map(String.init) ?? "unknown")"
                )
                await scheduleBackstop()
        }
    }

    private func scheduleBackstop() async {
        await backstopScheduler?()
    }

    public func handleBackgroundSessionEvents(completionHandler: @escaping @Sendable () -> Void)
        async
    {
        _ = uploadSession
        backgroundCompletionHandler = completionHandler
    }

    func handleBackgroundSessionFinished() {
        if let handler = backgroundCompletionHandler {
            backgroundCompletionHandler = nil
            DispatchQueue.main.async {
                handler()
            }
        }
    }

    #if os(Windows)
    @_optimize(none)
    #endif
    private func outstandingTasks() async -> [URLSessionTask] {
        await withCheckedContinuation {
            (continuation: CheckedContinuation<[URLSessionTask], Never>) in
            uploadSession.getTasksWithCompletionHandler { dataTasks, uploadTasks, downloadTasks in
                continuation.resume(
                    returning: dataTasks as [URLSessionTask] + uploadTasks + downloadTasks
                )
            }
        }
    }
}

final class ProgressUploadDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?,
    ) {
        let description = task.taskDescription
        let statusCode = (task.response as? HTTPURLResponse)?.statusCode
        Task {
            await ProgressUploadManager.shared.handleTaskCompletion(
                taskDescription: description,
                statusCode: statusCode,
                error: error,
            )
        }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        debugLog("[ProgressUploadManager] Background session finished events")
        Task {
            await ProgressUploadManager.shared.handleBackgroundSessionFinished()
        }
    }
}
