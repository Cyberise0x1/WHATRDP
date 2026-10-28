<?php
declare(strict_types=1);

use WHMCS\Database\Capsule;

require_once __DIR__ . '/../../servers/rdpmonster/lib/ApiException.php';
require_once __DIR__ . '/../../servers/rdpmonster/lib/ApiClient.php';
require_once __DIR__ . '/../../servers/rdpmonster/lib/Store.php';
require_once __DIR__ . '/../../servers/rdpmonster/lib/Provisioner.php';

function rdpmonster_config(): array
{
    return [
        'name' => 'RDP Monster',
        'description' => 'Webhook receiver and service sync for the RDP Monster server module.',
        'version' => '1.0',
        'author' => 'RDP Monster reseller',
        'fields' => [
            'webhook_secret' => [
                'FriendlyName' => 'Webhook signing secret',
                'Type' => 'password',
                'Size' => '50',
                'Description' => 'From the RDP Monster client area webhook settings.',
            ],
        ],
    ];
}

function rdpmonster_activate(): array
{
    try {
        \RdpMonster\Store::ensure();
        return ['status' => 'success', 'description' => 'RDP Monster tables created.'];
    } catch (\Throwable $e) {
        return ['status' => 'error', 'description' => 'Could not create tables: ' . $e->getMessage()];
    }
}

function rdpmonster_deactivate(): array
{
    return ['status' => 'success', 'description' => 'Data kept. Remove the module to drop its tables.'];
}

function rdpmonster_upgrade(array $vars): void
{
}

function rdpmonster_output(array $vars): void
{
    $secret = Capsule::table('tbladdonmodules')
        ->where('module', 'rdpmonster')
        ->where('setting', 'webhook_secret')
        ->value('value');

    $url = rtrim(\App::getSystemURL(), '/') . '/modules/addons/rdpmonster/webhook.php';
    $services = \RdpMonster\Store::all();

    echo '<h2>RDP Monster</h2>';
    echo '<p><strong>Webhook URL</strong><br><code>' . htmlspecialchars($url, ENT_QUOTES) . '</code></p>';
    echo '<p><strong>Signing secret</strong>: ' . ($secret ? 'configured' : '<span style="color:#c00">not set</span>') . '</p>';
    echo '<p>Subscribe to <code>server.created</code>, <code>server.delivered</code>, <code>server.renewed</code>, '
        . '<code>server.deleted</code>, <code>server.suspended</code> and <code>service.expiring</code>.</p>';

    echo '<table class="datatable" width="100%"><thead><tr>'
        . '<th>Service</th><th>Server id</th><th>Status</th><th>IP</th><th>Last sync</th><th>Last error</th>'
        . '</tr></thead><tbody>';

    if ($services === []) {
        echo '<tr><td colspan="6">No linked services yet.</td></tr>';
    }

    foreach ($services as $row) {
        echo '<tr>'
            . '<td>#' . (int) $row->serviceid . '</td>'
            . '<td>' . htmlspecialchars((string) $row->server_id, ENT_QUOTES) . '</td>'
            . '<td>' . htmlspecialchars((string) $row->status, ENT_QUOTES) . '</td>'
            . '<td>' . htmlspecialchars((string) $row->primary_ip, ENT_QUOTES) . '</td>'
            . '<td>' . htmlspecialchars((string) $row->last_sync, ENT_QUOTES) . '</td>'
            . '<td>' . htmlspecialchars((string) $row->last_error, ENT_QUOTES) . '</td>'
            . '</tr>';
    }

    echo '</tbody></table>';
}

function rdpmonster_sidebar(): void
{
    echo '<p>Webhook endpoint: <code>/modules/addons/rdpmonster/webhook.php</code></p>';
}
