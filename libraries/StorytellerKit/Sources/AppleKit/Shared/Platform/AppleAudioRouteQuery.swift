import Foundation
import StorytellerKit

#if os(iOS) || os(tvOS) || os(watchOS)
import AVFAudio
#endif

public struct AppleAudioRouteQuery: AudioRouteQuerying {
    public init() {}

    public var isHeadphoneRouteActive: Bool {
        #if os(iOS) || os(tvOS) || os(watchOS)
        let headphonePorts: Set<AVAudioSession.Port> = [
            .headphones, .bluetoothA2DP, .bluetoothHFP, .bluetoothLE,
        ]
        return AVAudioSession.sharedInstance().currentRoute.outputs.contains {
            headphonePorts.contains($0.portType)
        }
        #else
        return false
        #endif
    }
}
