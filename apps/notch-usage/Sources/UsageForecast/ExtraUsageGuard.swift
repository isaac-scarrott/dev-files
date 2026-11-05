import Foundation

/// An account with extra usage on keeps serving past 100% and bills the overage, so cliproxy's failover on 429
/// never fires. The guard takes such an account out of rotation just before a window fills.
public enum ExtraUsageGuard {
    public static let threshold = 98.0

    public struct Window: Equatable, Sendable {
        public let utilization: Double
        public let resetsAt: Date?

        public init(utilization: Double, resetsAt: Date?) {
            self.utilization = utilization
            self.resetsAt = resetsAt
        }

        /// A reading whose window has already reset describes nothing: the next poll will show the new window.
        func isFull(at now: Date) -> Bool {
            utilization >= ExtraUsageGuard.threshold && (resetsAt.map { $0 > now } ?? true)
        }
    }

    public enum Action: Equatable, Sendable {
        case hold, release, none
    }

    /// `held` is whether the guard itself took the account out of rotation.
    public static func action(extraUsage: Bool?, held: Bool, windows: [Window], now: Date) -> Action {
        let full = windows.contains { $0.isFull(at: now) }
        if held { return full ? .none : .release }
        return extraUsage == true && full ? .hold : .none
    }

    /// Sets `"disabled"` in an auth file's bytes without touching anything else in it, so a token cliproxy
    /// refreshed a moment ago is never reformatted or lost. Nil when the file isn't a JSON object.
    public static func setDisabled(_ disabled: Bool, in file: Data) -> Data? {
        guard var text = String(data: file, encoding: .utf8) else { return nil }
        let value = disabled ? "true" : "false"
        if let range = text.range(of: #""disabled"\s*:\s*(true|false)"#, options: .regularExpression) {
            text.replaceSubrange(range, with: "\"disabled\": \(value)")
        } else if let brace = text.firstIndex(of: "{") {
            text.insert(contentsOf: "\n  \"disabled\": \(value),", at: text.index(after: brace))
        } else {
            return nil
        }
        return Data(text.utf8)
    }

    public static func isDisabled(in file: Data) -> Bool {
        guard let object = try? JSONSerialization.jsonObject(with: file) as? [String: Any] else { return false }
        return object["disabled"] as? Bool ?? false
    }
}
