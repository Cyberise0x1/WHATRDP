# Hosting choice for WHMCS

Decision record, 2026-10-28. Evaluated against WHMCS 9.1 system requirements,
not marketing copy.

## The hard requirements

WHMCS 9.x self-hosted will not install unless the host offers:

| Requirement | Value |
| --- | --- |
| PHP | **8.2, 8.3 or 8.4** only |
| ionCube Loader | **15.0.0 or higher** |
| MySQL | 5.7 minimum, 8.x recommended, `utf8_unicode_ci`, strict mode off |
| Web server | Apache 2.x with `mod_rewrite`, `.htaccess` AllowOverride |
| PHP extensions | curl, gd2, imap, json, pdo_mysql (mysqlnd), xml, bcmath, fileinfo, gmp, iconv, intl, mbstring, openssl, soap |
| Other | cron jobs, 128 MB+ memory, outbound HTTPS |

The ionCube version is the usual trap: plenty of cPanel hosts still run loader
13 or 14, which silently breaks WHMCS 9.

## Reframe: do you even need reseller hosting?

You are selling Windows RDP and Linux VPS, not shared cPanel accounts. What you
actually need is **a home for WHMCS**: one PHP application plus a MySQL
database. A reseller plan is simply a convenient vehicle because it usually
bundles a WHMCS licence, gives you cPanel/WHM, and leaves room to resell shared
hosting later as an upsell.

A $6–15/month VPS running LAMP would also work, but you would buy the WHMCS
licence separately — currently **$34.95/month** for self-hosted Plus (250 active
clients).

## The five candidates

| Provider | WHMCS licence | Price | Verdict |
| --- | --- | --- | --- |
| **SkyNetHosting** | Bundled free (Starter tier) | $9.95/mo cheap, $26.95/mo business after promo | **Best fit** |
| PeekHosting | Not included (+$34.95) | $9 budget, $32 business | Good host, more expensive total |
| OKHoster | Bundled free | $2.29–$13.94/mo | Cheapest, highest risk — avoid for billing |
| hosting.com | Not included | Not a reseller product | Not applicable |
| Facebook "fb-answers" page | n/a | n/a | Login wall, no content |

### SkyNetHosting — recommended

- 20+ years trading, 4-star Trustpilot across 111 reviews
- cPanel + WHM + LiteSpeed + CloudLinux, JetBackup, US/EU/Asia locations
- **WHMCS licence bundled** with every reseller plan
- 30-day money back, 1-hour response guarantee, 24/7 live chat
- $9.95/mo Cheap Reseller (25 GB NVMe, 5 cPanel accounts) is enough for one
  WHMCS install plus your marketing site
- $26.95/mo Business Reseller (250 GB, 25 accounts) if you expect to host
  customer sites or grow

Caveats:

- The headline $6.95 is a first-month promo; recurring is $26.95–$39.95.
- The bundled WHMCS is described as a **Starter** licence "valued $15.95".
  WHMCS no longer sells that tier, so confirm the active-client cap in writing
  before you depend on it.
- Their site leans hard on promotional banners — read the renewal price.

### PeekHosting — solid runner-up

- 14+ years, 2,500+ customers, genuine cPanel/WHM, LiteSpeed, Imunify360,
  weekly backups to Google Drive
- Budget Reseller from $9, Business Reseller from $32
- No WHMCS included, so add $34.95/month: $44–67/month total
- Better if you value a calm, established host over the lowest total cost

### OKHoster — do not run your billing on this

- $2.29–$13.94/month with "unmetered" disks, bandwidth and inodes
- DMCA-ignored hosting, master and alpha reseller tiers
- 13 Trustpilot reviews, small Facebook presence
- Unmetered at $2.29 is oversold by definition, and the DMCA-ignored audience
  carries IP-reputation risk. Fine for a throwaway test site; wrong place for
  the system that handles your customer payments and credentials.

### hosting.com — not applicable

Consumer and SMB shared hosting with an AI assistant. No cPanel/WHM reseller
tier, no WHMCS bundling, and it is priced for the US small-business market.

### The Facebook link — not evaluable

`web.facebook.com/fb-answers/...` resolves to a login wall and returns no
article content. Nothing to assess.

## Pre-purchase questions to ask SkyNetHosting

Ask in a presales ticket and keep the reply:

1. Do reseller plans offer **PHP 8.2/8.3/8.4 with ionCube Loader 15.0.0+**?
   (If not, WHMCS 9.x cannot install.)
2. Which **WHMCS licence tier** is included, and what is its active-client cap?
3. Is **outbound HTTPS** from the account unrestricted? WHMCS must reach
   `dashboard.rdp.monster`.
4. Are **cron jobs** allowed at 5-minute intervals?
5. Is hosting a WHMCS that provisions **external servers** (not their cPanel)
   acceptable under the AUP?
6. What is the **renewal price** after the promotional term?

## Cost comparison, first year

| Option | Monthly | Year one |
| --- | --- | --- |
| SkyNetHosting Cheap Reseller (WHMCS included) | $9.95 | ~$119 |
| SkyNetHosting Business Reseller (WHMCS included) | $26.95 | ~$323 |
| PeekHosting Budget + WHMCS Plus | $43.95 | ~$527 |
| OKHoster Enhanced + free WHMCS | $7.00 | ~$84 (high risk) |
| Own VPS + WHMCS Plus | $6–15 + $34.95 | ~$490–600 |

The bundled-licence options are roughly a third of the cost of buying WHMCS
separately, which is the whole reason reseller hosting wins here.

## Recommendation

Start on **SkyNetHosting's $9.95 Cheap Reseller plan**, after confirming points
1–3 above. It bundles the licence, costs less than buying WHMCS alone, and the
30-day money-back window means a bad fit costs nothing.

Move to the Business Reseller plan only when you need more cPanel accounts or
want to host customer sites. If SkyNetHosting cannot confirm ionCube 15, fall
back to PeekHosting and budget for the WHMCS licence, or run WHMCS on a small
VPS where you control the PHP and ionCube versions yourself.
