import Foundation

/// One reading of a usage window, as returned by Anthropic.
public struct Sample: Codable, Equatable, Sendable {
    public let at: Date
    public let utilization: Double
    public let resetsAt: Date?
    /// When this window was first seen at its limit.
    public let exhaustedSince: Date?

    public init(at: Date, utilization: Double, resetsAt: Date?, exhaustedSince: Date? = nil) {
        self.at = at
        self.utilization = utilization
        self.resetsAt = resetsAt
        self.exhaustedSince = exhaustedSince
    }
}

public enum WindowKind: Sendable {
    case fiveHour, week, month

    public var length: TimeInterval {
        switch self {
        case .fiveHour: 5 * 3600
        case .week: 7 * 86400
        // Billing months vary by a day or two; the allowance is what matters, not the exact edge.
        case .month: 30 * 86400
        }
    }

    /// The shortest stretch a rate is drawn from; anything shorter is noise.
    var minSpan: TimeInterval {
        switch self {
        case .fiveHour: 10 * 60
        case .week: 6 * 3600
        case .month: 24 * 3600
        }
    }
}

public struct Projection: Equatable, Sendable {
    /// When `utilization` was read.
    public let at: Date
    public let utilization: Double
    public let resetsAt: Date?
    /// Percentage points per second, or nil when there's too little history to say. For an exhausted
    /// window, the pace that ran it out: that traffic now lands on the other accounts.
    public let rate: Double?
    /// Where utilization lands at reset if the current pace holds. Uncapped.
    public let projected: Double?
    /// When the window hits 100%, if that happens before it resets. In the past when already there.
    public let exhaustsAt: Date?

    public init(at: Date, utilization: Double, resetsAt: Date?, rate: Double?, projected: Double?, exhaustsAt: Date?) {
        self.at = at
        self.utilization = utilization
        self.resetsAt = resetsAt
        self.rate = rate
        self.projected = projected
        self.exhaustsAt = exhaustsAt
    }

    public var isExhausted: Bool { utilization >= 100 }
    public var runsOutBeforeReset: Bool { exhaustsAt != nil }
}

public enum Forecast {
    /// The 5h window follows recent pace, so stopping work shows up within minutes. The week uses its
    /// average since the window opened: hour-to-hour rates swing with sleep and meetings.
    public static func project(_ kind: WindowKind, current: Sample, history: [Sample]) -> Projection {
        let u = current.utilization
        guard let resetsAt = current.resetsAt else {
            return Projection(at: current.at, utilization: u, resetsAt: nil, rate: nil, projected: nil, exhaustsAt: nil)
        }
        if u >= 100 {
            let since = current.exhaustedSince ?? current.at
            let peak = Sample(at: since, utilization: u, resetsAt: resetsAt)
            let rate = (kind == .fiveHour ? recentRate(current: peak, history: history, kind: kind) : nil)
                ?? windowAverageRate(current: peak, kind: kind)
            return Projection(at: current.at, utilization: u, resetsAt: resetsAt, rate: rate, projected: u, exhaustsAt: since)
        }
        let rate = (kind == .fiveHour ? recentRate(current: current, history: history, kind: kind) : nil)
            ?? windowAverageRate(current: current, kind: kind)
        guard let rate else {
            return Projection(at: current.at, utilization: u, resetsAt: resetsAt, rate: nil, projected: nil, exhaustsAt: nil)
        }
        let remaining = resetsAt.timeIntervalSince(current.at)
        let projected = u + rate * max(remaining, 0)
        let exhaustsAt = rate > 0 ? current.at.addingTimeInterval((100 - u) / rate) : nil
        return Projection(at: current.at, utilization: u, resetsAt: resetsAt, rate: rate, projected: projected,
                          exhaustsAt: exhaustsAt.flatMap { $0 < resetsAt ? $0 : nil })
    }

    /// Least-squares slope over the last 45 minutes of the same window.
    static func recentRate(current: Sample, history: [Sample], kind: WindowKind) -> Double? {
        guard let resetsAt = current.resetsAt else { return nil }
        let cutoff = current.at.addingTimeInterval(-45 * 60)
        let points = history.filter {
            $0.at >= cutoff && $0.at < current.at
                && $0.resetsAt.map { abs($0.timeIntervalSince(resetsAt)) < 120 } == true
        } + [current]
        guard let first = points.first, current.at.timeIntervalSince(first.at) >= kind.minSpan else { return nil }
        let xs = points.map { $0.at.timeIntervalSince(first.at) }
        let ys = points.map(\.utilization)
        let n = Double(points.count)
        let mx = xs.reduce(0, +) / n, my = ys.reduce(0, +) / n
        let sxx = zip(xs, xs).map { ($0 - mx) * ($1 - mx) }.reduce(0, +)
        guard sxx > 0 else { return nil }
        let sxy = zip(xs, ys).map { ($0 - mx) * ($1 - my) }.reduce(0, +)
        return max(sxy / sxx, 0)
    }

    static func windowAverageRate(current: Sample, kind: WindowKind) -> Double? {
        guard let resetsAt = current.resetsAt else { return nil }
        let elapsed = current.at.timeIntervalSince(resetsAt.addingTimeInterval(-kind.length))
        guard elapsed >= kind.minSpan else { return nil }
        return current.utilization / elapsed
    }
}

// MARK: - Pool

public struct PoolMember: Sendable {
    public let fiveHour: Projection?
    public let week: Projection?
    /// Relative size of the account's allowance (Max 20x = 20, Max 5x = 5), so load can move between
    /// accounts in absolute terms: 10% of a 20x account is four times 10% of a 5x one.
    public let capacity: Double

    public init(fiveHour: Projection?, week: Projection?, capacity: Double) {
        self.fiveHour = fiveHour
        self.week = week
        self.capacity = capacity
    }

    func projection(_ kind: WindowKind) -> Projection? { kind == .fiveHour ? fiveHour : week }
}

/// A stretch when every account is at a limit.
public struct Blackout: Equatable, Sendable {
    public let start: Date
    public let end: Date?

    public init(start: Date, end: Date?) {
        self.start = start
        self.end = end
    }
}

/// When an account is out of one window: from `start` until `end`, or for good if `end` is nil.
typealias Outage = (start: Date, end: Date?)

extension Forecast {
    /// Steps the pool forward through one window's length. Each available account keeps its own measured
    /// pace; when one hits its limit, its load is split evenly across the accounts still available, which
    /// burn faster. Returns the first moment none are left.
    ///
    /// For the 5h window an account that runs out of its week is out too, at the time the week simulation
    /// gives. The week ignores 5h limits: they pause an account for hours, which barely moves a weekly total.
    public static func blackout(_ kind: WindowKind, _ members: [PoolMember], now: Date) -> Blackout? {
        poolSimulation(kind, members, now: now).blackout
    }

    /// When each account is out of this window, keyed by index into `members`. The same simulation the
    /// blackout comes from, so an account's own row agrees with the pool's headline.
    public static func outageStarts(_ kind: WindowKind, _ members: [PoolMember], now: Date) -> [Int: Date] {
        poolSimulation(kind, members, now: now).outages.mapValues { $0.start }
    }

    /// The 5h simulation runs the week first, because an account out of its week is out of the pool.
    static func poolSimulation(_ kind: WindowKind, _ members: [PoolMember], now: Date)
        -> (blackout: Blackout?, outages: [Int: Outage]) {
        let weekOutages = kind == .fiveHour ? simulate(.week, members, now: now, blocks: [:]).outages : [:]
        return simulate(kind, members, now: now, blocks: weekOutages)
    }

    /// `blocks` and the returned `outages` are keyed by index into `members`.
    static func simulate(_ kind: WindowKind, _ members: [PoolMember], now: Date,
                         blocks: [Int: Outage]) -> (blackout: Blackout?, outages: [Int: Outage]) {
        let step: TimeInterval = 60

        struct State {
            let member: Int
            var utilization: Double
            var resetsAt: Date?
            /// Absolute pace (percentage points × capacity per second), so it can move between accounts
            /// of different sizes.
            var load: Double
            let capacity: Double
            let blocked: Outage?
            var unlimited = false
            /// When an account that is already out ran out.
            var outSince: Date? = nil
            /// How far back this account's measured rate looks.
            var lookback: TimeInterval = 0
        }

        var states: [State] = members.enumerated().compactMap { i, m in
            let capacity = max(m.capacity, 0.1)
            guard let p = m.projection(kind) else {
                // Anthropic reports a week but no 5h window for accounts it has lifted the 5h limit from:
                // still in the pool, only its week can stop it.
                guard kind == .fiveHour, m.week != nil else { return nil }
                return State(member: i, utilization: 0, resetsAt: nil, load: 0, capacity: capacity,
                             blocked: blocks[i], unlimited: true)
            }
            // The last reading may be minutes old; carry it forward at its own pace to now.
            let sinceReading = max(now.timeIntervalSince(p.at), 0)
            let current = p.isExhausted ? p.utilization : min(p.utilization + (p.rate ?? 0) * sinceReading, 100)
            let windowAge = p.resetsAt.map { now.timeIntervalSince($0.addingTimeInterval(-kind.length)) } ?? 0
            return State(member: i, utilization: current, resetsAt: p.resetsAt, load: (p.rate ?? 0) * capacity,
                         capacity: capacity, blocked: blocks[i],
                         outSince: p.isExhausted ? p.exhaustsAt : nil,
                         lookback: kind == .fiveHour ? min(45 * 60, windowAge) : windowAge)
        }
        guard !states.isEmpty else { return (nil, [:]) }

        func available(_ s: State, at t: Date) -> Bool {
            if s.utilization >= 100 { return false }
            if let b = s.blocked, t >= b.start, b.end.map({ t < $0 }) ?? true { return false }
            return true
        }

        func freeAgain(_ s: State, after t: Date) -> Date? {
            var free = t
            if s.utilization >= 100 {
                guard let r = s.resetsAt else { return nil }
                free = max(free, r)
            }
            // The week may run out while the 5h window is still waiting to reset.
            if let b = s.blocked, free >= b.start {
                guard let e = b.end else { return nil }
                free = max(free, e)
            }
            return free
        }

        // Accounts still open have been absorbing the load of those already out since they ran out, so
        // their measured rates hold part of it. Take that part off, or redistributing it counts it twice.
        let openNow = states.indices.filter { available(states[$0], at: now) }
        for j in states.indices where !openNow.contains(j) {
            // Out for the week without its 5h window being exhausted: it has been absorbed since the week
            // gave out, not since a 5h exhaustion that never happened.
            let since = states[j].outSince ?? states[j].blocked.flatMap { $0.start <= now ? $0.start : nil }
            guard let since else { continue }
            let share = states[j].load / Double(max(openNow.count, 1))
            for i in openNow where states[i].lookback > 0 {
                let absorbed = min(max(now.timeIntervalSince(since) / states[i].lookback, 0), 1)
                states[i].load = max(states[i].load - share * absorbed, 0)
            }
        }

        var outages: [Int: Outage] = [:]
        var t = now
        let end = now.addingTimeInterval(kind.length)
        while t <= end {
            for i in states.indices {
                if let r = states[i].resetsAt, t >= r {
                    states[i].utilization = 0
                    states[i].resetsAt = nil
                }
                if states[i].utilization >= 100, outages[states[i].member] == nil {
                    outages[states[i].member] = (states[i].outSince ?? t, states[i].resetsAt)
                }
            }
            let open = states.indices.filter { available(states[$0], at: t) }
            if open.isEmpty {
                return (Blackout(start: t, end: states.compactMap { freeAgain($0, after: t) }.min()), outages)
            }
            let stranded = states.indices.filter { !open.contains($0) }.map { states[$0].load }.reduce(0, +)
            let share = stranded / Double(open.count)
            for i in open where !states[i].unlimited {
                // A fresh window opens on first use after the last one reset.
                if states[i].resetsAt == nil { states[i].resetsAt = t.addingTimeInterval(kind.length) }
                states[i].utilization += (states[i].load + share) / states[i].capacity * step
            }
            t = t.addingTimeInterval(step)
        }
        return (nil, outages)
    }
}
