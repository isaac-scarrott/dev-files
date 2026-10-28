import Foundation

/// `--worst-case` renders these instead of live data, to check layout against hostile input.
extension [AccountUsage] {
    static var worstCase: [AccountUsage] {
        let soon = Date.now.addingTimeInterval(40)
        let far = Date.now.addingTimeInterval(6 * 86400 + 23 * 3600)
        return [
            .init(id: "a", label: "christopher.alexander.montgomery-wellington@holibob", org: "Holibob Engineering Platform Team (EU)", plan: "Enterprise",
                  fiveHour: .init(utilization: 142, resetsAt: soon), sevenDay: .init(utilization: 99.6, resetsAt: far), fetchedAt: .now),
            .init(id: "b", label: "a@b", org: "Personal", plan: "Max 20x",
                  fiveHour: .init(utilization: -3, resetsAt: nil), sevenDay: .init(utilization: 0, resetsAt: nil), fetchedAt: .now),
            .init(id: "c", label: "李小龍@例え", org: "株式会社テスト",
                  fiveHour: nil, sevenDay: nil, fetchedAt: nil, problem: "Signed out"),
            .init(id: "d", label: "isaac@holibob", org: "Holibob", plan: "Team",
                  fiveHour: .init(utilization: 84.9, resetsAt: far), sevenDay: .init(utilization: 85, resetsAt: far),
                  fetchedAt: .now.addingTimeInterval(-3600), problem: "Offline"),
            .init(id: "e", label: "e@x", org: "Personal", fiveHour: .init(utilization: 50, resetsAt: soon), sevenDay: nil, fetchedAt: .now),
            .init(id: "f", label: "f@x", org: "Personal", fiveHour: .init(utilization: 100, resetsAt: soon), sevenDay: .init(utilization: 100, resetsAt: soon), fetchedAt: .now),
        ]
    }
}
