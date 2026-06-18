<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

function parse_track_filename(string $filename): array
{
    $base = pathinfo($filename, PATHINFO_FILENAME);
    $title = trim(preg_replace('/\s+/', ' ', str_replace(['_', '-'], ' ', $base)) ?? $base);
    $year = null;
    $number = null;
    $key = '--';
    $bpm = 0;

    if (preg_match('/\b(20\d{2})\s*#\s*(\d+)\b/i', $title, $match)) {
        $year = (int)$match[1];
        $number = (int)$match[2];
    } elseif (preg_match('/\btrack\s*#?\s*(\d+)\b/i', $title, $match)) {
        $number = (int)$match[1];
    }

    if (preg_match_all('/\b([5-9]\d|1\d{2}|2[0-2]\d)\s*(?:bpm)?\b/i', $title, $matches)) {
        $values = array_map('intval', $matches[1]);
        $bpm = (int)end($values);
    }

    if (preg_match('/(?:^|[^A-Za-z0-9])([A-G](?:#|b)?)(?:\s*(maj|major|min|minor|m))?(?=$|[^A-Za-z0-9])/i', $title, $match)) {
        $root = strtoupper($match[1][0]) . substr($match[1], 1);
        $mode = strtolower((string)($match[2] ?? ''));
        if (in_array($mode, ['m', 'min', 'minor'], true)) {
            $key = $root . ' min';
        } elseif (in_array($mode, ['maj', 'major'], true)) {
            $key = $root . ' maj';
        } else {
            $key = $root;
        }
    }

    return [
        'title' => $title,
        'year' => $year,
        'number' => $number,
        'key' => $key,
        'bpm' => $bpm,
    ];
}

function normalize_track(array $track, int $index): array
{
    $parsed = parse_track_filename((string)($track['title'] ?? 'Beat ' . str_pad((string)($index + 1), 3, '0', STR_PAD_LEFT)));
    $title = trim((string)($track['title'] ?? $parsed['title']));
    $year = array_key_exists('year', $track) && $track['year'] !== null ? (int)$track['year'] : $parsed['year'];
    $number = array_key_exists('number', $track) && $track['number'] !== null ? (int)$track['number'] : $parsed['number'];
    $key = trim((string)($track['key'] ?? $parsed['key']));
    $bpm = (int)($track['bpm'] ?? $parsed['bpm']);
    $id = trim((string)($track['id'] ?? safe_slug(($year ? $year . '-' : '') . ($number ? $number . '-' : '') . $title . '-' . $index)));
    $tags = array_values(array_filter(array_map('strval', (array)($track['tags'] ?? $track['mood'] ?? []))));

    if ($year !== null && !in_array((string)$year, $tags, true)) {
        $tags[] = (string)$year;
    }
    if (!empty($track['featured']) && !in_array('featured', $tags, true)) {
        $tags[] = 'featured';
    }

    return [
        'id' => $id,
        'title' => $title,
        'year' => $year,
        'number' => $number,
        'key' => $key !== '' ? $key : '--',
        'bpm' => $bpm,
        'src' => trim((string)($track['src'] ?? '')),
        'tags' => $tags,
        'featured' => (bool)($track['featured'] ?? false),
        'peaks' => array_values((array)($track['peaks'] ?? [])),
    ];
}

function audio_base_dir(array $config): string
{
    $audioBasePath = (string)($config['music']['audioBasePath'] ?? '/media/beats/');
    $relative = trim($audioBasePath, '/');
    return project_path($relative);
}

function scan_audio_tracks(string $baseDir, string $baseUrl): array
{
    $tracks = [];
    if (!is_dir($baseDir)) {
        return $tracks;
    }

    $extensions = ['mp3' => true, 'm4a' => true, 'wav' => true, 'ogg' => true, 'flac' => true, 'webm' => true, 'aif' => true, 'aiff' => true];
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
        $parsed = parse_track_filename(basename($relative));
        $src = rtrim($baseUrl, '/') . '/' . implode('/', array_map('rawurlencode', explode('/', $relative)));
        $tags = [];
        if ($parsed['year'] !== null) {
            $tags[] = (string)$parsed['year'];
        }

        $tracks[] = [
            'id' => safe_slug($relative),
            'title' => $parsed['title'],
            'year' => $parsed['year'],
            'number' => $parsed['number'],
            'key' => $parsed['key'],
            'bpm' => $parsed['bpm'],
            'src' => $src,
            'tags' => $tags,
            'featured' => false,
            'peaks' => [],
        ];
    }

    usort($tracks, static fn(array $a, array $b): int => strcasecmp((string)$a['title'], (string)$b['title']));
    return $tracks;
}

function seed_key(array $seed): string
{
    return (int)($seed['year'] ?? 0) . '-' . (int)($seed['number'] ?? 0);
}

function track_seed_key(array $track): string
{
    return (int)($track['year'] ?? 0) . '-' . (int)($track['number'] ?? 0);
}

function select_featured_tracks(array $tracks, array $config): array
{
    $limit = (int)($config['music']['featuredLimit'] ?? 8);
    $selected = [];
    $used = [];

    foreach ((array)($config['music']['featuredSeeds'] ?? []) as $seed) {
        if (!is_array($seed)) {
            continue;
        }
        $wanted = seed_key($seed);
        foreach ($tracks as $track) {
            if (track_seed_key($track) === $wanted && empty($used[$track['id']])) {
                $selected[] = $track;
                $used[$track['id']] = true;
                break;
            }
        }
    }

    $pools = [
        array_values(array_filter($tracks, static fn(array $track): bool => !empty($track['featured']))),
        array_values(array_filter($tracks, static fn(array $track): bool => (int)($track['year'] ?? 0) === 2026)),
        $tracks,
    ];

    foreach ($pools as $pool) {
        foreach ($pool as $track) {
            if (count($selected) >= $limit) {
                break 2;
            }
            if (empty($used[$track['id']])) {
                $selected[] = $track;
                $used[$track['id']] = true;
            }
        }
    }

    return array_slice($selected, 0, $limit);
}

function track_matches(array $track, string $query, string $year, string $key, int $bpmMin, int $bpmMax, ?bool $featured): bool
{
    if ($featured !== null && (bool)$track['featured'] !== $featured) {
        return false;
    }
    if ($year !== 'all' && (string)($track['year'] ?? 'unknown') !== $year) {
        return false;
    }
    if ($key !== 'all' && strtolower((string)$track['key']) !== strtolower($key)) {
        return false;
    }
    if (($bpmMin > 0 || $bpmMax < 999) && ((int)$track['bpm'] < $bpmMin || (int)$track['bpm'] > $bpmMax)) {
        return false;
    }
    if ($query === '') {
        return true;
    }

    $haystack = strtolower(implode(' ', [
        $track['title'],
        $track['year'],
        $track['number'] ? '# ' . $track['number'] : '',
        $track['key'],
        $track['bpm'] ? $track['bpm'] . ' bpm' : '',
        implode(' ', (array)$track['tags']),
    ]));
    return str_contains($haystack, $query);
}

function facets(array $tracks): array
{
    $years = [];
    $keys = [];
    foreach ($tracks as $track) {
        if (!empty($track['year'])) {
            $years[(string)$track['year']] = true;
        }
        if (!empty($track['key']) && $track['key'] !== '--') {
            $keys[(string)$track['key']] = true;
        }
    }
    $years = array_keys($years);
    rsort($years, SORT_NUMERIC);
    $keys = array_keys($keys);
    natcasesort($keys);

    return [
        'years' => array_values($years),
        'keys' => array_values($keys),
    ];
}

$config = site_config();
$catalog = read_json_file('content/music/catalog.json', ['tracks' => []]);
$tracks = [];
foreach ((array)($catalog['tracks'] ?? []) as $index => $track) {
    if (is_array($track)) {
        $tracks[] = normalize_track($track, (int)$index);
    }
}

$musicConfig = (array)($config['music'] ?? []);
if (($musicConfig['autoScanAudio'] ?? false) === true) {
    $baseUrl = (string)($musicConfig['audioBasePath'] ?? '/media/beats/');
    $scanned = scan_audio_tracks(audio_base_dir($config), $baseUrl);
    $known = [];
    foreach ($tracks as $track) {
        if (!empty($track['src'])) {
            $known[$track['src']] = true;
        }
        $known[$track['id']] = true;
    }
    foreach ($scanned as $index => $track) {
        if (empty($known[$track['src']]) && empty($known[$track['id']])) {
            $tracks[] = normalize_track($track, count($tracks) + $index);
        }
    }
}

$query = strtolower(trim((string)($_GET['q'] ?? '')));
$year = trim((string)($_GET['year'] ?? 'all'));
$key = trim((string)($_GET['key'] ?? 'all'));
$bpmMin = max(0, (int)($_GET['bpm_min'] ?? 0));
$bpmMax = min(999, (int)($_GET['bpm_max'] ?? 999));
$featured = isset($_GET['featured']) ? filter_var($_GET['featured'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) : null;

$filtered = array_values(array_filter($tracks, static fn(array $track): bool => track_matches($track, $query, $year, $key, $bpmMin, $bpmMax, $featured)));

$offset = max(0, (int)($_GET['offset'] ?? 0));
$limit = (int)($_GET['limit'] ?? 0);
$paged = $limit > 0 ? array_slice($filtered, $offset, min($limit, 100)) : $filtered;

json_response([
    'tracks' => $paged,
    'featured' => select_featured_tracks($tracks, $config),
    'total' => count($filtered),
    'available' => count($tracks),
    'facets' => facets($tracks),
]);
