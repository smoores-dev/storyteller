import Foundation

#if canImport(CoreFoundation)
import CoreFoundation
#endif
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class DownloadManagerDelegate: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    private let queue = DispatchQueue(label: "dev.smoores.storyteller.download-manager-delegate")
    private var taskToDownloadId: [Int: String] = [:]
    private var lastProgressTime: [Int: CFAbsoluteTime] = [:]

    func registerTask(_ task: URLSessionDownloadTask, downloadId: String) {
        queue.sync {
            taskToDownloadId[task.taskIdentifier] = downloadId
        }
    }

    func downloadId(for task: URLSessionTask) -> String? {
        queue.sync {
            taskToDownloadId[task.taskIdentifier] ?? task.taskDescription
        }
    }

    func removeTask(_ task: URLSessionTask) -> String? {
        queue.sync {
            lastProgressTime.removeValue(forKey: task.taskIdentifier)
            return taskToDownloadId.removeValue(forKey: task.taskIdentifier) ?? task.taskDescription
        }
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64,
    ) {
        guard let id = downloadId(for: downloadTask) else { return }

        let now = CFAbsoluteTimeGetCurrent()
        let shouldEmit: Bool = queue.sync {
            let last = lastProgressTime[downloadTask.taskIdentifier] ?? 0
            if now - last >= 0.1 {
                lastProgressTime[downloadTask.taskIdentifier] = now
                return true
            }
            return false
        }
        guard shouldEmit else { return }

        let progress: Double =
            totalBytesExpectedToWrite > 0
            ? Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
            : 0

        Task {
            await DownloadManager.shared.handleProgress(
                downloadId: id,
                receivedBytes: totalBytesWritten,
                expectedBytes: totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : nil,
                progress: progress,
            )
        }
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL,
    ) {
        guard let id = removeTask(downloadTask) else { return }

        if let httpResponse = downloadTask.response as? HTTPURLResponse,
            !(200...299).contains(httpResponse.statusCode)
        {
            try? FileManager.default.removeItem(at: location)
            let statusCode = httpResponse.statusCode
            Task {
                await DownloadManager.shared.handleHTTPError(
                    downloadId: id,
                    statusCode: statusCode,
                )
            }
            return
        }

        let fm = FileManager.default
        let persistentURL = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)

        do {
            if fm.fileExists(atPath: persistentURL.path) {
                try fm.removeItem(at: persistentURL)
            }
            try fm.moveItem(at: location, to: persistentURL)
        } catch {
            debugLog("[DownloadManager] Failed to move downloaded file: \(error)")
            Task {
                await DownloadManager.shared.handleFailure(
                    downloadId: id,
                    error: error,
                    resumeData: nil,
                )
            }
            return
        }

        Task {
            await DownloadManager.shared.handleFileDownloaded(
                downloadId: id,
                tempURL: persistentURL,
            )
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?,
    ) {
        guard let error else { return }
        guard let id = removeTask(task) else { return }

        #if !canImport(Darwin)
        let resumeData: Data? = nil
        #else
        let resumeData = (error as NSError).userInfo[NSURLSessionDownloadTaskResumeData] as? Data
        #endif

        Task {
            await DownloadManager.shared.handleFailure(
                downloadId: id,
                error: error,
                resumeData: resumeData,
            )
        }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        debugLog("[DownloadManager] Background session finished events")
        Task {
            await DownloadManager.shared.handleBackgroundSessionFinished()
        }
    }
}
