<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

function normalize_track(array $track, int $index): array
{
    $title = trim((string)($track['title'] ?? 'Beat ' . str_pad((string)($index + 1), 3, '0', STR_PAD_LEFT)));
    $id = trim((string)($track['id'] ?? safe_slug($title . '-' . $index)));

    return [
        'id' => $id,
        'title' => $title,
        'genre' => trim((string)($track['genre'] ?? 'uncategorized')),
        'bpm' => (int)($track['bpm'] ?? 0),
        'key' => trim((string)($track['key'] ?? '--')),
        'duration' => trim((string)($track['duration'] ?? '--')),
        'mood' => array_values(array_filter((array)($track['mood'] ?? []))),
        'src' => trim((string)($track['src'] ?? '')),
        'peaks' => array_values((array)($track['peaks'] ?? [])),
    ];
}

function scan_audio_tracks(string $baseDir, string $baseUrl): array
{
    $tracks = [];
    if (!is_dir($baseDir)) {
        return $tracks;
    }

    $extensions = ['mp3' => true, 'm4a' => true, 'wav' => true, 'ogg' => true, 'flac' => true, 'webm' => true];
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($baseDir, FilesystemIterator::SKIP_DOTS));

    foreach ($iterator as $file) {
        if (!$file instanceof SplFileInfo || !$file->isFile()) {
            continue;
        }

        $extension = strtolower($file->getExtension());
        if (!isset($extensions[$extension])) {
            continue;
        }

        $relative = ltrim(str_replace('\\', '/', substr($file->getPathname(), strlen($baseDir))), '/');
        $title = preg_replace('/\.[^.]+$/', '', basename($relative)) ?: basename($relative);
        $genre = dirname($relative) !== '.' ? basename(dirname($relative)) : 'uncategorized';

        $tracks[] = [
            'id' => safe_slug($relative),
            'title' => str_replace(['_', '-'], ' ', $title),
            'genre' => $genre,
            'bpm' => 0,
            'key' => '--',
            'duration' => '--',
            'mood' => [],
            'src' => rtrim($baseUrl, '/') . '/' . implode('/', array_map('rawurlencode', explode('/', $relative))),
            'peaks' => [],
        ];
    }

    usort($tracks, static fn(array $a, array $b): int => strcasecmp($a['title'], $b['title']));
    return $tracks;
}

$config = site_config();
$catalog = read_json_file('content/music/catalog.json', ['tracks' => []]);
$tracks = array_map('normalize_track', (array)($catalog['tracks'] ?? []), array_keys((array)($catalog['tracks'] ?? [])));

$musicConfig = (array)($config['music'] ?? []);
if (($musicConfig['autoScanAudio'] ?? false) === true) {
    $baseUrl = (string)($musicConfig['audioBasePath'] ?? '/content/music/audio/');
    $scanned = scan_audio_tracks(project_path('content/music/audio'), $baseUrl);
    $knownBySrc = [];
    foreach ($tracks as $track) {
        if (!empty($track['src'])) {
            $knownBySrc[$track['src']] = true;
        }
    }
    foreach ($scanned as $track) {
        if (!isset($knownBySrc[$track['src']])) {
            $tracks[] = $track;
        }
    }
}

$query = strtolower(trim((string)($_GET['q'] ?? '')));
$genre = strtolower(trim((string)($_GET['genre'] ?? 'all')));

$filtered = array_values(array_filter($tracks, static function (array $track) use ($query, $genre): bool {
    if ($genre !== '' && $genre !== 'all' && strtolower((string)$track['genre']) !== $genre) {
        return false;
    }
    if ($query === '') {
        return true;
    }
    $haystack = strtolower(implode(' ', [
        $track['title'],
        $track['genre'],
        $track['key'],
        implode(' ', (array)$track['mood']),
    ]));
    return str_contains($haystack, $query);
}));

$offset = max(0, (int)($_GET['offset'] ?? 0));
$limit = (int)($_GET['limit'] ?? 0);
$paged = $limit > 0 ? array_slice($filtered, $offset, min($limit, 100)) : $filtered;

json_response([
    'tracks' => $paged,
    'total' => count($filtered),
    'available' => count($tracks),
]);
