# Changelog

## [Unreleased]

### [0.2.1] - 2023-06-15

### Added

-   New options parameter for `LogHeaders.getDataParser` with a `filters` field analogous to
    [`FieldFilterSet`](https://docs.rs/blackbox-log/0.3.1/blackbox_log/struct.FieldFilterSet.html)
    from the Rust api to limit which fields should be returned for each frame type. This can improve
    performance.
-   `DataParser.{main,slow,gps}FrameDef`: Get frame definition after any field filters

### [0.2.0] - 2023-06-09

### Changed

-   Renamed `blackbox-log/sync` import to `blackbox-log/slim`

### Removed

-   Multi-threaded async api (`blackbox-log/async`)
-   Default export from `blackbox-log/slim`. It is still exported as `Parser`

## [0.1.5] - 2023-05-16

### Fixed

-   Include panic messages in errors thrown due to a panic in WebAssembly
-   Frame timestamps

## [0.1.4] - 2023-05-10

### Added

-   [`Stats.progress`](https://docs.rs/blackbox-log/0.3.1/blackbox_log/data/struct.Stats.html#structfield.progress)

### Changed

-   Remove `type` restriction from export of `ParserEventKind`

## [0.1.3] - 2023-05-04

### Fixed

-   Do not throw an error when calling `*Parser.loadFile` with a buffer of length 0

## [0.1.2] - 2023-04-20

### Fixed

-   Inline worker file in main export after it is compiled

## [0.1.1] - 2023-04-18

### Fixed

-   Do not bundle dependencies

## [0.1.0] - 2023-04-18

Initial release

[unreleased]: https://github.com/blackbox-log/blackbox-log-ts/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/blackbox-log/blackbox-log-ts/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/blackbox-log/blackbox-log-ts/compare/v0.1.5...v0.2.0
[0.1.5]: https://github.com/blackbox-log/blackbox-log-ts/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/blackbox-log/blackbox-log-ts/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/blackbox-log/blackbox-log-ts/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/blackbox-log/blackbox-log-ts/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/blackbox-log/blackbox-log-ts/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/blackbox-log/blackbox-log-ts/releases/tag/v0.1.0
