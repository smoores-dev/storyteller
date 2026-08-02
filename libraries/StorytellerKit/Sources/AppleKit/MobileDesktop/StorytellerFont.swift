#if os(iOS) || os(macOS)
import StorytellerKit
import SwiftUI

#if canImport(CoreText)
import CoreText
#endif

extension Font {
    static func storytellerTitle(size: CGFloat) -> Font {
        .custom("YoungSerif", size: size)
    }
}

extension Color {
    static let storytellerOrange = Color(
        red: 235.0 / 255.0,
        green: 114.0 / 255.0,
        blue: 47.0 / 255.0,
    )
}

#if canImport(CoreText)
public enum StorytellerFontRegistration {
    nonisolated(unsafe) private static var registered = false

    public static func registerBundledFonts() {
        guard !registered else { return }
        registered = true

        guard let fontsURL = KitResources.fontsDirectory() else {
            return
        }

        let fm = FileManager.default
        guard
            let files = try? fm.contentsOfDirectory(at: fontsURL, includingPropertiesForKeys: nil)
        else { return }

        for file in files where file.pathExtension == "ttf" || file.pathExtension == "otf" {
            CTFontManagerRegisterFontsForURL(file as CFURL, .process, nil)
        }
    }
}
#endif

#if os(macOS)
import AppKit

public enum SidebarSelectionColor {
    nonisolated(unsafe) public static var color: NSColor = NSColor(Color.storytellerOrange)
    nonisolated(unsafe) private static var installed = false

    public static func install() {
        guard !installed else { return }
        installed = true

        let original = class_getInstanceMethod(
            NSTableRowView.self,
            #selector(NSTableRowView.drawSelection(in:)),
        )!
        let swizzled = class_getInstanceMethod(
            NSTableRowView.self,
            #selector(NSTableRowView.st_drawSelection(in:)),
        )!
        method_exchangeImplementations(original, swizzled)
    }

    public static func updateColor(hex: String) {
        let swiftColor = Color(hex: hex) ?? .storytellerOrange
        color = NSColor(swiftColor).withAlphaComponent(0.85)
    }
}

extension NSTableRowView {
    @objc func st_drawSelection(in dirtyRect: NSRect) {
        if selectionHighlightStyle != .none {
            let selectionRect = NSInsetRect(bounds, 2, 2)
            SidebarSelectionColor.color.setFill()
            NSBezierPath(roundedRect: selectionRect, xRadius: 6, yRadius: 6).fill()
        }
    }
}
#endif

#endif
