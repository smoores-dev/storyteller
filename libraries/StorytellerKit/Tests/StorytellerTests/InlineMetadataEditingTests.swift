import Testing

@testable import StorytellerAppleKit
@testable import StorytellerKit

@Test func publicationDateWireValueExpandsBareYear() {
    #expect(
        InlineMetadataParsing.publicationDateWireValue("2020") == "2020-01-01T00:00:00.000Z"
    )
    #expect(
        InlineMetadataParsing.publicationDateWireValue(" 1999 ") == "1999-01-01T00:00:00.000Z"
    )
}

@Test func publicationDateWireValuePreservesFullDate() {
    #expect(
        InlineMetadataParsing.publicationDateWireValue("2020-01-15")
            == "2020-01-15T00:00:00.000Z"
    )
    #expect(
        InlineMetadataParsing.publicationDateWireValue("2024-02-29")
            == "2024-02-29T00:00:00.000Z"
    )
}

@Test func publicationDateWireValueRejectsInvalidInput() {
    #expect(InlineMetadataParsing.publicationDateWireValue("") == nil)
    #expect(InlineMetadataParsing.publicationDateWireValue("banana") == nil)
    #expect(InlineMetadataParsing.publicationDateWireValue("20") == nil)
    #expect(InlineMetadataParsing.publicationDateWireValue("2020-1-5") == nil)
    #expect(InlineMetadataParsing.publicationDateWireValue("2020-13-01") == nil)
    #expect(InlineMetadataParsing.publicationDateWireValue("2023-02-29") == nil)
    #expect(InlineMetadataParsing.publicationDateWireValue("2020-01-15T00:00:00.000Z") == nil)
}

@Test func nameListSplitsTrimsAndDropsEmpties() {
    #expect(
        InlineMetadataParsing.nameList(from: " Ann Leckie , John Scalzi ,, ")
            == ["Ann Leckie", "John Scalzi"]
    )
    #expect(InlineMetadataParsing.nameList(from: "") == [])
    #expect(InlineMetadataParsing.nameList(from: " , ,") == [])
    #expect(InlineMetadataParsing.nameList(from: "solo") == ["solo"])
}

@Test func positionStringDropsWholeNumberFraction() {
    #expect(InlineMetadataParsing.positionString(nil as Float?) == "")
    #expect(InlineMetadataParsing.positionString(3 as Float) == "3")
    #expect(InlineMetadataParsing.positionString(2.5 as Float) == "2.5")
    #expect(InlineMetadataParsing.positionString(0.1 as Float) == "0.1")
}
