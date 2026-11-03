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
}

extension [AccountUsage] {
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
