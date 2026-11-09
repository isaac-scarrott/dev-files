import Foundation
import SQLite3
import UsageForecast

/// One OpenCode Go key's allowances. Go measures three nested windows in percent of their own
/// limit: a rolling 5 hours, the week, and the month. Any one of them running out stops every model.
struct GoAccount: Identifiable, Equatable, Codable {
    let id: String
    let label: String
    var rolling: UsageWindow?
    var weekly: UsageWindow?
    var monthly: UsageWindow?
    var fetchedAt: Date?
    var problem: String?
    /// Recent rolling readings, for the burn rate.
    var history: [Sample] = []

    init(id: String, label: String) {
        self.id = id
        self.label = label
    }

    // A snapshot written before a field existed must still load, or every key re-polls at once.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        label = try c.decode(String.self, forKey: .label)
        rolling = try c.decodeIfPresent(UsageWindow.self, forKey: .rolling)
        weekly = try c.decodeIfPresent(UsageWindow.self, forKey: .weekly)
        monthly = try c.decodeIfPresent(UsageWindow.self, forKey: .monthly)
        fetchedAt = try c.decodeIfPresent(Date.self, forKey: .fetchedAt)
        problem = try c.decodeIfPresent(String.self, forKey: .problem)
        history = try c.decodeIfPresent([Sample].self, forKey: .history) ?? []
    }
}

struct GoCredential {
    let id: String
    let label: String
    let token: String
}

/// OpenCode keeps its keys in its own store. Read them from there rather than asking for a copy,
/// so rotating or adding a key in the console shows up here without doing anything else.
enum GoCredentials {
    private struct Stored: Decodable {
        let type: String?
        let key: String?
        let access: String?
        var token: String? { [key, access].compactMap { $0 }.first { !$0.isEmpty } }
    }

    private static var dataDirectory: URL {
        if let xdg = ProcessInfo.processInfo.environment["XDG_DATA_HOME"], !xdg.isEmpty {
            return URL(fileURLWithPath: xdg).appendingPathComponent("opencode")
        }
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".local/share/opencode")
    }

    static func load() -> [GoCredential] {
        let stored = fromDatabase()
        return stored.isEmpty ? fromAuthFile() : stored
    }

    /// The V2 credential table. `active` is null on rows written by older builds.
    private static func fromDatabase() -> [GoCredential] {
        let url = dataDirectory.appendingPathComponent("opencode.db")
        var handle: OpaquePointer?
        guard sqlite3_open_v2(url.path, &handle, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else {
            sqlite3_close(handle)
            return []
        }
        defer { sqlite3_close(handle) }
        // OpenCode writes this file while we read it; wait for its lock instead of giving up.
        sqlite3_busy_timeout(handle, 2000)

        let sql = """
            SELECT id, label, value FROM credential
            WHERE integration_id = 'opencode-go' AND (active IS NULL OR active = 1)
            ORDER BY time_updated DESC
            """
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK else { return [] }
        defer { sqlite3_finalize(statement) }

        var found: [GoCredential] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            guard let id = text(statement, 0), let value = text(statement, 2),
                  let stored = try? JSONDecoder().decode(Stored.self, from: Data(value.utf8)),
                  let token = stored.token else { continue }
            found.append(GoCredential(id: id, label: text(statement, 1) ?? "OpenCode Go", token: token))
        }
        return found
    }

    private static func text(_ statement: OpaquePointer?, _ column: Int32) -> String? {
        sqlite3_column_text(statement, column).map { String(cString: $0) }
    }

    /// A V1 install keeps a single Console key in auth.json instead.
    private static func fromAuthFile() -> [GoCredential] {
        let url = dataDirectory.appendingPathComponent("auth.json")
        guard let data = try? Data(contentsOf: url),
              let root = try? JSONDecoder().decode([String: Stored].self, from: data),
              let stored = root["opencode"], let token = stored.token else { return [] }
        return [GoCredential(id: "opencode", label: "OpenCode", token: token)]
    }
}

private struct GoUsageResponse: Decodable {
    struct Window: Decodable {
        let status: String
        let percent: Double
        let resetsAt: Date?

        var window: UsageWindow { UsageWindow(utilization: percent, resetsAt: resetsAt) }
    }
    struct Usage: Decodable {
        let rolling: Window?
        let weekly: Window?
        let monthly: Window?
    }
    let usage: Usage
}

extension GoAccount {
    private static var usageURL: URL { URL(string: "https://opencode.ai/zen/go/v1/usage")! }

    /// On failure, keep the last good numbers and say why they're old, rather than blanking the row.
    static func fetch(_ cred: GoCredential, previous: GoAccount?) async -> (GoAccount, Outcome) {
        var account = previous ?? GoAccount(id: cred.id, label: cred.label)
        var outcome = Outcome.failed
        var request = URLRequest(url: usageURL)
        request.timeoutInterval = 10
        request.setValue("Bearer \(cred.token)", forHTTPHeaderField: "Authorization")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let http = response as? HTTPURLResponse
            switch http?.statusCode ?? 0 {
            case 200:
                // Scheduled as a success even if the body is unreadable: a fast retry would only spend rate limit.
                outcome = .ok
                guard let body = try? UsageStore.makeDecoder().decode(GoUsageResponse.self, from: data) else {
                    account.problem = "Unexpected response"
                    break
                }
                let now = Date.now
                account.rolling = body.usage.rolling?.window.carryingExhaustion(from: account.rolling, at: now)
                account.weekly = body.usage.weekly?.window.carryingExhaustion(from: account.weekly, at: now)
                account.monthly = body.usage.monthly?.window.carryingExhaustion(from: account.monthly, at: now)
                account.fetchedAt = now
                account.problem = nil
                if let rolling = account.rolling {
                    account.history = account.history.filter { now.timeIntervalSince($0.at) < UsageStore.historyKept }
                        + [Sample(at: now, utilization: rolling.utilization, resetsAt: rolling.resetsAt)]
                }
            case 401, 403:
                account.problem = "Signed out"
                outcome = .rateLimited(retryAfter: nil)
            case 429:
                account.problem = "Rate limited"
                let retryAfter = http?.value(forHTTPHeaderField: "retry-after").flatMap(TimeInterval.init)
                outcome = .rateLimited(retryAfter: retryAfter)
            case let code:
                account.problem = "OpenCode returned \(code)"
            }
        } catch {
            account.problem = "Offline"
        }
        return (account, outcome)
    }
}

/// A window that is out now, or will be before it resets. An exhausted window is a wall even with no
/// reset time: nothing refills it until one appears. A reset time already past means it has refilled,
/// so it is no wall at all. 99.6% reads as 100, so rounding decides what counts as out.
private func wall(_ p: Projection) -> Blackout? {
    if let resetsAt = p.resetsAt, resetsAt <= p.at { return nil }
    if p.utilization.rounded() >= 100 { return Blackout(start: p.exhaustsAt ?? p.at, end: p.resetsAt) }
    guard let resetsAt = p.resetsAt, let out = p.exhaustsAt, out < resetsAt else { return nil }
    return Blackout(start: out, end: resetsAt)
}

struct GoOutlook {
    let rolling: Projection?
    let weekly: Projection?
    let monthly: Projection?

    var canProject: Bool { [rolling, weekly, monthly].contains { $0?.rate != nil } }

    /// The first allowance to run out and when that one comes back. These are separate walls:
    /// spending the week does not refill the month, and the 5h wall is the one you hit first.
    var nextOut: Blackout? {
        let windows = [rolling, weekly, monthly].compactMap { $0 }
        return windows.compactMap(wall).min { $0.start < $1.start }
    }
}

extension GoAccount {
    var outlook: GoOutlook {
        let at = fetchedAt ?? .now
        func project(_ kind: WindowKind, _ window: UsageWindow?, history: [Sample] = []) -> Projection? {
            guard let window else { return nil }
            return Forecast.project(
                kind,
                current: Sample(at: at, utilization: window.utilization,
                                resetsAt: window.resetsAt, exhaustedSince: window.exhaustedSince),
                history: history
            )
        }
        return GoOutlook(
            rolling: project(.fiveHour, rolling, history: history),
            weekly: project(.week, weekly),
            monthly: project(.month, monthly)
        )
    }
}

extension [GoAccount] {
    func nextOut() -> Blackout? {
        compactMap { $0.outlook.nextOut }.min { $0.start < $1.start }
    }

    /// The compact's one triple: one key is the exact projection, several are averaged. Amber comes from
    /// the earliest wall across keys, so a key that is out still warns even when the average looks calm.
    /// No faint arc, for the same reason as Claude's pair: at 12pt a projection reads as usage.
    func combinedOutlook(now: Date) -> GoOutlook {
        let outlooks = map(\.outlook)
        func pooled(_ window: KeyPath<GoOutlook, Projection?>) -> Projection? {
            let projections = outlooks.compactMap { $0[keyPath: window] }
            guard !projections.isEmpty else { return nil }
            let utilization = projections.reduce(0) { $0 + $1.utilization } / Double(projections.count)
            let nearest = projections.compactMap(wall).min { $0.start < $1.start }
            return Projection(at: now, utilization: utilization, resetsAt: nearest?.end, rate: nil,
                              projected: nil, exhaustsAt: nearest?.start)
        }
        return GoOutlook(rolling: pooled(\.rolling), weekly: pooled(\.weekly), monthly: pooled(\.monthly))
    }
}
