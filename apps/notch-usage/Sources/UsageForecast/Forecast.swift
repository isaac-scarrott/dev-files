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

    /// 99.6 shows as "100%" and Anthropic rounds the same way, so a reading that rounds to 100 has no
    /// room left in it.
    public var isExhausted: Bool { utilization.rounded() >= 100 }
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
        if u.rounded() >= 100 {
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

/// The pool's own forecast for one window: the next blackout, when each account drops out, and where
/// each account's window lands. Display reads one of these per window so the ring arcs and the text
/// above them come from the same simulation.
public struct PoolForecast: Sendable {
    public let blackout: Blackout?
    /// Keyed by index into the `members` the forecast was made for.
    public let outageStart: [Int: Date]
    /// Where each member's window lands: its utilization at its own reset, or at the horizon end if it
    /// doesn't reset within it. Uncapped below 100, exactly 100 when it ran out first.
    public let landing: [Int: Double]

    public init(blackout: Blackout?, outageStart: [Int: Date], landing: [Int: Double]) {
        self.blackout = blackout
        self.outageStart = outageStart
        self.landing = landing
    }
}

extension Forecast {
    /// Steps the pool forward through one window's length. Each available account keeps its own measured
    /// pace; when one hits its limit, its load is split evenly across the accounts still available, which
    /// burn faster. Returns the next stretch when none are left.
    ///
    /// For the 5h window an account that runs out of its week is out too, at the time the week simulation
    /// gives. The week ignores 5h limits: they pause an account for hours, which barely moves a weekly total.
    public static func blackout(_ kind: WindowKind, _ members: [PoolMember], now: Date) -> Blackout? {
        poolForecast(kind, members, now: now).blackout
    }

    /// One simulation, three answers: the pool's next blackout, when each account drops out, and where
    /// each account's window lands. An account's own row therefore agrees with the pool's headline.
    public static func poolForecast(_ kind: WindowKind, _ members: [PoolMember], now: Date) -> PoolForecast {
        let result = poolSimulation(kind, members, now: now)
        return PoolForecast(blackout: result.blackout,
                            outageStart: result.outages.mapValues { $0.start },
                            landing: result.landing)
    }

    /// The 5h simulation runs the week first, because an account out of its week is out of the pool.
    static func poolSimulation(_ kind: WindowKind, _ members: [PoolMember], now: Date)
        -> (blackout: Blackout?, outages: [Int: Outage], landing: [Int: Double]) {
        let weekOutages = kind == .fiveHour ? simulate(.week, members, now: now, blocks: [:]).outages : [:]
        return simulate(kind, members, now: now, blocks: weekOutages)
    }

    /// `blocks`, the returned `outages` and `landing` are keyed by index into `members`.
    static func simulate(_ kind: WindowKind, _ members: [PoolMember], now: Date, blocks: [Int: Outage])
        -> (blackout: Blackout?, outages: [Int: Outage], landing: [Int: Double]) {
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
            var current = p.utilization
            var outSince = p.isExhausted ? p.exhaustsAt : nil
            if !p.isExhausted {
                let carried = p.utilization + (p.rate ?? 0) * sinceReading
                if let rate = p.rate, rate > 0, carried.rounded() >= 100 {
                    // The reading itself was below the limit, but the pace since took it over: it went
                    // out at the crossing, and that is when its traffic started landing elsewhere.
                    outSince = p.at.addingTimeInterval((100 - p.utilization) / rate)
                    current = 100
                } else {
                    current = carried
                }
            }
            let windowAge = p.resetsAt.map { now.timeIntervalSince($0.addingTimeInterval(-kind.length)) } ?? 0
            return State(member: i, utilization: current, resetsAt: p.resetsAt, load: (p.rate ?? 0) * capacity,
                         capacity: capacity, blocked: blocks[i], outSince: outSince,
                         lookback: kind == .fiveHour ? min(45 * 60, windowAge) : windowAge)
        }
        guard !states.isEmpty else { return (nil, [:], [:]) }

        func available(_ s: State, at t: Date) -> Bool {
            if s.utilization.rounded() >= 100 { return false }
            if let b = s.blocked, t >= b.start, b.end.map({ t < $0 }) ?? true { return false }
            return true
        }

        func freeAgain(_ s: State, after t: Date) -> Date? {
            var free = t
            if s.utilization.rounded() >= 100 {
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

        /// The earliest reason an account is out at `t`: its 5h window running out, or a week block that
        /// has begun. An account can be out for both, and the load landed elsewhere from the first.
        func outStart(_ s: State, at t: Date) -> Date? {
            [s.outSince, s.blocked.flatMap { $0.start <= t ? $0.start : nil }].compactMap { $0 }.min()
        }

        // Accounts still open have been absorbing the load of those already out since they ran out, so
        // their measured rates hold part of it. Take that part off, or redistributing it counts it twice.
        let openNow = states.indices.filter { available(states[$0], at: now) }
        // Oldest out first, so a later one is corrected against every account that went before it.
        let outNow = states.indices.filter { !openNow.contains($0) }
            .sorted { (outStart(states[$0], at: now) ?? now) < (outStart(states[$1], at: now) ?? now) }
        for j in outNow {
            guard let since = outStart(states[j], at: now) else { continue }
            let share = states[j].load / Double(max(openNow.count, 1))
            for i in openNow where states[i].lookback > 0 {
                let absorbed = min(max(now.timeIntervalSince(since) / states[i].lookback, 0), 1)
                states[i].load = max(states[i].load - share * absorbed, 0)
            }
            // An account that went out later was open while this one's traffic was moving, so its
            // measured rate holds part of that share: those points were carried, not stranded.
            for i in outNow where i != j && states[i].lookback > 0 {
                guard let ownStart = outStart(states[i], at: now), ownStart > since else { continue }
                let absorbed = min(max(ownStart.timeIntervalSince(since) / states[i].lookback, 0), 1)
                states[i].load = max(states[i].load - share * absorbed, 0)
            }
        }

        /// Where a window sits when it stops: its real reading, except that running out is exactly 100.
        func landed(_ s: State) -> Double { s.utilization.rounded() >= 100 ? 100 : s.utilization }

        var outages: [Int: Outage] = [:]
        var landing: [Int: Double] = [:]
        var blackoutStart: Date?
        var blackoutEnd: Date?
        /// When the pool last became non-empty, if it still is: an account freeing up only ends the
        /// blackout once it stays free, or another takes over without a gap.
        var openSince: Date?
        var t = now
        let horizon = now.addingTimeInterval(kind.length)
        var end = horizon
        while t <= end {
            for i in states.indices {
                if let r = states[i].resetsAt, t >= r {
                    if r <= horizon, landing[states[i].member] == nil { landing[states[i].member] = landed(states[i]) }
                    states[i].utilization = 0
                    states[i].resetsAt = nil
                }
                // Out for any reason counts: a spent 5h window, or a week that won't take more traffic.
                if outages[states[i].member] == nil, !available(states[i], at: t) {
                    outages[states[i].member] = (outStart(states[i], at: t) ?? t, freeAgain(states[i], after: t))
                }
            }
            let open = states.indices.filter { available(states[$0], at: t) }
            if open.isEmpty {
                if blackoutStart == nil { blackoutStart = t }
                openSince = nil
            } else {
                if openSince == nil {
                    openSince = t
                    // The clear moment can sit past this window's length: a reset the week blocks again
                    // minutes later doesn't count, so keep looking up to a window length beyond it.
                    if blackoutStart != nil, blackoutEnd == nil { end = max(end, t.addingTimeInterval(kind.length)) }
                }
                if let since = openSince, t.timeIntervalSince(since) >= 30 * 60 { blackoutEnd = since }
            }
            if !open.isEmpty {
                let stranded = states.indices.filter { !open.contains($0) }.map { states[$0].load }.reduce(0, +)
                let share = stranded / Double(open.count)
                for i in open where !states[i].unlimited {
                    // A fresh window opens on first use after the last one reset.
                    if states[i].resetsAt == nil { states[i].resetsAt = t.addingTimeInterval(kind.length) }
                    states[i].utilization += (states[i].load + share) / states[i].capacity * step
                }
            }
            if t >= horizon {
                // No reset inside the horizon: where it stands at the horizon is where it lands.
                for i in states.indices where landing[states[i].member] == nil {
                    landing[states[i].member] = landed(states[i])
                }
                if blackoutEnd != nil { break }
            }
            t = t.addingTimeInterval(step)
        }
        guard let start = blackoutStart else { return (nil, outages, landing) }
        // Nothing stayed clear inside the horizon: the latest moment we can still place every account free.
        let finish = blackoutEnd ?? states.compactMap { freeAgain($0, after: t) }.max()
        return (Blackout(start: start, end: finish), outages, landing)
    }
}
