import AppKit
import SwiftUI
import UsageForecast

// One visual idea: a ring. The unhovered notch is the pool, not the keys: one pair for Claude
// (5h, week) and one triple for OpenCode Go (5h, week, month). The solid arc is the pool's usage;
// amber means it will be blocked before the window resets. Hovering opens the per-account rows, where
// the faint arc beyond each solid one shows where that account lands at reset at its current pace.
//
// The two providers are independent pools, so even unhovered they sit either side of a hairline, and
// expanded they read as two sections with their own columns rather than one table.

private let amber = Color(red: 1.0, green: 0.72, blue: 0.27)
// A single margin grid, so labels, rings and headers share the same left and right edges.
private let panelWidth: CGFloat = 470
private let panelPadding: CGFloat = 16

extension Double {
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

struct Ring: View {
    let solid: Double
    let faint: Double
    let warns: Bool
    let size: CGFloat
    let lineWidth: CGFloat
    var dimmed = false

    var body: some View {
        let pct = Swift.min(Swift.max(solid, 0), 100)
        let ahead = Swift.min(Swift.max(faint, pct), 100)
        let color = warns ? amber : .white.opacity(0.92)
        ZStack {
            Circle().stroke(.white.opacity(0.14), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: ahead / 100)
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

private struct CompactRingView: View {
    let ring: CompactRing?
    let dimmed: Bool

    var body: some View {
        Ring(solid: ring?.utilization ?? 0, faint: 0, warns: ring?.warns == true,
             size: 12, lineWidth: 2, dimmed: dimmed)
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

/// The unhovered notch is one glance per provider: a pair for Claude and a triple for OpenCode Go.
/// Their limits are separate, so a hairline divides them; hovering opens the per-account rows.
struct CompactRings: View {
    @ObservedObject var store: UsageStore

    var body: some View {
        TimelineView(.everyMinute) { _ in
            let now = Date.now
            HStack(spacing: 9) {
                if !store.accounts.isEmpty {
                    ProviderMark(name: "claude", size: 11)
                    let compact = store.accounts.compactModel(now: now)
                    HStack(spacing: 3) {
                        if compact.noFiveHourLimit {
                            NoLimitMark(size: 12, lineWidth: 2)
                        } else {
                            CompactRingView(ring: compact.fiveHour, dimmed: compact.dimmed)
                        }
                        CompactRingView(ring: compact.week, dimmed: compact.dimmed)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Claude, \(store.accounts.count) account\(store.accounts.count == 1 ? "" : "s")")
                }
                if !store.accounts.isEmpty && !store.goAccounts.isEmpty {
                    Rectangle()
                        .fill(.white.opacity(0.16))
                        .frame(width: 1, height: 14)
                }
                if !store.goAccounts.isEmpty {
                    ProviderMark(name: "opencode", size: 11)
                    let compact = store.goAccounts.compactModel(now: now)
                    HStack(spacing: 3) {
                        CompactRingView(ring: compact.rolling, dimmed: compact.dimmed)
                        CompactRingView(ring: compact.weekly, dimmed: compact.dimmed)
                        CompactRingView(ring: compact.monthly, dimmed: compact.dimmed)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("OpenCode Go")
                }
            }
        }
        .padding(.horizontal, 8)
    }
}

/// Right of the notch: when the nearest wall is, or when it's back if it's here already. The provider
/// mark identifies whose wall it is, so the words can stay short. Empty while nothing is coming.
struct CompactNextOut: View {
    @ObservedObject var store: UsageStore

    var body: some View {
        TimelineView(.everyMinute) { _ in
            if let wall = Self.wall(store.accounts, store.goAccounts, now: .now) {
                HStack(spacing: 5) {
                    ProviderMark(name: wall.mark, size: 10)
                    Text(wall.text)
                        .font(.system(size: 11, weight: .semibold).monospacedDigit())
                        .foregroundStyle(amber)
                        .lineLimit(1)
                }
                .padding(.horizontal, 8)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(wall.label) \(wall.text)")
            }
        }
    }

    struct Wall {
        let label: String
        let mark: String
        let text: String
    }

    static func wall(_ claude: [AccountUsage], _ go: [GoAccount], now: Date) -> Wall? {
        let walls: [(label: String, mark: String, blackout: Blackout)] = [
            claude.poolOutlook(now: now).nextOut.map { ("Claude", "claude", $0) },
            go.nextOut().map { ("OpenCode Go", "opencode", $0) }
        ].compactMap { $0 }
        guard let soonest = walls.min(by: { $0.blackout.start < $1.blackout.start }) else { return nil }
        let b = soonest.blackout
        if b.start <= now.addingTimeInterval(60) {
            let back = b.end.map { " · back \(whenText($0, now: now))" } ?? ""
            return Wall(label: soonest.label, mark: soonest.mark, text: "out" + back)
        }
        return Wall(label: soonest.label, mark: soonest.mark, text: "out \(whenText(b.start, now: now))")
    }
}

/// Every time the notch shows is a countdown: "in 2h 45m" here and "back in 3h 30m" there, never a clock
/// reading beside a duration. Elapsed and remaining time have to be read the same way to compare them.
/// Rounded to five minutes, which is as precise as a forecast gets, and never into the past.
func whenText(_ date: Date, now: Date) -> String {
    let rounded = (date.timeIntervalSince(now) / (5 * 60)).rounded() * (5 * 60)
    guard rounded >= 60 else { return "now" }
    return "in \(durationText(until: now.addingTimeInterval(rounded), from: now))"
}

/// One row column's whole state, decided once: the number shown, both arcs, the amber, the dimming
/// and the line under it. Every surface reads this so the ring and the words cannot disagree.
struct ColumnModel: Equatable {
    let percentText: String
    let solid: Double
    let faint: Double
    let amber: Bool
    let dimmed: Bool
    let line: String
    let noLimit: Bool
    let blockedBy: String?

    init(_ projection: Projection?, now: Date, noLimit: Bool = false, blockedBy: String? = nil) {
        let pct = (projection?.utilization ?? 0).displayPercent
        let resetPast = projection?.resetsAt.map { $0 <= now } ?? false
        let projected = Swift.min(Swift.max(projection?.projected ?? pct, 0), 100)
        self.noLimit = noLimit
        self.blockedBy = noLimit ? nil : blockedBy
        solid = noLimit ? 0 : pct
        faint = noLimit ? 0 : projected
        dimmed = projection == nil || self.blockedBy != nil || resetPast
        amber = !noLimit && self.blockedBy == nil && !resetPast && projection?.warns == true
        percentText = projection == nil ? (noLimit ? "No limit" : "–") : "\(Int(pct))%"
        if noLimit {
            line = "weekly only"
        } else if resetPast {
            line = "resetting"
        } else if let blockedBy = self.blockedBy {
            line = blockedBy
        } else if let p = projection, let resetsAt = p.resetsAt {
            if p.isExhausted {
                line = "back \(whenText(resetsAt, now: now))"
            } else if let out = p.exhaustsAt {
                line = "out \(whenText(out, now: now))"
            } else {
                line = "resets \(whenText(resetsAt, now: now))"
            }
        } else {
            line = ""
        }
    }
}

private struct WindowColumn: View {
    let model: ColumnModel
    static let width: CGFloat = 106

    var body: some View {
        HStack(spacing: 9) {
            if model.noLimit {
                NoLimitMark(size: 22, lineWidth: 2.5)
            } else {
                Ring(solid: model.solid, faint: model.faint, warns: model.amber,
                     size: 22, lineWidth: 2.5, dimmed: model.dimmed)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(model.percentText)
                    .font(.system(size: 15, weight: .semibold).monospacedDigit())
                    .foregroundStyle(model.amber ? amber : .white)
                    .contentTransition(.numericText(value: model.solid))
                // A blank line still takes its height, so rows without one stay centred on the ring.
                Text(model.line.isEmpty ? " " : model.line)
                    .font(.system(size: 10).monospacedDigit())
                    .foregroundStyle(model.amber ? amber.opacity(0.8) : .white.opacity(0.42))
                    .lineLimit(1)
            }
        }
        .frame(width: Self.width, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// A failed poll with recent numbers on screen isn't worth flagging; it only matters once they go stale.
private func staleCaption(_ problem: String?, fetchedAt: Date?, now: Date) -> String? {
    guard let problem else { return nil }
    guard let fetchedAt else { return problem }
    guard now.timeIntervalSince(fetchedAt) > 15 * 60 else { return nil }
    return "\(problem) · \(agoText(fetchedAt, now: now))"
}

/// "1h ago" rather than "1 hour ago": the caption shares a narrow column with the numbers.
private func agoText(_ date: Date, now: Date) -> String {
    let s = Int(now.timeIntervalSince(date))
    if s < 60 { return "just now" }
    let d = s / 86400, h = (s % 86400) / 3600, m = (s % 3600) / 60
    if d > 0 { return "\(d)d ago" }
    if h > 0 { return "\(h)h ago" }
    return "\(m)m ago"
}

/// A held account says why it is out of rotation before it says anything else, and the staleness still
/// rides along: pausing it is not a reason to hide that its numbers are old.
func accountCaption(_ account: AccountUsage, identity: String, now: Date) -> String {
    let stale = staleCaption(account.problem, fetchedAt: account.fetchedAt, now: now)
    if account.heldBack {
        let paused = "Paused · keeping extra usage off"
        return stale.map { "\(paused) · \($0)" } ?? paused
    }
    return stale ?? identity
}

private struct AccountRow: View {
    let account: AccountUsage
    /// The pool's schedule for this account, not its own pace: see `pooledOutlooks`.
    let outlook: Outlook
    let now: Date

    /// "Max 20x", "Team · Holibob": the plan leads; the org is only named when it isn't a personal one.
    private var identity: String {
        let org = account.org == "Personal" ? nil : account.org
        let parts = [account.plan, org].compactMap { $0 }
        return parts.isEmpty ? account.org : parts.joined(separator: " · ")
    }

    private var caption: String {
        accountCaption(account, identity: identity, now: now)
    }

    var body: some View {
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
            WindowColumn(model: ColumnModel(
                outlook.fiveHour, now: now, noLimit: account.noFiveHourLimit,
                blockedBy: claudeBlockedBy(noLimit: account.noFiveHourLimit, week: outlook.week)
            ))
            WindowColumn(model: ColumnModel(outlook.week, now: now))
        }
    }
}

func claudeBlockedBy(noLimit: Bool, week: Projection?) -> String? {
    guard !noLimit, week?.isExhausted == true else { return nil }
    return "weekly limit"
}

struct Status: Equatable {
    let text: String
    let warns: Bool
}

/// The one sentence that answers the real question for the Claude pool: will every account be
/// limited, when, and for how long? The nearest wall wins.
func claudeStatus(_ accounts: [AccountUsage], now: Date, pool: PoolOutlook? = nil) -> Status {
    let pool = pool ?? accounts.poolOutlook(now: now)
    let all = pool.members > 1 ? "All accounts" : "Your account"
    if let b = pool.nextOut {
        let back = b.end.map { " · back \(whenText($0, now: now))" } ?? ""
        if b.start <= now.addingTimeInterval(60) { return Status(text: "\(all) limited" + back, warns: true) }
        let what = pool.fiveHour == nil ? "Weekly limits run out" : "\(all) limited"
        return Status(text: "\(what) \(whenText(b.start, now: now))" + back, warns: true)
    }
    guard pool.canProject else { return Status(text: " ", warns: false) }
    let clear = "No limits ahead at this pace"
    return Status(text: pool.limitedNow == 0 ? clear : "\(pool.limitedNow) of \(pool.members) limited · the rest hold",
                  warns: false)
}

/// Go's three windows stop it independently, so name the one that gets there first.
func goStatus(_ accounts: [GoAccount], now: Date) -> Status {
    let walls = accounts.flatMap { account -> [(name: String, wall: Blackout)] in
        let outlook = account.outlook
        let windows = [("5h", outlook.rolling), ("Weekly", outlook.weekly), ("Monthly", outlook.monthly)]
        return windows.compactMap { name, projection in
            guard let p = projection, let resetsAt = p.resetsAt else { return nil }
            let start = p.isExhausted ? (p.exhaustsAt ?? p.at) : p.exhaustsAt
            guard let start, start < resetsAt else { return nil }
            return (name, Blackout(start: start, end: resetsAt))
        }
    }
    guard let soonest = walls.min(by: { $0.wall.start < $1.wall.start }) else {
        let canProject = accounts.contains { $0.outlook.canProject }
        return Status(text: canProject ? "No limits ahead at this pace" : " ", warns: false)
    }
    let back = soonest.wall.end.map { " · back \(whenText($0, now: now))" } ?? ""
    if soonest.wall.start <= now.addingTimeInterval(60) {
        return Status(text: "\(soonest.name) limit reached" + back, warns: true)
    }
    return Status(text: "\(soonest.name) limit out \(whenText(soonest.wall.start, now: now))" + back, warns: true)
}

/// Provider marks from bundled vectors, so they stay sharp at notch sizes.
private struct ProviderMark: View {
    let name: String
    let size: CGFloat

    var body: some View {
        if let image = Self.image(name) {
            Image(nsImage: image)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: size, height: size)
                .accessibilityHidden(true)
        }
    }

    @MainActor private static var cache: [String: NSImage] = [:]

    @MainActor private static func image(_ name: String) -> NSImage? {
        if let cached = cache[name] { return cached }
        guard let url = Bundle.module.url(forResource: name, withExtension: "svg"),
              let image = NSImage(contentsOf: url) else { return nil }
        cache[name] = image
        return image
    }
}

/// Provider mark, name and status share a line. The name hugs the mark so the status follows straight
/// after it; each section reads as one sentence instead of a label with a line of empty space beside it.
private struct SectionTitle: View {
    let mark: String
    let title: String
    let status: Status

    var body: some View {
        HStack(spacing: 0) {
            ProviderMark(name: mark, size: 14)
                .padding(.trailing, 7)
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.9)
                .foregroundStyle(.white.opacity(0.5))
                .padding(.trailing, 9)
            Text(status.text)
                .font(.system(size: 14, weight: .semibold))
                .tracking(-0.1)
                .foregroundStyle(status.warns ? amber : .white.opacity(0.92))
                .lineLimit(1)
                .contentTransition(.opacity)
            Spacer(minLength: 0)
        }
    }
}

/// Each provider declares its own columns, flush to the right margin so every row keeps the same edge.
private struct ColumnLabels: View {
    let titles: [String]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(titles, id: \.self) { title in
                Text(title).frame(width: WindowColumn.width, alignment: .leading)
            }
        }
        .font(.system(size: 9, weight: .semibold))
        .tracking(0.8)
        .foregroundStyle(.white.opacity(0.28))
    }
}

/// A hairline between providers: they are separate pools, not rows of one table.
private struct SectionDivider: View {
    var body: some View {
        LinearGradient(
            colors: [.white.opacity(0.03), .white.opacity(0.14), .white.opacity(0.03)],
            startPoint: .leading,
            endPoint: .trailing
        )
        .frame(height: 1)
    }
}

struct GoRowModel: Equatable {
    let rolling: ColumnModel
    let weekly: ColumnModel
    let monthly: ColumnModel
}

/// A window that is already at its limit stops the other two: name the one that resets last, since
/// that is the wait that matters. No reset time counts as the last wait of all.
func goBlockedBy(_ outlook: GoOutlook) -> [String?] {
    let windows: [(name: String, projection: Projection?)] = [
        ("5h", outlook.rolling), ("weekly", outlook.weekly), ("monthly", outlook.monthly)
    ]
    let exhausted = windows.filter { $0.projection?.isExhausted == true }
    guard let last = exhausted.max(by: {
        ($0.projection?.resetsAt ?? .distantFuture) < ($1.projection?.resetsAt ?? .distantFuture)
    }) else {
        return windows.map { _ in nil }
    }
    return windows.map { $0.projection?.isExhausted == true ? nil : "\(last.name) limit" }
}

func goRowModel(_ account: GoAccount, now: Date) -> GoRowModel {
    let outlook = account.outlook
    let blocked = goBlockedBy(outlook)
    return GoRowModel(rolling: ColumnModel(outlook.rolling, now: now, blockedBy: blocked[0]),
                      weekly: ColumnModel(outlook.weekly, now: now, blockedBy: blocked[1]),
                      monthly: ColumnModel(outlook.monthly, now: now, blockedBy: blocked[2]))
}

private struct GoRow: View {
    let account: GoAccount
    let now: Date

    /// The console's default name for the key says nothing; the row needs something to hold the left edge.
    private var identity: String {
        account.label == "OpenCode Go" ? "Default key" : account.label
    }

    var body: some View {
        let model = goRowModel(account, now: now)
        let problem = staleCaption(account.problem, fetchedAt: account.fetchedAt, now: now)
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(identity)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1)
                    .truncationMode(.middle)
                // The blank line keeps Go rows the same height as Claude's, whose second line is the plan.
                Text(problem ?? " ")
                    .font(.system(size: 10))
                    .tracking(0.1)
                    .foregroundStyle(problem == nil ? .clear : amber.opacity(0.85))
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Spacer(minLength: 16)
            WindowColumn(model: model.rolling)
            WindowColumn(model: model.weekly)
            WindowColumn(model: model.monthly)
        }
    }
}

struct ExpandedView: View {
    @ObservedObject var store: UsageStore

    var body: some View {
        TimelineView(.everyMinute) { _ in
            let now = Date.now
            VStack(alignment: .leading, spacing: 18) {
                if !store.accounts.isEmpty {
                    ClaudeSection(accounts: store.accounts, now: now)
                }
                if !store.accounts.isEmpty && !store.goAccounts.isEmpty {
                    SectionDivider()
                }
                if !store.goAccounts.isEmpty {
                    GoSection(accounts: store.goAccounts, now: now)
                }
                if store.accounts.isEmpty && store.goAccounts.isEmpty {
                    Text("No Claude accounts in ~/.cli-proxy-api and no OpenCode Go key in ~/.local/share/opencode")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.5))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, panelPadding)
            .padding(.top, 6)
            .padding(.bottom, 16)
            .frame(width: panelWidth)
        }
    }
}

private struct ClaudeSection: View {
    let accounts: [AccountUsage]
    let now: Date

    var body: some View {
        let forecasts = accounts.poolForecasts(now: now)
        let pool = accounts.poolOutlook(forecasts: forecasts)
        let outlooks = accounts.pooledOutlooks(now: now, forecasts: forecasts)
        ProviderSection(titles: ["5 HOURS", "WEEK"]) {
            SectionTitle(mark: "claude", title: "Claude", status: claudeStatus(accounts, now: now, pool: pool))
        } rows: {
            ForEach(accounts.indices, id: \.self) { i in
                AccountRow(account: accounts[i], outlook: outlooks[i], now: now)
            }
        }
    }
}

private struct GoSection: View {
    let accounts: [GoAccount]
    let now: Date

    var body: some View {
        ProviderSection(titles: ["5 HOURS", "WEEK", "MONTH"]) {
            SectionTitle(mark: "opencode", title: "OpenCode Go", status: goStatus(accounts, now: now))
        } rows: {
            ForEach(accounts) { GoRow(account: $0, now: now) }
        }
    }
}

/// One provider's block: its headline, its own column labels, then its rows. The labels sit closer to
/// the rows than to the headline, so each column group reads as one unit.
private struct ProviderSection<Header: View, Rows: View>: View {
    let titles: [String]
    @ViewBuilder let header: () -> Header
    @ViewBuilder let rows: () -> Rows

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header()
            ColumnLabels(titles: titles)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.top, 13)
                .padding(.bottom, 7)
            VStack(alignment: .leading, spacing: 10) {
                rows()
            }
        }
    }
}
