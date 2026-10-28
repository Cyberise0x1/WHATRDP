<?php
declare(strict_types=1);

namespace RdpMonster;

use WHMCS\Database\Capsule;

final class Store
{
    private const TABLE = 'mod_rdpmonster_services';

    public static function ensure(): void
    {
        if (Capsule::schema()->hasTable(self::TABLE)) {
            return;
        }

        Capsule::schema()->create(self::TABLE, function ($table): void {
            $table->integer('serviceid')->primary();
            $table->string('server_id')->nullable()->index();
            $table->string('status')->default('PENDING');
            $table->string('primary_ip')->nullable();
            $table->string('last_error')->nullable();
            $table->timestamp('last_sync')->nullable();
        });
    }

    public static function link(int $serviceId, string $serverId, string $status, ?string $ip = null): void
    {
        self::ensure();
        $now = date('Y-m-d H:i:s');

        if (Capsule::table(self::TABLE)->where('serviceid', $serviceId)->exists()) {
            Capsule::table(self::TABLE)->where('serviceid', $serviceId)->update([
                'server_id' => $serverId,
                'status' => $status,
                'primary_ip' => $ip,
                'last_error' => null,
                'last_sync' => $now,
            ]);
            return;
        }

        Capsule::table(self::TABLE)->insert([
            'serviceid' => $serviceId,
            'server_id' => $serverId,
            'status' => $status,
            'primary_ip' => $ip,
            'last_sync' => $now,
        ]);
    }

    public static function sync(int $serviceId, string $status, ?string $ip = null, ?string $error = null): void
    {
        self::ensure();

        $update = [
            'status' => $status,
            'last_sync' => date('Y-m-d H:i:s'),
        ];
        if ($ip !== null) {
            $update['primary_ip'] = $ip;
        }
        if ($error !== null) {
            $update['last_error'] = $error;
        }

        Capsule::table(self::TABLE)->where('serviceid', $serviceId)->update($update);
    }

    public static function serverId(int $serviceId): ?string
    {
        self::ensure();
        $row = Capsule::table(self::TABLE)->where('serviceid', $serviceId)->first();
        return $row && $row->server_id ? (string) $row->server_id : null;
    }

    public static function serviceIdForServer(string $serverId): ?int
    {
        self::ensure();
        $row = Capsule::table(self::TABLE)->where('server_id', $serverId)->first();
        return $row ? (int) $row->serviceid : null;
    }

    public static function row(int $serviceId): ?object
    {
        self::ensure();
        return Capsule::table(self::TABLE)->where('serviceid', $serviceId)->first();
    }

    public static function all(): array
    {
        self::ensure();
        return Capsule::table(self::TABLE)->orderByDesc('last_sync')->limit(200)->get()->all();
    }
}
