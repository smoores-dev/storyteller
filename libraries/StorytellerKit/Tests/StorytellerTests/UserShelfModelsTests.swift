import Foundation
import Testing

@testable import StorytellerKit

private func decode<T: Decodable>(_ type: T.Type, from json: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
}

private func encodeToJSONObject(_ value: some Encodable) throws -> [String: Any] {
    let data = try JSONEncoder().encode(value)
    let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    return try #require(object)
}

@Test func shelfDecodesFullPayload() throws {
    let json = """
        {
          "uuid": "shelf-1",
          "userId": "u-1",
          "name": "Space Operas",
          "description": "Big ships",
          "filter": {
            "and": [
              { "field": "tag", "operator": "is", "value": "sci_fi" }
            ]
          },
          "orderBy": "position",
          "orderDirection": "asc",
          "limitCount": 25,
          "icon": "rocket",
          "color": "#a1b2c3",
          "createdAt": "2026-06-30 09:00:00",
          "updatedAt": "2026-07-01 10:00:00",
          "books": [
            { "bookUuid": "b-1", "position": 0 },
            { "bookUuid": "b-2", "position": 1 }
          ]
        }
        """
    let shelf = try decode(UserShelf.self, from: json)
    #expect(shelf.uuid == "shelf-1")
    #expect(shelf.name == "Space Operas")
    #expect(shelf.description == "Big ships")
    #expect(shelf.orderBy == "position")
    #expect(shelf.orderDirection == "asc")
    #expect(shelf.limitCount == 25)
    #expect(shelf.icon == "rocket")
    #expect(shelf.color == "#a1b2c3")
    #expect(shelf.books == [
        UserShelfBook(bookUuid: "b-1", position: 0),
        UserShelfBook(bookUuid: "b-2", position: 1),
    ])

    let condition = try #require(
        shelf.filter?.objectValue?["and"]?.arrayValue?.first?.objectValue
    )
    #expect(condition["value"] == .string("sci_fi"))
}

@Test func shelfDecodesMinimalPayloadWithDefaults() throws {
    let json = """
        {
          "uuid": "shelf-2",
          "name": "Bare",
          "description": null,
          "filter": null,
          "limitCount": null,
          "icon": null,
          "color": null
        }
        """
    let shelf = try decode(UserShelf.self, from: json)
    #expect(shelf.uuid == "shelf-2")
    #expect(shelf.description == nil)
    #expect(shelf.filter == nil)
    #expect(shelf.orderBy == "createdAt")
    #expect(shelf.orderDirection == "desc")
    #expect(shelf.limitCount == nil)
    #expect(shelf.books.isEmpty)
}

@Test func shelfUpdatePayloadEncodesPatchSemantics() throws {
    var payload = UserShelfUpdatePayload()
    payload.name = "Renamed"
    payload.description = .null
    payload.books = ["b-1", "b-2"]
    let object = try encodeToJSONObject(payload)
    #expect(object.keys.sorted() == ["books", "description", "name"])
    #expect(object["description"] is NSNull)
    #expect(object["books"] as? [String] == ["b-1", "b-2"])
}
