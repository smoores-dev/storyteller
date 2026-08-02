import Foundation
import Testing

@testable import StorytellerKit

struct LiveReadingSyncPacketTests {
    private func makePacket() -> LiveReadingSyncPacket {
        LiveReadingSyncPacket(
            version: 1,
            senderID: "sender-1",
            bookID: BookID(sourceID: "test-source", uuid: "book"),
            sectionIndex: 3,
            entryIndex: 14,
            textId: "para-9",
            textHref: "text/part0003.html",
            playbackRate: 1.25,
            sentAt: 1_700_000_000,
        )
    }

    @Test func roundTripsThroughJSON() throws {
        let packet = makePacket()
        let data = try JSONEncoder().encode(packet)
        let decoded = try JSONDecoder().decode(LiveReadingSyncPacket.self, from: data)
        #expect(decoded.version == packet.version)
        #expect(decoded.senderID == packet.senderID)
        #expect(decoded.bookID == packet.bookID)
        #expect(decoded.sectionIndex == packet.sectionIndex)
        #expect(decoded.entryIndex == packet.entryIndex)
        #expect(decoded.textId == packet.textId)
        #expect(decoded.textHref == packet.textHref)
        #expect(decoded.playbackRate == packet.playbackRate)
        #expect(decoded.sentAt == packet.sentAt)
    }

    @Test func fitsInOneDatagram() throws {
        let data = try JSONEncoder().encode(makePacket())
        #expect(data.count < 1200)
    }

    @Test func syncConfigDecodesWithoutLiveSyncField() throws {
        let json = #"{"progressSyncIntervalSeconds": 15}"#
        let sync = try JSONDecoder().decode(
            StorytellerGlobalConfig.Sync.self,
            from: Data(json.utf8),
        )
        #expect(sync.liveReadingSyncEnabled == false)
    }
}
