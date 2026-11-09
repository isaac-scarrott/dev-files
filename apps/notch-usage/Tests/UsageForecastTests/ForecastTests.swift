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

    @Test func monthProjectsFromTheWholeBillingWindow() {
        // 10 days into a 30-day window at 40%: on pace for 120%, out after 15 more days.
        let reset = now.addingTimeInterval(hours(20 * 24))
        let p = Forecast.project(.month, current: .init(at: now, utilization: 40, resetsAt: reset), history: [])
        #expect(abs(p.projected! - 120) < 0.01)
        #expect(abs(p.exhaustsAt!.timeIntervalSince(now.addingTimeInterval(hours(15 * 24)))) < 1)
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

    @Test func exhaustedWindowKeepsThePaceThatRanItOut() {
        // Window opened 4h ago, out since 2h ago: it burned 100% in its first 2h.
        let reset = now.addingTimeInterval(hours(1))
        let current = Sample(at: now, utilization: 100, resetsAt: reset, exhaustedSince: now.addingTimeInterval(-hours(2)))
        let p = Forecast.project(.fiveHour, current: current, history: [])
        #expect(abs(p.rate! - 50 / 3600) < 1e-9)
        #expect(p.exhaustsAt == now.addingTimeInterval(-hours(2)))
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

    @Test func ninetyNinePointSixReadsAsOneHundredAndIsOut() {
        // Anthropic rounds 99.6 up to "100%", so a reading there is out: no room for the next minute.
        let p = Forecast.project(.fiveHour,
                                 current: .init(at: now, utilization: 99.6, resetsAt: now.addingTimeInterval(hours(1))),
                                 history: [])
        #expect(p.isExhausted)

        let b = Forecast.blackout(.fiveHour, [member(99.6, ratePerHour: 0, resetIn: hours(2))], now: now)
        #expect(b?.start == now)
        #expect(b?.end == now.addingTimeInterval(hours(2)))
    }

    @Test func poolForecastLandsEachAccountWhereItsWindowEnds() {
        // A is out until its 3h reset: it ran out before resetting, so it lands at exactly 100.
        // B burns 10%/h from 50% and resets at 4h: 90% there.
        // C resets past the 5h horizon, so it lands at the horizon: 50 + 5%/h over 5h = 75%.
        let f = Forecast.poolForecast(.fiveHour, [member(100, ratePerHour: 0, resetIn: hours(3)),
                                                  member(50, ratePerHour: 10, resetIn: hours(4)),
                                                  member(50, ratePerHour: 5, resetIn: hours(5.5))], now: now)
        #expect(f.landing[0] == 100)
        #expect(abs((f.landing[1] ?? 0) - 90) <= 0.5)
        #expect(abs((f.landing[2] ?? 0) - 75) <= 0.5)
    }

    @Test func readingThatCarriedPastTheLimitIsOutFromWhenItCrossed() {
        // A was read 4h ago at 80% and 20%/h, so it crossed 100% an hour after that: 3h ago, though no
        // reading ever said so. B at 50% burning 40%/h already holds A's share; with that taken off it
        // burns 20%/h and A's 20%/h lands back on it: 40%/h until A's reset at 1h (B at 90%), then
        // 20%/h, so B runs out at about 1h29m. Without A's crossing it burns the full 60%/h: 50m.
        let a = Projection(at: now.addingTimeInterval(-hours(4)), utilization: 80,
                           resetsAt: now.addingTimeInterval(hours(1)), rate: 20 / 3600,
                           projected: nil, exhaustsAt: nil)
        let pool = [PoolMember(fiveHour: a, week: nil, capacity: 5),
                    member(50, ratePerHour: 40, resetIn: hours(4))]
        let start = try! #require(Forecast.poolForecast(.fiveHour, pool, now: now).outageStart[1])
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(minutes(89)))) <= 60)
    }

    @Test func weekBlockRecordsAnOutageForAnOpenFiveHourWindow() {
        // B's 5h window is only at 10%, but its week runs out at 1h and stays out for 48h: from 1h it is
        // out of the pool, so its own row must say so.
        let week = Projection(at: now, utilization: 94.5, resetsAt: now.addingTimeInterval(hours(48)),
                              rate: 5 / 3600, projected: nil, exhaustsAt: now.addingTimeInterval(hours(1)))
        let b = PoolMember(fiveHour: member(10, ratePerHour: 0, resetIn: hours(4)).fiveHour, week: week, capacity: 5)
        let f = Forecast.poolForecast(.fiveHour, [member(100, ratePerHour: 0, resetIn: hours(3)), b], now: now)
        let start = try! #require(f.outageStart[1])
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(hours(1)))) <= 60)
    }

    @Test func absorptionUsesTheEarliestReasonAnAccountIsOut() {
        // A is out of its 5h window only since 10m ago, but out of its week since 2h ago. B's measured
        // 40%/h has been carrying A's share for those 2h — more than B's 45m lookback — so the whole
        // share comes off B; A's 40%/h then lands back on it: 40%/h from 50%, out at 1h14m (42m if the
        // correction only reaches back to the 5h exhaustion).
        let a = PoolMember(
            fiveHour: Projection(at: now, utilization: 100, resetsAt: now.addingTimeInterval(hours(3)),
                                 rate: 40 / 3600, projected: 100, exhaustsAt: now.addingTimeInterval(-minutes(10))),
            week: Projection(at: now, utilization: 100, resetsAt: now.addingTimeInterval(hours(48)),
                             rate: 10 / 3600, projected: 100, exhaustsAt: now.addingTimeInterval(-hours(2))),
            capacity: 5)
        let b = Forecast.blackout(.fiveHour, [a, member(50, ratePerHour: 40, resetIn: hours(4))], now: now)
        let start = try! #require(b?.start)
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(minutes(74)))) <= 120)
    }

    @Test func outAccountsDoNotDoubleCountTheLoadTheyAlreadyCarried() {
        // A ran out 2h ago at 40%/h; C ran out 10m ago, and its measured 60%/h already holds A's 40.
        // Take that share off C and the load still to place is A's 40 plus C's own 20: 60%/h, so B at
        // 40% is out at 1h (36m if C's A-share is counted a second time).
        func out(_ ratePerHour: Double, since: TimeInterval, resetIn: TimeInterval) -> PoolMember {
            let p = Projection(at: now, utilization: 100, resetsAt: now.addingTimeInterval(resetIn),
                               rate: ratePerHour / 3600, projected: 100,
                               exhaustsAt: now.addingTimeInterval(-since))
            return PoolMember(fiveHour: p, week: nil, capacity: 5)
        }
        let b = Forecast.blackout(.fiveHour, [out(40, since: hours(2), resetIn: hours(3)),
                                              out(60, since: minutes(10), resetIn: hours(4)),
                                              member(40, ratePerHour: 0, resetIn: hours(4.5))], now: now)
        let start = try! #require(b?.start)
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(hours(1)))) <= 120)
    }

    @Test func blackoutEndsOnlyWhenAnAccountStaysFree() {
        // A's 5h window resets at 1h, but its week gives out at 1h15m and stays out for 48h: that reset
        // buys 15 minutes. B's reset at 3h is the first moment an account stays open, so the blackout
        // ends there rather than at A's 1h.
        let week = Projection(at: now, utilization: 93.25, resetsAt: now.addingTimeInterval(hours(48)),
                              rate: 5 / 3600, projected: nil, exhaustsAt: now.addingTimeInterval(minutes(75)))
        let a = PoolMember(fiveHour: member(100, ratePerHour: 0, resetIn: hours(1)).fiveHour, week: week, capacity: 5)
        let f = Forecast.poolForecast(.fiveHour, [a, member(100, ratePerHour: 0, resetIn: hours(3))], now: now)
        #expect(f.blackout?.start == now)
        #expect(f.blackout?.end == now.addingTimeInterval(hours(3)))
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
        // A is out for 3h, so B carries the whole pool. At 10%/h from 69% B is still short of the wall
        // (99.5) when A is back at 3h.
        let calm = Forecast.blackout(.fiveHour, [member(100, ratePerHour: 0, resetIn: hours(3)),
                                      member(69, ratePerHour: 10, resetIn: hours(4))], now: now)
        #expect(calm == nil)

        // At 30%/h, B hits 100% in 1h while A is still out until 3h: blackout 1h → 3h.
        let b = Forecast.blackout(.fiveHour, [member(100, ratePerHour: 0, resetIn: hours(3)),
                                   member(70, ratePerHour: 30, resetIn: hours(4))], now: now)
        let start = try! #require(b?.start)
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(hours(1)))) <= 60)
        #expect(b?.end == now.addingTimeInterval(hours(3)))
    }

    @Test func outageStartsAgreesWithTheBlackoutForTheLastOpenAccount() {
        // Same pool as above: A is out for 3h and B at 70% carrying everything runs out at 1h, which is
        // where the blackout begins. So B's own row must read that time, not its own-pace estimate.
        let pool = [member(100, ratePerHour: 0, resetIn: hours(3)),
                    member(70, ratePerHour: 30, resetIn: hours(4))]
        let start = try! #require(Forecast.blackout(.fiveHour, pool, now: now)?.start)
        #expect(Forecast.poolForecast(.fiveHour, pool, now: now).outageStart[1] == start)
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

    @Test func busyAccountKeepsItsOwnPaceBesideAnIdleOne() {
        // A burns 60%/h from 40%: out in 1h, not diluted by idle B. B then carries 300 units/h = 60%/h,
        // so it runs out 1h40m after that, while A waits until its reset at 4h.
        let b = Forecast.blackout(.fiveHour, [member(40, ratePerHour: 60, resetIn: hours(4)),
                                              member(0, ratePerHour: 0, resetIn: hours(5))], now: now)
        let start = try! #require(b?.start)
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(hours(1) + minutes(100)))) <= 120)
        #expect(b?.end == now.addingTimeInterval(hours(4)))
    }

    @Test func justExhaustedAccountsLoadLandsOnTheSurvivor() {
        // A ran out a moment ago at 40%/h; B at 50% is idle so far. B now carries A's load: out in 1h15m,
        // well before A's reset at 3h.
        let a = Projection(at: now, utilization: 100, resetsAt: now.addingTimeInterval(hours(3)),
                           rate: 40 / 3600, projected: 100, exhaustsAt: now)
        let b = Forecast.blackout(.fiveHour, [PoolMember(fiveHour: a, week: nil, capacity: 5),
                                              member(50, ratePerHour: 0, resetIn: hours(4))], now: now)
        let start = try! #require(b?.start)
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(hours(1.25)))) <= 60)
    }

    @Test func survivorsRateAlreadyHoldingTheLoadIsNotCountedTwice() {
        // A ran out an hour ago at 40%/h; B's measured 40%/h is all A's traffic. B must still burn 40%/h,
        // not 80: from 50% that's out in 1h15m.
        let a = Projection(at: now, utilization: 100, resetsAt: now.addingTimeInterval(hours(3)),
                           rate: 40 / 3600, projected: 100, exhaustsAt: now.addingTimeInterval(-hours(1)))
        let b = Forecast.blackout(.fiveHour, [PoolMember(fiveHour: a, week: nil, capacity: 5),
                                              member(50, ratePerHour: 40, resetIn: hours(4))], now: now)
        let start = try! #require(b?.start)
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(hours(1.25)))) <= 60)
    }

    @Test func survivorsRateAlreadyHoldingAWeekExhaustedAccountsLoadIsNotCountedTwice() {
        // A's week ran out two hours ago while its 5h window sits at 30%. B's measured 30%/h is already
        // all of A's traffic, so from 50% it still burns 30%/h: out in 1h40m, not 1h.
        let spentWeek = Projection(at: now, utilization: 100, resetsAt: now.addingTimeInterval(hours(48)),
                                   rate: nil, projected: 100, exhaustsAt: now.addingTimeInterval(-hours(2)))
        let a = PoolMember(fiveHour: member(30, ratePerHour: 20, resetIn: hours(3)).fiveHour,
                           week: spentWeek, capacity: 5)
        let start = try! #require(Forecast.blackout(.fiveHour, [a, member(50, ratePerHour: 30, resetIn: hours(4))],
                                                   now: now)?.start)
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(hours(1) + minutes(40)))) <= 120)
    }

    @Test func fiveHourPoolTakesWeekOutagesFromTheSharedWeekForecast() {
        // On its own estimate B's week lasts 6h, past the 5h horizon. But A's week runs out first and its
        // load moves onto B's week, which then runs out inside the horizon.
        func week(_ u: Double, perHour: Double) -> Projection {
            Projection(at: now, utilization: u, resetsAt: now.addingTimeInterval(hours(100)),
                       rate: perHour / 3600, projected: nil, exhaustsAt: now.addingTimeInterval(hours((100 - u) / perHour)))
        }
        // A's week is out at 1h, with B at 97%. B then burns 1%/h: out at 3.5h, with A still out.
        let a = PoolMember(fiveHour: member(10, ratePerHour: 0, resetIn: hours(4)).fiveHour, week: week(99, perHour: 0.5), capacity: 5)
        let b = PoolMember(fiveHour: member(10, ratePerHour: 0, resetIn: hours(4)).fiveHour, week: week(96.5, perHour: 0.5), capacity: 5)
        let blackout = Forecast.blackout(.fiveHour, [a, b], now: now)
        let start = try! #require(blackout?.start)
        // The week it comes from is stepped in 5-minute blocks, so the time can sit up to that late.
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(hours(3.5)))) <= 300)
    }

    @Test func weekRunningOutTakesAnAccountOutOfTheFiveHourPool() {
        // B's 5h window is fine, but its week runs out in 1h and A is out for 3h.
        let week = Projection(at: now, utilization: 94.5, resetsAt: now.addingTimeInterval(hours(48)),
                              rate: 5 / 3600, projected: nil, exhaustsAt: now.addingTimeInterval(hours(1)))
        let b = PoolMember(fiveHour: member(10, ratePerHour: 5, resetIn: hours(4)).fiveHour, week: week, capacity: 5)
        let blackout = Forecast.blackout(.fiveHour, [member(100, ratePerHour: 0, resetIn: hours(3)), b], now: now)
        let start = try! #require(blackout?.start)
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(hours(1)))) <= 60)
        #expect(blackout?.end == now.addingTimeInterval(hours(3)))
    }

    @Test func blackoutDoesNotEndOnAResetTheWeekWillBlock() {
        // Both out now. A's 5h window resets in 2h, but its week runs out at 1h and stays out for 2 days,
        // so A's reset frees nothing: B's reset at 5h is the real end.
        let week = Projection(at: now, utilization: 95, resetsAt: now.addingTimeInterval(hours(48)),
                              rate: 5 / 3600, projected: nil, exhaustsAt: now.addingTimeInterval(hours(1)))
        let a = PoolMember(fiveHour: member(100, ratePerHour: 0, resetIn: hours(2)).fiveHour, week: week, capacity: 5)
        let b = Forecast.blackout(.fiveHour, [a, member(100, ratePerHour: 0, resetIn: hours(5))], now: now)
        #expect(b?.start == now)
        #expect(b?.end == now.addingTimeInterval(hours(5)))
    }

    @Test func accountWithoutAFiveHourWindowKeepsThePoolOpen() {
        // Live shape from 3 Nov: the 20x account has no 5h limit, so the 5x one running out doesn't stop you.
        let week = Projection(at: now, utilization: 40, resetsAt: now.addingTimeInterval(hours(96)),
                              rate: 0.5 / 3600, projected: nil, exhaustsAt: nil)
        let noFiveHour = PoolMember(fiveHour: nil, week: week, capacity: 20)
        let pool = [noFiveHour, member(40, ratePerHour: 53, resetIn: hours(2)), member(0, ratePerHour: 0, resetIn: hours(5))]
        #expect(Forecast.blackout(.fiveHour, pool, now: now) == nil)

        // Its week running out still takes it out.
        let spent = Projection(at: now, utilization: 97, resetsAt: now.addingTimeInterval(hours(48)),
                               rate: 5 / 3600, projected: nil, exhaustsAt: now.addingTimeInterval(hours(0.5)))
        let b = Forecast.blackout(.fiveHour, [PoolMember(fiveHour: nil, week: spent, capacity: 20),
                                              member(100, ratePerHour: 0, resetIn: hours(3))], now: now)
        let start = try! #require(b?.start)
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(hours(0.5)))) <= 60)
    }

    @Test func absorptionSplitsAcrossTheAccountsOpenWhenTheLoadLanded() {
        // A and B both ran out of their 5h window (2h and 1h ago) measuring 1%/min each; C sits at 30%
        // and its 1%/min over the last 45m holds what it carried. When A's load landed, B was still
        // open, so A's share went two ways: C gives back half of it, then B's whole share (B was the
        // only one left by then). C keeps its own pace plus the 2%/min now stranded on it: 1.5%/min,
        // so 30% reaches 100 in 47m. Dividing A's share by today's single open account takes C's whole
        // measured pace off and leaves it burning 1%/min, out at 70m.
        func out(_ ratePerHour: Double, since: TimeInterval) -> PoolMember {
            let p = Projection(at: now, utilization: 100, resetsAt: now.addingTimeInterval(hours(4)),
                               rate: ratePerHour / 3600, projected: 100, exhaustsAt: now.addingTimeInterval(-since))
            return PoolMember(fiveHour: p, week: nil, capacity: 5)
        }
        let f = Forecast.poolForecast(.fiveHour, [out(60, since: hours(2)), out(60, since: hours(1)),
                                                  member(30, ratePerHour: 60, resetIn: hours(4))], now: now)
        let start = try! #require(f.outageStart[2])
        #expect(abs(start.timeIntervalSince(now.addingTimeInterval(minutes(47)))) <= 120)
        #expect(start < now.addingTimeInterval(hours(4)))
    }

    @Test func blackoutHasNoEndWhenAnAccountCanNeverReturn() {
        // A's week is spent with no reset at all, so the pool never clears again. B's 5h window resets at
        // 2h, but its week runs out at 2h30 and never comes back either. B still frees its 5h window
        // first, and naming B's 100h week reset as the end would say the pool reopens with A still out.
        let spentWeek = Projection(at: now, utilization: 100, resetsAt: nil, rate: 0,
                                   projected: 100, exhaustsAt: now.addingTimeInterval(-hours(1)))
        let a = PoolMember(fiveHour: member(100, ratePerHour: 0, resetIn: hours(3)).fiveHour,
                           week: spentWeek, capacity: 5)
        let bWeek = Projection(at: now, utilization: 90, resetsAt: now.addingTimeInterval(hours(100)),
                               rate: 4 / 3600, projected: nil, exhaustsAt: now.addingTimeInterval(minutes(150)))
        let b = PoolMember(fiveHour: member(100, ratePerHour: 0, resetIn: hours(2)).fiveHour,
                           week: bWeek, capacity: 5)
        let f = Forecast.poolForecast(.fiveHour, [a, b], now: now)
        #expect(f.blackout?.start == now)
        #expect(f.blackout?.end == nil)
    }

    @Test func weekSimulationStepsInFiveMinuteBlocks() {
        // 98% at 0.7%/h is out when it rounds to 100 (99.5), 128.6m from now: the week's 5-minute step
        // puts that at 130m. A one-minute step would report 129m, a time the UI never shows.
        let w = Projection(at: now, utilization: 98, resetsAt: now.addingTimeInterval(hours(100)),
                           rate: 0.7 / 3600, projected: nil, exhaustsAt: nil)
        let start = try! #require(Forecast.blackout(.week, [PoolMember(fiveHour: nil, week: w, capacity: 5)],
                                                    now: now)?.start)
        #expect(start.timeIntervalSince(now) == minutes(130))
        #expect(start.timeIntervalSince(now).truncatingRemainder(dividingBy: minutes(5)) == 0)
    }

    @Test func bothWindowsShareOneWeekSimulation() {
        // The pair must answer exactly what asking per window answers, for the cost of one week
        // simulation rather than two (the week is the long one: 7 days of steps).
        func week(_ u: Double, perHour: Double) -> Projection {
            Projection(at: now, utilization: u, resetsAt: now.addingTimeInterval(hours(100)),
                       rate: perHour / 3600, projected: nil, exhaustsAt: nil)
        }
        let pool = [PoolMember(fiveHour: member(10, ratePerHour: 5, resetIn: hours(4)).fiveHour,
                               week: week(99, perHour: 0.5), capacity: 5),
                    PoolMember(fiveHour: member(20, ratePerHour: 5, resetIn: hours(3)).fiveHour,
                               week: week(96.5, perHour: 0.5), capacity: 5)]
        let both = Forecast.poolForecasts(pool, now: now)
        let five = Forecast.poolForecast(.fiveHour, pool, now: now)
        let single = Forecast.poolForecast(.week, pool, now: now)
        #expect(both.fiveHour.blackout == five.blackout)
        #expect(both.fiveHour.outageStart == five.outageStart)
        #expect(both.fiveHour.landing == five.landing)
        #expect(both.week.blackout == single.blackout)
        #expect(both.week.outageStart == single.outageStart)
        #expect(both.week.landing == single.landing)

        func cheapest(_ work: () -> Void) -> Duration {
            (0..<3).map { _ in ContinuousClock().measure(work) }.min()!
        }
        let pair = cheapest { _ = Forecast.poolForecasts(pool, now: now) }
        let perWindow = cheapest {
            _ = Forecast.poolForecast(.fiveHour, pool, now: now)
            _ = Forecast.poolForecast(.week, pool, now: now)
        }
        #expect(pair < perWindow)
    }

    @Test func rowsNameTheOutageRunningWhenThePoolGoesDark() {
        // B carries A's 1%/min while A's window is spent, so B runs out at ~34m and the pool is dark from
        // there until A's reset at 2h. The latest row time must be the blackout start: that is the wall
        // the headline names, and every row that is out at that moment names its own outage, not an
        // earlier one.
        let pool = [member(100, ratePerHour: 60, resetIn: hours(2)),
                    member(50, ratePerHour: 30, resetIn: hours(4))]
        let f = Forecast.poolForecast(.fiveHour, pool, now: now)
        let dark = try! #require(f.blackout?.start)
        let latest = try! #require(f.outageStart.values.max())
        #expect(abs(latest.timeIntervalSince(dark)) <= 60)

        // A frees its 5h window at 10m, then runs out again at ~1h once B's load joins it; B is gone at
        // ~40m. The pool goes dark at A's second exhaustion, so A's row must name that, not the
        // exhaustion it is in right now.
        let again = Forecast.poolForecast(.fiveHour,
                                          [member(100, ratePerHour: 60, resetIn: minutes(10)),
                                           member(50, ratePerHour: 60, resetIn: hours(4))], now: now)
        let second = try! #require(again.blackout?.start)
        let a = try! #require(again.outageStart[0])
        #expect(second > now.addingTimeInterval(minutes(30)))
        #expect(a > now.addingTimeInterval(minutes(30)))
        #expect(abs(a.timeIntervalSince(second)) <= 60)
        let latestAgain = try! #require(again.outageStart.values.max())
        #expect(abs(latestAgain.timeIntervalSince(second)) <= 60)
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
        // The week is stepped in 5-minute blocks, so a moment on its edge lands up to that late.
        let end = try! #require(b?.end)
        #expect(abs(end.timeIntervalSince(now.addingTimeInterval(3.6 * 86400))) <= 300)
    }
}
