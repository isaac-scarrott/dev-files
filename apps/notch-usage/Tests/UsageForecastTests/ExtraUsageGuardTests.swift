import Foundation
import Testing
@testable import UsageForecast

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let later = now.addingTimeInterval(3600)
private func window(_ u: Double, resets: Date? = later) -> ExtraUsageGuard.Window { .init(utilization: u, resetsAt: resets) }

@Suite struct GuardDecisions {
    @Test func holdsAnExtraUsageAccountAtTheThreshold() {
        #expect(ExtraUsageGuard.action(extraUsage: true, held: false, windows: [window(10), window(98)], now: now) == .hold)
    }

    @Test func leavesAnAccountBelowTheThreshold() {
        #expect(ExtraUsageGuard.action(extraUsage: true, held: false, windows: [window(97.9), window(50)], now: now) == .none)
    }

    @Test func neverTouchesAnAccountWithoutExtraUsage() {
        // Its 429s already fail over, and an unknown plan isn't worth guessing about.
        #expect(ExtraUsageGuard.action(extraUsage: false, held: false, windows: [window(100)], now: now) == .none)
        #expect(ExtraUsageGuard.action(extraUsage: nil, held: false, windows: [window(100)], now: now) == .none)
    }

    @Test func staysHeldWhileAnyWindowIsFull() {
        #expect(ExtraUsageGuard.action(extraUsage: true, held: true, windows: [window(5), window(99)], now: now) == .none)
    }

    @Test func releasesWhenBothWindowsAreBelowTheThreshold() {
        #expect(ExtraUsageGuard.action(extraUsage: true, held: true, windows: [window(2), window(40)], now: now) == .release)
    }

    @Test func releasesWhenTheFullWindowHasResetEvenIfTheReadingIsStale() {
        // A held account may have no token that works, so the old reading's reset time is all there is.
        let past = now.addingTimeInterval(-60)
        #expect(ExtraUsageGuard.action(extraUsage: true, held: true, windows: [window(100, resets: past), window(4)], now: now) == .release)
    }

    @Test func aStaleFullReadingDoesNotHold() {
        let past = now.addingTimeInterval(-60)
        #expect(ExtraUsageGuard.action(extraUsage: true, held: false, windows: [window(100, resets: past)], now: now) == .none)
    }

    @Test func releasesWhenNoWindowsAreKnown() {
        #expect(ExtraUsageGuard.action(extraUsage: true, held: true, windows: [], now: now) == .release)
    }
}

@Suite struct DisabledEdit {
    private let file = Data("""
    {
      "access_token": "abc/def",
      "disabled": false,
      "email": "a@b",
      "refresh_token": "xyz"
    }
    """.utf8)

    @Test func changesOnlyTheDisabledValue() throws {
        let edited = try #require(ExtraUsageGuard.setDisabled(true, in: file))
        let expected = String(decoding: file, as: UTF8.self).replacingOccurrences(of: "\"disabled\": false", with: "\"disabled\": true")
        #expect(String(decoding: edited, as: UTF8.self) == expected)
        #expect(ExtraUsageGuard.isDisabled(in: edited))
    }

    @Test func roundTripsToTheOriginalBytes() throws {
        let there = try #require(ExtraUsageGuard.setDisabled(true, in: file))
        #expect(ExtraUsageGuard.setDisabled(false, in: there) == file)
    }

    @Test func addsTheKeyWhenAbsent() throws {
        let bare = Data(#"{"email": "a@b"}"#.utf8)
        let edited = try #require(ExtraUsageGuard.setDisabled(true, in: bare))
        #expect(ExtraUsageGuard.isDisabled(in: edited))
        let object = try JSONSerialization.jsonObject(with: edited) as? [String: Any]
        #expect(object?["email"] as? String == "a@b")
    }

    @Test func refusesNonObjects() {
        #expect(ExtraUsageGuard.setDisabled(true, in: Data("nope".utf8)) == nil)
    }
}
