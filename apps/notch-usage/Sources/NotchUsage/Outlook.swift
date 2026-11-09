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

    /// cliproxy is routing to it and it has reported: only these belong to the pool.
    var inPool: Bool { !heldBack && fetchedAt != nil }

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
    /// Accounts in the pool, which is also the denominator in "n of m limited".
    let members: Int

    /// The next time every account is out. The 5h simulation already takes weeks running out into
    /// account, so when it finds one it's never later than the week's.
    var nextOut: Blackout? { fiveHour ?? week }
}

struct CompactRing: Equatable {
    let utilization: Double
    let warns: Bool
}

struct PoolForecasts {
    let fiveHour: PoolForecast
    let week: PoolForecast
}

struct ClaudeCompact: Equatable {
    let noFiveHourLimit: Bool
    let fiveHour: CompactRing?
    let week: CompactRing?
    let dimmed: Bool
}

struct GoCompact: Equatable {
    let rolling: CompactRing?
    let weekly: CompactRing?
    let monthly: CompactRing?
    let dimmed: Bool
}

extension [AccountUsage] {
    /// Indices of the accounts in the pool; rows still list all of them.
    var poolIndices: [Int] { indices.filter { self[$0].inPool } }

    private func poolRows(_ outlooks: [Outlook]) -> [PoolMember] {
        poolIndices.map {
            PoolMember(fiveHour: outlooks[$0].fiveHour, week: outlooks[$0].week,
                       capacity: self[$0].capacity ?? assumedCapacity)
        }
    }

    /// The compact's one pair for the whole pool: capacity-weighted usage, so a 20x account's points
    /// count four times a 5x account's. Amber comes from the pool's own forecast: a moderate average
    /// still warns when the pool as a whole runs out before the window resets. A member whose 5h limit
    /// was lifted still holds capacity, so it enters the 5h average as 0%.
    func compactModel(now: Date, pool: PoolOutlook? = nil) -> ClaudeCompact {
        let pool = pool ?? poolOutlook(now: now)
        let members = poolIndices
        func average(_ window: (AccountUsage) -> UsageWindow?, countMissingAsZero: Bool) -> Double? {
            var total = 0.0
            var used = 0.0
            for i in members {
                let weight = Swift.max(self[i].capacity ?? assumedCapacity, 0.1)
                if let window = window(self[i]) {
                    used += weight * window.utilization
                    total += weight
                } else if countMissingAsZero {
                    total += weight
                }
            }
            guard total > 0 else { return nil }
            return used / total
        }
        let noFive = poolNoFiveHourLimit
        let five = noFive ? nil : average({ $0.fiveHour }, countMissingAsZero: true)
            .map { CompactRing(utilization: $0, warns: pool.fiveHour != nil) }
        let week = average({ $0.sevenDay }, countMissingAsZero: false)
            .map { CompactRing(utilization: $0, warns: pool.week != nil) }
        return ClaudeCompact(noFiveHourLimit: noFive, fiveHour: five, week: week, dimmed: members.isEmpty)
    }

    /// True when every account in the pool has had its 5h limit lifted, so the pair has no 5h ring.
    var poolNoFiveHourLimit: Bool {
        let reporting = poolIndices.filter { self[$0].sevenDay != nil }
        return !reporting.isEmpty && reporting.allSatisfy { self[$0].fiveHour == nil }
    }

    /// One week simulation feeds the 5h one, so a caller that needs both the headline and the rows
    /// computes these once instead of once per surface.
    func poolForecasts(now: Date) -> PoolForecasts {
        let rows = poolRows(map(\.outlook))
        return PoolForecasts(fiveHour: Forecast.poolForecast(.fiveHour, rows, now: now),
                             week: Forecast.poolForecast(.week, rows, now: now))
    }

    func poolOutlook(now: Date) -> PoolOutlook {
        poolOutlook(forecasts: poolForecasts(now: now))
    }

    func poolOutlook(forecasts: PoolForecasts) -> PoolOutlook {
        let own = map(\.outlook)
        let members = poolIndices
        return PoolOutlook(
            fiveHour: forecasts.fiveHour.blackout,
            week: forecasts.week.blackout,
            limitedNow: members.filter {
                own[$0].fiveHour?.isExhausted == true || own[$0].week?.isExhausted == true
            }.count,
            canProject: members.contains { own[$0].fiveHour?.rate != nil || own[$0].week?.rate != nil },
            members: members.count
        )
    }

    /// Each pool member's outlook with the shared pool's schedule standing in for its own: load moves
    /// to whoever is still open, so an open account runs out when the pool says, not at its own pace.
    /// A window already at its limit, or an account outside the pool, keeps its own outlook.
    func pooledOutlooks(now: Date) -> [Outlook] {
        pooledOutlooks(now: now, forecasts: poolForecasts(now: now))
    }

    func pooledOutlooks(now: Date, forecasts: PoolForecasts) -> [Outlook] {
        let own = map(\.outlook)
        let members = poolIndices
        let five = forecasts.fiveHour
        let week = forecasts.week
        func pooled(_ p: Projection?, _ slot: Int, _ forecast: PoolForecast) -> Projection? {
            guard let p, !p.isExhausted else { return p }
            let out = forecast.outageStart[slot].flatMap { out in
                p.resetsAt.map { out < $0 } == true ? out : nil
            }
            let landing = forecast.landing[slot] ?? p.projected ?? p.utilization
            let projected = out == nil ? Swift.min(landing, 99.99) : Swift.max(landing, 100)
            return Projection(at: p.at, utilization: p.utilization, resetsAt: p.resetsAt, rate: p.rate,
                              projected: projected, exhaustsAt: out)
        }
        var result = own
        for (slot, index) in members.enumerated() {
            result[index] = Outlook(fiveHour: pooled(own[index].fiveHour, slot, five),
                                    week: pooled(own[index].week, slot, week))
        }
        return result
    }
}

extension [GoAccount] {
    /// The compact's one triple: one key is the exact projection, several are averaged. Amber comes
    /// from any key's wall for that window, so a key that is out still warns when the average looks calm.
    func compactModel(now: Date) -> GoCompact {
        let combined = combinedOutlook(now: now)
        let outlooks = map(\.outlook)
        func warns(_ window: KeyPath<GoOutlook, Projection?>) -> Bool {
            outlooks.contains { $0[keyPath: window].flatMap(wall) != nil }
        }
        func ring(_ p: Projection?, warns: Bool) -> CompactRing? {
            p.map { CompactRing(utilization: $0.utilization, warns: warns) }
        }
        return GoCompact(
            rolling: ring(combined.rolling, warns: warns(\.rolling)),
            weekly: ring(combined.weekly, warns: warns(\.weekly)),
            monthly: ring(combined.monthly, warns: warns(\.monthly)),
            dimmed: isEmpty || allSatisfy { $0.fetchedAt == nil }
        )
    }
}

extension Projection {
    /// Amber means one thing: this window will stop you before it resets. Without enough history to
    /// project, a high reading stands in.
    var warns: Bool { isExhausted || runsOutBeforeReset || (rate == nil && utilization.rounded() >= 85) }
}
