import Foundation
import Testing
@testable import Fieldwork

// The iPhone app's copies of web logic, checked against the same cases as
// the web's tests (tests/tutor.test.ts, tests/viz.test.ts, …).

@Suite("Streaming text")
@MainActor struct StreamingText {
    @Test func showsOnlyFinishedSentencesWhileWriting() {
        #expect(Blocks.sentences("Cash is king. Profit is an opin", writing: true) == ["Cash is king. "])
        #expect(Blocks.sentences("Cash is king. Profit is an opinion.", writing: false) == ["Cash is king. ", "Profit is an opinion."])
    }

    @Test func releasesALongSentenceAtAClauseBreak() {
        let long = "When a senator objects to unanimous consent, which is how almost everything moves, the chamber has to fall back on cloture, and that needs sixty votes to"
        let out = Blocks.sentences(long, writing: true)
        #expect(out.count == 1)
        #expect(out[0].hasSuffix(", "))
    }

    @Test func holdsBackAnUnclosedBoldMarker() {
        #expect(Blocks.sentences("The **filibuster. is", writing: true).isEmpty)
        #expect(Blocks.sentences("The **filibuster** works. More", writing: true) == ["The **filibuster** works. "])
    }
}

@Suite("Sim formulas")
@MainActor struct Formulas {
    @Test func evaluatesArithmetic() throws {
        let f = try Formula("round((price - cost) * units / 1000, 1)")
        #expect(try f.evaluate(["price": 12, "cost": 7, "units": 2500]) == 12.5)
        #expect(try Formula("2 ^ 3 ^ 2").evaluate([:]) == 512)
        #expect(try Formula("-min(3, abs(-5))").evaluate([:]) == -3)
    }

    @Test func rejectsUnknownNames() {
        #expect(throws: Formula.Invalid.self) { try Formula("eval(1)") }
        #expect(throws: Formula.Invalid.self) { try Formula("price * 2").evaluate([:]) }
    }
}

@Suite("Preferences")
@MainActor struct PreferenceDefaults {
    @Test func fallsBackFieldByField() throws {
        let json = try JSONDecoder().decode(JSON.self, from: Data(#"{"writing":"candid","reading":{"size":"huge","lessonFont":"dyslexic"},"session":{"breaks":7}}"#.utf8))
        let p = Prefs(json: json)
        #expect(p.writing == "candid")
        #expect(p.reading.size == "m")
        #expect(p.reading.lessonFont == .dyslexic)
        #expect(p.session.breaks == 5)
        #expect(p.voice == "cedar")
        #expect(p.sound == false)
    }
}

@Suite("Lesson text")
@MainActor struct LessonText {
    @Test func firstSentenceSkipsListMarkers() {
        #expect(firstSentence([.text("1. Look at the cash line first. Then the rest.")]) == "Look at the cash line first.")
    }

    @Test func termPhrasesSplitComparisons() {
        #expect(SessionExtras.phrases("Profit vs cash") == ["profit vs cash", "profit"])
    }
}

#if DEBUG
@Suite("Fixtures")
@MainActor struct Fixtures {
    // The demo workspace's plan must decode, or Learn and You show no plan.
    @Test func demoPlanDecodes() throws {
        let url = try #require(Bundle.main.url(forResource: "state", withExtension: "json", subdirectory: "Fixtures"))
        let json = try JSONDecoder().decode(JSON.self, from: Data(contentsOf: url))
        let plan = try #require(json["state"]?["plan"])
        _ = try plan.decode(Plan.self)
    }
}
#endif
