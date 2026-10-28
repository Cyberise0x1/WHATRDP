<?php
declare(strict_types=1);

namespace RdpMonster;

class ApiException extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status = 0,
        public readonly string $errorCode = '',
        public readonly ?string $ref = null,
        public readonly array $payload = []
    ) {
        parent::__construct($message);
    }

    public function isAuthError(): bool
    {
        return in_array($this->status, [401, 403], true);
    }

    public function isInsufficientBalance(): bool
    {
        return $this->status === 402 || $this->errorCode === 'insufficient_balance';
    }

    public function isRateLimited(): bool
    {
        return $this->status === 429;
    }

    public function isNotFound(): bool
    {
        return $this->status === 404 || $this->errorCode === 'not_found';
    }
}
