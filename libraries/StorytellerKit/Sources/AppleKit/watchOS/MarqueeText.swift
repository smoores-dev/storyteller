#if os(watchOS)
import SwiftUI
import UIKit

struct MarqueeText: View {
    let text: String
    var font: Font = .caption

    @State private var isTruncated = false
    @State private var containerWidth: CGFloat = 0
    @State private var textWidth: CGFloat = 0
    @State private var offset: CGFloat = 0
    @State private var animationTask: Task<Void, Never>?

    private let scrollSpeed: Double = 25
    private let pauseDuration: Double = 1.5

    var body: some View {
        Group {
            if isTruncated && containerWidth > 0 {
                Text(text)
                    .font(font)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .background(
                        GeometryReader { geo in
                            Color.clear.onAppear {
                                textWidth = geo.size.width
                                startScrolling()
                            }
                        }
                    )
                    .offset(x: offset)
                    .frame(width: containerWidth, alignment: .leading)
                    .clipped()
            } else {
                Text(text)
                    .font(font)
                    .lineLimit(2)
            }
        }
        .overlay(
            GeometryReader { geo in
                Color.clear
                    .onAppear {
                        containerWidth = geo.size.width
                        checkTruncation()
                    }
            }
        )
        .onDisappear {
            animationTask?.cancel()
            animationTask = nil
        }
    }

    private func checkTruncation() {
        guard containerWidth > 0 else { return }

        let testFont: UIFont
        switch font {
            case .caption: testFont = .preferredFont(forTextStyle: .caption1)
            case .caption2: testFont = .preferredFont(forTextStyle: .caption2)
            case .headline: testFont = .preferredFont(forTextStyle: .headline)
            default: testFont = .preferredFont(forTextStyle: .caption1)
        }

        let size = (text as NSString).boundingRect(
            with: CGSize(width: containerWidth, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: testFont],
            context: nil,
        )

        let lineHeight = testFont.lineHeight
        isTruncated = size.height > lineHeight * 2.2
    }

    private func startScrolling() {
        guard textWidth > containerWidth else { return }

        let scrollDistance = textWidth - containerWidth
        let duration = scrollDistance / scrollSpeed

        animationTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(pauseDuration))

            while !Task.isCancelled {
                withAnimation(.linear(duration: duration)) {
                    offset = -scrollDistance
                }

                try? await Task.sleep(for: .seconds(duration + pauseDuration))
                guard !Task.isCancelled else { break }

                withAnimation(.linear(duration: duration)) {
                    offset = 0
                }

                try? await Task.sleep(for: .seconds(duration + pauseDuration))
                guard !Task.isCancelled else { break }
            }
        }
    }
}
#endif
