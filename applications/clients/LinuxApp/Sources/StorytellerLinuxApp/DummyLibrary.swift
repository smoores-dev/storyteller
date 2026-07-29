import Foundation
import StorytellerKit

enum DummyLibrary {
    static let books: [BookMetadata] = {
        let json = """
            [
                {"uuid": "1", "title": "Book A", "authors": [{"name": "Author A"}]},
                {"uuid": "2", "title": "Book B", "authors": [{"name": "Author B"}]},
                {"uuid": "3", "title": "Book C", "authors": [{"name": "Author C"}]},
                {"uuid": "4", "title": "Book D", "authors": [{"name": "Author D"}]},
                {"uuid": "5", "title": "Book E", "authors": [{"name": "Author E"}]},
                {"uuid": "6", "title": "Book F", "authors": [{"name": "Author F"}]},
                {"uuid": "7", "title": "Book G", "authors": [{"name": "Author G"}]},
                {"uuid": "8", "title": "Book H", "authors": [{"name": "Author H"}]},
                {"uuid": "9", "title": "Book I", "authors": [{"name": "Author I"}]},
                {"uuid": "10", "title": "Book J", "authors": [{"name": "Author J"}]},
                {"uuid": "11", "title": "Book K", "authors": [{"name": "Author K"}]},
                {"uuid": "12", "title": "Book L", "authors": [{"name": "Author L"}]}
            ]
            """
        let data = Data(json.utf8)
        return (try? JSONDecoder().decode([BookMetadata].self, from: data)) ?? []
    }()
}
