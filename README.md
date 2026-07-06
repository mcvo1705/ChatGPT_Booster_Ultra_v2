# AI Chat Speed Booster

**Website:** [projects.thiering.org/ai-chat-speed-booster](https://projects.thiering.org/ai-chat-speed-booster/)

Keeps long AI chat conversations responsive by showing only recent messages first, then letting you load older ones when you need them.

Works on **ChatGPT**, **Claude**, **Gemini**, and any AI chat app you add to the config.

## Install via official browser extension store

| Browser | Version | Link |
| --- | --- | --- |
| Chrome | v1.4.5 | [chromewebstore](https://chromewebstore.google.com/detail/ai-chat-speed-booster/fgefgkfmapdjjjdekejanelknedclfik) | 
| Firefox | v1.4.5 | [addons.mozilla.org](https://addons.mozilla.org/en-US/firefox/addon/ai-chat-speed-booster/?utm_source=addons.mozilla.org&utm_medium=referral&utm_content=search)

## Install

We suggest using your browser's official extension store because it updates automatically. If the extension is not available in your browser's store, either open an issue to let us know or download the extension and import it manually. Keep in mind that manually installed versions do not update automatically when a new release is published.  

1. Go to [Releases](https://github.com/Noah4ever/ai-chat-speed-booster/releases)
2. Download the zip for your browser
3. Follow your browser guide:
    - [Chrome install guide](docs/install/chrome.md)
    - [Firefox install guide](docs/install/firefox.md)
    - [Edge install guide](docs/install/edge.md)
    - [Safari install guide](docs/install/safari.md)

Store listings (Chrome/Firefox) may lag because review can take time.

## Build it yourself

### 1) Requirements

- Node.js 18+
- npm

### 2) Install

```bash
git clone https://github.com/Noah4ever/ai-chat-speed-booster.git
cd ai-chat-speed-booster
npm install
```

### 3) Build

Build all targets:

```bash
npm run build:all
```

You can also just build one target (`chrome`, `firefox`, `safari`, `edge`):

```bash
npm run build:chrome
```
Build output goes to `dist/chrome/`.

## Releasing a new version

The two scripts under `scripts/` handle everything between editing code and uploading zips to the stores.

### 1. Bump the version

```bash
npm run bump 1.4.5
```

Updates the version in `package.json` and all four browser manifests (`browsers/{chrome,edge,firefox,safari}/manifest.json`), stages only those five files, commits with `fix: update version to 1.4.5`, and creates the tag `v1.4.5`.

Flags:

- `npm run bump 1.4.5 -- --dry` — preview the changes, write nothing
- `npm run bump 1.4.5 -- --no-tag` — commit but skip the tag

The script refuses to run if the tag already exists, if you're already on that version, or if the version isn't semver-shaped (`X.Y.Z` or `X.Y.Z-beta.1`).

### 2. Package the release zips

```bash
npm run package
```

Builds Chrome + Firefox, then writes three zips into `deploys/` (gitignored):

| File | What it's for |
| --- | --- |
| `chrome-v<version>.zip` | Upload to the Chrome Web Store |
| `firefox-v<version>.zip` | Upload to Firefox AMO |
| `firefox-source-v<version>.zip` | Source archive AMO requires for review |

The source zip is produced by `git archive HEAD`, so it always matches the last commit — **bump and commit before packaging**, otherwise the source archive will show the previous version's tree.

Flag: `npm run package -- --skip-build` re-zips whatever's already in `dist/` without rebuilding.

### 3. Push and upload

```bash
git push && git push --tags
```

Then upload from `deploys/`:

- **Chrome Web Store** — upload `chrome-v<version>.zip`
- **Firefox AMO** — upload `firefox-v<version>.zip`, then attach `firefox-source-v<version>.zip` when prompted for source code. AMO also asks for release notes — paste a short summary of what changed.

### 4. After the stores publish

Update the version numbers in the [Install via official browser extension store](#install-via-official-browser-extension-store) table at the top of this README. Store review can take days, so the listed version is allowed to lag behind the tag.

## Adding a new AI chat site

All site definitions live in one file: [`sites.config.json`](sites.config.json).

To add a new site, add an entry to the array:

```json
{
    "id": "mysite",
    "name": "My AI Chat",
    "hostnames": ["mysite.com"],
    "urlPatterns": ["*://mysite.com/*"],
    "selectors": {
        "messageTurn": ".message-selector",
        "scrollContainer": ".scroll-container"
    },
    "messageIdAttribute": "data-message-id"
}
```

Then rebuild. The build script auto-injects the URL patterns into all browser manifests. No other files need to change.

### Finding the right selectors

1. Open the AI chat in your browser
2. Right-click on a message → Inspect
3. Find the repeating element wrapping each message turn → that's `messageTurn`
4. Find the scrollable container → that's `scrollContainer`
5. If there's a fallback scroll container, add `scrollContainerAlt`
6. If messages have a unique ID attribute, set `messageIdAttribute` (defaults to `data-testid`)

### Currently supported sites

| Site | Status |
| ---- | ------ |
| [ChatGPT](https://chatgpt.com) | ✅ Tested |
| [Claude](https://claude.ai) | ✅ Tested |
| [Gemini](https://gemini.google.com) | ✅ Tested |

PRs to add or fix site configs are welcome.

## How it works

- Shows the latest messages first (default: 3)
- Hides older messages
- Adds a "Load more" button at the top to reveal older messages in batches
- Keeps the visible window capped as new messages arrive
- Caches up to 5 recent chats (LRU) for faster switching
- Trims chat/API data before rendering to reduce load time and improve responsiveness

## Settings

Set these from the popup:

| Setting            | Default   | Range   |
| ------------------ | --------- | ------- |
| Visible messages   | 3         | 1-200   |
| Load more batch    | 3         | 1-50    |
| Status indicator   | On        | On/Off  |
| Badge position     | Top right | 4 corners |

## Testing

Automated tests use [Playwright](https://playwright.dev/) to validate build outputs and run the real extension in headless Chromium against mock pages.

### Run all tests

```bash
npm test
```

This builds all browser targets, validates every `dist/` output, then loads the extension in Chromium and verifies it works for each configured site (60 tests, ~7s).

### Individual test suites

```bash
npm run test:build       # validate dist/ outputs only
npm run test:extension   # extension tests on mock pages
npm run test:integration # live site tests (requires auth, see below)
```

### Integration tests (live sites)

To test against real sites with your account:

1. Copy `.env.example` to `.env` and fill in your credentials  
   (for ChatGPT via Google login, use your Google email/password)
2. Run `npm run test:auth` — a browser opens, log in to each site, press Enter
3. Run `npm run test:integration`

The auth profile is saved to `tests/.auth-profile/` (git-ignored) and reused across runs.

### Headless mode

Set `HEADLESS=1` to run without a visible browser window:

```bash
HEADLESS=1 npm test
```

## Browser support

- Chrome
- Firefox
- Edge
- Safari

## Privacy

- No message content is read or sent anywhere
- No analytics or tracking
- Settings are stored locally in browser storage

## Source code submission (Firefox)

This project is built from TypeScript source files and bundled with esbuild.

### Build environment

- Operating systems: Linux, macOS, or Windows
- Node.js: 18 or newer
- npm: included with Node.js

### Reproducible build steps (Firefox)

```bash
git clone https://github.com/Noah4ever/ai-chat-speed-booster.git
cd ai-chat-speed-booster
npm ci
npm run build:firefox
```

The Firefox extension output is generated in `dist/firefox/`.
The file to load or package is `dist/firefox/manifest.json`.

Build script used by this project: `scripts/build.mjs`

## Credits

Fast Mode in this project uses a fetch-interception approach that trims API responses before the app renders them. Earlier work in this area includes [Speed Booster for ChatGPT](https://chromewebstore.google.com/detail/speed-booster-for-chatgpt/finipiejpmpccemiedioehhpgcafnndo) by BGSN.

## License

MIT
