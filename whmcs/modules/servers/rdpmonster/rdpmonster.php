<?php
declare(strict_types=1);

use RdpMonster\ApiException;
use RdpMonster\Provisioner;
use RdpMonster\Store;

require_once __DIR__ . '/lib/ApiException.php';
require_once __DIR__ . '/lib/ApiClient.php';
require_once __DIR__ . '/lib/Store.php';
require_once __DIR__ . '/lib/Provisioner.php';

function rdpmonster_MetaData(): array
{
    return [
        'DisplayName' => 'RDP Monster',
        'APIVersion' => '1.1',
        'RequireUsername' => false,
        'RequireDomain' => false,
        'AutoSetup' => true,
        'AutoSetupRemote' => true,
    ];
}

function rdpmonster_ConfigOptions(): array
{
    $osOptions = implode(',', [
        'windows-2022', 'windows-2012',
        'ubuntu-24-04', 'ubuntu-22-04', 'ubuntu-20-04',
        'debian-12', 'debian-11', 'centos-9', 'centos-8', 'kali',
    ]);

    return [
        'Source' => [
            'FriendlyName' => 'Offer source',
            'Type' => 'dropdown',
            'Options' => 'plan,resellerproduct,custom',
            'Default' => 'plan',
            'Description' => 'plan = platform SKU, resellerproduct = your own offer, custom = bespoke spec',
        ],
        'Slug' => [
            'FriendlyName' => 'Plan / offer slug',
            'Type' => 'text',
            'Size' => '30',
            'Default' => 'europe/1',
            'Description' => 'Ignored when source is custom. E.g. europe/1 or starter-eu',
        ],
        'OS' => [
            'FriendlyName' => 'OS template',
            'Type' => 'dropdown',
            'Options' => $osOptions,
            'Default' => 'windows-2022',
        ],
        'Extra IPv4' => [
            'FriendlyName' => 'Extra IPv4',
            'Type' => 'text',
            'Size' => '4',
            'Default' => '0',
            'Description' => 'Extra addresses, billed at $1.75/mo each (max 30)',
        ],
        'Region' => [
            'FriendlyName' => 'Custom: region',
            'Type' => 'dropdown',
            'Options' => 'europe,usa',
            'Default' => 'europe',
        ],
        'Tier' => [
            'FriendlyName' => 'Custom: tier',
            'Type' => 'dropdown',
            'Options' => 'CLASSIC,HIGH_PERFORMANCE',
            'Default' => 'CLASSIC',
        ],
        'vCPU' => [
            'FriendlyName' => 'Custom: vCPU',
            'Type' => 'text',
            'Size' => '4',
            'Default' => '2',
        ],
        'RAM GB' => [
            'FriendlyName' => 'Custom: RAM (GB)',
            'Type' => 'text',
            'Size' => '4',
            'Default' => '4',
        ],
        'Disk GB' => [
            'FriendlyName' => 'Custom: disk (GB)',
            'Type' => 'text',
            'Size' => '6',
            'Default' => '60',
        ],
        'Label prefix' => [
            'FriendlyName' => 'Label prefix',
            'Type' => 'text',
            'Size' => '20',
            'Default' => 'whmcs',
            'Description' => 'The WHMCS service id is appended automatically',
        ],
        'Timeout' => [
            'FriendlyName' => 'Provisioning timeout (s)',
            'Type' => 'text',
            'Size' => '5',
            'Default' => '120',
        ],
    ];
}

function rdpmonster_CreateAccount(array $params)
{
    try {
        $provisioner = Provisioner::fromParams($params, 30, 3);
        $response = $provisioner->create($params);

        $server = $response['data'] ?? [];
        if (empty($server['id'])) {
            throw new ApiException('RDP Monster accepted the order but returned no server id');
        }

        $serverId = (string) $server['id'];
        $timeout = max(30, (int) ($params['configoption11'] ?? 120));
        $server = $provisioner->waitForActive($serverId, $timeout);
        $ip = $provisioner->primaryIp($server);

        $username = null;
        $password = null;
        if (($server['status'] ?? '') === 'ACTIVE') {
            try {
                $credentials = $provisioner->credentialsFor($serverId);
                $username = isset($credentials['user']) ? (string) $credentials['user'] : null;
                $password = isset($credentials['password']) ? (string) $credentials['password'] : null;
            } catch (ApiException $e) {
                rdpmonster_log('credentials unavailable during create', $params, ['serverId' => $serverId], ['error' => $e->getMessage()]);
            }
        }

        Store::sync((int) $params['serviceid'], (string) ($server['status'] ?? 'PENDING'), $ip);

        rdpmonster_log('CreateAccount', $params, ['serverId' => $serverId, 'status' => $server['status'] ?? null], [
            'invoice' => $response['invoice'] ?? null,
        ]);

        return [
            'success' => true,
            'productid' => $serverId,
            'username' => $username,
            'password' => $password,
            'customfields' => [],
        ];
    } catch (ApiException $e) {
        Store::sync((int) ($params['serviceid'] ?? 0), 'FAILED', null, $e->getMessage());
        rdpmonster_log('CreateAccount failed', $params, [], ['error' => $e->getMessage(), 'http' => $e->status]);
        throw new Exception(rdpmonster_friendly_error($e));
    }
}

function rdpmonster_SuspendAccount(array $params)
{
    return rdpmonster_run_action($params, 'shutdown', 'Server shut down');
}

function rdpmonster_UnsuspendAccount(array $params)
{
    return rdpmonster_run_action($params, 'start', 'Server started');
}

function rdpmonster_TerminateAccount(array $params)
{
    try {
        $provisioner = Provisioner::fromParams($params);
        $serverId = rdpmonster_server_id($params, $provisioner);
        $provisioner->api()->delete('/servers/' . rawurlencode($serverId));

        Store::sync((int) $params['serviceid'], 'TERMINATED');
        rdpmonster_log('TerminateAccount', $params, ['serverId' => $serverId], ['ok' => true]);

        return 'success';
    } catch (ApiException $e) {
        if ($e->isNotFound()) {
            return 'success';
        }
        throw new Exception(rdpmonster_friendly_error($e));
    }
}

function rdpmonster_ChangePassword(array $params)
{
    try {
        $provisioner = Provisioner::fromParams($params);
        $serverId = rdpmonster_server_id($params, $provisioner);
        $password = (string) ($params['password'] ?? '');

        $body = ['action' => 'reset-password'];
        if ($password !== '') {
            $body['password'] = $password;
        }

        $result = $provisioner->api()->post('/servers/' . rawurlencode($serverId) . '/actions', $body)['data'] ?? [];
        rdpmonster_log('ChangePassword', $params, ['serverId' => $serverId], ['ok' => !empty($result['password'])]);

        return 'success';
    } catch (ApiException $e) {
        throw new Exception(rdpmonster_friendly_error($e));
    }
}

function rdpmonster_ChangePackage(array $params)
{
    try {
        $provisioner = Provisioner::fromParams($params);
        $serverId = rdpmonster_server_id($params, $provisioner);

        $payload = Provisioner::buildPayload($params);
        $body = ['dryRun' => true];
        if (isset($payload['plan'])) {
            $body['plan'] = $payload['plan'];
        } elseif (isset($payload['custom'])) {
            $body['custom'] = $payload['custom'];
            $body['tier'] = $payload['tier'] ?? 'CLASSIC';
        } else {
            throw new ApiException('Package changes need a plan or a custom spec, not a reseller product');
        }

        $quote = $provisioner->api()->upgrade($serverId, $body);
        rdpmonster_log('ChangePackage quote', $params, $body, $quote);

        $body['dryRun'] = false;
        $provisioner->api()->upgrade($serverId, $body);
        Store::sync((int) $params['serviceid'], 'UPGRADING');

        return 'success';
    } catch (ApiException $e) {
        throw new Exception(rdpmonster_friendly_error($e));
    }
}

function rdpmonster_ClientArea(array $params): string
{
    global $CONFIG;

    $serviceId = (int) ($params['serviceid'] ?? 0);
    $serverId = Store::serverId($serviceId);
    $message = '';

    $action = isset($_POST['rdpmonster_action']) ? (string) $_POST['rdpmonster_action'] : '';
    if ($action !== '') {
        try {
            check_token('plain', (string) ($_POST['rdpmonster_token'] ?? ''));
            $provisioner = Provisioner::fromParams($params);
            if ($serverId === null) {
                throw new ApiException('This service is not linked to a server yet');
            }
            if (in_array($action, ['start', 'stop', 'shutdown', 'reboot'], true)) {
                $provisioner->api()->action($serverId, $action);
                $message = 'Action "' . htmlspecialchars($action, ENT_QUOTES) . '" sent';
            } elseif ($action === 'credentials') {
                $credentials = $provisioner->credentialsFor($serverId);
                $message = 'User: ' . htmlspecialchars((string) ($credentials['user'] ?? ''), ENT_QUOTES)
                    . ' — Password: ' . htmlspecialchars((string) ($credentials['password'] ?? ''), ENT_QUOTES);
            } elseif ($action === 'console') {
                $session = $provisioner->console($serverId);
                if (!empty($session['embedUrl'])) {
                    $message = 'Console: <a href="' . htmlspecialchars((string) $session['embedUrl'], ENT_QUOTES)
                        . '" target="_blank" rel="noopener">open (valid 5 minutes)</a>';
                } else {
                    $message = 'Console is not available right now';
                }
            }
        } catch (\Throwable $e) {
            $message = 'Error: ' . htmlspecialchars($e->getMessage(), ENT_QUOTES);
        }
    }

    $server = null;
    $serverIp = null;
    $error = null;
    $provisioner = Provisioner::fromParams($params);

    if ($serverId !== null) {
        try {
            $server = $provisioner->api()->server($serverId);
            $serverIp = $provisioner->primaryIp($server);
            Store::sync($serviceId, (string) ($server['status'] ?? 'UNKNOWN'), $serverIp);
        } catch (\Throwable $e) {
            $error = $e->getMessage();
        }
    }

    $token = generate_token('plain');
    $rows = [
        'Status' => is_array($server) ? ($server['status'] ?? 'unknown') : 'unknown',
        'Power' => is_array($server) ? ($server['power'] ?? 'unknown') : 'unknown',
        'IP address' => $serverIp ?? 'pending',
        'Plan' => is_array($server) ? ($server['plan'] ?? ($server['resellerProduct'] ?? 'custom')) : '—',
        'OS' => is_array($server) && isset($server['os']['name']) ? $server['os']['name'] : 'pending',
        'Expires' => is_array($server) ? ($server['expiresAt'] ?? '—') : '—',
    ];

    $html = '<div class="rdpmonster-panel">';
    if ($message !== '') {
        $html .= '<div class="alert alert-info">' . $message . '</div>';
    }
    if ($error !== null) {
        $html .= '<div class="alert alert-danger">' . htmlspecialchars($error, ENT_QUOTES) . '</div>';
    }

    $html .= '<table class="table table-striped"><tbody>';
    foreach ($rows as $label => $value) {
        $html .= '<tr><th>' . $label . '</th><td>' . htmlspecialchars((string) $value, ENT_QUOTES) . '</td></tr>';
    }
    $html .= '</tbody></table>';

    $html .= '<form method="post" class="form-inline">';
    $html .= '<input type="hidden" name="rdpmonster_token" value="' . $token . '">';
    foreach (['start' => 'Start', 'reboot' => 'Reboot', 'shutdown' => 'Shut down', 'credentials' => 'Show credentials', 'console' => 'Open console'] as $value => $label) {
        $html .= '<button class="btn btn-default" name="rdpmonster_action" value="' . $value . '" type="submit" style="margin-right:6px">' . $label . '</button>';
    }
    $html .= '</form></div>';

    return $html;
}

function rdpmonster_AdminServicesTabFields(array $params): array
{
    $serviceId = (int) ($params['serviceid'] ?? 0);
    $row = Store::row($serviceId);

    return [
        'RDP Monster server' => $row && $row->server_id ? htmlspecialchars((string) $row->server_id) : 'not linked',
        'Last known status' => $row ? htmlspecialchars((string) $row->status) : '—',
        'Primary IP' => $row && $row->primary_ip ? htmlspecialchars((string) $row->primary_ip) : '—',
        'Last error' => $row && $row->last_error ? htmlspecialchars((string) $row->last_error) : '—',
        'Last sync' => $row && $row->last_sync ? htmlspecialchars((string) $row->last_sync) : '—',
    ];
}

function rdpmonster_AdminCustomButtonArray(): array
{
    return [
        'Sync status' => 'Sync',
        'Reboot server' => 'Reboot',
        'Show credentials' => 'Credentials',
    ];
}

function rdpmonster_Sync(array $params)
{
    try {
        $provisioner = Provisioner::fromParams($params);
        $serverId = rdpmonster_server_id($params, $provisioner);
        $server = $provisioner->api()->server($serverId);
        Store::sync((int) $params['serviceid'], (string) ($server['status'] ?? 'UNKNOWN'), $provisioner->primaryIp($server));
        return 'Status: ' . ($server['status'] ?? 'unknown') . ', power: ' . ($server['power'] ?? 'unknown');
    } catch (ApiException $e) {
        throw new Exception(rdpmonster_friendly_error($e));
    }
}

function rdpmonster_Reboot(array $params)
{
    try {
        $provisioner = Provisioner::fromParams($params);
        $serverId = rdpmonster_server_id($params, $provisioner);
        $provisioner->api()->action($serverId, 'reboot');
        return 'Reboot sent';
    } catch (ApiException $e) {
        throw new Exception(rdpmonster_friendly_error($e));
    }
}

function rdpmonster_Credentials(array $params)
{
    try {
        $provisioner = Provisioner::fromParams($params);
        $serverId = rdpmonster_server_id($params, $provisioner);
        $credentials = $provisioner->credentialsFor($serverId);
        return 'User: ' . ($credentials['user'] ?? '?') . ' / Password: ' . ($credentials['password'] ?? '?');
    } catch (ApiException $e) {
        throw new Exception(rdpmonster_friendly_error($e));
    }
}

function rdpmonster_TestConnection(array $params): array
{
    try {
        $provisioner = Provisioner::fromParams($params);
        $account = $provisioner->api()->account();
        $reseller = $account['reseller'] ?? null;
        $tier = is_array($reseller) ? ($reseller['tier'] ?? 'none') : 'none';
        $discount = is_array($reseller) ? (int) ($reseller['discountPercent'] ?? 0) : 0;
        $balance = number_format(((int) ($account['balanceCents'] ?? 0)) / 100, 2);

        return [
            'success' => true,
            'error' => '',
            'balance' => '$' . $balance,
            'tier' => $tier . ' (' . $discount . '%)',
        ];
    } catch (ApiException $e) {
        return ['success' => false, 'error' => rdpmonster_friendly_error($e)];
    }
}

function rdpmonster_run_action(array $params, string $action, string $okMessage): string
{
    try {
        $provisioner = Provisioner::fromParams($params);
        $serverId = rdpmonster_server_id($params, $provisioner);
        $provisioner->api()->action($serverId, $action);
        rdpmonster_log('action ' . $action, $params, ['serverId' => $serverId], ['ok' => true]);
        return 'success';
    } catch (ApiException $e) {
        throw new Exception(rdpmonster_friendly_error($e));
    }
}

function rdpmonster_server_id(array $params, Provisioner $provisioner): string
{
    $serviceId = (int) ($params['serviceid'] ?? 0);
    $serverId = Store::serverId($serviceId);

    if ($serverId === null && !empty($params['username'])) {
        $serverId = (string) $params['username'];
    }

    if ($serverId === null) {
        throw new ApiException('No RDP Monster server is linked to this service');
    }

    return $serverId;
}

function rdpmonster_friendly_error(ApiException $e): string
{
    if ($e->isInsufficientBalance()) {
        return 'RDP Monster account balance is too low to complete this order. Top up the reseller balance and try again.';
    }
    if ($e->isAuthError()) {
        return 'RDP Monster rejected the API token (' . $e->errorCode . '). Check the token scopes and IP allowlist.';
    }
    if ($e->isRateLimited()) {
        return 'RDP Monster rate limited this request. Wait a moment and retry.';
    }
    return $e->getMessage() !== '' ? $e->getMessage() : 'Unexpected RDP Monster error';
}

function rdpmonster_log(string $action, array $params, array $request, array $response): void
{
    if (!function_exists('logModuleCall')) {
        return;
    }

    logModuleCall(
        'rdpmonster',
        $action,
        $request,
        $response,
        '',
        [(string) ($params['serveraccesshash'] ?? ''), (string) ($params['serverpassword'] ?? '')]
    );
}
