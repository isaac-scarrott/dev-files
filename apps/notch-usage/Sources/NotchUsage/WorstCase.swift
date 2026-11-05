import Foundation

/// `--worst-case` renders these instead of live data, to check layout against hostile input.
extension [AccountUsage] {
    static var worstCase: [AccountUsage] {
        func account(_ id: String, _ label: String, org: String, plan: String? = nil,
                     five: (Double, TimeInterval?)?, week: (Double, TimeInterval?)?,
                     fetchedAgo: TimeInterval? = 0, problem: String? = nil) -> AccountUsage {
            var a = AccountUsage(id: id, label: label, org: org)
            a.plan = plan
            a.fiveHour = five.map { UsageWindow(utilization: $0.0, resetsAt: $0.1.map { Date.now.addingTimeInterval($0) }) }
            a.sevenDay = week.map { UsageWindow(utilization: $0.0, resetsAt: $0.1.map { Date.now.addingTimeInterval($0) }) }
            a.fetchedAt = fetchedAgo.map { Date.now.addingTimeInterval(-$0) }
            a.problem = problem
            a.heldBack = id == "f"
            return a
        }
        let h: TimeInterval = 3600, d: TimeInterval = 86400
        return [
            account("a", "christopher.alexander.montgomery-wellington@holibob", org: "Holibob Engineering Platform Team (EU)",
                    plan: "Enterprise", five: (142, 40), week: (99.6, 6 * d + 23 * h)),
            account("b", "a@b", org: "Personal", plan: "Max 20x", five: (-3, nil), week: (0, nil)),
            account("c", "李小龍@例え", org: "株式会社テスト", five: nil, week: nil, fetchedAgo: nil, problem: "Signed out"),
            account("d", "isaac@holibob", org: "Holibob", plan: "Team", five: (84.9, 4 * h), week: (85, 2 * d),
                    fetchedAgo: h, problem: "Offline"),
            // Burning hard an hour into the window: projects past 100% well before reset.
            account("e", "e@x", org: "Personal", plan: "Max 5x", five: (60, 4 * h), week: (20, 6 * d)),
            account("f", "f@x", org: "Personal", five: (100, 25 * 60), week: (100, 3 * h)),
        ]
    }
}
