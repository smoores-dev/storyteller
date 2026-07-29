import Foundation
import Testing

@testable import StorytellerKit

private func decode<T: Decodable>(_ type: T.Type, from json: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
}

@Test func userPreferencesDecodeIgnoresUnknownKeysAndBadValues() throws {
    let json = """
        {
          "defaultView": "table",
          "colorMode": "colorful",
          "colorIntensity": 0.4,
          "gridCardSize": "not-a-real-size",
          "ratingIcon": "heart",
          "bookDetail3dView": 2,
          "accentColor": "#ff8800",
          "ratingDimensions": [
            { "id": "plot", "label": "Plot" },
            { "id": "vibes", "label": "Vibes" }
          ],
          "layoutAnimations": false,
          "someFutureKey": { "nested": [1, 2, 3] },
          "another_unknown_key": true
        }
        """
    let preferences = try decode(ServerUserPreferences.self, from: json)
    #expect(preferences.defaultView == .table)
    #expect(preferences.colorMode == .full)
    #expect(preferences.colorIntensity == 0.4)
    #expect(preferences.gridCardSize == nil)
    #expect(preferences.ratingIcon == .heart)
    #expect(preferences.bookDetail3dView == 2)
    #expect(preferences.accentColor == "#ff8800")
    #expect(preferences.ratingDimensions == [
        RatingDimension(id: "plot", label: "Plot"),
        RatingDimension(id: "vibes", label: "Vibes"),
    ])
    #expect(preferences.layoutAnimations == false)
    #expect(preferences.locale == nil)
    #expect(preferences.defaultStatusUuid == nil)
    #expect(preferences.animatePanelOpen == nil)
}

@Test func userPreferencesDecodeFromEmptyObject() throws {
    let preferences = try decode(ServerUserPreferences.self, from: "{}")
    #expect(preferences == ServerUserPreferences())
}
