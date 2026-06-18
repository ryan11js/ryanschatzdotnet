import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const audioExt = new Set([".mp3", ".m4a", ".wav", ".ogg", ".flac", ".webm", ".aif", ".aiff"]);
const featuredSeeds = new Set(["2026-9", "2026-11", "2026-20", "2026-22"]);

function usage() {
  console.log([
    "Usage:",
    "  npm run import:beats -- <folder>",
    "",
    "Options:",
    "  --out=<path>          Default: content/music/catalog.json",
    "  --media-base=<url>    Default: /media/beats/",
    "",
    "Example:",
    "  npm run import:beats -- \"D:\\Google Drive\\Audio\"",
    "",
    "The script writes catalog metadata only. It does not copy or delete audio files."
  ].join("\n"));
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function sourceArg() {
  return process.argv.slice(2).find((arg) => !arg.startsWith("--"));
}

function safeSlug(value) {
  return String(value || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function encodeRelative(relative) {
  return relative.split("/").map(encodeURIComponent).join("/");
}

function parseTrackFilename(filename) {
  const parsed = path.parse(filename);
  const title = parsed.name.replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
  const yearMatch = title.match(/\b(20\d{2})\s*#\s*(\d+)\b/i);
  const trackMatch = title.match(/\btrack\s*#?\s*(\d+)\b/i);
  const bpmMatches = Array.from(title.matchAll(/\b([5-9]\d|1\d{2}|2[0-2]\d)\s*(?:bpm)?\b/gi));
  const keyMatch = title.match(/(?:^|[^A-Za-z0-9])([A-G](?:#|b)?)(?:\s*(maj|major|min|minor|m))?(?=$|[^A-Za-z0-9])/i);

  let key = "--";
  if (keyMatch) {
    const root = keyMatch[1].charAt(0).toUpperCase() + keyMatch[1].slice(1);
    const mode = String(keyMatch[2] || "").toLowerCase();
    if (["m", "min", "minor"].includes(mode)) key = `${root} min`;
    else if (["maj", "major"].includes(mode)) key = `${root} maj`;
    else key = root;
  }

  return {
    title,
    year: yearMatch ? Number(yearMatch[1]) : null,
    number: yearMatch ? Number(yearMatch[2]) : trackMatch ? Number(trackMatch[1]) : null,
    key,
    bpm: bpmMatches.length ? Number(bpmMatches.at(-1)[1]) : 0
  };
}

async function walk(dir, baseDir) {
  const tracks = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      tracks.push(...await walk(full, baseDir));
      continue;
    }
    if (!audioExt.has(path.extname(entry.name).toLowerCase())) continue;

    const relative = path.relative(baseDir, full).split(path.sep).join("/");
    const parsed = parseTrackFilename(entry.name);
    const seed = `${Number(parsed.year || 0)}-${Number(parsed.number || 0)}`;
    const tags = [];
    if (parsed.year) tags.push(String(parsed.year));
    if (featuredSeeds.has(seed)) tags.push("featured");

    tracks.push({
      id: safeSlug(relative),
      title: parsed.title,
      year: parsed.year,
      number: parsed.number,
      key: parsed.key,
      bpm: parsed.bpm,
      src: `${mediaBase.replace(/\/$/, "")}/${encodeRelative(relative)}`,
      tags,
      featured: featuredSeeds.has(seed)
    });
  }

  return tracks;
}

const source = sourceArg();
const outPath = path.resolve(root, argValue("out", "content/music/catalog.json"));
const mediaBase = argValue("media-base", "/media/beats/");

if (!source || process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(source ? 0 : 1);
}

const sourcePath = path.resolve(source);
const stat = await fs.stat(sourcePath).catch(() => null);
if (!stat?.isDirectory()) {
  console.error(`Not a directory: ${sourcePath}`);
  process.exit(1);
}

const tracks = (await walk(sourcePath, sourcePath))
  .sort((a, b) => {
    const year = Number(b.year || 0) - Number(a.year || 0);
    if (year !== 0) return year;
    const number = Number(a.number || 0) - Number(b.number || 0);
    if (number !== 0) return number;
    return a.title.localeCompare(b.title);
  });

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify({ tracks }, null, 2)}\n`, "utf8");

console.log(`Wrote ${tracks.length} tracks to ${path.relative(root, outPath)}`);
