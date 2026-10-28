<?php
declare(strict_types=1);

namespace RdpMonster;

final class ApiClient
{
    private string $baseUrl;
    private string $token;
    private int $timeout;
    private int $maxRetries;

    public function __construct(
        string $token,
        string $baseUrl = 'https://dashboard.rdp.monster/api/v1',
        int $timeout = 30,
        int $maxRetries = 3
    ) {
        $this->token = trim($token);
        $this->baseUrl = rtrim(self::normaliseBaseUrl($baseUrl), '/');
        $this->timeout = max(5, $timeout);
        $this->maxRetries = max(0, $maxRetries);

        if ($this->token === '') {
            throw new ApiException('RDP Monster API token is not configured');
        }
    }

    public static function normaliseBaseUrl(string $input): string
    {
        $url = trim($input);
        if ($url === '') {
            return 'https://dashboard.rdp.monster/api/v1';
        }
        if (!preg_match('#^https?://#i', $url)) {
            $url = 'https://' . $url;
        }
        $url = rtrim($url, '/');
        if (!str_ends_with($url, '/api/v1')) {
            $url .= '/api/v1';
        }
        return $url;
    }

    public function request(
        string $method,
        string $path,
        ?array $body = null,
        array $query = [],
        bool $retryOnServerError = true
    ): array {
        $url = $this->baseUrl . $path;
        if ($query !== []) {
            $url .= '?' . http_build_query($query);
        }

        $attempt = 0;
        while (true) {
            $attempt++;
            [$status, $raw, $headers] = $this->send($method, $url, $body);

            if ($status >= 200 && $status < 300) {
                $decoded = json_decode($raw, true);
                return is_array($decoded) ? $decoded : [];
            }

            $payload = json_decode($raw, true);
            $payload = is_array($payload) ? $payload : [];
            $code = (string) ($payload['error'] ?? '');
            $message = (string) ($payload['message'] ?? '');
            if ($message === '') {
                $message = $code !== '' ? $code : 'RDP Monster API returned HTTP ' . $status;
            }

            if ($status === 429 && $attempt <= $this->maxRetries) {
                $retryAfter = (int) ($headers['retry-after'] ?? 2);
                sleep(max(1, min(30, $retryAfter)));
                continue;
            }

            if ($status >= 500 && $attempt <= $this->maxRetries && $retryOnServerError) {
                usleep(250000 * (2 ** ($attempt - 1)));
                continue;
            }

            throw new ApiException(
                $message,
                $status,
                $code,
                isset($payload['ref']) ? (string) $payload['ref'] : null,
                $payload
            );
        }
    }

    public function get(string $path, array $query = []): array
    {
        return $this->request('GET', $path, null, $query);
    }

    public function post(string $path, array $body = []): array
    {
        return $this->request('POST', $path, $body);
    }

    public function delete(string $path): array
    {
        return $this->request('DELETE', $path);
    }

    public function catalog(): array
    {
        return $this->get('/catalog')['data'] ?? [];
    }

    public function account(): array
    {
        return $this->get('/account')['data'] ?? [];
    }

    public function server(string $id): array
    {
        return $this->get('/servers/' . rawurlencode($id))['data'] ?? [];
    }

    public function servers(array $query = []): array
    {
        return $this->get('/servers', $query);
    }

    public function quote(array $payload): array
    {
        $payload['dryRun'] = true;
        return $this->request('POST', '/servers', $payload)['data'] ?? [];
    }

    public function createServer(array $payload): array
    {
        try {
            return $this->request('POST', '/servers', $payload, [], false);
        } catch (ApiException $e) {
            if ($e->status < 500) {
                throw $e;
            }
            $existing = $this->findServerByLabel((string) ($payload['label'] ?? ''), 15);
            if ($existing !== null) {
                return ['data' => $existing, 'servers' => [$existing], 'recovered' => true];
            }
            throw new ApiException(
                'Server creation returned ' . $e->status . ' and no matching server appeared. '
                . 'Check GET /servers before retrying to avoid a duplicate.',
                $e->status,
                'create_uncertain',
                $e->ref,
                $e->payload
            );
        }
    }

    public function findServerByLabel(string $label, int $waitSeconds = 0): ?array
    {
        if ($label === '') {
            return null;
        }
        $deadline = time() + max(0, $waitSeconds);
        do {
            $response = $this->get('/servers', ['perPage' => 200, 'page' => 1]);
            foreach (($response['data'] ?? []) as $server) {
                if (($server['label'] ?? null) === $label) {
                    return $server;
                }
            }
            if (time() >= $deadline) {
                break;
            }
            sleep(3);
        } while (true);

        return null;
    }

    public function action(string $id, string $action, array $extra = []): array
    {
        return $this->post(
            '/servers/' . rawurlencode($id) . '/actions',
            array_merge(['action' => $action], $extra)
        )['data'] ?? [];
    }

    public function credentials(string $id): array
    {
        return $this->action($id, 'credentials');
    }

    public function reinstall(string $id, string $os): array
    {
        return $this->post('/servers/' . rawurlencode($id) . '/reinstall', ['os' => $os]);
    }

    public function renew(string $id, ?string $cycle = null, bool $dryRun = false): array
    {
        $body = ['dryRun' => $dryRun];
        if ($cycle !== null) {
            $body['cycle'] = $cycle;
        }
        return $this->post('/servers/' . rawurlencode($id) . '/renew', $body)['data'] ?? [];
    }

    public function cancel(string $id, string $when = 'end_of_period'): array
    {
        return $this->post('/servers/' . rawurlencode($id) . '/cancel', ['when' => $when])['data'] ?? [];
    }

    public function upgrade(string $id, array $body): array
    {
        return $this->post('/servers/' . rawurlencode($id) . '/upgrade', $body);
    }

    public function console(string $id): array
    {
        return $this->post('/servers/' . rawurlencode($id) . '/console')['data'] ?? [];
    }

    private function send(string $method, string $url, ?array $body): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new ApiException('Unable to initialise cURL');
        }

        $headers = [
            'Authorization: Bearer ' . $this->token,
            'Accept: application/json',
            'Content-Type: application/json',
            'User-Agent: rdpmonster-whmcs/1.0',
        ];

        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HEADER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ];

        if ($body !== null) {
            $options[CURLOPT_POSTFIELDS] = json_encode($body, JSON_THROW_ON_ERROR);
        }

        $responseHeaders = [];
        $options[CURLOPT_HEADERFUNCTION] = static function ($curl, string $header) use (&$responseHeaders): int {
            $parts = explode(':', $header, 2);
            if (count($parts) === 2) {
                $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
            }
            return strlen($header);
        };

        curl_setopt_array($ch, $options);
        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($errno !== 0) {
            throw new ApiException('Network error talking to RDP Monster: ' . $error, 0, 'network_error');
        }

        return [$status, (string) $raw, $responseHeaders];
    }
}
