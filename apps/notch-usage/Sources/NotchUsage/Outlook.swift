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
        let members = zip(self, outlooks).map { account, outlook in
            PoolMember(fiveHour: outlook.fiveHour, week: outlook.week, capacity: account.capacity ?? assumedCapacity)
        }
        return PoolOutlook(
            fiveHour: Forecast.blackout(.fiveHour, members, now: now),
            week: Forecast.blackout(.week, members, now: now),
            limitedNow: outlooks.filter { $0.fiveHour?.isExhausted == true || $0.week?.isExhausted == true }.count,
            canProject: outlooks.contains { $0.fiveHour?.rate != nil || $0.week?.rate != nil }
        )
    }
}

extension Projection {
    /// Amber means one thing: this window will stop you before it resets. Without enough history to
    /// project, a high reading stands in.
    var warns: Bool { isExhausted || runsOutBeforeReset || (rate == nil && utilization.rounded() >= 85) }
}
