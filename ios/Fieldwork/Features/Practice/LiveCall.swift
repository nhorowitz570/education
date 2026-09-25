import AVFoundation
import Foundation
import Observation
@preconcurrency import WebRTC

// One GPT-Live conversation over WebRTC, as src/components/practice/use-live.ts
// runs it: microphone → peer connection with an `oai-events` data channel →
// SDP offer (ICE gathered, no trickle) sent as JSON to /api/practice/<id>
// {action:'live'} → answer. Audio flows straight to the provider; the server
// conducts the call over its sideband. Leaving always ends the call and
// releases the microphone.
@MainActor @Observable
final class LiveCall: NSObject {
    enum Status: Equatable { case idle, connecting, live, ending, ended, error }

    let practiceId: String
    private(set) var status: Status = .idle
    private(set) var lines: [PracticeLine] = []
    var error: String?
    private(set) var muted = false
    private(set) var elapsed = 0
    private(set) var limit = 0
    // Smoothed speaking levels (0…1) for the orb: the partner and the learner.
    private(set) var levels: (me: Double, them: Double) = (0, 0)

    private static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        return RTCPeerConnectionFactory(encoderFactory: RTCDefaultVideoEncoderFactory(), decoderFactory: RTCDefaultVideoDecoderFactory())
    }()

    private var peer: RTCPeerConnection?
    private var channel: RTCDataChannel?
    private var mic: RTCAudioTrack?
    private var voiceId = ""
    private var started: Date?
    private var usage: Double = 0
    private var disposed = false
    private var beating = false
    private var closed: CheckedContinuation<Void, Never>?
    private var gathered: CheckedContinuation<Void, Never>?
    private var ticker: Task<Void, Never>?

    init(practiceId: String) { self.practiceId = practiceId }

    func start() async {
        disposed = false
        error = nil
        lines = []
        #if DEBUG
        if Demo.on { return simulate() }
        #endif
        status = .connecting
        do {
            guard await AVAudioApplication.requestRecordPermission() else {
                throw Failure("Microphone access is off. Allow it in Settings → Fieldwork, or practise in text.")
            }
            configureAudio()
            if disposed { return release() }
            let config = RTCConfiguration()
            config.sdpSemantics = .unifiedPlan
            let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: ["DtlsSrtpKeyAgreement": "true"])
            guard let pc = Self.factory.peerConnection(with: config, constraints: constraints, delegate: self) else {
                throw Failure("Voice isn’t available right now. You can practise in text instead.")
            }
            peer = pc
            let source = Self.factory.audioSource(with: RTCMediaConstraints(mandatoryConstraints: [
                "googEchoCancellation": "true", "googNoiseSuppression": "true", "googAutoGainControl": "true",
            ], optionalConstraints: nil))
            let track = Self.factory.audioTrack(with: source, trackId: "mic")
            mic = track
            pc.add(track, streamIds: ["fieldwork"])
            let dc = pc.dataChannel(forLabel: "oai-events", configuration: RTCDataChannelConfiguration())
            dc?.delegate = self
            channel = dc
            let offer = try await pc.offer(for: RTCMediaConstraints(mandatoryConstraints: ["OfferToReceiveAudio": "true"], optionalConstraints: nil))
            try await pc.setLocalDescription(offer)
            // Good-enough candidates; don't wait forever.
            await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
                if pc.iceGatheringState == .complete { c.resume(); return }
                gathered = c
                Task { [weak self] in
                    try? await Task.sleep(for: .seconds(2.5))
                    self?.gathered?.resume()
                    self?.gathered = nil
                }
            }
            if disposed { return release() }
            struct Live: Encodable { let action = "live"; let sdp: String }
            struct Answer: Decodable { let voiceId: String; let sdp: String; let limitSeconds: Int; let plannedSeconds: Int }
            let r: Answer = try await API.post("/api/practice/\(practiceId)", Live(sdp: pc.localDescription?.sdp ?? offer.sdp))
            voiceId = r.voiceId
            limit = r.limitSeconds
            if disposed {
                await control("close")
                return release()
            }
            try await pc.setRemoteDescription(RTCSessionDescription(type: .answer, sdp: r.sdp))
        } catch {
            release()
            if !voiceId.isEmpty { await control("close") }
            status = .error
            self.error = error.localizedDescription
        }
    }

    func end() async {
        #if DEBUG
        if Demo.on, peer == nil, status == .live {
            ticker?.cancel()
            status = .ending
            try? await Task.sleep(for: .seconds(1.2))
            status = .ended
            return
        }
        #endif
        guard peer != nil else { return }
        status = .ending
        send(["type": "session.close"])
        Task { await control("close") }
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            closed = c
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(8))
                self?.closed?.resume()
                self?.closed = nil
            }
        }
        release()
        status = .ended
    }

    // Leaving the screen ends the call immediately.
    func dispose() {
        disposed = true
        ticker?.cancel()
        guard peer != nil || !voiceId.isEmpty else { return }
        send(["type": "session.close"])
        let id = voiceId, seconds = usage, practice = practiceId
        if !id.isEmpty {
            Task.detached {
                struct Control: Encodable { let action = "control"; let voiceId: String; let op: String; let seconds: Double }
                let _: JSON? = try? await API.post("/api/practice/\(practice)", Control(voiceId: id, op: "close", seconds: seconds))
            }
        }
        release()
    }

    func toggleMute() {
        let next = !muted
        mic?.isEnabled = !next
        send(["type": next ? "session.input_audio.mute" : "session.input_audio.unmute"])
        muted = next
        Feedback.shared.play(.tap)
    }

    // MARK: Internals

    #if DEBUG
    // -demo: a pretend call (connecting, then turns back and forth with
    // moving levels), so the stage can be seen without a network.
    private func simulate() {
        status = .connecting
        let script: [PracticeLine] = [
            .init(role: "assistant", text: "Hey, good to hear from you! Everything okay? You sounded kind of serious in that email."),
            .init(role: "user", text: "Everything’s fine with the work. I’m calling because I need to move your account to 30-day terms."),
            .init(role: "assistant", text: "Thirty days? Huh. We’ve been doing it this way for four years. Is something going on over there?"),
            .init(role: "user", text: "We’ve grown, so payroll is bigger, and when invoices sit for 60 days I end up borrowing to cover it."),
        ]
        ticker = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1.6))
            guard !Task.isCancelled else { return }
            self?.started = .now
            self?.status = .live
            var n = 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(150))
                guard let call = self, call.status == .live, let started = call.started else { return }
                call.elapsed = Int(Date.now.timeIntervalSince(started))
                let turn = n / 30
                if n % 30 == 0 { call.lines.append(script[turn % script.count]) }
                let t = Double(n) * 0.15
                let wobble = (sin(t * 7) + sin(t * 3.1)) / 4 + 0.5
                let partner = turn % 2 == 0
                call.levels = (call.levels.me * 0.5 + (partner ? 0 : wobble * 0.8) * 0.5,
                               call.levels.them * 0.5 + (partner ? wobble : 0) * 0.5)
                n += 1
            }
        }
    }
    #endif

    private func configureAudio() {
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try? session.setActive(true)
        session.unlockForConfiguration()
    }

    private func release() {
        ticker?.cancel()
        ticker = nil
        mic?.isEnabled = false
        channel?.close()
        peer?.close()
        channel = nil
        peer = nil
        mic = nil
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        try? session.setActive(false)
        session.unlockForConfiguration()
    }

    private func send(_ message: [String: String]) {
        guard let channel, channel.readyState == .open, let data = try? JSONSerialization.data(withJSONObject: message) else { return }
        channel.sendData(RTCDataBuffer(data: data, isBinary: false))
    }

    private func control(_ op: String) async {
        guard !voiceId.isEmpty else { return }
        // Heartbeats never overlap; a slow one simply skips the next tick.
        if op == "heartbeat", beating { return }
        if op == "heartbeat" { beating = true }
        defer { if op == "heartbeat" { beating = false } }
        struct Control: Encodable { let action = "control"; let voiceId: String; let op: String; let seconds: Double }
        let _: JSON? = try? await API.post("/api/practice/\(practiceId)", Control(voiceId: voiceId, op: op, seconds: usage))
    }

    // Clock, hard limit, heartbeat every 5s and speaking levels.
    private func goLive() {
        started = .now
        status = .live
        Feedback.shared.play(.tap)
        ticker = Task { [weak self] in
            var n = 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(150))
                guard let self, self.status == .live, let started = self.started else { return }
                self.elapsed = Int(Date.now.timeIntervalSince(started))
                if self.limit > 0, self.elapsed >= self.limit - 5 { Task { await self.end() }; return }
                n += 1
                if n % 33 == 0 { Task { await self.control("heartbeat") } }
                await self.sampleLevels()
            }
        }
    }

    private func sampleLevels() async {
        guard let peer else { return }
        let report = await withCheckedContinuation { (c: CheckedContinuation<RTCStatisticsReport, Never>) in
            peer.statistics { c.resume(returning: $0) }
        }
        var me = 0.0, them = 0.0
        for s in report.statistics.values {
            guard let level = (s.values["audioLevel"] as? NSNumber)?.doubleValue else { continue }
            if s.type == "media-source" { me = max(me, level) }
            if s.type == "inbound-rtp" { them = max(them, level) }
        }
        levels = (levels.me * 0.6 + min(1, me * 2.5) * 0.4, levels.them * 0.6 + min(1, them * 2.5) * 0.4)
    }

    fileprivate func handle(_ data: Data) {
        guard let e = try? JSONDecoder.api.decode(JSON.self, from: data), let type = e["type"]?.string else { return }
        switch type {
        case "session.started": goLive()
        case "session.usage.updated": usage = e["usage"]?["seconds"]?.number ?? usage
        case "session.input_transcript.delta", "session.output_transcript.delta":
            let role = type.contains("input") ? "user" : "assistant"
            let delta = e["delta"]?.string ?? ""
            if let last = lines.last, last.role == role {
                lines[lines.count - 1].text += delta
            } else {
                lines.append(PracticeLine(role: role, text: delta))
            }
        case "session.input_audio.muted": muted = true
        case "session.input_audio.unmuted": muted = false
        case "session.closed":
            closed?.resume()
            closed = nil
            release()
            status = .ended
        default: break
        }
    }

    fileprivate func connection(_ state: RTCPeerConnectionState) {
        if state == .failed {
            error = "The audio connection dropped."
            release()
            status = .ended
        }
    }

    fileprivate func iceComplete() {
        gathered?.resume()
        gathered = nil
    }
}

extension LiveCall: RTCPeerConnectionDelegate, RTCDataChannelDelegate {
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        if newState == .complete { Task { @MainActor in self.iceComplete() } }
    }
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        Task { @MainActor in self.connection(newState) }
    }
    nonisolated func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {}
    nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        let data = buffer.data
        Task { @MainActor in self.handle(data) }
    }
}
