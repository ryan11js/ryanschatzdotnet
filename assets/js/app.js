(function () {
  "use strict";

  const state = {
    config: null,
    tracks: [],
    visibleTracks: 0,
    activeGenre: "all",
    query: "",
    activeTrackId: null,
    pageSize: 12
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const formatDate = (value) => {
    if (!value) return "syncing";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "syncing";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
  };

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

  const fallbackConfig = {
    site: {
      name: "Ryan Schatz",
      domain: "ryanschatz.net",
      intro: "Code, beats, and small tools built to ship.",
      footerLine: "ryanschatz.net"
    },
    social: {
      github: {
        username: "ripco",
        url: "https://github.com/ripco"
      }
    },
    music: {
      pageSize: 12,
      filters: ["all", "trap", "r&b", "cinematic", "electronic", "experimental"]
    },
    signalGraph: [
      { label: "Frontend", value: 94 },
      { label: "Audio", value: 88 },
      { label: "Tools", value: 91 },
      { label: "Systems", value: 84 }
    ]
  };

  const demoTracks = [
    { id: "beat-001", title: "Beat 001", genre: "electronic", bpm: 142, key: "F min", duration: "2:18", mood: ["clean", "night"], src: "" },
    { id: "beat-002", title: "Beat 002", genre: "trap", bpm: 156, key: "C min", duration: "2:42", mood: ["hard", "bright"], src: "" },
    { id: "beat-003", title: "Beat 003", genre: "r&b", bpm: 92, key: "A min", duration: "3:04", mood: ["soft", "warm"], src: "" },
    { id: "beat-004", title: "Beat 004", genre: "cinematic", bpm: 78, key: "D min", duration: "2:56", mood: ["wide", "tension"], src: "" },
    { id: "beat-005", title: "Beat 005", genre: "experimental", bpm: 128, key: "G min", duration: "2:30", mood: ["glitch", "cold"], src: "" },
    { id: "beat-006", title: "Beat 006", genre: "electronic", bpm: 118, key: "E min", duration: "3:12", mood: ["pulse", "late"], src: "" },
    { id: "beat-007", title: "Beat 007", genre: "trap", bpm: 144, key: "B min", duration: "2:25", mood: ["dark", "snap"], src: "" },
    { id: "beat-008", title: "Beat 008", genre: "r&b", bpm: 86, key: "F maj", duration: "3:22", mood: ["float", "clean"], src: "" }
  ];

  function applyConfig(config) {
    state.config = config;
    state.pageSize = Number(config.music?.pageSize || state.pageSize);

    document.title = `${config.site?.name || "Ryan Schatz"} | Code, Beats, Tools`;
    $("[data-site-name]").textContent = config.site?.name || "Ryan Schatz";
    $("[data-site-intro]").textContent = config.site?.intro || fallbackConfig.site.intro;
    $("[data-footer-name]").textContent = config.site?.name || "Ryan Schatz";
    $("[data-footer-line]").textContent = config.site?.footerLine || config.site?.domain || fallbackConfig.site.footerLine;

    const github = config.social?.github || fallbackConfig.social.github;
    $$("[data-github-link]").forEach((link) => {
      link.href = github.url || `https://github.com/${github.username || ""}`;
    });

    renderFilters(config.music?.filters || fallbackConfig.music.filters);
    renderSkillGraph(config.signalGraph || fallbackConfig.signalGraph);
  }

  function renderFilters(filters) {
    const row = $("[data-filter-row]");
    if (!row) return;
    row.innerHTML = "";
    filters.forEach((filter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = filter;
      button.dataset.genre = filter;
      button.className = filter === state.activeGenre ? "is-active" : "";
      button.addEventListener("click", () => {
        state.activeGenre = filter;
        state.visibleTracks = state.pageSize;
        renderTracks();
        renderFilters(filters);
      });
      row.append(button);
    });
  }

  function normalizeTrack(track, index) {
    const id = track.id || slug(`${track.title || "beat"}-${index}`);
    return {
      id,
      title: track.title || `Beat ${String(index + 1).padStart(3, "0")}`,
      genre: track.genre || "uncategorized",
      bpm: Number(track.bpm || 0),
      key: track.key || "--",
      duration: track.duration || "--",
      mood: Array.isArray(track.mood) ? track.mood : [],
      src: track.src || "",
      peaks: Array.isArray(track.peaks) && track.peaks.length ? track.peaks : seededPeaks(id)
    };
  }

  function filteredTracks() {
    const query = state.query.trim().toLowerCase();
    return state.tracks.filter((track) => {
      const genreMatch = state.activeGenre === "all" || track.genre.toLowerCase() === state.activeGenre.toLowerCase();
      if (!genreMatch) return false;
      if (!query) return true;
      const haystack = [track.title, track.genre, track.key, ...(track.mood || [])].join(" ").toLowerCase();
      return haystack.includes(query);
    });
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
      acc[track.genre] = (acc[track.genre] || 0) + 1;
      return acc;
    }, {});
    const maxCount = Math.max(1, ...Object.values(counts));
    chart.innerHTML = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([genre, value]) => `
        <div class="genre-bar">
          <span>${genre}</span>
          <i style="--scale:${value / maxCount}"></i>
          <b>${value}</b>
        </div>
      `).join("");
  }

  function renderTracks() {
    const grid = $("[data-track-grid]");
    const more = $("[data-load-more]");
    if (!grid || !more) return;

    const tracks = filteredTracks();
    const visible = tracks.slice(0, state.visibleTracks);
    grid.innerHTML = visible.map((track) => {
      const levels = track.peaks.slice(0, 18).map((peak) => `<i style="--level:${Math.max(0.12, Math.min(1, peak))}"></i>`).join("");
      const disabled = track.src ? "" : "disabled";
      const label = track.src ? (state.activeTrackId === track.id ? "Pause" : "Play") : "No audio file for";
      return `
        <article class="track-card ${state.activeTrackId === track.id ? "is-active" : ""}" data-track-id="${track.id}">
          <div class="track-info">
            <strong title="${track.title}">${track.title}</strong>
            <div class="track-meta">
              <span>${track.genre}</span>
              <span>${track.bpm || "--"} bpm</span>
              <span>${track.key}</span>
              <span>${track.duration}</span>
            </div>
            <div class="waveform" aria-hidden="true">${levels}</div>
          </div>
          <button class="play-button" type="button" ${disabled} aria-label="${label} ${track.title}" data-play="${track.id}">${track.src ? (state.activeTrackId === track.id ? "II" : ">" ) : "+"}</button>
        </article>
      `;
    }).join("");

    more.hidden = tracks.length <= state.visibleTracks;
    more.onclick = () => {
      state.visibleTracks += state.pageSize;
      renderTracks();
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
    renderTracks();
  }

  function renderSkillGraph(rows) {
    const graph = $("[data-skill-graph]");
    if (!graph) return;
    graph.innerHTML = rows.map((row) => {
      const value = Math.max(0, Math.min(100, Number(row.value || 0)));
      return `
        <div class="skill-row">
          <strong>${row.label}</strong>
          <i style="--value:${value / 100}"></i>
          <span>${value}%</span>
        </div>
      `;
    }).join("");
  }

  function fallbackRepo(config) {
    return config.githubPreview?.fallbackRepo || {
      name: "latest-project",
      description: "Newest public repository preview.",
      html_url: config.social?.github?.url || "https://github.com/",
      clone_url: `${config.social?.github?.url || "https://github.com/user"}/latest-project.git`,
      language: "Code",
      stargazers_count: 0,
      forks_count: 0,
      updated_at: new Date().toISOString()
    };
  }

  function compactRepo(repo) {
    return {
      name: repo.name,
      description: repo.description || "Public repository preview.",
      html_url: repo.html_url,
      clone_url: repo.clone_url || `${repo.html_url}.git`,
      language: repo.language || "Code",
      stargazers_count: repo.stargazers_count || 0,
      forks_count: repo.forks_count || 0,
      updated_at: repo.pushed_at || repo.updated_at
    };
  }

  async function loadGithubPreview(config) {
    let repo;
    try {
      const payload = await loadJson("/api/github.php");
      repo = payload.repo || payload;
    } catch (error) {
      const username = config.social?.github?.username;
      if (username) {
        try {
          const repos = await loadJson(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=20`);
          repo = repos.find((item) => !item.fork && !item.archived) || repos[0];
        } catch (githubError) {
          repo = fallbackRepo(config);
        }
      } else {
        repo = fallbackRepo(config);
      }
    }

    renderRepo(compactRepo(repo || fallbackRepo(config)));
  }

  function renderRepo(repo) {
    $("[data-repo-name]").textContent = repo.name || "Latest repo";
    $("[data-repo-description]").textContent = repo.description || "Public repository preview.";
    $("[data-repo-language]").textContent = repo.language || "Code";
    $("[data-repo-stars]").textContent = `${repo.stargazers_count || 0} stars`;
    $("[data-repo-forks]").textContent = `${repo.forks_count || 0} forks`;
    $("[data-repo-updated]").textContent = formatDate(repo.updated_at);
    $("[data-repo-link]").href = repo.html_url || "https://github.com/";
    $("[data-code-snippet]").textContent = [
      `$ git clone ${repo.clone_url || repo.html_url || "https://github.com/username/repo.git"}`,
      `$ cd ${repo.name || "repo"}`,
      "$ code .",
      "$ git status --short"
    ].join("\n");
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
      state.visibleTracks = state.pageSize;
      renderTracks();
    });
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
    config = { ...fallbackConfig, ...config };
    config.site = { ...fallbackConfig.site, ...(config.site || {}) };
    config.social = { ...fallbackConfig.social, ...(config.social || {}) };
    config.music = { ...fallbackConfig.music, ...(config.music || {}) };

    applyConfig(config);
    wireHeader();
    wireReveal();
    wireSearch();
    wirePlayerProgress();
    bootSignalCanvas();
    await Promise.all([loadMusic(), loadGithubPreview(config)]);
  }

  init().catch((error) => {
    console.error(error);
  });
}());
