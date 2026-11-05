import AppKit
import SwiftUI
import UsageForecast

struct UsageWindow: Equatable, Codable {
    let utilization: Double
    let resetsAt: Date?
    /// When a poll first found this window at its limit.
    var exhaustedSince: Date? = nil

    /// Keeps the first sighting at the limit across polls of the same window.
    func carryingExhaustion(from old: UsageWindow?, at now: Date) -> UsageWindow {
        guard utilization >= 100 else { return self }
        var next = self
        let sameWindow = old.flatMap { o in
            o.resetsAt.flatMap { a in resetsAt.map { abs(a.timeIntervalSince($0)) < 120 } }
        } ?? false
        next.exhaustedSince = sameWindow ? old?.exhaustedSince ?? now : now
        return next
    }
}

struct AccountUsage: Identifiable, Equatable, Codable {
    let id: String
    let label: String
    let org: String
    var plan: String?
    /// Allowance multiple from the account's rate-limit tier: 20 for Max 20x, 5 for Max 5x.
    var capacity: Double?
    var profileFetchedAt: Date?
    var fiveHour: UsageWindow?
    var sevenDay: UsageWindow?
    var fetchedAt: Date?
    var problem: String?
    /// Whether the account bills past 100% instead of refusing, as last reported.
    var extraUsage: Bool?
    /// The guard has taken this account out of cliproxy's rotation to keep it off extra usage.
    var heldBack = false
    /// Recent 5h readings, for the burn rate.
    var history: [Sample] = []

    init(id: String, label: String, org: String) {
        self.id = id
        self.label = label
        self.org = org
    }

    // Snapshots written before `history` existed must still load: losing one re-polls every account at once.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        label = try c.decode(String.self, forKey: .label)
        org = try c.decode(String.self, forKey: .org)
        plan = try c.decodeIfPresent(String.self, forKey: .plan)
        capacity = try c.decodeIfPresent(Double.self, forKey: .capacity)
        profileFetchedAt = try c.decodeIfPresent(Date.self, forKey: .profileFetchedAt)
        fiveHour = try c.decodeIfPresent(UsageWindow.self, forKey: .fiveHour)
        sevenDay = try c.decodeIfPresent(UsageWindow.self, forKey: .sevenDay)
        fetchedAt = try c.decodeIfPresent(Date.self, forKey: .fetchedAt)
        problem = try c.decodeIfPresent(String.self, forKey: .problem)
        extraUsage = try c.decodeIfPresent(Bool.self, forKey: .extraUsage)
        heldBack = try c.decodeIfPresent(Bool.self, forKey: .heldBack) ?? false
        history = try c.decodeIfPresent([Sample].self, forKey: .history) ?? []
    }
}

private struct CredentialFile: Decodable {
    let email: String
    let access_token: String
    let organization_name: String?
    let disabled: Bool?
}

private struct UsageResponse: Decodable {
    struct Window: Decodable {
        let utilization: Double
        let resets_at: Date?

        var window: UsageWindow { UsageWindow(utilization: utilization, resetsAt: resets_at) }
    }
    struct ExtraUsage: Decodable {
        let is_enabled: Bool?
    }
    let five_hour: Window?
    let seven_day: Window?
    let extra_usage: ExtraUsage?
}

private struct ProfileResponse: Decodable, Sendable {
    struct Organization: Decodable {
        let organization_type: String?
        let rate_limit_tier: String?
        /// Anthropic's own name for the plan, when it has one ("Ultra").
        let plan_display_name: String?
    }
    let organization: Organization?

    var capacity: Double? {
        let tier = organization?.rate_limit_tier ?? ""
        if tier.hasSuffix("_20x") { return 20 }
        if tier.hasSuffix("_5x") { return 5 }
        return organization?.organization_type == "claude_pro" ? 1 : nil
    }

    var plan: String? {
        guard let org = organization else { return nil }
        if let name = org.plan_display_name, !name.isEmpty { return name }
        switch org.organization_type {
        case "claude_team": return "Team"
        case "claude_enterprise": return "Enterprise"
        case "claude_pro": return "Pro"
        case "claude_max":
            let tier = org.rate_limit_tier ?? ""
            if tier.hasSuffix("_20x") { return "Max 20x" }
            if tier.hasSuffix("_5x") { return "Max 5x" }
            return "Max"
        default: return nil
        }
    }
}

private struct Credential {
    let id: String
    let label: String
    let org: String
    let token: String
}

/// When an account may next hit the usage endpoint. Anthropic rate-limits it hard (and Claude Code's own
/// polling shares the budget), so each account polls at most every 5 minutes and backs off to 30 on a 429.
private struct Schedule: Codable {
    var nextAttempt: Date = .distantPast
    var backoff: TimeInterval = 0
}

/// Last known numbers and schedules, so a relaunch shows data at once and doesn't re-poll early.
private struct Snapshot: Codable {
    var accounts: [AccountUsage]
    var schedules: [String: Schedule]
}

private enum Outcome: Sendable {
    case ok
    /// Also used for auth failures: retrying a dead token sooner than a rate limit would buys nothing.
    case rateLimited(retryAfter: TimeInterval?)
    case failed
}

@MainActor
final class UsageStore: ObservableObject {
    @Published private(set) var accounts: [AccountUsage] = []

    private static let authDir = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".cli-proxy-api")
    private static let snapshotURL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("NotchUsage/snapshot.json")
    private static let minInterval: TimeInterval = 5 * 60
    private static let maxBackoff: TimeInterval = 30 * 60
    private static let failureRetry: TimeInterval = 60
    private static let tick: Duration = .seconds(30)
    nonisolated private static let historyKept: TimeInterval = 2 * 3600
    nonisolated private static let profileMaxAge: TimeInterval = 86400

    private static let heldKey = "extraUsageGuardHeld"

    private var schedules: [String: Schedule] = [:]
    private var refreshing = false
    /// Auth files the guard disabled itself. Kept across launches: a held account is skipped by everything else,
    /// so forgetting it would leave it disabled for good.
    private var held = Set(UserDefaults.standard.stringArray(forKey: UsageStore.heldKey) ?? [])

    init(preview: [AccountUsage]? = nil) {
        if let preview { accounts = preview; return }
        if let data = try? Data(contentsOf: Self.snapshotURL),
           let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data) {
            accounts = snapshot.accounts
            schedules = snapshot.schedules
        }
        Task { [weak self] in
            while !Task.isCancelled {
                await self?.refreshDue()
                try? await Task.sleep(for: Self.tick)
            }
        }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { _ = Task { await self?.refreshDue() } }
        }
    }

    private func refreshDue() async {
        guard !refreshing else { return }
        refreshing = true
        defer { refreshing = false }

        let now = Date.now
        let creds = Self.loadCredentials(held: held)
        let previous = Dictionary(accounts.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let due = creds.filter { schedules[$0.id, default: Schedule()].nextAttempt <= now }

        var results: [String: AccountUsage] = [:]
        await withTaskGroup(of: (AccountUsage, Outcome).self) { group in
            for cred in due {
                group.addTask { await Self.fetch(cred, previous: previous[cred.id]) }
            }
            for await (usage, outcome) in group {
                results[usage.id] = usage
                schedules[usage.id] = Self.reschedule(schedules[usage.id, default: Schedule()], after: outcome, now: now)
            }
        }

        var merged = creds.map { cred in
            results[cred.id] ?? previous[cred.id] ?? AccountUsage(id: cred.id, label: cred.label, org: cred.org)
        }
        applyGuard(to: &merged, now: now)
        guard merged != accounts else { return }
        withAnimation(.spring(response: 0.5, dampingFraction: 1)) { accounts = merged }
        saveSnapshot()
    }

    private static func reschedule(_ schedule: Schedule, after outcome: Outcome, now: Date) -> Schedule {
        // Jitter keeps the accounts from all firing in the same second.
        let jitter = TimeInterval.random(in: 0...20)
        var next = schedule
        switch outcome {
        case .ok:
            next.backoff = 0
            next.nextAttempt = now + minInterval + jitter
        case .rateLimited(let retryAfter):
            next.backoff = min(max(schedule.backoff * 2, minInterval), maxBackoff)
            next.nextAttempt = now + max(next.backoff, retryAfter ?? 0) + jitter
        case .failed:
            next.nextAttempt = now + failureRetry + jitter
        }
        return next
    }

    private func saveSnapshot() {
        let snapshot = Snapshot(accounts: accounts, schedules: schedules)
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? FileManager.default.createDirectory(at: Self.snapshotURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: Self.snapshotURL, options: .atomic)
    }

    /// Disables or re-enables accounts on extra usage so cliproxy stops routing to one that is about to bill
    /// overage. Runs on stored readings too, not only fresh ones: a held account's token may have expired, and its
    /// last reset time is then all that says when it is safe again.
    private func applyGuard(to accounts: inout [AccountUsage], now: Date) {
        let before = held
        for i in accounts.indices {
            let id = accounts[i].id
            let url = Self.authDir.appendingPathComponent(id)
            if held.contains(id), !Self.fileIsDisabled(url) { held.remove(id) }
            let windows = [accounts[i].fiveHour, accounts[i].sevenDay].compactMap { $0 }
                .map { ExtraUsageGuard.Window(utilization: $0.utilization, resetsAt: $0.resetsAt) }
            switch ExtraUsageGuard.action(extraUsage: accounts[i].extraUsage, held: held.contains(id), windows: windows, now: now) {
            case .hold:
                if Self.writeDisabled(true, to: url) {
                    held.insert(id)
                    NSLog("extra-usage guard: paused %@", id)
                }
            case .release:
                if Self.writeDisabled(false, to: url) {
                    held.remove(id)
                    schedules[id, default: Schedule()].nextAttempt = now
                    NSLog("extra-usage guard: resumed %@", id)
                }
            case .none:
                break
            }
            accounts[i].heldBack = held.contains(id)
        }
        if held != before { UserDefaults.standard.set(Array(held), forKey: Self.heldKey) }
    }

    nonisolated private static func fileIsDisabled(_ url: URL) -> Bool {
        (try? Data(contentsOf: url)).map(ExtraUsageGuard.isDisabled(in:)) ?? false
    }

    /// Written in place, never by replacing the file: cliproxy ignores a replaced file whose content looks
    /// unchanged to it, so an atomic write would leave the account in rotation.
    nonisolated private static func writeDisabled(_ disabled: Bool, to url: URL) -> Bool {
        // Read right before writing: cliproxy rewrites the file whenever it refreshes the token.
        guard let old = try? Data(contentsOf: url), let new = ExtraUsageGuard.setDisabled(disabled, in: old) else { return false }
        if new == old { return true }
        guard let handle = try? FileHandle(forWritingTo: url) else { return false }
        defer { try? handle.close() }
        do {
            // Overwrite, then trim: the file is never empty while cliproxy might read it.
            try handle.seek(toOffset: 0)
            try handle.write(contentsOf: new)
            try handle.truncate(atOffset: UInt64(new.count))
            return true
        } catch {
            return false
        }
    }

    private static func loadCredentials(held: Set<String>) -> [Credential] {
        let files = (try? FileManager.default.contentsOfDirectory(at: authDir, includingPropertiesForKeys: nil)) ?? []
        return files
            .filter { $0.lastPathComponent.hasPrefix("claude-") && $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .compactMap { url in
                guard let data = try? Data(contentsOf: url),
                      let file = try? JSONDecoder().decode(CredentialFile.self, from: data),
                      file.disabled != true || held.contains(url.lastPathComponent) else { return nil }
                let parts = file.email.split(separator: "@", maxSplits: 1)
                let domain = parts.count > 1 ? parts[1].split(separator: ".").first.map(String.init) ?? "" : ""
                let org = file.organization_name ?? ""
                // cliproxy names personal orgs "<email>'s Organization"; that says nothing a reader needs.
                let orgLabel = org.isEmpty || org.hasSuffix("'s Organization") ? "Personal" : org
                return Credential(id: url.lastPathComponent, label: "\(parts.first ?? "")@\(domain)",
                                  org: orgLabel, token: file.access_token)
            }
    }

    nonisolated private static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        let fractional = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        let plain = Date.ISO8601FormatStyle()
        decoder.dateDecodingStrategy = .custom { decoder in
            let s = try decoder.singleValueContainer().decode(String.self)
            return try (try? fractional.parse(s)) ?? plain.parse(s)
        }
        return decoder
    }

    /// On failure, keep the last good numbers and say why they're old, rather than blanking the row.
    nonisolated private static func fetch(_ cred: Credential, previous: AccountUsage?) async -> (AccountUsage, Outcome) {
        // The plan rarely changes, so it's carried forward and refetched once a day.
        let profileDue = previous?.capacity == nil
            || previous?.profileFetchedAt.map { Date.now.timeIntervalSince($0) > profileMaxAge } ?? true
        async let profile = profileDue ? fetchProfile(cred) : nil
        var usage = AccountUsage(id: cred.id, label: cred.label, org: cred.org)
        if let previous {
            usage.plan = previous.plan
            usage.capacity = previous.capacity
            usage.profileFetchedAt = previous.profileFetchedAt
            usage.fiveHour = previous.fiveHour
            usage.sevenDay = previous.sevenDay
            usage.fetchedAt = previous.fetchedAt
            usage.extraUsage = previous.extraUsage
            usage.heldBack = previous.heldBack
            usage.history = previous.history
        }
        var outcome = Outcome.failed
        do {
            let (data, response) = try await URLSession.shared.data(for: request("usage", cred))
            let http = response as? HTTPURLResponse
            switch http?.statusCode ?? 0 {
            case 200:
                // Scheduled as a success even if the body is unreadable: a fast retry would only spend rate limit.
                outcome = .ok
                guard let body = try? makeDecoder().decode(UsageResponse.self, from: data) else {
                    usage.problem = "Unexpected response"
                    break
                }
                let now = Date.now
                usage.fiveHour = body.five_hour?.window.carryingExhaustion(from: usage.fiveHour, at: now)
                usage.sevenDay = body.seven_day?.window.carryingExhaustion(from: usage.sevenDay, at: now)
                usage.fetchedAt = now
                usage.extraUsage = body.extra_usage?.is_enabled
                if let five = usage.fiveHour {
                    usage.history = usage.history.filter { now.timeIntervalSince($0.at) < historyKept }
                        + [Sample(at: now, utilization: five.utilization, resetsAt: five.resetsAt)]
                }
            case 401, 403:
                usage.problem = "Signed out"
                outcome = .rateLimited(retryAfter: nil)
            case 429:
                usage.problem = "Rate limited"
                let retryAfter = http?.value(forHTTPHeaderField: "retry-after").flatMap(TimeInterval.init)
                outcome = .rateLimited(retryAfter: retryAfter)
            case let code: usage.problem = "Anthropic returned \(code)"
            }
        } catch {
            usage.problem = "Offline"
        }
        if let profile = await profile {
            usage.plan = profile.plan
            usage.capacity = profile.capacity ?? usage.capacity
            usage.profileFetchedAt = .now
        }
        return (usage, outcome)
    }

    nonisolated private static func fetchProfile(_ cred: Credential) async -> ProfileResponse? {
        guard let (data, response) = try? await URLSession.shared.data(for: request("profile", cred)),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return try? JSONDecoder().decode(ProfileResponse.self, from: data)
    }

    nonisolated private static func request(_ endpoint: String, _ cred: Credential) -> URLRequest {
        var req = URLRequest(url: URL(string: "https://api.anthropic.com/api/oauth/\(endpoint)")!)
        req.timeoutInterval = 10
        req.setValue("Bearer \(cred.token)", forHTTPHeaderField: "Authorization")
        req.setValue("oauth-2025-04-20", forHTTPHeaderField: "anthropic-beta")
        return req
    }
}
