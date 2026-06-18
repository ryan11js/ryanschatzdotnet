# ryanschatz.net

Portfolio landing page for `ryanschatz.net`: music archive, `/sts2` link, project hub, GitHub repo feed, and configurable content.

## Local Preview

```bash
npm start
```

Open `http://localhost:4173`.

No install step is required. The Node server only exists because this Windows machine does not have PHP installed. On cPanel, the PHP endpoints in `/api` handle the same config, music, and GitHub JSON.

## Configure

Edit [config/site.json](config/site.json):

- `social.github.username`: GitHub username used for the live latest-repo preview.
- `social.github.url`: GitHub profile URL.
- `githubPreview.excludeNames`: repos to hide from the public project feed.
- `githubPreview.pinned`: featured project cards.
- `music.audioBasePath`: URL path for hosted beat files, currently `/media/beats/`.
- `music.autoScanAudio`: when `true`, `/api/music.php` scans the hosted beat folder.
- `signalGraph`: the lower visual graph values.

## Music

Beat audio should live on the server, outside Git:

```text
public_html/media/beats/
```

The repo tracks only [media/beats/.gitkeep](media/beats/.gitkeep). Audio extensions are ignored so large beat files do not get committed.

To generate the catalog from a local Google Drive export:

```bash
npm run import:beats -- "D:\Google Drive\Audio"
```

For a year folder like the local `2026/` export, include the public subfolder in the generated URLs:

```bash
npm run import:beats -- "2026" --media-base=/media/beats/2026/
```

The import script parses names like `2026 # 9 KEY BPM` and `track NUM KEY BPM`, keeps the display title at `# NUM`, and stores key/BPM metadata separately. It does not copy audio. Upload the same folder structure to `/public_html/media/beats/` so the generated `src` URLs resolve. The browser loads music metadata lazily when the music section is near view or when a music control is used; audio files load only after pressing play.

For local preview, `server.mjs` can serve `/media/beats/2026/...` URLs from the top-level `2026/` export folder if `media/beats/2026/` has not been populated yet.

Featured homepage seeds are configured in [config/site.json](config/site.json): `2026 # 9`, `2026 # 11`, `2026 # 20`, and `2026 # 22`. The UI auto-fills the remaining featured slots from the catalog.

## cPanel Git

This repo is static/PHP friendly:

- Document root can point at this repository folder.
- `/api/*.php` should run on standard cPanel PHP.
- `/sts2` is left alone by `.htaccess`, so your existing tool can live there.
- `cache/github-*.json` is ignored by Git and used only for GitHub API caching.
- `.cpanel.yml` creates `/public_html/media/beats/` and does not overwrite uploaded audio.

Suggested first remote:

```bash
git remote add origin <your-repo-url>
git push -u origin main
```
