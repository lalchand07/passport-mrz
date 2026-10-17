# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the packages use
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-17

### Added

- `passport-mrz`: parser for TD1, TD2, TD3, MRV-A and MRV-B with automatic format detection,
  per-field and composite check digits, century inference, name splitting and truncation
  detection, TD1/TD2 long document numbers, country names including ICAO special codes.
  All formats are **beta**: written from general knowledge of ICAO Doc 9303 and not yet
  verified against the official text.
- Checksum-guided OCR correction (character-class repairs, minimal substitution search,
  composite tie-break, filler repair, insertion/deletion repair) with every change reported.
- `passport-mrz/travel`: `validForTravel`, `passengerType`, `airlineName`, `toPassenger`.
- `passport-mrz/generate`: synthetic MRZ generator and OCR-style mutator.
- `passport-mrz` CLI with JSON output and optional `--image` OCR.
- `passport-mrz-ocr`: offline OCR with tesseract.js (local model and wasm), MRZ detection,
  deskew, thresholding, legacy + LSTM passes, confirmation read and review flags.
- Playground (Vite) with a network-blocking Content-Security-Policy, deployed to GitHub Pages.
