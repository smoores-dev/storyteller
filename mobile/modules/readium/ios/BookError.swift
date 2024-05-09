
import Foundation
import R2Shared

enum BookError: LocalizedError {
    case publicationIsNotValid
    case bookNotFound
    case bookDeletionFailed(Error?)
    case importFailed(Error)
    case openFailed(Error)
    case downloadFailed(Error)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .publicationIsNotValid:
            return NSLocalizedString("book_error_publicationIsNotValid", comment: "Error message used when trying to import a publication that is not valid")
        case .bookNotFound:
            return NSLocalizedString("book_error_bookNotFound", comment: "Error message used when trying to open a book whose file is not found")
        case let .importFailed(error):
            return String(format: NSLocalizedString("book_error_importFailed", comment: "Error message used when a low-level error occured while importing a publication"), error.localizedDescription)
        case let .openFailed(error):
            return String(format: NSLocalizedString("book_error_openFailed", comment: "Error message used when a low-level error occured while opening a publication"), error.localizedDescription)
        case let .downloadFailed(error):
            return String(format: NSLocalizedString("book_error_downloadFailed", comment: "Error message when the download of a publication failed"), error.localizedDescription)
        default:
            return nil
        }
    }
}
