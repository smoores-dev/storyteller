#if os(iOS) || os(macOS)
import SwiftUI

#if os(iOS)
struct AlphabetScrubber<Item, ID: Hashable>: View {
    let items: [Item]
    let textForItem: (Item) -> String
    let idForItem: (Item) -> ID
    let proxy: ScrollViewProxy

    @State private var isDragging = false
    @State private var currentLetter: Character?

    private let letters: [Character] = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ#")
    private let letterHeight: CGFloat = 14
    private let scrubberWidth: CGFloat = 20

    private var availableLetters: Set<Character> {
        var result = Set<Character>()
        for item in items {
            result.insert(firstLetter(of: textForItem(item)))
        }
        return result
    }

    var body: some View {
        GeometryReader { geometry in
            let totalHeight = geometry.size.height
            let availableHeight = min(totalHeight, letterHeight * CGFloat(letters.count))
            let actualLetterHeight = availableHeight / CGFloat(letters.count)

            HStack {
                Spacer()

                VStack(spacing: 0) {
                    ForEach(letters, id: \.self) { letter in
                        let isAvailable = availableLetters.contains(letter)
                        let isHighlighted = currentLetter == letter && isDragging

                        Text(String(letter))
                            .font(.system(size: 10, weight: isHighlighted ? .bold : .medium))
                            .foregroundStyle(
                                isAvailable ? (isHighlighted ? .primary : .secondary) : .quaternary
                            )
                            .frame(width: scrubberWidth, height: actualLetterHeight)
                    }
                }
                .background(
                    Color.clear
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    isDragging = true
                                    let index = Int(value.location.y / actualLetterHeight)
                                    if index >= 0 && index < letters.count {
                                        let letter = letters[index]
                                        if currentLetter != letter {
                                            currentLetter = letter
                                            if availableLetters.contains(letter) {
                                                scrollToLetter(letter)
                                                UIImpactFeedbackGenerator(style: .light)
                                                    .impactOccurred()
                                            }
                                        }
                                    }
                                }
                                .onEnded { _ in
                                    isDragging = false
                                    currentLetter = nil
                                }
                        )
                )
                .padding(.trailing, 2)
            }
            .frame(maxHeight: .infinity)
        }
    }

    private func firstLetter(of text: String) -> Character {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = trimmed.first?.uppercased().first else {
            return "#"
        }
        return first.isLetter ? first : "#"
    }

    private func scrollToLetter(_ letter: Character) {
        for item in items {
            if firstLetter(of: textForItem(item)) == letter {
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(idForItem(item), anchor: .top)
                }
                break
            }
        }
    }
}
#endif

#endif
