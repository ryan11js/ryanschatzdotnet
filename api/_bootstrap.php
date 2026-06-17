<?php
declare(strict_types=1);

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: public, max-age=120');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function project_path(string $relative): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, ltrim($relative, '/\\'));
}

function read_json_file(string $relative, array $fallback = []): array
{
    $path = project_path($relative);
    if (!is_file($path)) {
        return $fallback;
    }

    $json = file_get_contents($path);
    if ($json === false) {
        return $fallback;
    }

    $data = json_decode($json, true);
    return is_array($data) ? $data : $fallback;
}

function site_config(): array
{
    return read_json_file('config/site.json');
}

function safe_slug(string $value): string
{
    $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $value) ?? '');
    return trim($slug, '-') ?: 'item';
}
