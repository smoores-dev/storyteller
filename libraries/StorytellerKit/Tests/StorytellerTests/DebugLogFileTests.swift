import Foundation
import Testing

@testable import StorytellerKit

@Test func repeatedMessagesCollapseIntoOneBufferEntry() {
    let buffer = DebugLogBuffer(isolatedVerbose: false)

    _ = buffer.appendCollapsing("t1 spam", body: "spam")
    _ = buffer.appendCollapsing("t2 spam", body: "spam")
    _ = buffer.appendCollapsing("t3 spam", body: "spam")

    let messages = buffer.getMessages()
    #expect(messages.count == 1)
    #expect(messages[0].contains("[x3]"))
}

@Test func endingARunRecordsItsCountInTheDurableLog() {
    let buffer = DebugLogBuffer(isolatedVerbose: false)

    #expect(buffer.appendCollapsing("t1 spam", body: "spam").count == 1)
    #expect(buffer.appendCollapsing("t2 spam", body: "spam").isEmpty)
    #expect(buffer.appendCollapsing("t3 spam", body: "spam").isEmpty)

    let closing = buffer.appendCollapsing("t4 other", body: "other")
    #expect(closing.count == 2)
    #expect(closing[0].contains("repeated 3 times"))
    #expect(closing[1].contains("other"))

    #expect(buffer.getMessages().count == 2)
}

@Test func distinctMessagesAreNotCollapsed() {
    let buffer = DebugLogBuffer(isolatedVerbose: false)

    _ = buffer.appendCollapsing("t1 a", body: "a")
    _ = buffer.appendCollapsing("t2 b", body: "b")
    _ = buffer.appendCollapsing("t3 a", body: "a")

    #expect(buffer.getMessages().count == 3)
}
