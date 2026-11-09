import Foundation
import UsageForecast

/// Where each of an account's windows is heading, from its latest reading and recent history.
struct Outlook {
    let fiveHour: Projection?
    let week: Projection?
}

/// Accounts whose plan hasn't loaded yet count as 5x: the smallest allowance cliproxy is likely to hold.
private let assumedCapacity = 5.0

extension AccountUsage {
    /// Anthropic has lifted the 5h limit on this account: it reports a week but no 5h window.
    var noFiveHourLimit: Bool { fetchedAt != nil && fiveHour == nil && sevenDay != nil }

    var outlook: Outlook {
        let at = fetchedAt ?? .now
        func sample(_ w: UsageWindow) -> Sample {
            Sample(at: at, utilization: w.utilization, resetsAt: w.resetsAt, exhaustedSince: w.exhaustedSince)
        }
        return Outlook(
            fiveHour: fiveHour.map { Forecast.project(.fiveHour, current: sample($0), history: history) },
            week: sevenDay.map { Forecast.project(.week, current: sample($0), history: []) }
        )
    }
}

struct PoolOutlook {
    let fiveHour: Blackout?
    let week: Blackout?
    /// Accounts at a limit right now, in either window.
    let limitedNow: Int
    /// False until some account has enough history to project: "clear" would be a guess.
    let canProject: Bool

    /// The next time every account is out. The 5h simulation already takes weeks running out into
    /// account, so when it finds one it's never later than the week's.
    var nextOut: Blackout? { fiveHour ?? week }
}

/// One pool member per account, built from that account's own outlook.
private func poolMembers(_ accounts: [AccountUsage], _ outlooks: [Outlook]) -> [PoolMember] {
    zip(accounts, outlooks).map { account, outlook in
        PoolMember(fiveHour: outlook.fiveHour, week: outlook.week, capacity: account.capacity ?? assumedCapacity)
    }
}

extension [AccountUsage] {
    /// The compact's one pair for the whole pool: capacity-weighted usage, so a 20x account's points
    /// count four times a 5x account's. The pool's own forecast decides the amber, so a moderate
    /// average still warns when the pool as a whole runs out before the window resets. No faint arc:
    /// on a 12pt ring a projection reads as usage, not as a forecast.
    func combinedOutlook(now: Date) -> Outlook {
        let pool = poolOutlook(now: now)
        func pooled(_ window: (AccountUsage) -> UsageWindow?, wall: Blackout?) -> Projection? {
            let members = compactMap { account in window(account).map { (account, $0) } }
            var weighted = 0.0
            var total = 0.0
            for (account, window) in members {
                let weight = Swift.max(account.capacity ?? assumedCapacity, 0.1)
                weighted += weight * window.utilization
                total += weight
            }
            guard total > 0 else { return nil }
            return Projection(at: now, utilization: weighted / total, resetsAt: wall?.end, rate: nil,
                              projected: nil, exhaustsAt: wall?.start)
        }
        return Outlook(
            fiveHour: pooled({ $0.fiveHour }, wall: pool.fiveHour),
            week: pooled({ $0.sevenDay }, wall: pool.week)
        )
    }

    /// True when every account that has reported has had its 5h limit lifted, so the pair has no 5h ring.
    var poolNoFiveHourLimit: Bool {
        let reporting = filter { $0.fetchedAt != nil && $0.sevenDay != nil }
        return !reporting.isEmpty && reporting.allSatisfy { $0.fiveHour == nil }
    }

    func poolOutlook(now: Date) -> PoolOutlook {
        let outlooks = map(\.outlook)
        let members = poolMembers(self, outlooks)
        return PoolOutlook(
            fiveHour: Forecast.blackout(.fiveHour, members, now: now),
            week: Forecast.blackout(.week, members, now: now),
            limitedNow: outlooks.filter { $0.fiveHour?.isExhausted == true || $0.week?.isExhausted == true }.count,
            canProject: outlooks.contains { $0.fiveHour?.rate != nil || $0.week?.rate != nil }
        )
    }

    /// Each account's outlook with the shared pool's outage start standing in for its own: load moves to
    /// whoever is still open, so an open account runs out when the pool says, not at its own pace. A
    /// window already at its limit keeps the time it actually ran out.
    func pooledOutlooks(now: Date) -> [Outlook] {
        let outlooks = map(\.outlook)
        let members = poolMembers(self, outlooks)
        let fiveHour = Forecast.poolForecast(.fiveHour, members, now: now).outageStart
        let week = Forecast.poolForecast(.week, members, now: now).outageStart
        func pooled(_ p: Projection?, outage: Date?) -> Projection? {
            guard let p, !p.isExhausted else { return p }
            let out = outage.flatMap { out in p.resetsAt.map { out < $0 } == true ? out : nil }
            return Projection(at: p.at, utilization: p.utilization, resetsAt: p.resetsAt, rate: p.rate,
                              projected: p.projected, exhaustsAt: out)
        }
        return outlooks.enumerated().map { i, outlook in
            Outlook(fiveHour: pooled(outlook.fiveHour, outage: fiveHour[i]),
                    week: pooled(outlook.week, outage: week[i]))
        }
    }
}

extension Projection {
    /// Amber means one thing: this window will stop you before it resets. Without enough history to
    /// project, a high reading stands in.
    var warns: Bool { isExhausted || runsOutBeforeReset || (rate == nil && utilization.rounded() >= 85) }
}
