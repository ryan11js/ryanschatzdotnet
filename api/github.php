<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

function github_fallback_repos(array $config): array
{
    $pinned = (array)($config['githubPreview']['pinned'] ?? []);
    $fallback = (array)($config['githubPreview']['fallbackRepo'] ?? []);

    $repos = [
        [
            'name' => 'sts2crng',
            'description' => 'A tool to provide insight into Correlated Randomness in Slay the Spire 2',
            'html_url' => 'https://github.com/ryan11js/sts2crng',
            'clone_url' => 'https://github.com/ryan11js/sts2crng.git',
            'language' => 'JavaScript',
            'stargazers_count' => 0,
            'forks_count' => 0,
            'updated_at' => gmdate('c'),
        ],
        [
            'name' => 'beamng-playerguns',
            'description' => 'A mod to add Player Guns into BeamNG Drive working with Beam MP multiplayer.',
            'html_url' => 'https://github.com/ryan11js/beamng-playerguns',
            'clone_url' => 'https://github.com/ryan11js/beamng-playerguns.git',
            'language' => 'Lua',
            'stargazers_count' => 0,
            'forks_count' => 0,
            'updated_at' => gmdate('c'),
        ],
        $fallback + [
            'name' => 'ryanschatzdotnet',
            'description' => 'Repo for landing page of my website RyanSchatz.net',
            'html_url' => 'https://github.com/ryan11js/ryanschatzdotnet',
            'clone_url' => 'https://github.com/ryan11js/ryanschatzdotnet.git',
            'language' => 'JavaScript',
            'stargazers_count' => 0,
            'forks_count' => 0,
            'updated_at' => gmdate('c'),
        ],
    ];

    return array_map(static fn(array $repo): array => enrich_repo($repo, $config, $pinned), $repos);
}

function fetch_url_json(string $url): ?array
{
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => implode("\r\n", [
                'Accept: application/vnd.github+json',
                'User-Agent: ryanschatz-net',
            ]),
            'timeout' => 5,
        ],
    ]);

    $body = @file_get_contents($url, false, $context);
    if ($body === false) {
        return null;
    }

    $data = json_decode($body, true);
    return is_array($data) ? $data : null;
}

function cache_path(string $username): string
{
    return project_path('cache/github-' . safe_slug($username) . '.json');
}

function read_cache(string $username, int $ttlSeconds): ?array
{
    $path = cache_path($username);
    if (!is_file($path) || filemtime($path) < time() - $ttlSeconds) {
        return null;
    }
    $json = file_get_contents($path);
    $data = $json ? json_decode($json, true) : null;
    return is_array($data) ? $data : null;
}

function write_cache(string $username, array $payload): void
{
    $path = cache_path($username);
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    if (is_writable($dir)) {
        @file_put_contents($path, json_encode($payload, JSON_UNESCAPED_SLASHES));
    }
}

function pinned_by_name(array $pinned): array
{
    $map = [];
    foreach ($pinned as $item) {
        if (is_array($item) && !empty($item['name'])) {
            $map[(string)$item['name']] = $item;
        }
    }
    return $map;
}

function enrich_repo(array $repo, array $config, array $pinned): array
{
    $pinMap = pinned_by_name($pinned);
    $name = (string)($repo['name'] ?? '');
    $pin = $pinMap[$name] ?? [];
    $websiteRepo = (string)($config['githubPreview']['websiteRepo'] ?? '');

    return [
        'name' => $name,
        'title' => (string)($pin['title'] ?? $repo['name'] ?? 'repo'),
        'category' => (string)($pin['category'] ?? ($name === $websiteRepo ? 'Website' : 'Repo')),
        'description' => (string)($pin['description'] ?? $repo['description'] ?? 'Public repository preview.'),
        'html_url' => (string)($repo['html_url'] ?? 'https://github.com/ryan11js'),
        'project_url' => (string)($pin['projectUrl'] ?? $repo['html_url'] ?? 'https://github.com/ryan11js'),
        'clone_url' => (string)($repo['clone_url'] ?? ''),
        'language' => (string)($repo['language'] ?? 'Code'),
        'stargazers_count' => (int)($repo['stargazers_count'] ?? 0),
        'forks_count' => (int)($repo['forks_count'] ?? 0),
        'updated_at' => (string)($repo['pushed_at'] ?? $repo['updated_at'] ?? gmdate('c')),
        'topics' => array_values((array)($repo['topics'] ?? [])),
        'isPinned' => isset($pinMap[$name]),
        'isWebsiteRepo' => $name === $websiteRepo,
    ];
}

function repo_allowed(array $repo, array $config): bool
{
    $name = (string)($repo['name'] ?? '');
    $excludeNames = array_map('strval', (array)($config['githubPreview']['excludeNames'] ?? []));

    if ($name === '' || in_array($name, $excludeNames, true)) {
        return false;
    }
    if ((bool)($config['githubPreview']['excludeForks'] ?? true) && !empty($repo['fork'])) {
        return false;
    }
    if ((bool)($config['githubPreview']['excludeArchived'] ?? true) && !empty($repo['archived'])) {
        return false;
    }
    return true;
}

function select_featured(array $repos, array $config): array
{
    $featured = [];
    foreach ((array)($config['githubPreview']['pinned'] ?? []) as $pin) {
        if (!is_array($pin) || empty($pin['name'])) {
            continue;
        }
        foreach ($repos as $repo) {
            if (($repo['name'] ?? '') === $pin['name']) {
                $featured[] = $repo;
                break;
            }
        }
    }
    return $featured;
}

function select_latest(array $repos, array $config): array
{
    $websiteRepo = (string)($config['githubPreview']['websiteRepo'] ?? '');
    foreach ($repos as $repo) {
        if (($repo['name'] ?? '') !== $websiteRepo) {
            return $repo;
        }
    }
    return $repos[0] ?? [];
}

$config = site_config();
$github = (array)($config['social']['github'] ?? []);
$username = trim((string)($github['username'] ?? ''));

if ($username === '') {
    $repos = github_fallback_repos($config);
    json_response([
        'repos' => $repos,
        'featured' => select_featured($repos, $config),
        'latest' => select_latest($repos, $config),
        'source' => 'fallback',
    ]);
}

$cache = read_cache($username, 600);
if ($cache !== null) {
    json_response($cache + ['source' => $cache['source'] ?? 'cache']);
}

$reposRaw = fetch_url_json('https://api.github.com/users/' . rawurlencode($username) . '/repos?sort=updated&per_page=100');
if ($reposRaw === null || isset($reposRaw['message'])) {
    $repos = github_fallback_repos($config);
    json_response([
        'repos' => $repos,
        'featured' => select_featured($repos, $config),
        'latest' => select_latest($repos, $config),
        'source' => 'fallback',
    ]);
}

$pinned = (array)($config['githubPreview']['pinned'] ?? []);
$repos = [];
foreach ($reposRaw as $repo) {
    if (is_array($repo) && repo_allowed($repo, $config)) {
        $repos[] = enrich_repo($repo, $config, $pinned);
    }
}

$payload = [
    'repos' => $repos,
    'featured' => select_featured($repos, $config),
    'latest' => select_latest($repos, $config),
    'source' => 'github',
];

write_cache($username, $payload);
json_response($payload);
