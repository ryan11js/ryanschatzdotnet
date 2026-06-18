import { createReadStream, existsSync, promises as fs, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const port = Number(process.env.PORT || 4173);

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".mp3", "audio/mpeg"],
  [".m4a", "audio/mp4"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".flac", "audio/flac"],
  [".aif", "audio/aiff"],
  [".aiff", "audio/aiff"]
]);
const audioExt = new Set([".mp3", ".m4a", ".wav", ".ogg", ".flac", ".webm", ".aif", ".aiff"]);

async function readJson(relative, fallback = {}) {
  try {
    return JSON.parse(await fs.readFile(path.join(root, relative), "utf8"));
  } catch {
    return fallback;
  }
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function safeSlug(value) {
  return String(value || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function encodeRelative(relative) {
  return relative.split("/").map(encodeURIComponent).join("/");
}

function isInsideRoot(target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeRoot(root) {
  return root.charAt(0).toUpperCase() + root.slice(1).toLowerCase();
}

function parseTrackFilename(filename) {
  const parsed = path.parse(filename);
  const baseTitle = parsed.name.replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
  const yearHashMatch = baseTitle.match(/^(.*?\b(20\d{2})\s*#\s*(\d+))\b(.*)$/i);
  const genericHashMatch = yearHashMatch ? null : baseTitle.match(/^(.*?#\s*(\d+))\b(.*)$/i);
  const trackMatch = yearHashMatch || genericHashMatch ? null : baseTitle.match(/^(track\s*#?\s*(\d+))\b(.*)$/i);

  let title = baseTitle;
  let year = null;
  let number = null;
  let tail = "";

  if (yearHashMatch) {
    title = yearHashMatch[1];
    year = Number(yearHashMatch[2]);
    number = Number(yearHashMatch[3]);
    tail = yearHashMatch[4] || "";
  } else if (genericHashMatch) {
    title = genericHashMatch[1];
    number = Number(genericHashMatch[2]);
    tail = genericHashMatch[3] || "";
    const titleYear = title.match(/\b(20\d{2})\b/);
    year = titleYear ? Number(titleYear[1]) : null;
  } else if (trackMatch) {
    title = trackMatch[1];
    number = Number(trackMatch[2]);
    tail = trackMatch[3] || "";
  }

  title = title.replace(/\s+/g, " ").trim();
  tail = tail.replace(/\s+/g, " ").trim();

  const bpmMatches = Array.from(tail.matchAll(/\b([5-9]\d|1\d{2}|2[0-2]\d)\s*bpm\b/gi));
  const keyMatch = tail.match(/(?:^|[^A-Za-z0-9])([A-G](?:#|b)?)(?:\s*(maj|major|min|minor|m))?(?=$|[^A-Za-z0-9])/i);

  let key = "--";
  if (keyMatch) {
    const root = normalizeRoot(keyMatch[1]);
    const mode = String(keyMatch[2] || "").toLowerCase();
    if (["m", "min", "minor"].includes(mode)) key = `${root} min`;
    else if (["maj", "major"].includes(mode)) key = `${root} maj`;
    else key = root;
  }

  return {
    title,
    year,
    number,
    key,
    bpm: bpmMatches.length ? Number(bpmMatches.at(-1)[1]) : 0
  };
}

function compareTracks(a, b) {
  const year = Number(b.year || 0) - Number(a.year || 0);
  if (year !== 0) return year;

  const aNumber = a.number === null || a.number === undefined ? Number.MAX_SAFE_INTEGER : Number(a.number);
  const bNumber = b.number === null || b.number === undefined ? Number.MAX_SAFE_INTEGER : Number(b.number);
  const number = aNumber - bNumber;
  if (number !== 0) return number;

  return String(a.src || a.id || a.title).localeCompare(String(b.src || b.id || b.title), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function normalizeTrack(track, index) {
  const parsed = parseTrackFilename(track.title || `Beat ${String(index + 1).padStart(3, "0")}`);
  const hasYear = track.year !== null && track.year !== undefined && track.year !== "";
  const hasNumber = track.number !== null && track.number !== undefined && track.number !== "";
  const year = hasYear && Number.isFinite(Number(track.year)) ? Number(track.year) : parsed.year;
  const number = hasNumber && Number.isFinite(Number(track.number)) ? Number(track.number) : parsed.number;
  const tags = Array.isArray(track.tags) ? [...track.tags] : Array.isArray(track.mood) ? [...track.mood] : [];
  if (year && !tags.includes(String(year))) tags.push(String(year));
  if (track.featured && !tags.includes("featured")) tags.push("featured");

  return {
    id: track.id || safeSlug(`${year || ""}-${number || ""}-${track.title || parsed.title}-${index}`),
    title: track.title || parsed.title,
    year,
    number,
    key: track.key || parsed.key || "--",
    bpm: Number(track.bpm || parsed.bpm || 0),
    src: track.src || "",
    tags,
    featured: Boolean(track.featured),
    peaks: Array.isArray(track.peaks) ? track.peaks : []
  };
}

async function scanAudioTracks(baseDir, baseUrl) {
  const tracks = [];

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!audioExt.has(path.extname(entry.name).toLowerCase())) continue;

      const relative = path.relative(baseDir, full).split(path.sep).join("/");
      const parsed = parseTrackFilename(path.basename(relative));
      tracks.push({
        id: safeSlug(relative),
        title: parsed.title,
        year: parsed.year,
        number: parsed.number,
        key: parsed.key,
        bpm: parsed.bpm,
        src: `${baseUrl.replace(/\/$/, "")}/${encodeRelative(relative)}`,
        tags: parsed.year ? [String(parsed.year)] : [],
        featured: false,
        peaks: []
      });
    }
  }

  await walk(baseDir);
  return tracks.sort(compareTracks);
}

function resolveStaticTarget(filePath, pathname) {
  const target = existsSync(filePath) && statSync(filePath).isDirectory()
    ? path.join(filePath, "index.html")
    : filePath;

  if (existsSync(target) || !pathname.startsWith("/media/beats/")) {
    return target;
  }

  const relativeAudio = pathname.replace(/^\/media\/beats\/+/, "");
  const fallback = path.normalize(path.join(root, relativeAudio));
  if (
    audioExt.has(path.extname(fallback).toLowerCase())
    && isInsideRoot(fallback)
    && existsSync(fallback)
    && statSync(fallback).isFile()
  ) {
    return fallback;
  }

  return target;
}

function seedKey(seed) {
  return `${Number(seed.year || 0)}-${Number(seed.number || 0)}`;
}

function trackSeedKey(track) {
  return `${Number(track.year || 0)}-${Number(track.number || 0)}`;
}

function selectFeaturedTracks(tracks, config) {
  const limit = Number(config.music?.featuredLimit || 8);
  const selected = [];
  const used = new Set();
  const seeds = Array.isArray(config.music?.featuredSeeds) ? config.music.featuredSeeds : [];

  for (const seed of seeds) {
    const match = tracks.find((track) => trackSeedKey(track) === seedKey(seed));
    if (match && !used.has(match.id)) {
      selected.push(match);
      used.add(match.id);
    }
  }

  for (const pool of [
    tracks.filter((track) => track.featured),
    tracks.filter((track) => track.year === 2026),
    tracks
  ]) {
    for (const track of pool) {
      if (selected.length >= limit) return selected.slice(0, limit);
      if (!used.has(track.id)) {
        selected.push(track);
        used.add(track.id);
      }
    }
  }

  return selected.slice(0, limit);
}

function filterTracks(tracks, url) {
  const query = (url.searchParams.get("q") || "").toLowerCase();
  const year = url.searchParams.get("year") || "all";
  const key = url.searchParams.get("key") || "all";
  const bpmMin = Math.max(0, Number(url.searchParams.get("bpm_min") || 0));
  const bpmMax = Math.min(999, Number(url.searchParams.get("bpm_max") || 999));
  const featuredRaw = url.searchParams.get("featured");
  const featured = featuredRaw === null ? null : featuredRaw === "true";

  return tracks.filter((track) => {
    if (featured !== null && track.featured !== featured) return false;
    if (year !== "all" && String(track.year || "unknown") !== year) return false;
    if (key !== "all" && String(track.key || "--").toLowerCase() !== key.toLowerCase()) return false;
    if ((bpmMin > 0 || bpmMax < 999) && (!track.bpm || track.bpm < bpmMin || track.bpm > bpmMax)) return false;
    if (!query) return true;
    return [
      track.title,
      track.year,
      track.number ? `# ${track.number}` : "",
      track.key,
      track.bpm ? `${track.bpm} bpm` : "",
      ...(track.tags || [])
    ].join(" ").toLowerCase().includes(query);
  });
}

function musicFacets(tracks) {
  const years = Array.from(new Set(tracks.map((track) => track.year).filter(Boolean))).sort((a, b) => b - a);
  const keys = Array.from(new Set(tracks.map((track) => track.key).filter((key) => key && key !== "--"))).sort((a, b) => a.localeCompare(b));
  return { years, keys };
}

async function handleSite(response) {
  sendJson(response, await readJson("config/site.json"));
}

async function handleMusic(request, response) {
  const config = await readJson("config/site.json");
  const catalog = await readJson("content/music/catalog.json", { tracks: [] });
  const music = config.music || {};
  let tracks = Array.isArray(catalog.tracks) ? catalog.tracks.map(normalizeTrack) : [];

  if (music.autoScanAudio) {
    const audioBasePath = music.audioBasePath || "/media/beats/";
    const scanned = await scanAudioTracks(path.join(root, audioBasePath.replace(/^\/+|\/+$/g, "")), audioBasePath);
    const known = new Set(tracks.flatMap((track) => [track.id, track.src].filter(Boolean)));
    tracks = tracks.concat(scanned.map(normalizeTrack).filter((track) => !known.has(track.id) && !known.has(track.src)));
  }

  tracks.sort(compareTracks);

  const url = new URL(request.url, `http://${request.headers.host}`);
  const filtered = filterTracks(tracks, url);
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const limit = Math.max(0, Number(url.searchParams.get("limit") || 0));

  sendJson(response, {
    tracks: limit ? filtered.slice(offset, offset + Math.min(limit, 100)) : filtered,
    featured: selectFeaturedTracks(tracks, config),
    total: filtered.length,
    available: tracks.length,
    facets: musicFacets(tracks)
  });
}

function enrichRepo(repo, config) {
  const pin = (config.githubPreview?.pinned || []).find((item) => item.name === repo.name) || {};
  const websiteRepo = config.githubPreview?.websiteRepo;
  return {
    name: repo.name,
    title: pin.title || repo.title || repo.name,
    category: pin.category || repo.category || (repo.name === websiteRepo ? "Website" : "Repo"),
    description: pin.description || repo.description || "Public repository preview.",
    html_url: repo.html_url || repo.url || "https://github.com/ryan11js",
    project_url: pin.projectUrl || repo.project_url || repo.html_url || repo.url || "https://github.com/ryan11js",
    clone_url: repo.clone_url || `${repo.html_url || repo.url}.git`,
    language: repo.language || "Code",
    stargazers_count: repo.stargazers_count || 0,
    forks_count: repo.forks_count || 0,
    updated_at: repo.pushed_at || repo.updated_at || new Date().toISOString(),
    topics: repo.topics || [],
    isPinned: Boolean(pin.name),
    isWebsiteRepo: repo.name === websiteRepo
  };
}

function fallbackRepos(config) {
  return [
    enrichRepo({
      name: "sts2crng",
      description: "A tool to provide insight into Correlated Randomness in Slay the Spire 2",
      html_url: "https://github.com/ryan11js/sts2crng",
      clone_url: "https://github.com/ryan11js/sts2crng.git",
      language: "JavaScript"
    }, config),
    enrichRepo({
      name: "beamng-playerguns",
      description: "A mod to add Player Guns into BeamNG Drive working with Beam MP multiplayer.",
      html_url: "https://github.com/ryan11js/beamng-playerguns",
      clone_url: "https://github.com/ryan11js/beamng-playerguns.git",
      language: "Lua"
    }, config),
    enrichRepo(config.githubPreview?.fallbackRepo || {
      name: "ryanschatzdotnet",
      description: "Repo for landing page of my website RyanSchatz.net",
      html_url: "https://github.com/ryan11js/ryanschatzdotnet",
      clone_url: "https://github.com/ryan11js/ryanschatzdotnet.git",
      language: "JavaScript"
    }, config)
  ];
}

function selectFeaturedRepos(repos, config) {
  return (config.githubPreview?.pinned || [])
    .map((pin) => repos.find((repo) => repo.name === pin.name))
    .filter(Boolean);
}

function selectLatestRepo(repos, config) {
  return repos.find((repo) => repo.name !== config.githubPreview?.websiteRepo) || repos[0] || null;
}

async function handleGithub(response) {
  const config = await readJson("config/site.json");
  const username = config.social?.github?.username;
  if (!username) {
    const repos = fallbackRepos(config);
    sendJson(response, { repos, featured: selectFeaturedRepos(repos, config), latest: selectLatestRepo(repos, config), source: "fallback" });
    return;
  }

  try {
    const githubResponse = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=100`, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "ryanschatz-net"
      }
    });
    if (!githubResponse.ok) throw new Error(`GitHub ${githubResponse.status}`);
    const excluded = new Set(config.githubPreview?.excludeNames || []);
    const repos = (await githubResponse.json())
      .filter((repo) => repo && repo.name && !repo.fork && !repo.archived && !excluded.has(repo.name))
      .map((repo) => enrichRepo(repo, config));
    sendJson(response, { repos, featured: selectFeaturedRepos(repos, config), latest: selectLatestRepo(repos, config), source: "github" });
  } catch {
    const repos = fallbackRepos(config);
    sendJson(response, { repos, featured: selectFeaturedRepos(repos, config), latest: selectLatestRepo(repos, config), source: "fallback" });
  }
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.normalize(path.join(root, pathname));
  if (!isInsideRoot(filePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const target = resolveStaticTarget(filePath, pathname);

  if (!existsSync(target)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const type = types.get(path.extname(target).toLowerCase()) || "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": target.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-store"
  });
  createReadStream(target).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/api/site.php") return handleSite(response);
    if (url.pathname === "/api/music.php") return handleMusic(request, response);
    if (url.pathname === "/api/github.php") return handleGithub(response);
    return serveStatic(request, response);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Server error");
  }
});

server.listen(port, () => {
  console.log(`ryanschatz.net preview: http://localhost:${port}`);
});
