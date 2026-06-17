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
  [".flac", "audio/flac"]
]);

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

async function scanAudioTracks(baseDir, baseUrl) {
  const tracks = [];
  const audioExt = new Set([".mp3", ".m4a", ".wav", ".ogg", ".flac", ".webm"]);

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
      const parsed = path.parse(relative);
      const genre = parsed.dir ? path.basename(parsed.dir) : "uncategorized";
      tracks.push({
        id: safeSlug(relative),
        title: parsed.name.replace(/[_-]/g, " "),
        genre,
        bpm: 0,
        key: "--",
        duration: "--",
        mood: [],
        src: `${baseUrl.replace(/\/$/, "")}/${relative.split("/").map(encodeURIComponent).join("/")}`,
        peaks: []
      });
    }
  }

  await walk(baseDir);
  return tracks.sort((a, b) => a.title.localeCompare(b.title));
}

async function handleSite(response) {
  sendJson(response, await readJson("config/site.json"));
}

async function handleMusic(request, response) {
  const config = await readJson("config/site.json");
  const catalog = await readJson("content/music/catalog.json", { tracks: [] });
  const music = config.music || {};
  let tracks = Array.isArray(catalog.tracks) ? catalog.tracks : [];

  if (music.autoScanAudio) {
    const scanned = await scanAudioTracks(path.join(root, "content/music/audio"), music.audioBasePath || "/content/music/audio/");
    const known = new Set(tracks.map((track) => track.src).filter(Boolean));
    tracks = tracks.concat(scanned.filter((track) => !known.has(track.src)));
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  const query = (url.searchParams.get("q") || "").toLowerCase();
  const genre = (url.searchParams.get("genre") || "all").toLowerCase();
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const limit = Math.max(0, Number(url.searchParams.get("limit") || 0));

  const filtered = tracks.filter((track) => {
    if (genre !== "all" && String(track.genre || "").toLowerCase() !== genre) return false;
    if (!query) return true;
    return [track.title, track.genre, track.key, ...(track.mood || [])].join(" ").toLowerCase().includes(query);
  });

  sendJson(response, {
    tracks: limit ? filtered.slice(offset, offset + Math.min(limit, 100)) : filtered,
    total: filtered.length,
    available: tracks.length
  });
}

function fallbackRepo(config) {
  const github = config.social?.github || {};
  return {
    ...(config.githubPreview?.fallbackRepo || {}),
    name: config.githubPreview?.fallbackRepo?.name || "latest-project",
    description: config.githubPreview?.fallbackRepo?.description || "Newest public repository preview.",
    html_url: config.githubPreview?.fallbackRepo?.html_url || github.url || "https://github.com/",
    clone_url: config.githubPreview?.fallbackRepo?.clone_url || `${github.url || "https://github.com/user"}/latest-project.git`,
    language: config.githubPreview?.fallbackRepo?.language || "Code",
    stargazers_count: 0,
    forks_count: 0,
    updated_at: new Date().toISOString()
  };
}

async function handleGithub(response) {
  const config = await readJson("config/site.json");
  const username = config.social?.github?.username;
  if (!username) {
    sendJson(response, { repo: fallbackRepo(config), source: "fallback" });
    return;
  }

  try {
    const githubResponse = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=30`, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "ryanschatz-net"
      }
    });
    if (!githubResponse.ok) throw new Error(`GitHub ${githubResponse.status}`);
    const repos = await githubResponse.json();
    const repo = repos.find((item) => !item.fork && !item.archived) || repos[0] || fallbackRepo(config);
    sendJson(response, {
      repo: {
        name: repo.name,
        description: repo.description || "Public repository preview.",
        html_url: repo.html_url,
        clone_url: repo.clone_url || `${repo.html_url}.git`,
        language: repo.language || "Code",
        stargazers_count: repo.stargazers_count || 0,
        forks_count: repo.forks_count || 0,
        updated_at: repo.pushed_at || repo.updated_at || new Date().toISOString(),
        topics: repo.topics || []
      },
      source: "github"
    });
  } catch {
    sendJson(response, { repo: fallbackRepo(config), source: "fallback" });
  }
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.normalize(path.join(root, pathname));
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const target = existsSync(filePath) && statSync(filePath).isDirectory()
    ? path.join(filePath, "index.html")
    : filePath;

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
