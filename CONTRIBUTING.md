# Contributing

Thanks for helping! Please read this first.

## Never submit real passport data

**Do not put real MRZs, passport photos, ID card scans or visa images in issues, pull
requests, tests, screenshots or logs.** This includes "just my own passport" and redacted
photos, because redaction often fails and an MRZ is itself personal data.

- Use the generator: `generateMrz({ format: 'TD3', seed: 1 })` from `passport-mrz/generate`.
- Use the ICAO specimen MRZs in `packages/core/test/fixtures.ts`.
- To report a problem with a real document, describe it ("TD1 card from country X, the
  optional data field holds …") or build a synthetic MRZ that reproduces it with
  `buildMrz(format, document)`.

Pull requests containing real personal data will be closed and the data purged from history.

## ICAO documents

Do not commit ICAO documents or excerpts. If you can verify an item in
[docs/FORMAT_NOTES.md](docs/FORMAT_NOTES.md#details-to-verify-against-the-official-text),
open an issue or PR that cites the Doc 9303 part, section and edition.

## Development

```sh
npm ci
npm run build       # core + OCR packages
npm test            # vitest (all packages)
npm run lint
npm run format      # prettier
npm run typecheck
npm run playground:dev
```

- Node 20+.
- The core package must keep **zero runtime dependencies** and must never make network calls.
- Every bug fix needs a test. Parser changes need a test in `packages/core/test`.
- Keep commits small and focused; describe _why_ in the message.
- Corrections must stay conservative: never accept a change that is not proven by a check
  digit or forced by the character class, and always report it.

## Releasing

1. Update `CHANGELOG.md` and the versions in `packages/*/package.json`.
2. `npm publish -w passport-mrz && npm publish -w passport-mrz-ocr` (the `prepack` scripts
   build and copy README / LICENSE / DATA_LICENSES).
