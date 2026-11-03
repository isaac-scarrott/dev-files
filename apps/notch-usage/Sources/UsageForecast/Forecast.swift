import Foundation

/// One reading of a usage window, as returned by Anthropic.
public struct Sample: Codable, Equatable, Sendable {
    public let at: Date
    public let utilization: Double
    public let resetsAt: Date?

    public init(at: Date, utilization: Double, resetsAt: Date?) {
        self.at = at
        self.utilization = utilization
        self.resetsAt = resetsAt
    }
}

public enum WindowKind: Sendable {
    case fiveHour, week

    public var length: TimeInterval { self == .fiveHour ? 5 * 3600 : 7 * 86400 }

    /// The shortest stretch a rate is drawn from; anything shorter is noise.
    var minSpan: TimeInterval { self == .fiveHour ? 10 * 60 : 6 * 3600 }
}

public struct Projection: Equatable, Sendable {
    /// When `utilization` was read.
    public let at: Date
    public let utilization: Double
    public let resetsAt: Date?
    /// Percentage points per second, or nil when there's too little history to say.
    public let rate: Double?
    /// Where utilization lands at reset if the current pace holds. Uncapped.
    public let projected: Double?
    /// When the window hits 100%, if that happens before it resets. In the past when already there.
    public let exhaustsAt: Date?

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
            return Projection(at: current.at, utilization: u, resetsAt: resetsAt, rate: nil, projected: u, exhaustsAt: current.at)
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
}

extension Forecast {
    /// Steps the pool forward through one window's length. Each available account keeps its own measured
    /// pace; when one hits its limit, its load is split evenly across the accounts still available, which
    /// burn faster. Returns the first moment none are left.
    ///
    /// For the 5h window an account that runs out of its week is out too. The week ignores 5h limits:
    /// they pause an account for hours, which barely moves a weekly total.
    public static func blackout(_ kind: WindowKind, _ members: [PoolMember], now: Date) -> Blackout? {
        let step: TimeInterval = kind == .fiveHour ? 60 : 15 * 60

        struct State {
            var utilization: Double
            var resetsAt: Date?
            let rate: Double
            let capacity: Double
            let blocked: (start: Date, end: Date?)?
            var unlimited = false
            /// Absolute pace, so it can move between accounts of different sizes.
            var load: Double { rate * capacity }
        }

        var states: [State] = members.compactMap { m in
            let weekOut = kind == .fiveHour ? m.week.flatMap { w in w.exhaustsAt.map { ($0, w.resetsAt) } } : nil
            guard let p = m.projection(kind) else {
                // Anthropic reports a week but no 5h window for accounts it has lifted the 5h limit from:
                // still in the pool, only its week can stop it.
                guard kind == .fiveHour, m.week != nil else { return nil }
                return State(utilization: 0, resetsAt: nil, rate: 0, capacity: max(m.capacity, 0.1),
                             blocked: weekOut, unlimited: true)
            }
            // The last reading may be minutes old; carry it forward at its own pace to now.
            let sinceReading = max(now.timeIntervalSince(p.at), 0)
            let current = p.isExhausted ? p.utilization : min(p.utilization + (p.rate ?? 0) * sinceReading, 100)
            return State(utilization: current, resetsAt: p.resetsAt, rate: p.rate ?? 0,
                         capacity: max(m.capacity, 0.1), blocked: weekOut)
        }
        guard !states.isEmpty else { return nil }

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

        var t = now
        let end = now.addingTimeInterval(kind.length)
        while t <= end {
            for i in states.indices {
                if let r = states[i].resetsAt, t >= r {
                    states[i].utilization = 0
                    states[i].resetsAt = nil
                }
            }
            let open = states.indices.filter { available(states[$0], at: t) }
            if open.isEmpty {
                return Blackout(start: t, end: states.compactMap { freeAgain($0, after: t) }.min())
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
        return nil
    }
}
