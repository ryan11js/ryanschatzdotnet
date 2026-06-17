# ryanschatz.net

Portfolio landing page for `ryanschatz.net`: music archive, `/sts2` link, GitHub repo preview, and configurable content.

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
- `music.audioBasePath`: URL path for beat files.
- `music.autoScanAudio`: when `true`, `/api/music.php` scans `content/music/audio`.
- `signalGraph`: the lower visual graph values.

## Music

Put audio files here:

```text
content/music/audio/
```

You can organize them by genre:

```text
content/music/audio/trap/beat-name.mp3
content/music/audio/r&b/beat-name.m4a
```

For richer metadata, add entries to [content/music/catalog.json](content/music/catalog.json). Catalog entries can include `title`, `genre`, `bpm`, `key`, `duration`, `mood`, `src`, and optional `peaks`.

## cPanel Git

This repo is static/PHP friendly:

- Document root can point at this repository folder.
- `/api/*.php` should run on standard cPanel PHP.
- `/sts2` is left alone by `.htaccess`, so your existing tool can live there.
- `cache/github-*.json` is ignored by Git and used only for GitHub API caching.

Suggested first remote:

```bash
git remote add origin <your-repo-url>
git push -u origin main
```
