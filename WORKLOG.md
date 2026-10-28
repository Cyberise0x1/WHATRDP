# rdp.monster reseller — work log

Running record of discovery, decisions and open items for the remote-server
reselling business built on rdp.monster wholesale.

**Never write secret values in this file.** Credentials live in Replit secrets
only: `RDP_MONSTER_EMAIL`, `RDP_MONSTER_PASSWORD`, `RDP_MONSTER_API_KEY`.

---

## 2026-10-28 — discovery session

### Goal

Determine what is required to start reselling rdp.monster servers, and decide
between renting a VPS to subdivide versus reselling their inventory.

### Findings

**Panel**
- Client area is `https://dashboard.rdp.monster` (Next.js app behind Cloudflare).
- `manager.rdp.monster` is an alias of the same application, not a separate
  WHMCS install. There is one panel only.
- Login is protected by Cloudflare Turnstile. A headless browser cannot pass it
  (`Captcha verification failed`), so login must be done by a human in a real
  browser. Credentials were confirmed working by the account holder.

**API**
- Base URL: `https://dashboard.rdp.monster/api/v1`
- OpenAPI document: `GET /api/v1/openapi.json` (public, no auth required)
- Auth: `Authorization: Bearer rdpm_<32 chars>`
- Token scopes: `vps:read`, `vps:write`, `billing:read`
- Rate limit: 120 requests/minute per token; `429` with `Retry-After`
- All amounts are integer cents (USD)
- Lists are paginated with `page` / `perPage` (max 200) and return `meta`
- Billing periods: `MONTHLY`, `QUARTERLY`, `SEMIANNUALLY`, `ANNUALLY`,
  `BIENNIALLY`, `TRIENNIALLY`
- Errors: `{ "error": "<code>", "message": "…" }`

### Endpoint surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/account` | Balance, active services, unpaid invoices |
| GET | `/catalog` | Products, regions, plans (SKUs), OS templates, custom limits, reseller products, tier |
| GET | `/servers` | List servers |
| POST | `/servers` | Create one or more servers, paid from balance |
| GET | `/servers/{id}` | Details, IPs, resources, status |
| PATCH | `/servers/{id}` | Rename, tag, toggle auto-renewal |
| DELETE | `/servers/{id}` | Cancel and destroy immediately |
| GET | `/dedicated/offers` | Dedicated offers with stock and reseller price |
| POST | `/dedicated` | Order a dedicated server |
| GET | `/servers/{id}/install` | Reinstall/rescue status on dedicated |
| POST | `/servers/{id}/rescue` | Boot into or out of rescue mode |
| POST | `/servers/{id}/actions` | Power and access actions |
| GET | `/servers/{id}/reinstall` | Allowed OS templates |
| POST | `/servers/{id}/reinstall` | Reinstall with another OS (same IPs) |
| POST | `/servers/{id}/upgrade` | Quote or apply upgrade |
| GET/POST/DELETE | `/servers/{id}/downgrade` | Quote, schedule, cancel downgrade |
| GET | `/servers/{id}/metrics` | CPU, RAM, disk %, network (1h / 24h / 7d) |
| POST | `/servers/{id}/console` | White-label console session |
| POST | `/servers/{id}/renew` | Renew now for a period |
| POST | `/servers/{id}/cancel` | Stop at period end or destroy now |
| GET | `/invoices` | Invoices with items |
| GET | `/invoices/{id}` | One invoice with lines |
| POST | `/invoices/{id}/pay` | Pay unpaid invoice from balance |
| GET/POST | `/servers/{id}/ips` | List, add IPv4, change one |

Server creation accepts three shapes: a catalog plan (`plan` + `os` + `cycle`),
one of your own reseller offers (`resellerProduct` + `os`), or custom specs
(`region` + `tier` + `custom{cpuCores,ramMb,diskGb,ipv4Count}` + `os`).
`dryRun: true` returns the discounted quote without ordering.

### API key status — BLOCKED

The stored `RDP_MONSTER_API_KEY` is a 32-character string with no prefix. The
API requires the `rdpm_` prefix, so it is sent as `rdpm_<key>`. Format
validation passes, but the token lookup fails:

```
401 {"error":"unauthorized","message":"Token revoked or unknown"}
```

Interpretation: the token was revoked/deleted, or it was issued to a different
account. A token generated in the panel is currently **not** visible to this
shell — the environment still exposes the old value.

Verification one-liner:

```bash
curl -s "https://dashboard.rdp.monster/api/v1/account" \
  -H "Authorization: Bearer $RDP_MONSTER_API_KEY"
```

Expected on success: `200` with balance and service data.

### Decisions

- **Resell inventory rather than subdividing a self-managed VPS.** Zero capex,
  ~10s provisioning, provider carries hardware and Windows licensing. Owning
  the hypervisor only becomes rational past roughly 20 servers/month.

### Open items

- [ ] Update the `RDP_MONSTER_API_KEY` secret with the full `rdpm_…` token and
      restart the shell so the new value is picked up.
- [ ] Confirm the token carries `vps:read`, `vps:write`, `billing:read`.
- [ ] `openapi.md` was mentioned as uploaded but is not present in the
      workspace. Re-upload or keep using `/api/v1/openapi.json`.
- [ ] Confirm reseller access is approved (not just a standard client account).
- [ ] Fund the prepaid balance before the first order.

---

## Program economics (from rdp.monster)

Discount is applied to orders, renewals, upgrades, add-ons and IPs, and is
driven by rolling 30-day top-ups.

| Tier | 30-day top-ups | Discount |
| --- | --- | --- |
| Bronze | $0–100 | 15% |
| Silver | $100–300 | 20% |
| Gold | $300–600 | 25% |
| Platinum | $600–1,200 | 30% |
| Diamond | $1,200–2,500 | 35% |
| Emerald | $2,500–5,000 | 40% |
| Ruby | $5,000–10,000 | 45% |
| Obsidian | $10,000+ | 50% |

Public plans (list price): Basic $8.99 (2c/6GB/40GB), Standard $16.99
(4c/8GB/70GB), Pro $29.99 (6c/12GB/90GB), Advanced $41.99 (12c/24GB/150GB),
Elite $82.99 (24c/64GB/200GB). Extra IPv4 is $1.75/month.

Margin reality check: at Bronze, Basic costs $7.64, so the spread is $1.35 per
server per month before your own markup. This is a volume business.

The provider's own example offers: `starter-eu` (2 vCPU / 4 GB / 60 GB) costs
$9.74 and retails $14.90; `trader-ny` (4 vCPU / 8 GB / 100 GB HP) costs $19.49
and retails $29.00; `bot-farm` (8 vCPU / 16 GB / 200 GB) costs $37.49 and
retails $54.00.

## Launch checklist

1. Reseller access approved — free, but gated behind a manual review of markets,
   sales channels and expected volume.
2. Valid `rdpm_` API token with all three scopes.
3. Prepaid balance funded by card, PayPal or crypto.
4. Storefront: WHMCS with the free provisioning module, Blesta/HostBill, or a
   custom panel against the REST API.
5. Own payment processing and support desk — the provider stays invisible and
   the customer relationship is ours.
6. Webhook endpoint for provisioning events (HMAC-SHA256 signed, auto-retried).

## Risk notes

- Provider is explicitly no-KYC and crypto-friendly; abuse-prone customers will
  gravitate here and the reseller of record absorbs that exposure.
- Billing is prepaid, so inventory must be funded before it sells.
- White-label means support and disputes are ours, not theirs.
