import SwiftUI
import UsageForecast

// One visual idea: a ring. Compact shows each account as a pair, 5h then 7d, split across the notch;
// expanded is the same pair per row, larger, in the same order. The solid arc is where you are; the faint
// arc beyond it is where you'll be at reset at the current pace. Amber means you'll hit the limit first.

private let amber = Color(red: 1.0, green: 0.72, blue: 0.27)

private extension Double {
    /// Rounded once, so the number shown and the arc drawn for it can never disagree.
    var displayPercent: Double { Swift.min(Swift.max(self, 0), 100).rounded() }
}

func durationText(until date: Date, from now: Date) -> String {
    let s = Int(date.timeIntervalSince(now))
    if s < 60 { return "now" }
    let d = s / 86400, h = (s % 86400) / 3600, m = (s % 3600) / 60
    if d > 0 { return "\(d)d \(h)h" }
    if h > 0 { return "\(h)h \(m)m" }
    return "\(m)m"
}

private func clockText(_ date: Date) -> String {
    date.formatted(.dateTime.hour().minute())
}

/// Predicted times are only as good as the pace behind them; to the minute would claim otherwise.
private extension Date {
    func rounded(to interval: TimeInterval) -> Date {
        Date(timeIntervalSinceReferenceDate: (timeIntervalSinceReferenceDate / interval).rounded() * interval)
    }
}

/// "Fri 19:00" — or just the time when it's today.
private func dayText(_ date: Date) -> String {
    Calendar.current.isDateInToday(date)
        ? clockText(date)
        : date.formatted(.dateTime.weekday(.abbreviated).hour().minute())
}

struct Ring: View {
    let projection: Projection?
    let size: CGFloat
    let lineWidth: CGFloat
    var dimmed = false

    var body: some View {
        let pct = (projection?.utilization ?? 0).displayPercent
        let ahead = (projection?.projected ?? 0).displayPercent
        let color = projection?.warns == true ? amber : .white.opacity(0.92)
        ZStack {
            Circle().stroke(.white.opacity(0.14), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: Swift.max(ahead, pct) / 100)
                .stroke(color.opacity(0.3), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
            Circle()
                .trim(from: 0, to: pct / 100)
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        }
        .rotationEffect(.degrees(-90))
        .opacity(dimmed ? 0.35 : 1)
        .frame(width: size, height: size)
    }
}

/// Stands in for a ring where the window has no limit at all.
struct NoLimitMark: View {
    let size: CGFloat
    let lineWidth: CGFloat

    var body: some View {
        // Same stroke and reach as a ring: a ring's stroke straddles radius c, so its outer edge is at
        // c + lineWidth/2; arms end at c, and their round caps reach it.
        Path { p in
            let c = size / 2
            let arm = c / 2.squareRoot()
            p.move(to: CGPoint(x: c - arm, y: c - arm)); p.addLine(to: CGPoint(x: c + arm, y: c + arm))
            p.move(to: CGPoint(x: c + arm, y: c - arm)); p.addLine(to: CGPoint(x: c - arm, y: c + arm))
        }
        .stroke(.white.opacity(0.35), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .frame(width: size, height: size)
    }
}

/// One group per account, its 5h mark then its week ring, in the expanded view's column order.
struct CompactRings: View {
    @ObservedObject var store: UsageStore

    var body: some View {
        HStack(spacing: 10) {
            ForEach(store.accounts) { a in
                let outlook = a.outlook
                HStack(spacing: 3) {
                    if a.noFiveHourLimit {
                        NoLimitMark(size: 12, lineWidth: 2)
                    } else {
                        Ring(projection: outlook.fiveHour, size: 12, lineWidth: 2, dimmed: a.fetchedAt == nil)
                    }
                    Ring(projection: outlook.week, size: 12, lineWidth: 2, dimmed: a.fetchedAt == nil)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(a.label)
            }
        }
        .padding(.horizontal, 8)
    }
}

/// Right of the notch: when every account will next be out of usage, or when it's back if that's now.
/// Empty while nothing is coming.
struct CompactNextOut: View {
    @ObservedObject var store: UsageStore

    var body: some View {
        TimelineView(.everyMinute) { _ in
            let text = Self.text(store.accounts.poolOutlook(now: .now).nextOut, now: .now)
            Text(text ?? "")
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundStyle(amber)
                .lineLimit(1)
                .padding(.horizontal, text == nil ? 0 : 8)
        }
    }

    static func text(_ b: Blackout?, now: Date) -> String? {
        guard let b else { return nil }
        if b.start <= now.addingTimeInterval(60) {
            return "Out" + (b.end.map { " · back \(whenText($0, now: now))" } ?? "")
        }
        return "Out \(whenText(b.start, now: now))"
    }
}

/// Relative while it's close ("in 40m"), a clock time later today ("16:30"), then a day ("Sat 07:15").
/// Forecasts are rounded to 5 minutes, never into the past.
func whenText(_ date: Date, now: Date) -> String {
    let rounded = date.rounded(to: 5 * 60)
    let t = rounded > now ? rounded : rounded.addingTimeInterval(5 * 60)
    if date.timeIntervalSince(now) < 3 * 3600 { return "in \(durationText(until: date, from: now))" }
    return dayText(t)
}

private struct WindowColumn: View {
    let projection: Projection?
    let now: Date
    var noLimit = false
    static let width: CGFloat = 106

    /// The line under the percentage says what happens next: when you'll run out, when you're back,
    /// or, when neither applies, simply when it resets.
    private var next: String {
        if noLimit { return "weekly limit only" }
        guard let p = projection, let resetsAt = p.resetsAt else { return "" }
        if p.isExhausted {
            return resetsAt.timeIntervalSince(now) < 60 ? "resetting" : "back in \(durationText(until: resetsAt, from: now))"
        }
        if let out = p.exhaustsAt { return "out in \(durationText(until: out, from: now))" }
        return "resets \(durationText(until: resetsAt, from: now))"
    }

    var body: some View {
        let pct = (projection?.utilization ?? 0).displayPercent
        let warns = projection?.warns == true
        let next = next
        HStack(spacing: 8) {
            if noLimit {
                NoLimitMark(size: 20, lineWidth: 2.5)
            } else {
                Ring(projection: projection, size: 20, lineWidth: 2.5, dimmed: projection == nil)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(projection == nil ? (noLimit ? "No limit" : "–") : "\(Int(pct))%")
                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle(warns ? amber : .white)
                    .contentTransition(.numericText(value: pct))
                // A blank line still takes its height, so rows without one stay centred on the ring.
                Text(next.isEmpty ? " " : next)
                    .font(.system(size: 10).monospacedDigit())
                    .foregroundStyle(warns && !(projection?.isExhausted ?? false) ? amber.opacity(0.85) : .white.opacity(0.45))
                    .lineLimit(1)
            }
        }
        .frame(width: Self.width, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct AccountRow: View {
    let account: AccountUsage
    let now: Date

    /// "Max 20x", "Team · Holibob": the plan leads; the org is only named when it isn't a personal one.
    private var identity: String {
        let org = account.org == "Personal" ? nil : account.org
        let parts = [account.plan, org].compactMap { $0 }
        return parts.isEmpty ? account.org : parts.joined(separator: " · ")
    }

    /// A failed poll with recent numbers on screen isn't worth flagging; it only matters once they go stale.
    private var caption: String {
        if account.heldBack { return "Paused · keeping extra usage off" }
        guard let problem = account.problem else { return identity }
        guard let fetchedAt = account.fetchedAt else { return problem }
        guard now.timeIntervalSince(fetchedAt) > 15 * 60 else { return identity }
        let age = RelativeDateTimeFormatter().localizedString(for: fetchedAt, relativeTo: now)
        return "\(problem) · \(age)"
    }

    var body: some View {
        let outlook = account.outlook
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(account.label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1)
                    .truncationMode(.middle)
                Text(caption)
                    .font(.system(size: 10))
                    .tracking(0.1)
                    .foregroundStyle(caption == identity ? .white.opacity(0.4) : amber.opacity(0.85))
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Spacer(minLength: 16)
            WindowColumn(projection: outlook.fiveHour, now: now, noLimit: account.noFiveHourLimit)
            WindowColumn(projection: outlook.week, now: now)
        }
    }
}

/// The one sentence that answers the real question: will every account be limited, when, and for how
/// long? The nearest wall wins: a 5h blackout is hours away at most, a weekly one can be days.
private struct Headline: View {
    let accounts: [AccountUsage]
    let now: Date

    var body: some View {
        let (text, warns) = headline
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(warns ? amber : .white.opacity(0.92))
            .lineLimit(1)
            .contentTransition(.opacity)
    }

    private var headline: (String, Bool) {
        let pool = accounts.poolOutlook(now: now)
        let all = accounts.count > 1 ? "All accounts" : "Your account"
        if let b = pool.nextOut {
            let back = b.end.map { " · back \(whenText($0, now: now))" } ?? ""
            if b.start <= now.addingTimeInterval(60) { return ("\(all) limited" + back, true) }
            let what = pool.fiveHour == nil ? "Weekly limits run out" : "\(all) limited"
            return ("\(what) \(whenText(b.start, now: now))" + back, true)
        }
        guard pool.canProject else { return (" ", false) }
        let clear = "No limits ahead at this pace"
        return (pool.limitedNow == 0 ? clear : "\(pool.limitedNow) of \(accounts.count) limited · the rest hold", false)
    }
}

struct ExpandedView: View {
    @ObservedObject var store: UsageStore

    var body: some View {
        TimelineView(.everyMinute) { _ in
            let now = Date.now
            VStack(alignment: .leading, spacing: 14) {
                if !store.accounts.isEmpty {
                    Headline(accounts: store.accounts, now: now)
                }
                HStack(spacing: 0) {
                    Spacer()
                    Group {
                        Text("5 HOURS").frame(width: WindowColumn.width, alignment: .leading)
                        Text("WEEK").frame(width: WindowColumn.width, alignment: .leading)
                    }
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(0.6)
                    .foregroundStyle(.white.opacity(0.3))
                }
                .padding(.bottom, -2)

                ForEach(store.accounts) { AccountRow(account: $0, now: now) }

                if store.accounts.isEmpty {
                    Text("No Claude accounts in ~/.cli-proxy-api")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.5))
                }
            }
            .frame(width: 410)
            .padding(.horizontal, 14)
            .padding(.top, 4)
            .padding(.bottom, 14)
        }
    }
}
