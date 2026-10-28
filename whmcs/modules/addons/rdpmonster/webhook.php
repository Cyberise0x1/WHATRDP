<?php
declare(strict_types=1);

use RdpMonster\ApiClient;
use RdpMonster\ApiException;
use RdpMonster\Store;
use WHMCS\Database\Capsule;

require_once __DIR__ . '/../../../init.php';
require_once __DIR__ . '/../../servers/rdpmonster/lib/ApiException.php';
require_once __DIR__ . '/../../servers/rdpmonster/lib/ApiClient.php';
require_once __DIR__ . '/../../servers/rdpmonster/lib/Store.php';

header('Content-Type: application/json');

$secret = (string) Capsule::table('tbladdonmodules')
    ->where('module', 'rdpmonster')
    ->where('setting', 'webhook_secret')
    ->value('value');

if ($secret === '') {
    http_response_code(500);
    echo json_encode(['error' => 'webhook_secret_not_configured']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$timestamp = (string) ($_SERVER['HTTP_X_RDPM_TIMESTAMP'] ?? '');
$signature = (string) ($_SERVER['HTTP_X_RDPM_SIGNATURE'] ?? '');

$expected = 'v1=' . hash_hmac('sha256', $timestamp . '.' . $raw, $secret);
if ($signature === '' || !hash_equals($expected, $signature)) {
    http_response_code(401);
    echo json_encode(['error' => 'invalid_signature']);
    exit;
}

if ($timestamp === '' || abs(time() - (int) $timestamp) > 300) {
    http_response_code(401);
    echo json_encode(['error' => 'stale_timestamp']);
    exit;
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_json']);
    exit;
}

$event = (string) ($payload['event'] ?? '');
$data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
$rmServiceId = (string) ($data['serviceId'] ?? '');

$serviceId = $rmServiceId !== '' ? Store::serviceIdForServer($rmServiceId) : null;

if ($serviceId === null) {
    echo json_encode(['ok' => true, 'ignored' => 'unknown service']);
    exit;
}

try {
    switch ($event) {
        case 'server.created':
            \RdpMonster\Store::sync($serviceId, 'ACTIVE', isset($data['ip']) ? (string) $data['ip'] : null);
            rdpmonster_webhook_pull_credentials($serviceId, $rmServiceId);
            break;
        case 'server.delivered':
            \RdpMonster\Store::sync($serviceId, 'ACTIVE', isset($data['ip']) ? (string) $data['ip'] : null);
            rdpmonster_webhook_pull_credentials($serviceId, $rmServiceId);
            break;
        case 'server.renewed':
            \RdpMonster\Store::sync($serviceId, 'ACTIVE');
            break;
        case 'server.suspended':
            \RdpMonster\Store::sync($serviceId, 'SUSPENDED');
            break;
        case 'server.deleted':
            \RdpMonster\Store::sync($serviceId, 'TERMINATED');
            break;
        case 'service.expiring':
            \RdpMonster\Store::sync($serviceId, 'EXPIRING_SOON');
            break;
        default:
            break;
    }

    if (function_exists('logActivity')) {
        logActivity('RDP Monster webhook ' . $event . ' for service #' . $serviceId);
    }
} catch (\Throwable $e) {
    if (function_exists('logActivity')) {
        logActivity('RDP Monster webhook error: ' . $e->getMessage());
    }
    http_response_code(500);
    echo json_encode(['error' => 'handler_failed']);
    exit;
}

echo json_encode(['ok' => true]);

function rdpmonster_webhook_pull_credentials(int $serviceId, string $rmServiceId): void
{
    $hosting = Capsule::table('tblhosting')->where('id', $serviceId)->first();
    if (!$hosting) {
        return;
    }

    $server = Capsule::table('tblservers')->where('id', (int) $hosting->server)->first();
    if (!$server) {
        return;
    }

    $token = (string) ($server->accesshash ?: $server->password);
    $api = new ApiClient($token, (string) $server->hostname);

    try {
        $credentials = $api->credentials($rmServiceId);
    } catch (ApiException $e) {
        return;
    }

    $password = (string) ($credentials['password'] ?? '');
    $stored = function_exists('encrypt') ? encrypt($password) : $password;

    Capsule::table('tblhosting')->where('id', $serviceId)->update([
        'username' => (string) ($credentials['user'] ?? ''),
        'password' => $stored,
    ]);
}
