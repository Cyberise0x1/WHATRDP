<?php
declare(strict_types=1);

namespace RdpMonster;

final class Provisioner
{
    public function __construct(private ApiClient $api)
    {
    }

    public function api(): ApiClient
    {
        return $this->api;
    }

    public static function fromParams(array $params, int $timeout = 30, int $maxRetries = 3): self
    {
        $baseUrl = (string) ($params['serverhostname'] ?? '');
        $token = (string) ($params['serveraccesshash'] ?? '');
        if ($token === '') {
            $token = (string) ($params['serverpassword'] ?? '');
        }

        return new self(new ApiClient($token, $baseUrl, $timeout, $maxRetries));
    }

    public static function mapCycle(string $billingCycle): string
    {
        return match (strtolower(trim($billingCycle))) {
            'quarterly' => 'QUARTERLY',
            'semiannually' => 'SEMIANNUALLY',
            'annually' => 'ANNUALLY',
            'biennially' => 'BIENNIALLY',
            'triennially' => 'TRIENNIALLY',
            default => 'MONTHLY',
        };
    }

    public static function buildPayload(array $params): array
    {
        $offerType = strtolower(trim((string) ($params['configoption1'] ?? 'plan')));
        $slug = trim((string) ($params['configoption2'] ?? ''));
        $os = trim((string) ($params['configoption3'] ?? '')) ?: 'ubuntu-24-04';
        $extraIps = max(0, (int) ($params['configoption4'] ?? 0));

        $label = trim((string) ($params['configoption10'] ?? ''));
        if ($label === '') {
            $label = 'whmcs-' . (int) ($params['serviceid'] ?? 0);
        } else {
            $label .= '-' . (int) ($params['serviceid'] ?? 0);
        }

        $payload = [
            'os' => $os,
            'cycle' => self::mapCycle((string) ($params['billingcycle'] ?? 'Monthly')),
            'label' => $label,
            'quantity' => 1,
        ];

        if ($extraIps > 0) {
            $payload['addons'] = ['IP' => min(30, $extraIps)];
        }

        if ($offerType === 'custom') {
            $payload['region'] = trim((string) ($params['configoption5'] ?? 'europe')) ?: 'europe';
            $payload['tier'] = strtoupper(trim((string) ($params['configoption6'] ?? 'CLASSIC'))) ?: 'CLASSIC';
            $payload['custom'] = [
                'cpuCores' => max(1, (int) ($params['configoption7'] ?? 2)),
                'ramMb' => max(1024, ((int) ($params['configoption8'] ?? 4)) * 1024),
                'diskGb' => max(20, (int) ($params['configoption9'] ?? 40)),
                'ipv4Count' => max(1, $extraIps ?: 1),
            ];
            if (isset($payload['addons'])) {
                unset($payload['addons']);
            }
        } elseif ($offerType === 'resellerproduct') {
            if ($slug === '') {
                throw new ApiException('No reseller product slug configured for this product');
            }
            $payload['resellerProduct'] = $slug;
        } else {
            if ($slug === '') {
                throw new ApiException('No plan SKU configured for this product');
            }
            $payload['plan'] = $slug;
        }

        return $payload;
    }

    public function create(array $params): array
    {
        $payload = self::buildPayload($params);
        $response = $this->api->createServer($payload);
        $server = $response['data'] ?? [];

        $serviceId = (int) ($params['serviceid'] ?? 0);
        if ($serviceId > 0 && !empty($server['id'])) {
            Store::link($serviceId, (string) $server['id'], (string) ($server['status'] ?? 'PENDING'));
        }

        return $response;
    }

    public function waitForActive(string $serverId, int $timeoutSeconds = 120, int $interval = 5): array
    {
        $deadline = time() + max(10, $timeoutSeconds);

        do {
            $server = $this->api->server($serverId);
            $status = (string) ($server['status'] ?? '');

            if ($status === 'ACTIVE') {
                return $server;
            }
            if (in_array($status, ['FAILED', 'TERMINATED', 'CANCELLED'], true)) {
                throw new ApiException('Server entered status ' . $status . ' during provisioning');
            }
            if (time() >= $deadline) {
                return $server;
            }
            sleep($interval);
        } while (true);
    }

    public function credentialsFor(string $serverId): array
    {
        return $this->api->credentials($serverId);
    }

    public function primaryIp(array $server): ?string
    {
        foreach (($server['ips'] ?? []) as $ip) {
            if (!empty($ip['primary'])) {
                return (string) $ip['address'];
            }
        }
        return isset($server['ips'][0]['address']) ? (string) $server['ips'][0]['address'] : null;
    }
}
