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

/// Oldest first, so the deltas read as the pace the forecast measures.
private func samples(at: Date, utilization: Double, ratePerMinute: Double, resetsAt: Date) -> [Sample] {
    (1...5).reversed().map { step in
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
        // 1%/min from 60%: out in 40 minutes, well inside the 4h window.
        a.fiveHour = UsageWindow(utilization: 60, resetsAt: fiveReset)
        a.sevenDay = UsageWindow(utilization: 5, resetsAt: weekReset)
        a.history = samples(at: now, utilization: 60, ratePerMinute: 1, resetsAt: fiveReset)
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
        // Paused, but fast enough that its own pace would say "out in 40m" if it were pooled.
        a.heldBack = true
        a.fiveHour = UsageWindow(utilization: 60, resetsAt: fiveReset)
        a.sevenDay = UsageWindow(utilization: 5, resetsAt: weekReset)
        a.history = samples(at: now, utilization: 60, ratePerMinute: 1, resetsAt: fiveReset)
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

private func expectClose(_ actual: Double?, _ expected: Double,
                         _ message: @autoclosure () -> String, tolerance: Double = 0.01) {
    guard let actual else {
        Issue.record(Comment(rawValue: message() + " (nil)"))
        return
    }
    expect(abs(actual - expected) <= tolerance, "\(message()) \(actual) vs \(expected)")
}

private func ratePerMinute(_ projection: Projection?) -> Double? {
    projection?.rate.map { $0 * 60 }
}

/// I1, I3 and I4 for one column: the ring's amber, the faint arc and the text must describe the same
/// future.
private func checkColumn(_ model: ColumnModel, _ projection: Projection?, _ tag: String,
                         inPool: Bool = true) {
    expect(!model.line.contains("in -"), "\(tag) negative time: \(model.line)")
    expect(!model.line.contains("in now"), "\(tag) countdown to now: \(model.line)")
    expect(!model.line.hasSuffix(" ago"), "\(tag) clock reading: \(model.line)")
    if projection?.justReset == true {
        expect(model.line == "just reset", "\(tag) just-reset line: \(model.line)")
        expect(model.percentText == "0%", "\(tag) just-reset percent: \(model.percentText)")
        expect(model.solid == 0 && model.faint == 0, "\(tag) just-reset arcs \(model.solid)/\(model.faint)")
        expect(!model.amber, "\(tag) just-reset amber")
        expect(!model.dimmed, "\(tag) just-reset dimmed")
        return
    }
    if projection?.resetsAt.map({ $0 <= now }) == true {
        // A reading old enough that its reset passed since: the window refilled, and a past moment
        // must never reach the countdown.
        expect(model.line == "just reset", "\(tag) past-reset line: \(model.line)")
        expect(!model.amber, "\(tag) past reset still amber")
        expect(!model.line.contains("in "), "\(tag) past reset countdown: \(model.line)")
        return
    }
    if let blockedBy = model.blockedBy {
        expect(!model.amber, "\(tag) blocked column amber")
        expect(model.line == blockedBy, "\(tag) blocked line: \(model.line)")
        expect(model.dimmed, "\(tag) blocked column not dimmed")
        return
    }
    let out = model.line.hasPrefix("out")
    let fallback = inPool && (projection.map { $0.rate == nil && $0.utilization.rounded() >= 85 } ?? false)
    let expected = projection?.isExhausted == true || (inPool && out) || fallback
    expect(model.amber == expected,
           "\(tag) amber \(model.amber) expected \(expected), line \(model.line), p \(String(describing: projection))")
    if out, inPool { expect(model.faint >= 100, "\(tag) out with faint \(model.faint)") }
    if projection?.isExhausted != true && model.faint >= 100 && inPool {
        expect(out, "\(tag) faint \(model.faint) but line \(model.line)")
    }
    if projection?.isExhausted == true { expect(!out, "\(tag) exhausted but line starts out") }
    if let exhaustsAt = projection?.exhaustsAt, exhaustsAt <= now, projection?.isExhausted != true {
        expect(model.line == "out now", "\(tag) carried-out window not said now: \(model.line)")
    }
    if !inPool {
        expect(model.faint == model.solid, "\(tag) out-of-pool faint \(model.faint) vs solid \(model.solid)")
        expect(!out, "\(tag) out-of-pool row claims a schedule: \(model.line)")
        expect(!model.amber || projection?.isExhausted == true,
               "\(tag) out-of-pool amber without a limit: \(model.line)")
    }
}

@MainActor
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
        let blocked = claudeBlockedBy(noLimit: a.noFiveHourLimit, week: pooled[i].week)
        let five = ColumnModel(pooled[i].fiveHour, now: now, noLimit: a.noFiveHourLimit,
                               inPool: a.inPool, blockedBy: blocked)
        let week = ColumnModel(pooled[i].week, now: now, inPool: a.inPool)
        checkColumn(five, pooled[i].fiveHour, "\(context) row \(i) 5h", inPool: a.inPool)
        checkColumn(week, pooled[i].week, "\(context) row \(i) week", inPool: a.inPool)
        expect(five.blockedBy == blocked, "\(context) row \(i) blockedBy \(String(describing: five.blockedBy))")
        if let blocked {
            expect(blocked == "weekly limit" && pooled[i].week?.isExhausted == true,
                   "\(context) row \(i) blocked by \(blocked) without an exhausted week")
        }
        if pooled[i].fiveHour?.utilization.rounded() ?? 0 >= 100 {
            expect(five.percentText == "100%", "\(context) row \(i) 5h shows \(five.percentText)")
        }
    }
    if members.contains(where: { accounts[$0].fiveHour?.utilization.rounded() ?? 0 >= 100 }) {
        expect(pool.limitedNow > 0, "\(context) 99.6 not counted as limited")
    }

    // I2: the latest "out in …" row column is the headline's 5h wall.
    // Rows are read as the panel draws them. A row shows its current window, so a member whose window
    // resets before the wall can't name it; a just-refilled window (no reset yet) still can.
    if let five = pool.fiveHour, five.start > now.addingTimeInterval(60),
       pool.nextOut == five, !accounts.poolNoFiveHourLimit {
        let namers = members.filter { i in
            guard let p = pooled[i].fiveHour else { return false }
            return p.resetsAt.map { $0 > five.start } ?? true
        }
        let lines = namers.map { i -> String in
            let a = accounts[i]
            return ColumnModel(pooled[i].fiveHour, now: now, noLimit: a.noFiveHourLimit, inPool: a.inPool,
                               blockedBy: claudeBlockedBy(noLimit: a.noFiveHourLimit, week: pooled[i].week)).line
        }
        let outs = lines.filter { $0.hasPrefix("out") }
        let wall = "out \(whenText(five.start, now: now))"
        // When a member resets before the wall, the wall can fall in its next window: the rows then
        // read "back in X" and "out in X", and none can name the wall itself.
        let wallInALaterWindow = members.contains { i in
            pooled[i].fiveHour?.resetsAt.map { $0 <= five.start } ?? false
        }
        if !namers.isEmpty, !wallInALaterWindow {
            expect(outs.contains(wall), "\(context) no 5h row names headline wall \(wall); rows \(lines)")
        }
        expect(!outs.contains("out now"), "\(context) a row says out now before the wall; rows \(lines)")
        let latest = namers.compactMap { i -> Date? in
            guard let p = pooled[i].fiveHour, !p.isExhausted, claudeBlockedBy(
                noLimit: accounts[i].noFiveHourLimit, week: pooled[i].week) == nil else { return nil }
            return p.exhaustsAt
        }.max()
        expect(latest.map { $0 <= five.start.addingTimeInterval(60) } ?? true,
               "\(context) a row runs out after the wall; rows \(lines)")
    }

    // I2 for a pool that is already limited: every member must say out or blocked right now.
    if let next = pool.nextOut, next.start <= now.addingTimeInterval(60) {
        for i in members {
            let a = accounts[i]
            let blocked = claudeBlockedBy(noLimit: a.noFiveHourLimit, week: pooled[i].week)
            let five = ColumnModel(pooled[i].fiveHour, now: now, noLimit: a.noFiveHourLimit,
                                   inPool: a.inPool, blockedBy: blocked)
            let week = ColumnModel(pooled[i].week, now: now, inPool: a.inPool)
            let fiveOut = pooled[i].fiveHour?.isExhausted == true || blocked != nil
            let weekOut = pooled[i].week?.isExhausted == true || week.blockedBy != nil
            expect(fiveOut || weekOut,
                   "\(context) limited now but row \(i) is open: \(five.line) / \(week.line)")
        }
    }

    // I3: the headline's wall must light the compact ring for that window.
    if let next = pool.nextOut, status.warns {
        if next == pool.fiveHour, !compact.noFiveHourLimit, let five = compact.fiveHour {
            expect(five.warns, "\(context) headline names 5h wall but 5h ring calm")
        }
        if next == pool.week, let week = compact.week {
            expect(week.warns, "\(context) headline names week wall but week ring calm")
        }
    }

    // The compact's next-out is the headline's wall, read through the same countdown.
    let nextOutWalls = CompactNextOut.walls(accounts, [], now: now)
    if let next = pool.nextOut {
        expect(nextOutWalls.count == 1 && nextOutWalls[0].label == "Claude",
               "\(context) compact next-out is not the Claude wall: \(nextOutWalls.map(\.label))")
        if let wall = nextOutWalls.first(where: { $0.label == "Claude" }) {
            expect(wall.blackout == next, "\(context) compact next-out \(wall.blackout) vs headline \(next)")
        }
        let back = next.end.flatMap { $0 > now ? " · back \(whenText($0, now: now))" : nil } ?? ""
        let expectedText = next.start <= now.addingTimeInterval(60)
            ? "out" + back
            : "out \(whenText(next.start, now: now))"
        expect(CompactNextOut.wall(accounts, [], now: now)?.text == expectedText,
               "\(context) compact next-out text \(String(describing: CompactNextOut.wall(accounts, [], now: now)?.text)) vs \(expectedText)")
    } else {
        expect(nextOutWalls.isEmpty, "\(context) compact next-out without a headline wall")
    }

    // I5: accounts outside the pool change neither the pool's status nor its compact.
    if accounts.contains(where: { !$0.inPool }) {
        let inPool = accounts.filter { $0.inPool }
        let inPoolPool = inPool.poolOutlook(now: now)
        expect(claudeStatus(inPool, now: now, pool: inPoolPool) == status,
               "\(context) held/unfetched changed the headline")
        expect(inPool.compactModel(now: now, pool: inPoolPool) == compact,
               "\(context) held/unfetched changed the compact")
        expect(inPoolPool.members == pool.members, "\(context) held/unfetched changed the pool size")
        expect(CompactNextOut.wall(inPool, [], now: now)?.text
                == CompactNextOut.wall(accounts, [], now: now)?.text,
               "\(context) held/unfetched changed the compact next-out")
    }
}

@MainActor @Suite struct SurfaceAgreement {
    @Test(arguments: AccountState.allCases) func everySurfaceAgreesAcrossTheMatrix(_ first: AccountState) {
        for second in AccountState.allCases {
            for third in AccountState.allCases {
                let accounts = [account(first, index: 0), account(second, index: 1), account(third, index: 2)]
                check(accounts, "\(first)/\(second)/\(third)")
            }
        }
    }

    @Test(arguments: AccountState.allCases) func eachStateProjectsItsIntendedPace(_ state: AccountState) {
        let a = account(state, index: 0)
        let outlook = a.outlook
        switch state {
        case .slow:
            expectClose(ratePerMinute(outlook.fiveHour), 0.1, "\(state) 5h rate")
            expect(outlook.fiveHour?.exhaustsAt == nil, "\(state) 5h runs out")
            expect(outlook.week?.exhaustsAt == nil, "\(state) week runs out")
        case .fast:
            expectClose(ratePerMinute(outlook.fiveHour), 1, "\(state) 5h rate")
            guard let out = outlook.fiveHour?.exhaustsAt else {
                Issue.record(Comment(rawValue: "\(state) has no 5h exhaustion"))
                return
            }
            expect(abs(out.timeIntervalSince(now + minutes(40))) <= minutes(1),
                   "\(state) 5h out \(out.timeIntervalSince(now) / 60)m")
            expect(outlook.fiveHour?.isExhausted == false, "\(state) already exhausted")
        case .held:
            expect(a.heldBack, "\(state) is not paused")
            expectClose(ratePerMinute(outlook.fiveHour), 1, "\(state) 5h rate")
            expect(outlook.fiveHour?.exhaustsAt != nil, "\(state) does not run out at its own pace")
        case .fiveOut:
            expect(outlook.fiveHour?.isExhausted == true, "\(state) not out")
            expect(outlook.fiveHour?.exhaustsAt == now - hours(1), "\(state) lost its exhaustion time")
        case .weekOut:
            expect(outlook.week?.isExhausted == true, "\(state) week not out")
            expect(outlook.week?.exhaustsAt == now - day, "\(state) lost its week exhaustion time")
            expect(outlook.fiveHour?.exhaustsAt == nil, "\(state) 5h runs out")
        case .weekNearlyOut:
            guard let out = outlook.week?.exhaustsAt else {
                Issue.record(Comment(rawValue: "\(state) week never runs out"))
                return
            }
            expect(out > now && out <= now.addingTimeInterval(hours(2)),
                   "\(state) week out in \(out.timeIntervalSince(now) / 60)m")
        case .noFiveLimit:
            expect(outlook.fiveHour == nil && outlook.week != nil, "\(state) windows wrong")
        case .neverFetched:
            expect(outlook.fiveHour == nil && outlook.week == nil, "\(state) has a projection")
        case .stale:
            expect(outlook.fiveHour?.at == now - hours(2), "\(state) lost its reading time")
            expectClose(ratePerMinute(outlook.fiveHour), 0.1, "\(state) 5h rate")
            expect(outlook.fiveHour?.exhaustsAt == nil, "\(state) runs out before reset")
        case .resetPast:
            expect(outlook.fiveHour?.justReset == true, "\(state) 5h survived its reset")
            expect(outlook.fiveHour?.utilization == 0 && outlook.fiveHour?.projected == 0,
                   "\(state) 5h not zeroed")
            expect(outlook.fiveHour?.resetsAt == nil && outlook.fiveHour?.rate == nil,
                   "\(state) 5h kept stale fields")
            expect(outlook.week?.justReset == false, "\(state) zeroed the week too")
        case .nearFull:
            expect(outlook.fiveHour?.isExhausted == true, "\(state) 99.6 not out")
            expect(outlook.fiveHour?.exhaustsAt == now - minutes(30), "\(state) lost its exhaustion time")
        }
    }

    @Test func aHeldAccountKeepsItsOwnRowButLeavesThePool() {
        var paused = account(.held, index: 1)
        paused.problem = "Signed out"
        let accounts = [account(.fast, index: 0), paused]
        let pooled = accounts.pooledOutlooks(now: now)
        let row = ColumnModel(pooled[1].fiveHour, now: now, inPool: accounts[1].inPool)
        #expect(pooled[1].fiveHour?.rate == accounts[1].outlook.fiveHour?.rate)
        #expect(pooled[1].fiveHour?.exhaustsAt == nil)
        #expect(pooled[1].fiveHour?.projected == nil)
        #expect(row.faint == row.solid)
        #expect(!row.amber)
        #expect(row.line.hasPrefix("resets "))
        #expect(accounts.poolOutlook(now: now).members == 1)
        #expect(claudeStatus(accounts, now: now).text.contains("Your account"))
    }

    @Test func anOutOfPoolHighReadingStaysCalm() {
        var a = AccountUsage(id: "a", label: "a", org: "Personal")
        a.capacity = 5
        a.fetchedAt = now
        a.heldBack = true
        a.fiveHour = UsageWindow(utilization: 90, resetsAt: now.addingTimeInterval(hours(4) + minutes(55)))
        a.sevenDay = UsageWindow(utilization: 5, resetsAt: now.addingTimeInterval(6 * day))
        let pooled = [a].pooledOutlooks(now: now)
        let row = ColumnModel(pooled[0].fiveHour, now: now, inPool: false)
        #expect(!row.amber)
        #expect(row.faint == row.solid)
        #expect(row.line.hasPrefix("resets in "))
    }

    @Test func aWindowWhoseResetPassedReadsZeroOnEverySurface() {
        let accounts = [account(.resetPast, index: 0)]
        #expect(accounts[0].outlook.fiveHour?.justReset == true)
        let pooled = accounts.pooledOutlooks(now: now)
        #expect(pooled[0].fiveHour?.justReset == true)
        let row = ColumnModel(pooled[0].fiveHour, now: now)
        #expect(row.percentText == "0%")
        #expect(row.line == "just reset")
        #expect(!row.amber)
        #expect(row.solid == 0 && row.faint == 0)
        #expect(accounts.compactModel(now: now).fiveHour?.utilization == 0)
        #expect(accounts.poolOutlook(now: now).fiveHour == nil)
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

@MainActor @Suite struct GoAgreement {
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

    /// Every Go surface reads the same walls, measured from the same `now`.
    @MainActor private func checkAgreement(_ accounts: [GoAccount], _ tag: String) {
        let compact = accounts.compactModel(now: now)
        let status = goStatus(accounts, now: now)
        let amber = compact.rolling?.warns == true
            || compact.weekly?.warns == true || compact.monthly?.warns == true
        expect(amber == status.warns, "\(tag) compact amber \(amber) vs headline \(status.warns): \(status.text)")
        expect((CompactNextOut.wall([], accounts, now: now) != nil) == status.warns,
               "\(tag) compact next-out vs headline \(status.text)")
        let next = accounts.nextOut(now: now)
        let walls = CompactNextOut.walls([], accounts, now: now)
        if let next {
            expect(walls.count == 1 && walls[0].label == "OpenCode Go" && walls[0].blackout == next,
                   "\(tag) next-out \(walls.map(\.label)) vs \(next)")
            let expected = next.start <= now.addingTimeInterval(60)
                ? "out" + (next.end.flatMap { $0 > now ? " · back \(whenText($0, now: now))" : nil } ?? "")
                : "out \(whenText(next.start, now: now))"
            expect(CompactNextOut.wall([], accounts, now: now)?.text == expected,
                   "\(tag) next-out text vs \(expected)")
        } else {
            expect(walls.isEmpty, "\(tag) wall without a headline")
        }
        for i in accounts.indices {
            let model = goRowModel(accounts[i], now: now)
            for (name, column) in [("5h", model.rolling), ("weekly", model.weekly), ("monthly", model.monthly)] {
                expect(!column.line.contains("in -"), "\(tag) row \(i) \(name) negative time")
                expect(!column.line.contains("in now"), "\(tag) row \(i) \(name) countdown to now")
            }
        }
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
        checkAgreement([a], "one steady key")
    }

    @Test func blockedColumnsNameTheExhaustedWindowThatResetsLast() {
        let a = go(UsageWindow(utilization: 100, resetsAt: now.addingTimeInterval(hours(2)),
                               exhaustedSince: now.addingTimeInterval(-hours(1))),
                   UsageWindow(utilization: 100, resetsAt: now.addingTimeInterval(2 * day)),
                   UsageWindow(utilization: 50, resetsAt: now.addingTimeInterval(3 * day)))
        let model = goRowModel(a, now: now)
        #expect(model.rolling.amber)
        #expect(model.rolling.line.hasPrefix("back "))
        #expect(model.weekly.line.hasPrefix("back "))
        #expect(model.monthly.blockedBy == "weekly limit")
        #expect(model.monthly.line == "weekly limit")
        #expect(!model.monthly.amber)
        #expect(model.monthly.dimmed)
        checkAgreement([a], "two exhausted windows")
    }

    @Test func aNilResetCountsAsTheLastWait() {
        let a = go(UsageWindow(utilization: 100, resetsAt: nil),
                   UsageWindow(utilization: 100, resetsAt: now.addingTimeInterval(2 * day)),
                   UsageWindow(utilization: 50, resetsAt: now.addingTimeInterval(3 * day)))
        let model = goRowModel(a, now: now)
        #expect(model.weekly.blockedBy == nil)
        #expect(model.monthly.blockedBy == "5h limit")
        checkAgreement([a], "nil reset")
    }

    @Test func theExhaustedColumnKeepsItsOwnCountdown() {
        let a = go(UsageWindow(utilization: 10, resetsAt: now.addingTimeInterval(hours(4))),
                   UsageWindow(utilization: 100, resetsAt: now.addingTimeInterval(2 * day)),
                   UsageWindow(utilization: 50, resetsAt: now.addingTimeInterval(3 * day)))
        let model = goRowModel(a, now: now)
        #expect(model.weekly.amber)
        #expect(model.weekly.line.hasPrefix("back "))
        #expect(model.rolling.blockedBy == "weekly limit")
        #expect(model.monthly.blockedBy == "weekly limit")
        checkAgreement([a], "exhausted week")
    }

    @Test func aResetThatHasPassedReadsZeroEverywhere() {
        let a = go(UsageWindow(utilization: 50, resetsAt: now - hours(1)),
                   UsageWindow(utilization: 10, resetsAt: now + 6 * day),
                   UsageWindow(utilization: 5, resetsAt: now + 20 * day))
        #expect(a.outlook.rolling?.justReset == true)
        let model = goRowModel(a, now: now)
        #expect(model.rolling.percentText == "0%")
        #expect(model.rolling.line == "just reset")
        #expect(!model.rolling.amber)
        #expect(model.rolling.solid == 0 && model.rolling.faint == 0)
        let compact = [a].compactModel(now: now)
        #expect(compact.rolling?.utilization == 0)
        #expect(compact.rolling?.warns == false)
        #expect(!goStatus([a], now: now).warns)
        checkAgreement([a], "past reset")
    }

    @Test func aStaleWindowWhoseResetPassedIsNoWall() {
        var a = go(UsageWindow(utilization: 100, resetsAt: now - hours(1),
                               exhaustedSince: now - hours(3)),
                   UsageWindow(utilization: 10, resetsAt: now + 6 * day),
                   UsageWindow(utilization: 5, resetsAt: now + 20 * day))
        // Read two hours ago, when the reset was still ahead: the reset has passed since.
        a.fetchedAt = now - hours(2)
        #expect(a.outlook.rolling?.justReset == false)
        #expect(wall(a.outlook.rolling!, now: now) == nil)
        #expect(!goStatus([a], now: now).warns)
        #expect([a].compactModel(now: now).rolling?.warns == false)
        let model = goRowModel(a, now: now)
        #expect(model.rolling.line == "just reset")
        #expect(!model.rolling.amber)
        checkAgreement([a], "stale past reset")
    }

    @Test func severalKeysAgreeEvenWhenOneIsAlreadyOut() {
        let out = go(UsageWindow(utilization: 100, resetsAt: now + hours(1)),
                     UsageWindow(utilization: 20, resetsAt: now + 4 * day),
                     UsageWindow(utilization: 10, resetsAt: now + 20 * day))
        let calm = go(UsageWindow(utilization: 20, resetsAt: now + hours(4)),
                      UsageWindow(utilization: 10, resetsAt: now + 5 * day),
                      UsageWindow(utilization: 5, resetsAt: now + 20 * day),
                      history: samples(at: now, utilization: 20, ratePerMinute: 0.1,
                                       resetsAt: now + hours(4)))
        checkAgreement([out, calm], "one key out")
    }
}
