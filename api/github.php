<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

function github_fallback_repo(array $config): array
{
    $fallback = (array)($config['githubPreview']['fallbackRepo'] ?? []);
    $github = (array)($config['social']['github'] ?? []);
    return $fallback + [
        'name' => 'latest-project',
        'description' => 'Newest public repository preview.',
        'html_url' => (string)($github['url'] ?? 'https://github.com/'),
        'clone_url' => rtrim((string)($github['url'] ?? 'https://github.com/user'), '/') . '/latest-project.git',
        'language' => 'Code',
        'stargazers_count' => 0,
        'forks_count' => 0,
        'updated_at' => gmdate('c'),
    ];
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

$config = site_config();
$github = (array)($config['social']['github'] ?? []);
$username = trim((string)($github['username'] ?? ''));

if ($username === '') {
    json_response(['repo' => github_fallback_repo($config), 'source' => 'fallback']);
}

$cache = read_cache($username, 600);
if ($cache !== null) {
    json_response($cache + ['source' => 'cache']);
}

$repos = fetch_url_json('https://api.github.com/users/' . rawurlencode($username) . '/repos?sort=updated&per_page=30');
if ($repos === null || isset($repos['message'])) {
    json_response(['repo' => github_fallback_repo($config), 'source' => 'fallback']);
}

$excludeForks = (bool)($config['githubPreview']['excludeForks'] ?? true);
$excludeArchived = (bool)($config['githubPreview']['excludeArchived'] ?? true);
$repo = null;

foreach ($repos as $candidate) {
    if (!is_array($candidate)) {
        continue;
    }
    if ($excludeForks && !empty($candidate['fork'])) {
        continue;
    }
    if ($excludeArchived && !empty($candidate['archived'])) {
        continue;
    }
    $repo = $candidate;
    break;
}

if ($repo === null && isset($repos[0]) && is_array($repos[0])) {
    $repo = $repos[0];
}

$payload = [
    'repo' => [
        'name' => (string)($repo['name'] ?? 'latest-project'),
        'description' => (string)($repo['description'] ?? 'Newest public repository preview.'),
        'html_url' => (string)($repo['html_url'] ?? ($github['url'] ?? 'https://github.com/')),
        'clone_url' => (string)($repo['clone_url'] ?? ''),
        'language' => (string)($repo['language'] ?? 'Code'),
        'stargazers_count' => (int)($repo['stargazers_count'] ?? 0),
        'forks_count' => (int)($repo['forks_count'] ?? 0),
        'updated_at' => (string)($repo['pushed_at'] ?? ($repo['updated_at'] ?? gmdate('c'))),
        'topics' => array_values((array)($repo['topics'] ?? [])),
    ],
    'source' => 'github',
];

write_cache($username, $payload);
json_response($payload);
