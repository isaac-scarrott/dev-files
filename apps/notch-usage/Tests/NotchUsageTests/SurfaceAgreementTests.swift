import Foundation
import Testing
import UsageForecast
@testable import NotchUsage

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let day: TimeInterval = 86_400
private func minutes(_ m: Double) -> TimeInterval { m * 60 }
private func hours(_ h: Double) -> TimeInterval { h * 3600 }

enum AccountState: CaseIterable, Sendable {
    case slow, fast, fiveOut, weekOut, weekNearlyOut, noFiveLimit
    case held, neverFetched, stale, resetPast, nearFull
}

private func samples(at: Date, utilization: Double, ratePerMinute: Double, resetsAt: Date) -> [Sample] {
    (1...5).map { step in
        Sample(at: at.addingTimeInterval(-minutes(10 * Double(step))),
               utilization: utilization - ratePerMinute * 10 * Double(step),
               resetsAt: resetsAt)
    }
}

private func account(_ state: AccountState, index: Int) -> AccountUsage {
    var a = AccountUsage(id: "a\(index)", label: "account \(index)", org: "Personal")
    a.capacity = index == 1 ? 20 : 5
    a.fetchedAt = now
    let fiveReset = now.addingTimeInterval(hours(4))
    let weekReset = now.addingTimeInterval(6 * day)
    switch state {
    case .slow:
        a.fiveHour = UsageWindow(utilization: 10, resetsAt: fiveReset)
        a.sevenDay = UsageWindow(utilization: 5, resetsAt: weekReset)
        a.history = samples(at: now, utilization: 10, ratePerMinute: 0.1, resetsAt: fiveReset)
    case .fast:
        a.fiveHour = UsageWindow(utilization: 30, resetsAt: fiveReset)
        a.sevenDay = UsageWindow(utilization: 5, resetsAt: weekReset)
        a.history = samples(at: now, utilization: 30, ratePerMinute: 1, resetsAt: fiveReset)
    case .fiveOut:
        let reset = now.addingTimeInterval(hours(2))
        a.fiveHour = UsageWindow(utilization: 100, resetsAt: reset,
                                 exhaustedSince: now.addingTimeInterval(-hours(1)))
        a.sevenDay = UsageWindow(utilization: 5, resetsAt: weekReset)
        a.history = samples(at: now, utilization: 100, ratePerMinute: 0, resetsAt: reset)
    case .weekOut:
        a.fiveHour = UsageWindow(utilization: 10, resetsAt: fiveReset)
        a.sevenDay = UsageWindow(utilization: 100, resetsAt: now.addingTimeInterval(2 * day),
                                 exhaustedSince: now.addingTimeInterval(-day))
        a.history = samples(at: now, utilization: 10, ratePerMinute: 0.1, resetsAt: fiveReset)
    case .weekNearlyOut:
        a.fiveHour = UsageWindow(utilization: 10, resetsAt: fiveReset)
        a.sevenDay = UsageWindow(utilization: 98, resetsAt: now.addingTimeInterval(4 * day))
        a.history = samples(at: now, utilization: 10, ratePerMinute: 0.1, resetsAt: fiveReset)
    case .noFiveLimit:
        a.fiveHour = nil
        a.sevenDay = UsageWindow(utilization: 5, resetsAt: weekReset)
    case .held:
        a.heldBack = true
        a.fiveHour = UsageWindow(utilization: 10, resetsAt: fiveReset)
        a.sevenDay = UsageWindow(utilization: 5, resetsAt: weekReset)
        a.history = samples(at: now, utilization: 10, ratePerMinute: 0.1, resetsAt: fiveReset)
    case .neverFetched:
        a.fetchedAt = nil
    case .stale:
        a.fetchedAt = now.addingTimeInterval(-hours(2))
        let at = a.fetchedAt!
        let reset = now.addingTimeInterval(hours(3))
        a.fiveHour = UsageWindow(utilization: 40, resetsAt: reset)
        a.sevenDay = UsageWindow(utilization: 5, resetsAt: weekReset)
        a.history = samples(at: at, utilization: 40, ratePerMinute: 0.1, resetsAt: reset)
    case .resetPast:
        a.fiveHour = UsageWindow(utilization: 50, resetsAt: now.addingTimeInterval(-hours(1)))
        a.sevenDay = UsageWindow(utilization: 5, resetsAt: weekReset)
    case .nearFull:
        let reset = now.addingTimeInterval(hours(2))
        a.fiveHour = UsageWindow(utilization: 99.6, resetsAt: reset,
                                 exhaustedSince: now.addingTimeInterval(-minutes(30)))
        a.sevenDay = UsageWindow(utilization: 5, resetsAt: weekReset)
        a.history = samples(at: now, utilization: 99.6, ratePerMinute: 0, resetsAt: reset)
    }
    return a
}

private func expect(_ condition: Bool, _ message: @autoclosure () -> String) {
    if !condition { Issue.record(Comment(rawValue: message())) }
}

/// I1, I3 and I4 for one column: the ring's amber, the faint arc and the text must describe the same
/// future.
private func checkColumn(_ model: ColumnModel, _ projection: Projection?, _ tag: String) {
    expect(!model.line.contains("in -"), "\(tag) negative time: \(model.line)")
    expect(!model.line.hasSuffix(" ago"), "\(tag) clock reading: \(model.line)")
    let resetPast = projection?.resetsAt.map { $0 <= now } == true
    if resetPast {
        expect(model.line == "resetting", "\(tag) past reset line: \(model.line)")
        expect(!model.amber, "\(tag) past reset still amber")
        expect(model.dimmed, "\(tag) past reset not dimmed")
        return
    }
    if let blockedBy = model.blockedBy {
        expect(!model.amber, "\(tag) blocked column amber")
        expect(model.line == blockedBy, "\(tag) blocked line: \(model.line)")
        expect(model.dimmed, "\(tag) blocked column not dimmed")
        return
    }
    let out = model.line.hasPrefix("out")
    let fallback = projection.map { $0.rate == nil && $0.utilization.rounded() >= 85 } ?? false
    let expected = projection?.isExhausted == true || out || fallback
    expect(model.amber == expected,
           "\(tag) amber \(model.amber) expected \(expected), line \(model.line), p \(String(describing: projection))")
    if out { expect(model.faint >= 100, "\(tag) out with faint \(model.faint)") }
    if projection?.isExhausted != true && model.faint >= 100 {
        expect(out, "\(tag) faint \(model.faint) but line \(model.line)")
    }
    if projection?.isExhausted == true { expect(!out, "\(tag) exhausted but line starts out") }
}

private func check(_ accounts: [AccountUsage], _ context: String) {
    let forecasts = accounts.poolForecasts(now: now)
    let pool = accounts.poolOutlook(forecasts: forecasts)
    let pooled = accounts.pooledOutlooks(now: now, forecasts: forecasts)
    let status = claudeStatus(accounts, now: now, pool: pool)
    let compact = accounts.compactModel(now: now, pool: pool)
    let members = accounts.poolIndices

    // I1 + I4
    for i in accounts.indices {
        let a = accounts[i]
        let five = ColumnModel(pooled[i].fiveHour, now: now, noLimit: a.noFiveHourLimit,
                               blockedBy: claudeBlockedBy(noLimit: a.noFiveHourLimit, week: pooled[i].week))
        let week = ColumnModel(pooled[i].week, now: now)
        checkColumn(five, pooled[i].fiveHour, "\(context) row \(i) 5h")
        checkColumn(week, pooled[i].week, "\(context) row \(i) week")
        if pooled[i].fiveHour?.utilization.rounded() ?? 0 >= 100 {
            expect(five.percentText == "100%", "\(context) row \(i) 5h shows \(five.percentText)")
        }
    }
    if members.contains(where: { accounts[$0].fiveHour?.utilization.rounded() ?? 0 >= 100 }) {
        expect(pool.limitedNow > 0, "\(context) 99.6 not counted as limited")
    }

    // I2: the latest "out in …" row column is the headline's 5h wall. Only live windows can name it:
    // a reset that is already past refills in the simulation, so a wall beyond it belongs to a window
    // no row can describe (D1 keeps exhaustsAt inside the current window, D6 says "resetting").
    let liveWindows = members.allSatisfy { i in
        guard let p = pooled[i].fiveHour else { return true }
        return p.isExhausted || p.resetsAt.map { $0 > now } == true
    }
    if liveWindows, let five = pool.fiveHour, five.start > now.addingTimeInterval(60),
       pool.nextOut == five, !accounts.poolNoFiveHourLimit {
        let wall = "out \(whenText(five.start, now: now))"
        let lines = members.compactMap { i -> String? in
            let model = ColumnModel(pooled[i].fiveHour, now: now)
            return model.line.hasPrefix("out") ? model.line : nil
        }
        expect(lines.contains(wall), "\(context) no 5h row names headline wall \(wall); rows \(lines)")
        let latest = members.compactMap { i -> Date? in
            guard let p = pooled[i].fiveHour, !p.isExhausted else { return nil }
            return p.exhaustsAt
        }.max()
        expect(latest.map { whenText($0, now: now) } == whenText(five.start, now: now),
               "\(context) latest row out \(latest.map { whenText($0, now: now) } ?? "none") vs headline \(whenText(five.start, now: now))")
    }

    // I3
    expect(status.warns == (pool.nextOut != nil), "\(context) headline warns \(status.warns) with \(String(describing: pool.nextOut))")
    expect((compact.week?.warns ?? false) == (pool.week != nil), "\(context) compact week amber")
    if let five = compact.fiveHour {
        expect(five.warns == (pool.fiveHour != nil), "\(context) compact 5h amber")
    }
    if let next = pool.nextOut, status.warns {
        if next == pool.fiveHour, !compact.noFiveHourLimit {
            expect(compact.fiveHour?.warns == true, "\(context) headline names 5h wall but 5h ring calm")
        }
        if next == pool.week {
            expect(compact.week?.warns == true, "\(context) headline names week wall but week ring calm")
        }
    }

    // I5
    let inPool = accounts.filter { $0.inPool }
    let inPoolPool = inPool.poolOutlook(now: now)
    expect(claudeStatus(inPool, now: now, pool: inPoolPool) == status,
           "\(context) held/unfetched changed the headline")
    expect(inPool.compactModel(now: now, pool: inPoolPool) == compact,
           "\(context) held/unfetched changed the compact")
}

@Suite struct SurfaceAgreement {
    @Test(arguments: AccountState.allCases) func everySurfaceAgreesAcrossTheMatrix(_ first: AccountState) {
        for second in AccountState.allCases {
            for third in AccountState.allCases {
                let accounts = [account(first, index: 0), account(second, index: 1), account(third, index: 2)]
                check(accounts, "\(first)/\(second)/\(third)")
            }
        }
    }

    @Test func aHeldAccountKeepsItsOwnRowButLeavesThePool() {
        let held = account(.slow, index: 0)
        var paused = held
        paused.heldBack = true
        paused.problem = "Signed out"
        paused.fetchedAt = now.addingTimeInterval(-hours(1))
        let accounts = [account(.fast, index: 1), paused]
        let pooled = accounts.pooledOutlooks(now: now)
        #expect(pooled[1].fiveHour == accounts[1].outlook.fiveHour)
        #expect(accounts.poolOutlook(now: now).members == 1)
        #expect(claudeStatus(accounts, now: now).text.contains("Your account"))
    }

    @Test func aHeldCaptionKeepsTheStaleReason() {
        var a = account(.held, index: 0)
        a.problem = "Offline"
        a.fetchedAt = now.addingTimeInterval(-hours(2))
        #expect(accountCaption(a, identity: "Max 5x", now: now)
                == "Paused · keeping extra usage off · Offline · 2h ago")
        #expect(accountCaption(account(.slow, index: 0), identity: "Max 5x", now: now) == "Max 5x")
    }

    @Test func aHighReadingWithoutPaceWarnsTheRowButNotTheCompact() {
        var a = AccountUsage(id: "a", label: "a", org: "Personal")
        a.capacity = 5
        a.fetchedAt = now
        a.fiveHour = UsageWindow(utilization: 90, resetsAt: now.addingTimeInterval(hours(4) + minutes(55)))
        a.sevenDay = UsageWindow(utilization: 5, resetsAt: now.addingTimeInterval(6 * day))
        let accounts = [a]
        let row = ColumnModel(accounts.pooledOutlooks(now: now)[0].fiveHour, now: now)
        #expect(row.amber)
        #expect(row.line.hasPrefix("resets in "))
        #expect(accounts.compactModel(now: now).fiveHour?.warns == false)
    }

    @Test func aNoLimitMemberCountsAsZeroInTheCompactFiveHourAverage() {
        // Capacity 20 at 0% and capacity 5 at 10%: the pair's 5h ring sits at 2%, not 10%.
        let accounts = [account(.slow, index: 0), account(.noFiveLimit, index: 1)]
        let compact = accounts.compactModel(now: now)
        #expect(abs((compact.fiveHour?.utilization ?? -1) - 2) < 0.001)
    }
}

@Suite struct GoAgreement {
    private func go(_ rolling: UsageWindow?, _ weekly: UsageWindow?, _ monthly: UsageWindow?,
                    history: [Sample] = []) -> GoAccount {
        var a = GoAccount(id: "go", label: "OpenCode Go")
        a.rolling = rolling
        a.weekly = weekly
        a.monthly = monthly
        a.fetchedAt = now
        a.history = history
        return a
    }

    @Test func rowLinesUseTheSameFiveMinuteCountdown() {
        let reset = now.addingTimeInterval(hours(4))
        let weekReset = now.addingTimeInterval(6 * day)
        let monthReset = now.addingTimeInterval(20 * day)
        let a = go(UsageWindow(utilization: 30, resetsAt: reset),
                   UsageWindow(utilization: 10, resetsAt: weekReset),
                   UsageWindow(utilization: 5, resetsAt: monthReset),
                   history: samples(at: now, utilization: 30, ratePerMinute: 0.1, resetsAt: reset))
        let model = goRowModel(a, now: now)
        #expect(model.rolling.line == "resets \(whenText(reset, now: now))")
        #expect(model.weekly.line == "resets \(whenText(weekReset, now: now))")
        #expect(model.monthly.line == "resets \(whenText(monthReset, now: now))")
        #expect(model.rolling.line.hasPrefix("resets in "))
    }

    @Test func blockedColumnsNameTheExhaustedWindowThatResetsLast() {
        let a = go(UsageWindow(utilization: 100, resetsAt: now.addingTimeInterval(hours(2)),
                               exhaustedSince: now.addingTimeInterval(-hours(1))),
                   UsageWindow(utilization: 100, resetsAt: now.addingTimeInterval(2 * day)),
                   UsageWindow(utilization: 50, resetsAt: now.addingTimeInterval(3 * day)))
        let model = goRowModel(a, now: now)
        #expect(model.rolling.amber)
        #expect(model.rolling.line.hasPrefix("back in "))
        #expect(model.weekly.line.hasPrefix("back in "))
        #expect(model.monthly.blockedBy == "weekly limit")
        #expect(model.monthly.line == "weekly limit")
        #expect(!model.monthly.amber)
        #expect(model.monthly.dimmed)
    }

    @Test func aNilResetCountsAsTheLastWait() {
        let a = go(UsageWindow(utilization: 100, resetsAt: nil),
                   UsageWindow(utilization: 100, resetsAt: now.addingTimeInterval(2 * day)),
                   UsageWindow(utilization: 50, resetsAt: now.addingTimeInterval(3 * day)))
        let model = goRowModel(a, now: now)
        #expect(model.weekly.blockedBy == nil)
        #expect(model.monthly.blockedBy == "5h limit")
    }

    @Test func theExhaustedColumnKeepsItsOwnCountdown() {
        let a = go(UsageWindow(utilization: 10, resetsAt: now.addingTimeInterval(hours(4))),
                   UsageWindow(utilization: 100, resetsAt: now.addingTimeInterval(2 * day)),
                   UsageWindow(utilization: 50, resetsAt: now.addingTimeInterval(3 * day)))
        let model = goRowModel(a, now: now)
        #expect(model.weekly.amber)
        #expect(model.weekly.line.hasPrefix("back in "))
        #expect(model.rolling.blockedBy == "weekly limit")
        #expect(model.monthly.blockedBy == "weekly limit")
    }
}
