# Contributing to AutoRSA Desktop

## Development

```bash
npm install
cd python && ./setup.ps1   # Windows
npm run dev                # Opens Electron window (not browser on :5173)
```

Optional: `ARSA_OPEN_DEVTOOLS=1 npm run dev` to open DevTools.

## Tests

```bash
npm test
npm run test:e2e   # smoke tests (no Electron required)
```

## Lint / format

```bash
npm run lint
npm run format
```

## Upstream broker sync checklist

When [NelsonDane/auto-rsa](https://github.com/NelsonDane/auto-rsa) adds or changes brokers, update **all** of:

1. `src/renderer/src/lib/brokers.ts` — `ALL_BROKER_SLUGS`, `BROKER_ENV_KEYS`
2. `src/renderer/src/lib/brokerDocs.ts` — `BROKER_DOCS`
3. `python/requirements.txt` — pin `auto_rsa_bot` version if validated
4. `src/shared/constants.ts` — `FALLBACK_LATEST_AUTORSA`
5. README troubleshooting if setup steps change

## Releases

```bash
npm run dist
```

Publish GitHub Release artifacts for auto-update (`electron-updater`).

## Screenshots

Add PNG/GIF captures to `docs/screenshots/` and link from README after UI changes.
