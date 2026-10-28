import AppKit
import SwiftUI

struct UsageWindow: Equatable, Codable {
    let utilization: Double
    let resetsAt: Date?
}

struct AccountUsage: Identifiable, Equatable, Codable {
    let id: String
    let label: String
    let org: String
    var plan: String?
    var fiveHour: UsageWindow?
    var sevenDay: UsageWindow?
    var fetchedAt: Date?
    var problem: String?
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
    let five_hour: Window?
    let seven_day: Window?
}

private struct ProfileResponse: Decodable {
    struct Organization: Decodable {
        let organization_type: String?
        let rate_limit_tier: String?
    }
    let organization: Organization?

    var plan: String? {
        guard let org = organization else { return nil }
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

    private var schedules: [String: Schedule] = [:]
    private var refreshing = false

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
        let creds = Self.loadCredentials()
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

        let merged = creds.map { cred in
            results[cred.id] ?? previous[cred.id] ?? AccountUsage(id: cred.id, label: cred.label, org: cred.org)
        }
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

    private static func loadCredentials() -> [Credential] {
        let files = (try? FileManager.default.contentsOfDirectory(at: authDir, includingPropertiesForKeys: nil)) ?? []
        return files
            .filter { $0.lastPathComponent.hasPrefix("claude-") && $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .compactMap { url in
                guard let data = try? Data(contentsOf: url),
                      let file = try? JSONDecoder().decode(CredentialFile.self, from: data),
                      file.disabled != true else { return nil }
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
        // The plan rarely changes, so it's fetched once and carried forward.
        async let plan = previous?.plan == nil ? fetchPlan(cred) : previous?.plan
        var usage = AccountUsage(id: cred.id, label: cred.label, org: cred.org, plan: nil,
                                 fiveHour: previous?.fiveHour, sevenDay: previous?.sevenDay, fetchedAt: previous?.fetchedAt)
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
                usage.fiveHour = body.five_hour?.window
                usage.sevenDay = body.seven_day?.window
                usage.fetchedAt = .now
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
        usage.plan = await plan
        return (usage, outcome)
    }

    nonisolated private static func fetchPlan(_ cred: Credential) async -> String? {
        guard let (data, response) = try? await URLSession.shared.data(for: request("profile", cred)),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return (try? JSONDecoder().decode(ProfileResponse.self, from: data))?.plan
    }

    nonisolated private static func request(_ endpoint: String, _ cred: Credential) -> URLRequest {
        var req = URLRequest(url: URL(string: "https://api.anthropic.com/api/oauth/\(endpoint)")!)
        req.timeoutInterval = 10
        req.setValue("Bearer \(cred.token)", forHTTPHeaderField: "Authorization")
        req.setValue("oauth-2025-04-20", forHTTPHeaderField: "anthropic-beta")
        return req
    }
}
