#if os(macOS)
import AVFoundation
import Foundation
import StorytellerKit

public enum MP3ToM4BConverterState: Equatable {
    case idle
    case processing
    case completed(URL)
    case error(String)
}

public struct MP3FileInfo: Identifiable {
    public let id = UUID()
    public let url: URL
    public var bitrate: Int?
    public var chapterName: String

    public var filename: String { url.deletingPathExtension().lastPathComponent }

    init(url: URL, bitrate: Int? = nil, chapterName: String? = nil) {
        self.url = url
        self.bitrate = bitrate
        self.chapterName = chapterName ?? url.deletingPathExtension().lastPathComponent
    }
}

@Observable
@MainActor
public final class MP3ToM4BConverterViewModel {
    public var files: [MP3FileInfo] = []
    public var outputURL: URL?
    public var bookTitle: String = ""
    public var bookAuthor: String = ""
    public var bitrate: Int = 128000
    public private(set) var detectedBitrate: Int?
    public private(set) var extractedCommonName: String?

    public private(set) var state: MP3ToM4BConverterState = .idle
    public private(set) var currentMessage: String = ""
    public private(set) var overallProgress: Double = 0.0

    private var conversionTask: Task<Void, Never>?

    public static let bitrateOptions = [64, 96, 128, 160, 192, 256, 320]

    public init() {}

    public var canStart: Bool {
        !files.isEmpty && outputURL != nil && state != .processing
    }

    public var suggestedFilename: String {
        if !bookTitle.isEmpty {
            return "\(bookTitle).m4b"
        } else if let common = extractedCommonName, !common.isEmpty {
            return common + ".m4b"
        } else if let first = files.first {
            return first.filename + ".m4b"
        }
        return "audiobook.m4b"
    }

    public func addFiles(_ urls: [URL]) {
        let existingURLs = Set(files.map(\.url))
        let newURLs = urls.filter { url in
            url.pathExtension.lowercased() == "mp3" && !existingURLs.contains(url)
        }

        for url in newURLs {
            files.append(MP3FileInfo(url: url, bitrate: nil))
        }
        sortFiles()
        updateChapterNames()

        Task { await detectAllBitrates() }
    }

    private func updateChapterNames() {
        guard files.count > 1 else {
            extractedCommonName = nil
            return
        }

        let names = files.map(\.filename)
        let commonPrefix = longestCommonPrefix(names)
        let commonSuffix = longestCommonSuffix(names)

        let combined = cleanupName(commonPrefix + commonSuffix)
        extractedCommonName = combined.isEmpty ? nil : combined

        if bookTitle.isEmpty, let common = extractedCommonName {
            bookTitle = common
        }

        for i in files.indices {
            var name = files[i].filename
            if !commonPrefix.isEmpty && name.hasPrefix(commonPrefix) {
                name = String(name.dropFirst(commonPrefix.count))
            }
            if !commonSuffix.isEmpty && name.hasSuffix(commonSuffix) {
                name = String(name.dropLast(commonSuffix.count))
            }
            let trimmed = name.trimmingCharacters(in: .whitespaces)
            files[i].chapterName = trimmed.isEmpty ? files[i].filename : trimmed
        }
    }

    private func cleanupName(_ name: String) -> String {
        let separators = CharacterSet(charactersIn: " -_.,;:")
        var result = name.trimmingCharacters(in: separators.union(.whitespacesAndNewlines))
        while let last = result.last, separators.contains(last.unicodeScalars.first!) {
            result.removeLast()
        }
        while let first = result.first, separators.contains(first.unicodeScalars.first!) {
            result.removeFirst()
        }
        return result
    }

    private func longestCommonPrefix(_ strings: [String]) -> String {
        guard let first = strings.first, !first.isEmpty else { return "" }

        var prefix = ""
        for (i, char) in first.enumerated() {
            let candidate = String(first.prefix(i + 1))
            if strings.allSatisfy({ $0.hasPrefix(candidate) }) {
                prefix = candidate
            } else {
                break
            }
        }

        if prefix == first && strings.allSatisfy({ $0 == first }) {
            return ""
        }

        return prefix
    }

    private func longestCommonSuffix(_ strings: [String]) -> String {
        guard let first = strings.first, !first.isEmpty else { return "" }

        var suffix = ""
        for i in 0..<first.count {
            let candidate = String(first.suffix(i + 1))
            if strings.allSatisfy({ $0.hasSuffix(candidate) }) {
                suffix = candidate
            } else {
                break
            }
        }

        if suffix == first && strings.allSatisfy({ $0 == first }) {
            return ""
        }

        return suffix
    }

    private func detectAllBitrates() async {
        for i in files.indices {
            guard files[i].bitrate == nil else { continue }

            let url = files[i].url
            let accessed = url.startAccessingSecurityScopedResource()
            defer { if accessed { url.stopAccessingSecurityScopedResource() } }

            let asset = AVURLAsset(url: url)
            do {
                let tracks = try await asset.loadTracks(withMediaType: .audio)
                if let track = tracks.first {
                    let rate = try await track.load(.estimatedDataRate)
                    let kbps = Int(rate / 1000)
                    files[i].bitrate = kbps

                    if detectedBitrate == nil {
                        let rounded =
                            Self.bitrateOptions.min(by: { abs($0 - kbps) < abs($1 - kbps) }) ?? 128
                        detectedBitrate = rounded
                        bitrate = rounded * 1000
                    }
                }
            } catch {
                debugLog(
                    "[MP3ToM4B] Failed to detect bitrate for \(url.lastPathComponent): \(error)"
                )
            }
        }
    }

    public func removeFile(id: UUID) {
        files.removeAll { $0.id == id }
    }

    public func sortFiles() {
        files.sort {
            $0.url.lastPathComponent.localizedStandardCompare($1.url.lastPathComponent)
                == .orderedAscending
        }
    }

    public func clearFiles() {
        files.removeAll()
        detectedBitrate = nil
        extractedCommonName = nil
    }

    public func startConversion() {
        guard canStart else { return }
        guard let outputURL else { return }

        state = .processing
        currentMessage = "Starting conversion..."
        overallProgress = 0.0

        let fileInfos = files.map { (url: $0.url, chapterName: $0.chapterName) }
        let title = bookTitle
        let author = bookAuthor
        let bitrateValue = bitrate

        conversionTask = Task.detached { [weak self] in
            await self?.runConversion(
                fileInfos: fileInfos,
                outputURL: outputURL,
                title: title,
                author: author,
                bitrate: bitrateValue,
            )
        }
    }

    public func cancel() {
        conversionTask?.cancel()
        conversionTask = nil
        state = .idle
    }

    private nonisolated func runConversion(
        fileInfos: [(url: URL, chapterName: String)],
        outputURL: URL,
        title: String,
        author: String,
        bitrate: Int,
    ) async {
        var accessedURLs: [(URL, Bool)] = []
        defer {
            for (url, accessed) in accessedURLs {
                if accessed { url.stopAccessingSecurityScopedResource() }
            }
        }

        for info in fileInfos {
            let accessed = info.url.startAccessingSecurityScopedResource()
            accessedURLs.append((info.url, accessed))
        }
        let outputAccess = outputURL.startAccessingSecurityScopedResource()
        accessedURLs.append((outputURL, outputAccess))

        await updateProgress(message: "Analyzing audio files...", progress: 0.02)

        do {
            var chapters: [(startTime: CMTime, duration: CMTime, title: String)] = []
            var totalDuration = CMTime.zero
            var audioSettings: [String: Any]?
            var channelLayout: Data?

            for (index, info) in fileInfos.enumerated() {
                if Task.isCancelled {
                    await MainActor.run { self.state = .idle }
                    return
                }

                let displayName = info.chapterName
                await updateProgress(
                    message: "Analyzing: \(displayName)",
                    progress: 0.02 + (Double(index) / Double(fileInfos.count)) * 0.08,
                )

                let asset = AVURLAsset(url: info.url)
                let duration = try await asset.load(.duration)
                let tracks = try await asset.loadTracks(withMediaType: .audio)

                guard let track = tracks.first else {
                    await setError("No audio track in \(info.url.lastPathComponent)")
                    return
                }

                if audioSettings == nil {
                    let formatDescriptions = try await track.load(.formatDescriptions)
                    if let formatDesc = formatDescriptions.first {
                        let basicDesc = CMAudioFormatDescriptionGetStreamBasicDescription(
                            formatDesc
                        )?.pointee
                        audioSettings = [
                            AVFormatIDKey: kAudioFormatMPEG4AAC,
                            AVSampleRateKey: basicDesc?.mSampleRate ?? 44100.0,
                            AVNumberOfChannelsKey: basicDesc?.mChannelsPerFrame ?? 2,
                            AVEncoderBitRateKey: bitrate,
                        ]

                        if let layout = CMAudioFormatDescriptionGetChannelLayout(
                            formatDesc,
                            sizeOut: nil,
                        ) {
                            channelLayout = Data(
                                bytes: layout,
                                count: MemoryLayout<AudioChannelLayout>.size,
                            )
                        }
                    }
                }

                chapters.append(
                    (startTime: totalDuration, duration: duration, title: info.chapterName)
                )
                totalDuration = CMTimeAdd(totalDuration, duration)
            }

            guard let settings = audioSettings else {
                await setError("Could not determine audio format")
                return
            }

            if FileManager.default.fileExists(atPath: outputURL.path) {
                try FileManager.default.removeItem(at: outputURL)
            }

            let writer = try AVAssetWriter(outputURL: outputURL, fileType: .m4a)

            var outputSettings = settings
            if let layout = channelLayout {
                outputSettings[AVChannelLayoutKey] = layout
            }

            let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: outputSettings)
            audioInput.expectsMediaDataInRealTime = false
            writer.add(audioInput)

            writer.metadata = createMetadata(title: title, author: author)

            guard writer.startWriting() else {
                await setError(
                    "Failed to start writing: \(writer.error?.localizedDescription ?? "unknown")"
                )
                return
            }

            writer.startSession(atSourceTime: .zero)

            var currentTime = CMTime.zero

            for (index, info) in fileInfos.enumerated() {
                if Task.isCancelled {
                    writer.cancelWriting()
                    try? FileManager.default.removeItem(at: outputURL)
                    await MainActor.run { self.state = .idle }
                    return
                }

                let displayName = info.chapterName
                let baseProgress = 0.15 + (Double(index) / Double(fileInfos.count)) * 0.80
                await updateProgress(message: "Encoding: \(displayName)", progress: baseProgress)
                debugLog("[MP3ToM4B] Encoding \(displayName)")

                let asset = AVURLAsset(url: info.url)
                let duration = try await asset.load(.duration)

                guard let reader = try? AVAssetReader(asset: asset) else {
                    await setError("Failed to create reader for \(info.url.lastPathComponent)")
                    return
                }

                let tracks = try await asset.loadTracks(withMediaType: .audio)
                guard let track = tracks.first else {
                    await setError("No audio track in \(info.url.lastPathComponent)")
                    return
                }

                let readerOutput = AVAssetReaderTrackOutput(
                    track: track,
                    outputSettings: [
                        AVFormatIDKey: kAudioFormatLinearPCM,
                        AVLinearPCMBitDepthKey: 32,
                        AVLinearPCMIsFloatKey: true,
                        AVLinearPCMIsNonInterleaved: false,
                    ],
                )
                reader.add(readerOutput)

                guard reader.startReading() else {
                    await setError(
                        "Failed to start reading \(info.url.lastPathComponent): \(reader.error?.localizedDescription ?? "unknown")"
                    )
                    return
                }

                var samplesWritten = 0
                while let sampleBuffer = readerOutput.copyNextSampleBuffer() {
                    if Task.isCancelled {
                        reader.cancelReading()
                        writer.cancelWriting()
                        try? FileManager.default.removeItem(at: outputURL)
                        await MainActor.run { self.state = .idle }
                        return
                    }

                    let adjustedBuffer = adjustSampleBufferTiming(
                        sampleBuffer,
                        offset: currentTime,
                    )

                    while !audioInput.isReadyForMoreMediaData {
                        try await Task.sleep(nanoseconds: 10_000_000)
                    }

                    if let adjusted = adjustedBuffer {
                        audioInput.append(adjusted)
                        samplesWritten += 1
                    }
                }

                debugLog("[MP3ToM4B] Wrote \(samplesWritten) samples for \(displayName)")

                if reader.status == .failed {
                    await setError(
                        "Failed to read \(info.url.lastPathComponent): \(reader.error?.localizedDescription ?? "unknown")"
                    )
                    return
                }

                currentTime = CMTimeAdd(currentTime, duration)
            }

            audioInput.markAsFinished()

            await updateProgress(message: "Finalizing...", progress: 0.98)

            await writer.finishWriting()

            if writer.status == .failed {
                await setError(
                    "Failed to write: \(writer.error?.localizedDescription ?? "unknown")"
                )
                return
            }

            if !chapters.isEmpty {
                await updateProgress(message: "Writing chapters...", progress: 0.99)
                try writeChplAtom(to: outputURL, chapters: chapters)
                debugLog("[MP3ToM4B] Wrote \(chapters.count) chapters via chpl atom")
            }

            await updateProgress(message: "Complete!", progress: 1.0)
            await MainActor.run {
                self.state = .completed(outputURL)
            }

        } catch {
            await setError(error.localizedDescription)
        }
    }

    private nonisolated func writeChplAtom(
        to url: URL,
        chapters: [(startTime: CMTime, duration: CMTime, title: String)],
    ) throws {
        var data = try Data(contentsOf: url)

        debugLog("[MP3ToM4B] File size: \(data.count) bytes")
        var debugPos = 0
        while debugPos + 8 <= data.count {
            var sz = readUInt32(from: data, at: debugPos)
            let tp = String(data: data[debugPos + 4..<debugPos + 8], encoding: .ascii) ?? "????"
            if sz == 1 && debugPos + 16 <= data.count {
                sz = Int(readUInt64(from: data, at: debugPos + 8))
            }
            debugLog("[MP3ToM4B] Atom '\(tp)' at \(debugPos), size \(sz)")
            if sz < 8 { break }
            debugPos += sz
        }

        guard let moovRange = findAtom("moov", in: data, start: 0) else {
            throw NSError(
                domain: "MP3ToM4B",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "No moov atom found"],
            )
        }

        var chpl = Data()
        chpl.append(UInt8(0x01))
        chpl.append(contentsOf: [0x00, 0x00, 0x00])
        chpl.append(UInt8(0x00))
        chpl.append(contentsOf: uint32ToBytes(UInt32(chapters.count)))

        for chapter in chapters {
            let timeIn100ns = UInt64(CMTimeGetSeconds(chapter.startTime) * 10_000_000)
            chpl.append(contentsOf: uint64ToBytes(timeIn100ns))

            let titleData = chapter.title.data(using: .utf8) ?? Data()
            chpl.append(UInt8(min(titleData.count, 255)))
            chpl.append(titleData.prefix(255))
        }

        var chplAtom = Data()
        chplAtom.append(contentsOf: uint32ToBytes(UInt32(8 + chpl.count)))
        chplAtom.append("chpl".data(using: .ascii)!)
        chplAtom.append(chpl)

        let udtaRange = findAtomInside("udta", in: data, parentRange: moovRange)

        if let udtaRange {
            let insertPos = udtaRange.lowerBound + 8
            data.insert(contentsOf: chplAtom, at: insertPos)
            updateAtomSize(in: &data, at: udtaRange.lowerBound, delta: chplAtom.count)
            updateAtomSize(in: &data, at: moovRange.lowerBound, delta: chplAtom.count)
        } else {
            var udta = Data()
            udta.append(contentsOf: uint32ToBytes(UInt32(8 + chplAtom.count)))
            udta.append("udta".data(using: .ascii)!)
            udta.append(chplAtom)

            let insertPos = moovRange.upperBound
            data.insert(contentsOf: udta, at: insertPos)
            updateAtomSize(in: &data, at: moovRange.lowerBound, delta: udta.count)
        }

        try data.write(to: url)
    }

    private nonisolated func readUInt32(from data: Data, at offset: Int) -> Int {
        guard offset + 4 <= data.count else { return 0 }
        return Int(data[offset]) << 24 | Int(data[offset + 1]) << 16 | Int(data[offset + 2]) << 8
            | Int(data[offset + 3])
    }

    private nonisolated func readUInt64(from data: Data, at offset: Int) -> UInt64 {
        guard offset + 8 <= data.count else { return 0 }
        var result: UInt64 = 0
        for i in 0..<8 {
            result = result << 8 | UInt64(data[offset + i])
        }
        return result
    }

    private nonisolated func uint32ToBytes(_ value: UInt32) -> [UInt8] {
        return [
            UInt8((value >> 24) & 0xFF), UInt8((value >> 16) & 0xFF), UInt8((value >> 8) & 0xFF),
            UInt8(value & 0xFF),
        ]
    }

    private nonisolated func uint64ToBytes(_ value: UInt64) -> [UInt8] {
        return (0..<8).reversed().map { UInt8((value >> ($0 * 8)) & 0xFF) }
    }

    private nonisolated func findAtom(_ type: String, in data: Data, start: Int) -> Range<Int>? {
        var pos = start
        while pos + 8 <= data.count {
            var size = readUInt32(from: data, at: pos)
            let t = String(data: data[pos + 4..<pos + 8], encoding: .ascii)

            if size == 1 && pos + 16 <= data.count {
                size = Int(readUInt64(from: data, at: pos + 8))
            }

            guard size >= 8 else { return nil }
            if t == type { return pos..<(pos + size) }
            pos += size
        }
        return nil
    }

    private nonisolated func findAtomInside(_ type: String, in data: Data, parentRange: Range<Int>)
        -> Range<Int>?
    {
        var pos = parentRange.lowerBound + 8
        while pos + 8 <= parentRange.upperBound {
            let size = readUInt32(from: data, at: pos)
            let t = String(data: data[pos + 4..<pos + 8], encoding: .ascii)
            guard size >= 8 else { return nil }
            if t == type { return pos..<(pos + size) }
            pos += size
        }
        return nil
    }

    private nonisolated func updateAtomSize(in data: inout Data, at offset: Int, delta: Int) {
        let current = readUInt32(from: data, at: offset)
        let new = uint32ToBytes(UInt32(current + delta))
        data.replaceSubrange(offset..<offset + 4, with: new)
    }

    private nonisolated func adjustSampleBufferTiming(
        _ sampleBuffer: CMSampleBuffer,
        offset: CMTime,
    ) -> CMSampleBuffer? {
        var timingInfo = CMSampleTimingInfo()
        CMSampleBufferGetSampleTimingInfo(sampleBuffer, at: 0, timingInfoOut: &timingInfo)

        timingInfo.presentationTimeStamp = CMTimeAdd(timingInfo.presentationTimeStamp, offset)
        if timingInfo.decodeTimeStamp.isValid {
            timingInfo.decodeTimeStamp = CMTimeAdd(timingInfo.decodeTimeStamp, offset)
        }

        var newBuffer: CMSampleBuffer?
        CMSampleBufferCreateCopyWithNewTiming(
            allocator: kCFAllocatorDefault,
            sampleBuffer: sampleBuffer,
            sampleTimingEntryCount: 1,
            sampleTimingArray: &timingInfo,
            sampleBufferOut: &newBuffer,
        )
        return newBuffer
    }

    private nonisolated func createMetadata(title: String, author: String) -> [AVMetadataItem] {
        var items: [AVMetadataItem] = []

        if !title.isEmpty {
            let titleItem = AVMutableMetadataItem()
            titleItem.identifier = .commonIdentifierTitle
            titleItem.value = title as NSString
            titleItem.extendedLanguageTag = "und"
            items.append(titleItem)

            let albumItem = AVMutableMetadataItem()
            albumItem.identifier = .commonIdentifierAlbumName
            albumItem.value = title as NSString
            albumItem.extendedLanguageTag = "und"
            items.append(albumItem)
        }

        if !author.isEmpty {
            let artistItem = AVMutableMetadataItem()
            artistItem.identifier = .commonIdentifierArtist
            artistItem.value = author as NSString
            artistItem.extendedLanguageTag = "und"
            items.append(artistItem)

            let authorItem = AVMutableMetadataItem()
            authorItem.identifier = .commonIdentifierAuthor
            authorItem.value = author as NSString
            authorItem.extendedLanguageTag = "und"
            items.append(authorItem)
        }

        return items
    }

    private nonisolated func updateProgress(message: String, progress: Double) async {
        await MainActor.run {
            self.currentMessage = message
            self.overallProgress = progress
        }
    }

    private nonisolated func setError(_ message: String) async {
        debugLog("[MP3ToM4B] Error: \(message)")
        await MainActor.run {
            self.state = .error(message)
        }
    }
}

#endif
