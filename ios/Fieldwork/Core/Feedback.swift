import AVFoundation
import UIKit

// Sound and haptics for the same moments as the web (src/lib/client/sound.ts):
// soft mallet tones on one pentatonic scale, synthesised the same way (a sine
// fundamental plus a faster overtone, a gentle low-pass and a short room
// delay). Sound is off unless the learner turns it on (You → Sound);
// haptics follow the system setting.
enum Cue: Sendable { case solid, partial, complete, levelup, tap, missed }

@MainActor
final class Feedback {
    static let shared = Feedback()
    var soundOn = false

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var buffers: [String: AVAudioPCMBuffer] = [:]
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!

    func play(_ cue: Cue) {
        haptic(cue)
        guard soundOn, cue != .missed else { return }
        start()
        guard engine.isRunning, let buffer = buffer(for: cue) else { return }
        player.scheduleBuffer(buffer, at: nil, options: .interrupts)
        if !player.isPlaying { player.play() }
    }

    private func haptic(_ cue: Cue) {
        switch cue {
        case .tap: UISelectionFeedbackGenerator().selectionChanged()
        case .solid: UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .partial: UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.7)
        case .missed: UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case .complete, .levelup: UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    private func start() {
        guard !engine.isRunning else { return }
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        if player.engine == nil {
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: format)
        }
        try? engine.start()
    }

    // C major pentatonic, from C5.
    private enum N {
        static let C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880.0, C6 = 1046.5, E6 = 1318.51, G6 = 1567.98
    }

    private struct Strike { let freq: Double; let at: Double; var gain = 0.16; var decay = 0.9; var bell = false }

    private func buffer(for cue: Cue) -> AVAudioPCMBuffer? {
        let key = "\(cue)"
        if let b = buffers[key] { return b }
        let strikes: [Strike]
        switch cue {
        case .tap: strikes = [Strike(freq: N.G6, at: 0, gain: 0.05, decay: 0.12)]
        case .solid: strikes = [Strike(freq: N.E5 * 2, at: 0, gain: 0.11, decay: 0.5), Strike(freq: N.G6, at: 0.075, gain: 0.1, decay: 0.7)]
        case .partial: strikes = [Strike(freq: N.A5, at: 0, gain: 0.09, decay: 0.55)]
        case .complete:
            strikes = [N.C5, N.E5, N.G5, N.C6].enumerated().map { Strike(freq: $1, at: Double($0) * 0.09, gain: 0.13 - Double($0) * 0.012, decay: 1.4, bell: true) }
                + [Strike(freq: N.E6, at: 0.42, gain: 0.05, decay: 1.6, bell: true)]
        case .levelup: strikes = [N.G5, N.C6, N.E6, N.G6].enumerated().map { Strike(freq: $1, at: Double($0) * 0.07, gain: 0.1, decay: 1.1, bell: true) }
        case .missed: return nil
        }
        let rate = format.sampleRate
        let length = (strikes.map { $0.at + $0.decay }.max() ?? 1) + 0.6
        let frames = AVAudioFrameCount(length * rate)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames), let out = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = frames
        var dry = [Double](repeating: 0, count: Int(frames))
        for s in strikes {
            let partials: [(Double, Double, Double)] = s.bell
                ? [(1, 1, s.decay), (2.76, 0.18, s.decay * 0.45), (5.4, 0.05, s.decay * 0.25)]
                : [(1, 1, s.decay), (3.93, 0.12, s.decay * 0.3)]
            let start = Int(s.at * rate)
            for (ratio, level, len) in partials {
                let count = Int(len * rate)
                let k = log(0.0001) / Double(count)
                for i in 0..<count where start + i < dry.count {
                    let t = Double(i) / rate
                    let attack = min(1, t / 0.006)
                    dry[start + i] += sin(2 * .pi * s.freq * ratio * t) * s.gain * level * attack * exp(k * Double(i))
                }
            }
        }
        // Low-pass (one pole at ~4.2 kHz), then a 110 ms feedback delay mixed
        // in quietly, then the master level.
        let alpha = 1 - exp(-2 * .pi * 4200 / rate)
        var lp = 0.0
        let delay = Int(0.11 * rate)
        var line = [Double](repeating: 0, count: Int(frames))
        for i in 0..<Int(frames) {
            lp += alpha * (dry[i] - lp)
            let echoed = i >= delay ? line[i - delay] : 0
            line[i] = lp + echoed * 0.22
            out[i] = Float((lp + echoed * 0.16) * 0.55)
        }
        buffers[key] = buffer
        return buffer
    }
}
