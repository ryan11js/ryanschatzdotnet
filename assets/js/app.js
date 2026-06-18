(function () {
  "use strict";

  const state = {
    config: null,
    tracks: [],
    repos: [],
    visibleTracks: 8,
    query: "",
    year: "all",
    key: "all",
    bpm: "all",
    musicMode: "featured",
    activeTrackId: null,
    pageSize: 8
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const fallbackConfig = {
    site: {
      name: "Ryan Schatz",
      domain: "ryanschatz.net",
      intro: "Code, beats, and small tools built to ship.",
      footerLine: "ryanschatz.net"
    },
    social: {
      github: {
        username: "ryan11js",
        url: "https://github.com/ryan11js"
      }
    },
    githubPreview: {
      excludeNames: ["ryan11js"],
      websiteRepo: "ryanschatzdotnet",
      pinned: [
        {
          name: "sts2crng",
          title: "Slay the Spire 2 Tool",
          category: "Tool",
          projectUrl: "/sts2",
          description: "Correlated randomness insight for Slay the Spire 2."
        },
        {
          name: "beamng-playerguns",
          title: "BeamNG Playerguns",
          category: "Game Mod",
          description: "Player guns for BeamNG Drive and BeamMP."
        }
      ]
    },
    music: {
      pageSize: 8,
      featuredLimit: 8,
      displayCount: "1000+",
      featuredSeeds: [
        { year: 2026, number: 9 },
        { year: 2026, number: 11 },
        { year: 2026, number: 20 },
        { year: 2026, number: 22 }
      ],
      bpmRanges: [
        { label: "all", min: 0, max: 999 },
        { label: "70-99", min: 70, max: 99 },
        { label: "100-129", min: 100, max: 129 },
        { label: "130-159", min: 130, max: 159 },
        { label: "160+", min: 160, max: 999 }
      ]
    },
    signalGraph: [
      { label: "Frontend", value: 94 },
      { label: "Audio", value: 88 },
      { label: "Tools", value: 91 },
      { label: "Systems", value: 84 }
    ]
  };

  const demoTracks = [
    { id: "2026-9", title: "2026 # 9", year: 2026, number: 9, key: "--", bpm: 0, src: "/media/beats/2026%20%23%209.mp3", tags: ["featured", "2026"], featured: true },
    { id: "2026-11", title: "2026 # 11", year: 2026, number: 11, key: "--", bpm: 0, src: "/media/beats/2026%20%23%2011.mp3", tags: ["featured", "2026"], featured: true },
    { id: "2026-20", title: "2026 # 20", year: 2026, number: 20, key: "--", bpm: 0, src: "/media/beats/2026%20%23%2020.mp3", tags: ["featured", "2026"], featured: true },
    { id: "2026-22", title: "2026 # 22", year: 2026, number: 22, key: "--", bpm: 0, src: "/media/beats/2026%20%23%2022.mp3", tags: ["featured", "2026"], featured: true },
    { id: "track-9", title: "Track 9", year: null, number: 9, key: "--", bpm: 0, src: "/media/beats/track%209.mp3", tags: ["archive"], featured: false },
    { id: "track-11", title: "Track 11", year: null, number: 11, key: "--", bpm: 0, src: "/media/beats/track%2011.mp3", tags: ["archive"], featured: false },
    { id: "track-20", title: "Track 20", year: null, number: 20, key: "--", bpm: 0, src: "/media/beats/track%2020.mp3", tags: ["archive"], featured: false },
    { id: "track-22", title: "Track 22", year: null, number: 22, key: "--", bpm: 0, src: "/media/beats/track%2022.mp3", tags: ["archive"], featured: false }
  ];

  const formatDate = (value) => {
    if (!value) return "syncing";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "syncing";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
  };

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const slug = (value) => String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const hash = (input) => {
    let h = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const seededPeaks = (id, length = 18) => {
    let seed = hash(id || "track");
    return Array.from({ length }, () => {
      seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
      seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
      return 0.18 + ((seed >>> 0) % 72) / 100;
    });
  };

  const loadJson = async (url) => {
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return response.json();
  };

  function mergeConfig(config) {
    return {
      ...fallbackConfig,
      ...config,
      site: { ...fallbackConfig.site, ...(config.site || {}) },
      social: { ...fallbackConfig.social, ...(config.social || {}) },
      githubPreview: { ...fallbackConfig.githubPreview, ...(config.githubPreview || {}) },
      music: { ...fallbackConfig.music, ...(config.music || {}) },
      signalGraph: config.signalGraph || fallbackConfig.signalGraph
    };
  }

  function applyConfig(config) {
    state.config = config;
    state.pageSize = Number(config.music?.pageSize || state.pageSize);
    state.visibleTracks = state.pageSize;

    document.title = `${config.site?.name || "Ryan Schatz"} | Code, Beats, Tools`;
    $("[data-site-name]").textContent = config.site?.name || "Ryan Schatz";
    $("[data-site-intro]").textContent = config.site?.intro || fallbackConfig.site.intro;
    $("[data-footer-name]").textContent = config.site?.name || "Ryan Schatz";
    $("[data-footer-line]").textContent = config.site?.footerLine || config.site?.domain || fallbackConfig.site.footerLine;

    const github = config.social?.github || fallbackConfig.social.github;
    $$("[data-github-link]").forEach((link) => {
      link.href = github.url || `https://github.com/${github.username || ""}`;
    });

    renderSkillGraph(config.signalGraph || fallbackConfig.signalGraph);
  }

  function normalizeTrack(track, index) {
    const id = track.id || slug(`${track.title || "beat"}-${index}`);
    const hasYear = track.year !== null && track.year !== undefined && track.year !== "";
    const hasNumber = track.number !== null && track.number !== undefined && track.number !== "";
    const year = hasYear && Number.isFinite(Number(track.year)) ? Number(track.year) : null;
    const number = hasNumber && Number.isFinite(Number(track.number)) ? Number(track.number) : null;
    const tags = Array.isArray(track.tags)
      ? track.tags
      : Array.isArray(track.mood)
        ? track.mood
        : [];

    return {
      id,
      title: track.title || `Beat ${String(index + 1).padStart(3, "0")}`,
      year,
      number,
      key: track.key || "--",
      bpm: Number(track.bpm || 0),
      src: track.src || "",
      tags,
      featured: Boolean(track.featured),
      peaks: Array.isArray(track.peaks) && track.peaks.length ? track.peaks : seededPeaks(id)
    };
  }

  function seedKey(seed) {
    return `${Number(seed.year || 0)}-${Number(seed.number || 0)}`;
  }

  function trackSeedKey(track) {
    return `${Number(track.year || 0)}-${Number(track.number || 0)}`;
  }

  function featuredTracks() {
    const limit = Number(state.config?.music?.featuredLimit || 8);
    const seeds = Array.isArray(state.config?.music?.featuredSeeds) ? state.config.music.featuredSeeds : [];
    const selected = [];
    const used = new Set();

    seeds.forEach((seed) => {
      const wanted = seedKey(seed);
      const match = state.tracks.find((track) => trackSeedKey(track) === wanted);
      if (match && !used.has(match.id)) {
        selected.push(match);
        used.add(match.id);
      }
    });

    const pools = [
      state.tracks.filter((track) => track.featured),
      state.tracks.filter((track) => track.year === 2026),
      state.tracks
    ];

    pools.forEach((pool) => {
      pool.forEach((track) => {
        if (selected.length >= limit) return;
        if (!used.has(track.id)) {
          selected.push(track);
          used.add(track.id);
        }
      });
    });

    return selected.slice(0, limit);
  }

  function selectedBpmRange() {
    const ranges = state.config?.music?.bpmRanges || fallbackConfig.music.bpmRanges;
    return ranges.find((range) => range.label === state.bpm) || ranges[0];
  }

  function criteriaActive() {
    return state.query.trim() || state.year !== "all" || state.key !== "all" || state.bpm !== "all" || state.musicMode === "archive";
  }

  function filteredTracks() {
    const query = state.query.trim().toLowerCase();
    const range = selectedBpmRange();
    return state.tracks.filter((track) => {
      if (state.year !== "all" && String(track.year || "unknown") !== state.year) return false;
      if (state.key !== "all" && String(track.key || "--").toLowerCase() !== state.key.toLowerCase()) return false;
      if (range && range.label !== "all") {
        if (!track.bpm || track.bpm < range.min || track.bpm > range.max) return false;
      }
      if (!query) return true;
      const haystack = [
        track.title,
        track.year,
        track.number ? `# ${track.number}` : "",
        track.key,
        track.bpm ? `${track.bpm} bpm` : "",
        ...(track.tags || [])
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }

  function currentTracks() {
    return criteriaActive() ? filteredTracks() : featuredTracks();
  }

  function renderMusicStats(tracks) {
    const count = tracks.length;
    const bpms = tracks.map((track) => track.bpm).filter(Boolean);
    const min = bpms.length ? Math.min(...bpms) : 0;
    const max = bpms.length ? Math.max(...bpms) : 0;
    const configuredTotal = state.config?.music?.displayCount;
    const totalLabel = configuredTotal || (count >= 1000 ? `${Math.floor(count / 100) / 10}k` : String(count || "1000+"));

    $("[data-music-count]").textContent = count >= 1000 ? totalLabel : (configuredTotal || String(count || "1000+"));
    $("[data-music-total]").textContent = totalLabel;
    $("[data-bpm-range]").textContent = min && max ? `${min}-${max}` : "--";

    const chart = $("[data-genre-chart]");
    if (!chart) return;
    const counts = tracks.reduce((acc, track) => {
      const label = track.year ? String(track.year) : "archive";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    const maxCount = Math.max(1, ...Object.values(counts));
    chart.innerHTML = Object.entries(counts)
      .sort((a, b) => Number(b[0]) - Number(a[0]) || b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => `
        <div class="genre-bar">
          <span>${escapeHtml(label)}</span>
          <i style="--scale:${value / maxCount}"></i>
          <b>${value}</b>
        </div>
      `).join("");
  }

  function renderFilterButtons(root, items, active, onClick) {
    if (!root) return;
    root.innerHTML = "";
    items.forEach((item) => {
      const value = String(item.value);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.className = value === active ? "is-active" : "";
      button.addEventListener("click", () => onClick(value));
      root.append(button);
    });
  }

  function renderMusicFilters() {
    const years = Array.from(new Set(state.tracks.map((track) => track.year).filter(Boolean)))
      .sort((a, b) => b - a)
      .map((year) => ({ value: year, label: String(year) }));
    const keys = Array.from(new Set(state.tracks.map((track) => track.key).filter((key) => key && key !== "--")))
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({ value: key, label: key }));
    const ranges = state.config?.music?.bpmRanges || fallbackConfig.music.bpmRanges;

    renderFilterButtons($("[data-year-filter]"), [{ value: "all", label: "all" }, ...years], state.year, (value) => {
      state.year = value;
      state.musicMode = "archive";
      state.visibleTracks = state.pageSize;
      renderTracks();
      renderMusicFilters();
    });

    renderFilterButtons($("[data-key-filter]"), [{ value: "all", label: "all" }, ...keys], state.key, (value) => {
      state.key = value;
      state.musicMode = "archive";
      state.visibleTracks = state.pageSize;
      renderTracks();
      renderMusicFilters();
    });

    renderFilterButtons($("[data-bpm-filter]"), ranges.map((range) => ({ value: range.label, label: range.label })), state.bpm, (value) => {
      state.bpm = value;
      state.musicMode = "archive";
      state.visibleTracks = state.pageSize;
      renderTracks();
      renderMusicFilters();
    });
  }

  function renderTracks() {
    const grid = $("[data-track-grid]");
    const more = $("[data-load-more]");
    if (!grid || !more) return;

    const tracks = currentTracks();
    const visible = tracks.slice(0, state.visibleTracks);
    grid.innerHTML = visible.map((track) => {
      const levels = track.peaks.slice(0, 18).map((peak) => `<i style="--level:${Math.max(0.12, Math.min(1, peak))}"></i>`).join("");
      const disabled = track.src ? "" : "disabled";
      const label = track.src ? (state.activeTrackId === track.id ? "Pause" : "Play") : "No audio file for";
      const meta = [
        track.year || "archive",
        track.number ? `#${track.number}` : "",
        track.key && track.key !== "--" ? track.key : "",
        track.bpm ? `${track.bpm} bpm` : ""
      ].filter(Boolean).join(" ");

      return `
        <article class="track-card ${state.activeTrackId === track.id ? "is-active" : ""}" data-track-id="${escapeHtml(track.id)}">
          <div class="track-info">
            <strong title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</strong>
            <div class="track-meta">
              <span>${escapeHtml(meta || "metadata pending")}</span>
            </div>
            <div class="waveform" aria-hidden="true">${levels}</div>
          </div>
          <button class="play-button" type="button" ${disabled} aria-label="${escapeHtml(label)} ${escapeHtml(track.title)}" data-play="${escapeHtml(track.id)}">${track.src ? (state.activeTrackId === track.id ? "II" : ">" ) : "+"}</button>
        </article>
      `;
    }).join("");

    more.hidden = tracks.length <= state.visibleTracks;
    more.onclick = () => {
      state.musicMode = "archive";
      state.visibleTracks += state.pageSize;
      renderTracks();
      renderMusicFilters();
    };

    $$("[data-play]").forEach((button) => {
      button.addEventListener("click", () => playTrack(button.dataset.play));
    });
  }

  function playTrack(id) {
    const track = state.tracks.find((item) => item.id === id);
    const audio = $("[data-audio]");
    const player = $("[data-player]");
    if (!track || !track.src || !audio || !player) return;

    if (state.activeTrackId === id && !audio.paused) {
      audio.pause();
      state.activeTrackId = null;
      renderTracks();
      return;
    }

    state.activeTrackId = id;
    audio.src = track.src;
    audio.play().catch(() => {});
    player.hidden = false;
    $("[data-player-title]").textContent = track.title;
    renderTracks();
  }

  function randomBeat() {
    const candidates = currentTracks().filter((track) => track.src);
    if (!candidates.length) return;
    const index = Math.floor(Math.random() * candidates.length);
    playTrack(candidates[index].id);
  }

  async function loadMusic() {
    let payload;
    try {
      payload = await loadJson("/api/music.php");
    } catch (error) {
      try {
        payload = await loadJson("/content/music/catalog.json");
      } catch (fallbackError) {
        payload = { tracks: demoTracks };
      }
    }

    const tracks = Array.isArray(payload.tracks) && payload.tracks.length ? payload.tracks : demoTracks;
    state.tracks = tracks.map(normalizeTrack);
    state.visibleTracks = state.pageSize;
    renderMusicStats(state.tracks);
    renderMusicFilters();
    renderTracks();
  }

  function compactRepo(repo, config = state.config) {
    const pinned = (config?.githubPreview?.pinned || []).find((item) => item.name === repo.name) || {};
    const websiteRepo = config?.githubPreview?.websiteRepo;
    return {
      name: repo.name,
      title: pinned.title || repo.title || repo.name || "Latest repo",
      category: pinned.category || repo.category || (repo.name === websiteRepo ? "Website" : "Repo"),
      description: pinned.description || repo.description || "Public repository preview.",
      html_url: repo.html_url || repo.url || "https://github.com/ryan11js",
      project_url: pinned.projectUrl || repo.project_url || repo.html_url || repo.url || "https://github.com/ryan11js",
      clone_url: repo.clone_url || `${repo.html_url || repo.url}.git`,
      language: repo.language || "Code",
      stargazers_count: repo.stargazers_count || 0,
      forks_count: repo.forks_count || 0,
      updated_at: repo.pushed_at || repo.updated_at,
      isWebsiteRepo: repo.name === websiteRepo || Boolean(repo.isWebsiteRepo)
    };
  }

  function fallbackRepos(config) {
    return [
      compactRepo({
        name: "sts2crng",
        description: "A tool to provide insight into Correlated Randomness in Slay the Spire 2",
        html_url: "https://github.com/ryan11js/sts2crng",
        clone_url: "https://github.com/ryan11js/sts2crng.git",
        language: "JavaScript",
        updated_at: new Date().toISOString()
      }, config),
      compactRepo({
        name: "beamng-playerguns",
        description: "A mod to add Player Guns into BeamNG Drive working with Beam MP multiplayer.",
        html_url: "https://github.com/ryan11js/beamng-playerguns",
        clone_url: "https://github.com/ryan11js/beamng-playerguns.git",
        language: "Lua",
        updated_at: new Date().toISOString()
      }, config),
      compactRepo(config.githubPreview?.fallbackRepo || {
        name: "ryanschatzdotnet",
        description: "Repo for landing page of my website RyanSchatz.net",
        html_url: "https://github.com/ryan11js/ryanschatzdotnet",
        clone_url: "https://github.com/ryan11js/ryanschatzdotnet.git",
        language: "JavaScript",
        updated_at: new Date().toISOString()
      }, config)
    ];
  }

  async function loadGithubPreview(config) {
    let payload;
    try {
      payload = await loadJson("/api/github.php");
    } catch (error) {
      try {
        const username = config.social?.github?.username;
        const repos = await loadJson(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=100`);
        payload = { repos };
      } catch (githubError) {
        payload = { repos: fallbackRepos(config), source: "fallback" };
      }
    }

    const rawRepos = Array.isArray(payload.repos)
      ? payload.repos
      : payload.repo
        ? [payload.repo]
        : fallbackRepos(config);

    const excluded = new Set(config.githubPreview?.excludeNames || []);
    const repos = rawRepos
      .filter((repo) => repo && repo.name && !repo.fork && !repo.archived && !excluded.has(repo.name))
      .map((repo) => compactRepo(repo, config));

    const featured = Array.isArray(payload.featured) && payload.featured.length
      ? payload.featured.map((repo) => compactRepo(repo, config))
      : (config.githubPreview?.pinned || []).map((pin) => repos.find((repo) => repo.name === pin.name) || compactRepo(pin, config));

    const latest = payload.latest
      ? compactRepo(payload.latest, config)
      : repos.find((repo) => !repo.isWebsiteRepo) || repos[0] || featured[0] || fallbackRepos(config)[0];

    state.repos = repos;
    renderProjects({ repos, featured, latest });
  }

  function visualClass(repo) {
    const name = `${repo.name} ${repo.category}`.toLowerCase();
    if (name.includes("sts") || name.includes("spire")) return "relic-grid";
    if (name.includes("beam") || name.includes("mod")) return "code-lines";
    return "mini-wave";
  }

  function renderFeaturedProjects(projects) {
    const root = $("[data-featured-projects]");
    if (!root) return;
    const cards = projects.slice(0, 3);
    root.innerHTML = cards.map((project) => {
      const visual = visualClass(project);
      const bits = visual === "mini-wave"
        ? "<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>"
        : "<i></i><i></i><i></i><i></i><i></i><i></i>";
      return `
        <a class="surface-card reveal is-visible" href="${escapeHtml(project.project_url || project.html_url)}" rel="noreferrer">
          <span class="surface-label">${escapeHtml(project.category)}</span>
          <strong>${escapeHtml(project.title)}</strong>
          <span class="surface-description">${escapeHtml(project.description)}</span>
          <span class="surface-visual ${visual}" aria-hidden="true">${bits}</span>
        </a>
      `;
    }).join("");
  }

  function renderRepoGrid(repos) {
    const root = $("[data-repo-grid]");
    if (!root) return;
    root.innerHTML = repos.map((repo) => `
      <a class="repo-card" href="${escapeHtml(repo.html_url)}" rel="noreferrer">
        <span>${escapeHtml(repo.category)}</span>
        <strong>${escapeHtml(repo.name)}</strong>
        <small>${escapeHtml(repo.language || "Code")} / ${formatDate(repo.updated_at)}</small>
      </a>
    `).join("");
  }

  function renderProjects(payload) {
    renderFeaturedProjects(payload.featured || []);
    renderRepo(payload.latest);
    renderRepoGrid(payload.repos || []);
  }

  function renderRepo(repo) {
    if (!repo) return;
    $("[data-repo-name]").textContent = repo.title || repo.name || "Latest project";
    $("[data-repo-description]").textContent = repo.description || "Public repository preview.";
    $("[data-repo-language]").textContent = repo.language || "Code";
    $("[data-repo-stars]").textContent = `${repo.stargazers_count || 0} stars`;
    $("[data-repo-forks]").textContent = `${repo.forks_count || 0} forks`;
    $("[data-repo-updated]").textContent = formatDate(repo.updated_at);
    $("[data-repo-link]").href = repo.project_url || repo.html_url || "https://github.com/ryan11js";
    $("[data-code-snippet]").textContent = [
      `$ git clone ${repo.clone_url || repo.html_url || "https://github.com/ryan11js/repo.git"}`,
      `$ cd ${repo.name || "repo"}`,
      repo.project_url && repo.project_url.startsWith("/") ? `$ open ${repo.project_url}` : "$ code ."
    ].join("\n");
  }

  function renderSkillGraph(rows) {
    const graph = $("[data-skill-graph]");
    if (!graph) return;
    graph.innerHTML = rows.map((row) => {
      const value = Math.max(0, Math.min(100, Number(row.value || 0)));
      return `
        <div class="skill-row">
          <strong>${escapeHtml(row.label)}</strong>
          <i style="--value:${value / 100}"></i>
          <span>${value}%</span>
        </div>
      `;
    }).join("");
  }

  function wirePlayerProgress() {
    const audio = $("[data-audio]");
    const progress = $("[data-progress]");
    if (!audio || !progress) return;
    audio.addEventListener("timeupdate", () => {
      const ratio = audio.duration ? audio.currentTime / audio.duration : 0;
      progress.style.setProperty("--progress", String(Math.max(0, Math.min(1, ratio))));
    });
    audio.addEventListener("ended", () => {
      state.activeTrackId = null;
      renderTracks();
    });
  }

  function wireSearch() {
    const input = $("#trackSearch");
    if (!input) return;
    input.addEventListener("input", () => {
      state.query = input.value;
      state.musicMode = input.value.trim() ? "archive" : state.musicMode;
      state.visibleTracks = state.pageSize;
      renderTracks();
    });
  }

  function clearMusicFilters() {
    state.query = "";
    state.year = "all";
    state.key = "all";
    state.bpm = "all";
    state.musicMode = "featured";
    state.visibleTracks = state.pageSize;
    const input = $("#trackSearch");
    if (input) input.value = "";
    renderMusicFilters();
    renderTracks();
  }

  function showArchive() {
    state.musicMode = "archive";
    state.visibleTracks = state.pageSize;
    renderMusicFilters();
    renderTracks();
  }

  function wireMusicActions() {
    $("[data-random-beat]")?.addEventListener("click", randomBeat);
    $("[data-clear-filters]")?.addEventListener("click", clearMusicFilters);
    $("[data-show-archive]")?.addEventListener("click", showArchive);
  }

  function wireReveal() {
    const reveals = $$(".reveal");
    const inViewport = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.top < window.innerHeight * 0.96 && rect.bottom > 0;
    };

    if (!("IntersectionObserver" in window)) {
      reveals.forEach((node) => node.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16 });

    reveals.forEach((node) => {
      if (inViewport(node)) {
        node.classList.add("is-visible");
      } else {
        observer.observe(node);
      }
    });

    window.setTimeout(() => {
      reveals.forEach((node) => {
        if (!node.classList.contains("is-visible") && inViewport(node)) {
          node.classList.add("is-visible");
          observer.unobserve(node);
        }
      });
    }, 180);
  }

  function wireHeader() {
    const header = $("[data-header]");
    if (!header) return;
    const update = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  function bootSignalCanvas() {
    const canvas = $("#signalCanvas");
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: 0.55, y: 0.56 };
    let width = 0;
    let height = 0;
    let frame = 0;

    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (time = 0) => {
      context.clearRect(0, 0, width, height);
      const centerY = height * (0.58 + (pointer.y - 0.5) * 0.06);
      const drift = time * 0.00035;

      for (let line = 0; line < 5; line += 1) {
        context.beginPath();
        const hueShift = line / 5;
        context.strokeStyle = line % 2
          ? `rgba(244, 174, 84, ${0.15 + hueShift * 0.08})`
          : `rgba(103, 217, 255, ${0.18 + hueShift * 0.11})`;
        context.lineWidth = 1 + line * 0.45;
        for (let x = -20; x <= width + 20; x += 12) {
          const n = Math.sin(x * 0.008 + drift * (2.2 + line)) * 42;
          const n2 = Math.sin(x * 0.018 - drift * (3.5 + line)) * 18;
          const pull = Math.sin((x / Math.max(1, width)) * Math.PI) * (pointer.x - 0.5) * 44;
          const y = centerY + n + n2 + pull + line * 18;
          if (x === -20) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }

      for (let dot = 0; dot < 54; dot += 1) {
        const seed = dot * 179;
        const x = ((seed + time * (0.012 + (dot % 5) * 0.003)) % (width + 180)) - 90;
        const y = centerY + Math.sin(seed + time * 0.0012) * 120 + (dot % 9) * 9;
        const size = 1 + (dot % 4) * 0.42;
        context.fillStyle = dot % 3 === 0 ? "rgba(244,174,84,0.42)" : "rgba(103,217,255,0.5)";
        context.fillRect(x, y, size, size);
      }

      frame += 1;
      if (!reduceMotion || frame < 2) requestAnimationFrame(draw);
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", (event) => {
      pointer.x = event.clientX / Math.max(1, window.innerWidth);
      pointer.y = event.clientY / Math.max(1, window.innerHeight);
    }, { passive: true });
    resize();
    draw();
  }

  async function init() {
    let config;
    try {
      config = await loadJson("/api/site.php");
    } catch (error) {
      try {
        config = await loadJson("/config/site.json");
      } catch (fallbackError) {
        config = fallbackConfig;
      }
    }

    config = mergeConfig(config);
    applyConfig(config);
    wireHeader();
    wireReveal();
    wireSearch();
    wireMusicActions();
    wirePlayerProgress();
    bootSignalCanvas();
    await Promise.all([loadMusic(), loadGithubPreview(config)]);
  }

  init().catch((error) => {
    console.error(error);
  });
}());
