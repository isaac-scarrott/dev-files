// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "NotchUsage",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/MrKai77/DynamicNotchKit", from: "1.1.0")
    ],
    targets: [
        .target(
            name: "UsageForecast",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .executableTarget(
            name: "NotchUsage",
            dependencies: ["DynamicNotchKit", "UsageForecast"],
            resources: [.process("Resources")],
            swiftSettings: [.swiftLanguageMode(.v6)],
            linkerSettings: [.linkedLibrary("sqlite3")]
        ),
        .testTarget(
            name: "UsageForecastTests",
            dependencies: ["UsageForecast"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "NotchUsageTests",
            dependencies: ["NotchUsage"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        )
    ]
)
