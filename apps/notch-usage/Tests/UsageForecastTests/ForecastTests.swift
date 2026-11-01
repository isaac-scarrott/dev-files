import Foundation
import Testing
@testable import UsageForecast

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private func minutes(_ m: Double) -> TimeInterval { m * 60 }
private func hours(_ h: Double) -> TimeInterval { h * 3600 }

@Suite struct Projections {
    @Test func weekUsesAverageSinceTheWindowOpened() {
        // 3.5 days in, 60% used: on pace for 120%, so it runs out at 100/60 of the elapsed time.
        let reset = now.addingTimeInterval(hours(84))
        let p = Forecast.project(.week, current: .init(at: now, utilization: 60, resetsAt: reset), history: [])
        #expect(abs(p.projected! - 120) < 0.01)
        let expected = now.addingTimeInterval(hours(84) * 40 / 60)
        #expect(abs(p.exhaustsAt!.timeIntervalSince(expected)) < 1)
    }

    @Test func fiveHourFollowsRecentPaceOverWindowAverage() {
        // 80% used early in the window, but flat for the last half hour: you've stopped, so no wall.
        let reset = now.addingTimeInterval(hours(3))
        let history = [minutes(30), minutes(20), minutes(10)].map {
            Sample(at: now.addingTimeInterval(-$0), utilization: 80, resetsAt: reset)
        }
        let p = Forecast.project(.fiveHour, current: .init(at: now, utilization: 80, resetsAt: reset), history: history)
        #expect(p.rate == 0)
        #expect(!p.runsOutBeforeReset)
    }

    @Test func fiveHourIgnoresHistoryFromAnEarlierWindow() {
        let reset = now.addingTimeInterval(hours(4.5))
        let stale = Sample(at: now.addingTimeInterval(-minutes(20)), utilization: 95, resetsAt: now.addingTimeInterval(-minutes(5)))
        let p = Forecast.project(.fiveHour, current: .init(at: now, utilization: 10, resetsAt: reset), history: [stale])
        // Falls back to the window average: 10% over the 30 minutes since it opened.
        #expect(abs(p.rate! - 10 / minutes(30)) < 1e-9)
    }

    @Test func tooLittleHistoryGivesNoProjection() {
        let reset = now.addingTimeInterval(hours(5) - minutes(3))
        let p = Forecast.project(.fiveHour, current: .init(at: now, utilization: 4, resetsAt: reset), history: [])
        #expect(p.rate == nil)
        #expect(p.projected == nil)
    }

    @Test func exhaustedWindowRunsOutImmediately() {
        let p = Forecast.project(.fiveHour, current: .init(at: now, utilization: 100, resetsAt: now.addingTimeInterval(minutes(27))), history: [])
        #expect(p.isExhausted)
        #expect(p.exhaustsAt == now)
    }
}

@Suite struct Pool {
    private func member(_ u: Double, ratePerHour: Double, resetIn: TimeInterval, capacity: Double = 5) -> PoolMember {
        let five = Projection(at: now, utilization: u, resetsAt: now.addingTimeInterval(resetIn),
                              rate: ratePerHour / 3600, projected: nil, exhaustsAt: u >= 100 ? now : nil)
        return PoolMember(fiveHour: five, week: nil, capacity: capacity)
    }

    @Test func idlePoolNeverBlacksOut() {
        #expect(Forecast.blackout(.fiveHour, [member(50, ratePerHour: 0, resetIn: hours(2))], now: now) == nil)
    }

    @Test func allExhaustedIsABlackoutNowUntilTheFirstReset() {
        let b = Forecast.blackout(.fiveHour, [member(100, ratePerHour: 0, resetIn: minutes(40)),
                                   member(100, ratePerHour: 0, resetIn: minutes(25))], now: now)
        #expect(b?.start == now)
        #expect(b?.end == now.addingTimeInterval(minutes(25)))
    }

    @Test func survivorAbsorbsTheExhaustedAccountsLoad() {
        // A is out for 3h, so B carries the whole pool. At 10%/h from 70%, B lasts 3h: A is back by then.
        let calm = Forecast.blackout(.fiveHour, [member(100, ratePerHour: 0, resetIn: hours(3)),
                                      member(70, ratePerHour: 10, resetIn: hours(4))], now: now)
        #expect(calm == nil)

        // At 30%/h, B hits 100% in 1h while A is still out until 3h: blackout 1h → 3h.
        let b = Forecast.blackout(.fiveHour, [member(100, ratePerHour: 0, resetIn: hours(3)),
                                   member(70, ratePerHour: 30, resetIn: hours(4))], now: now)
        let start = try! #require(b?.start)
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(hours(1)))) <= 60)
        #expect(b?.end == now.addingTimeInterval(hours(3)))
    }

    @Test func loadMovesInAbsoluteTermsBetweenDifferentSizedAccounts() {
        // Both burn 20%/h. When the small (5x) one runs out, its absolute load lands on the big (20x)
        // one as only a quarter as many percentage points: 20 + 5 = 25%/h.
        let small = member(90, ratePerHour: 20, resetIn: hours(4), capacity: 5)
        let big = member(10, ratePerHour: 20, resetIn: hours(4.5), capacity: 20)
        // Small hits 100 after 30m (big at 20%). Big then needs 80 / 25 = 3.2h → 3h42m from now.
        let b = Forecast.blackout(.fiveHour, [small, big], now: now)
        let start = try! #require(b?.start)
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(hours(3.7)))) <= 120)
    }

    @Test func weekRunningOutTakesAnAccountOutOfTheFiveHourPool() {
        // B's 5h window is fine, but its week runs out in 1h and A is out for 3h.
        let week = Projection(at: now, utilization: 95, resetsAt: now.addingTimeInterval(hours(48)),
                              rate: 5 / 3600, projected: nil, exhaustsAt: now.addingTimeInterval(hours(1)))
        let b = PoolMember(fiveHour: member(10, ratePerHour: 5, resetIn: hours(4)).fiveHour, week: week, capacity: 5)
        let blackout = Forecast.blackout(.fiveHour, [member(100, ratePerHour: 0, resetIn: hours(3)), b], now: now)
        #expect(blackout?.start == now.addingTimeInterval(hours(1)))
        #expect(blackout?.end == now.addingTimeInterval(hours(3)))
    }

    @Test func weeklyPoolRunsDryWhenTheBiggerAccountGoesFirst() {
        // Live shape from 28 Oct: a 20x account at 75% resetting in 3.6 days, a 5x at 32% resetting in 5.6.
        func weekMember(_ u: Double, perDay: Double, resetIn days: Double, capacity: Double) -> PoolMember {
            let w = Projection(at: now, utilization: u, resetsAt: now.addingTimeInterval(days * 86400),
                               rate: perDay / 86400, projected: nil, exhaustsAt: nil)
            return PoolMember(fiveHour: nil, week: w, capacity: capacity)
        }
        let b = Forecast.blackout(.week, [weekMember(75, perDay: 22, resetIn: 3.6, capacity: 20),
                                          weekMember(32, perDay: 23, resetIn: 5.6, capacity: 5)], now: now)
        // The 20x one is out after ~1.1 days; its load then lands on the 5x one at 4x the percentage rate.
        let start = try! #require(b?.start)
        #expect(start < now.addingTimeInterval(1.6 * 86400))
        #expect(b?.end == now.addingTimeInterval(3.6 * 86400))
    }
}
