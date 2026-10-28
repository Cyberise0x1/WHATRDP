# RDP Monster — WHMCS provisioning module

Sells rdp.monster Windows RDP, Linux VPS and dedicated servers through WHMCS.
Orders are paid from your reseller balance the moment the invoice is paid, and
credentials are delivered to the client automatically.

## What you get

```
modules/servers/rdpmonster/
  rdpmonster.php          module hooks (create, suspend, terminate, client area)
  lib/ApiClient.php       HTTP client: retries, 429 handling, label-based dedupe
  lib/Provisioner.php     payload building, cycle mapping, provisioning wait
  lib/Store.php           mod_rdpmonster_services table (service <-> server id)
  lib/ApiException.php    typed API errors
modules/addons/rdpmonster/
  rdpmonster.php          activation, settings, service list
  webhook.php             HMAC-verified webhook receiver
```

## Install

1. Copy `modules/servers/rdpmonster` into your WHMCS `modules/servers/` folder.
2. Copy `modules/addons/rdpmonster` into your WHMCS `modules/addons/` folder.
3. **System Settings → Addon Modules → RDP Monster → Activate.**
   Paste your webhook signing secret into its settings.
4. **System Settings → Servers → Add New Server:**
   - Module: `RDP Monster`
   - Hostname: `dashboard.rdp.monster`
   - **Access Hash: your `rdpm_…` API token** (this is the field the module reads)
   - Leave Username/Password empty

   Use the module's *Test Connection* button — it reports your balance and
   reseller tier, which confirms the token and scopes are right.
5. **Products/Services → Create Product** (type: Server), then in the
   *Module Settings* tab pick the server and fill in the config options.

## Config options per product

| Option | Meaning |
| --- | --- |
| Offer source | `plan` (platform SKU), `resellerproduct` (your own offer), `custom` |
| Plan / offer slug | e.g. `europe/1` or `starter-eu` |
| OS template | `windows-2022`, `ubuntu-24-04`, … |
| Extra IPv4 | billed at $1.75/mo each, max 30 |
| Custom: region / tier / vCPU / RAM / disk | only used when source is `custom` |
| Label prefix | server label becomes `<prefix>-<serviceid>` |
| Provisioning timeout | seconds to wait for `ACTIVE` (default 120) |

Billing cycle maps automatically: Monthly → `MONTHLY`, Quarterly →
`QUARTERLY`, Semi-Annually → `SEMIANNUALLY`, Annually → `ANNUALLY`, Biennially
→ `BIENNIALLY`, Triennially → `TRIENNIALLY`.

## How provisioning behaves

- On payment, WHMCS calls *Create Account* → `POST /servers` → polls until
  `ACTIVE` → fetches credentials → stores them on the service.
- If the account balance is too low the API returns `402`, and the module
  surfaces a clear "top up the reseller balance" error instead of a raw code.
- If a creation request fails with a 5xx, the module **does not blindly retry**.
  It searches `GET /servers` for the same label for up to 15 seconds and
  attaches to that server if found, otherwise fails loudly so you can reconcile
  manually. This is what stops duplicate servers being billed to you.
- Suspend → `shutdown`, Unsuspend → `start`, Terminate → `DELETE /servers/:id`.
- Client area gives status, IP, plan, OS, expiry, plus start/reboot/shutdown,
  credentials and a 5-minute white-label console link.
- Admin service tab shows the linked server id, last status, IP and last error,
  with *Sync status*, *Reboot* and *Show credentials* buttons.

## Webhooks

In the RDP Monster client area create a webhook pointing at:

```
https://your-whmcs.example.com/modules/addons/rdpmonster/webhook.php
```

Put the same signing secret into the addon settings, and subscribe to
`server.created`, `server.delivered`, `server.renewed`, `server.deleted`,
`server.suspended`, `service.expiring`.

The receiver verifies `x-rdpm-signature` (HMAC-SHA256 over
`timestamp + "." + rawBody`), rejects anything older than 5 minutes, updates the
service status, and on `server.created` / `server.delivered` pulls the
credentials into the WHMCS service automatically.

## Before going live

- Fund the reseller balance — every order is prepaid from it.
- Keep WHMCS's *Auto Setup* enabled for the product.
- Set a `Label prefix` unique per product so dedupe searches stay unambiguous.
- Watch for `402 insufficient_balance` in **Utilities → Logs → Module Log**;
  that is the one failure that silently stops sales.
- White-label the console: the links the API returns never mention rdp.monster.

## Requirements

WHMCS 8.x on PHP 8.1+, `curl` and `json` extensions.
