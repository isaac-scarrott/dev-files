import SwiftUI

// One visual idea: a ring. Compact puts the 5h rings left of the notch and the 7d rings right of it;
// expanded is the same two columns, larger, in the same order. Colour only ever means "near the limit".

private let amber = Color(red: 1.0, green: 0.72, blue: 0.27)
private let warnAt = 85.0

private extension Double {
    /// Rounded once, so the number shown and the colour it's drawn in can never disagree.
    var displayPercent: Double { Swift.min(Swift.max(self, 0), 100).rounded() }
}

func resetText(_ date: Date?, now: Date) -> String {
    guard let date else { return "" }
    let s = Int(date.timeIntervalSince(now))
    if s < 60 { return "resetting" }
    let d = s / 86400, h = (s % 86400) / 3600, m = (s % 3600) / 60
    if d > 0 { return "\(d)d \(h)h" }
    if h > 0 { return "\(h)h \(m)m" }
    return "\(m)m"
}

struct Ring: View {
    let pct: Double
    let size: CGFloat
    let lineWidth: CGFloat
    var dimmed = false

    var body: some View {
        ZStack {
            Circle().stroke(.white.opacity(0.14), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: pct.displayPercent / 100)
                .stroke(pct.displayPercent >= warnAt ? amber : .white.opacity(0.92),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .opacity(dimmed ? 0.35 : 1)
        .frame(width: size, height: size)
    }
}

struct CompactRings: View {
    @ObservedObject var store: UsageStore
    let sevenDay: Bool

    var body: some View {
        HStack(spacing: 5) {
            ForEach(store.accounts) { a in
                Ring(pct: (sevenDay ? a.sevenDay : a.fiveHour)?.utilization ?? 0,
                     size: 12, lineWidth: 2, dimmed: a.fetchedAt == nil)
            }
        }
        .padding(.horizontal, 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(sevenDay ? "Weekly usage" : "Five-hour usage")
    }
}

private struct WindowColumn: View {
    let window: UsageWindow?
    let now: Date
    static let width: CGFloat = 92

    var body: some View {
        let pct = (window?.utilization ?? 0).displayPercent
        let reset = resetText(window?.resetsAt, now: now)
        HStack(spacing: 8) {
            Ring(pct: pct, size: 20, lineWidth: 2.5, dimmed: window == nil)
            VStack(alignment: .leading, spacing: 1) {
                Text(window == nil ? "–" : "\(Int(pct))%")
                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle(pct >= warnAt ? amber : .white)
                    .contentTransition(.numericText(value: pct))
                // A blank line still takes its height, so rows without a reset time stay centred on the ring.
                Text(reset.isEmpty ? " " : reset)
                    .font(.system(size: 10).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.45))
            }
        }
        .frame(width: Self.width, alignment: .leading)
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
        guard let problem = account.problem else { return identity }
        guard let fetchedAt = account.fetchedAt else { return problem }
        guard now.timeIntervalSince(fetchedAt) > 15 * 60 else { return identity }
        let age = RelativeDateTimeFormatter().localizedString(for: fetchedAt, relativeTo: now)
        return "\(problem) · \(age)"
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
                    .foregroundStyle(account.problem == nil ? .white.opacity(0.4) : amber.opacity(0.85))
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Spacer(minLength: 16)
            WindowColumn(window: account.fiveHour, now: now)
            WindowColumn(window: account.sevenDay, now: now)
        }
        .accessibilityElement(children: .combine)
    }
}

struct ExpandedView: View {
    @ObservedObject var store: UsageStore

    var body: some View {
        TimelineView(.everyMinute) { _ in
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 0) {
                    Spacer()
                    Text("5 HOURS").frame(width: WindowColumn.width, alignment: .leading)
                    Text("WEEK").frame(width: WindowColumn.width, alignment: .leading)
                }
                .font(.system(size: 9, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(.white.opacity(0.3))
                .padding(.bottom, -4)

                ForEach(store.accounts) { AccountRow(account: $0, now: .now) }

                if store.accounts.isEmpty {
                    Text("No Claude accounts in ~/.cli-proxy-api")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.5))
                }
            }
            .frame(width: 380)
            .padding(.horizontal, 14)
            .padding(.top, 4)
            .padding(.bottom, 14)
        }
    }
}
