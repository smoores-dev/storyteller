import StorytellerKit
import SwiftUI

private struct LibraryRefreshDemand: ViewModifier {
    let enabled: Bool
    let model: MediaViewModel?
    @Environment(\.scenePhase) private var scenePhase
    @State private var owner = UUID()
    @State private var presented = false

    func body(content: Content) -> some View {
        content
            .onAppear {
                presented = true
                report()
            }
            .onDisappear {
                presented = false
                report()
            }
            .onChange(of: enabled && scenePhase == .active) { _, _ in report() }
    }

    private func report() {
        Task { @MainActor in
            let needed = presented && enabled && scenePhase == .active
            if let model {
                await model.setLibraryPresentation(needed, owner: owner)
            } else {
                await BookServiceActor.shared.setLibraryRefreshDemand(needed, owner: owner)
            }
        }
    }
}

extension View {
    func libraryRefreshDemand(_ enabled: Bool = true, model: MediaViewModel? = nil) -> some View {
        modifier(LibraryRefreshDemand(enabled: enabled, model: model))
    }
}
