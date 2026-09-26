# @pipeworx/rdap

[RDAP](https://www.icann.org/rdap) MCP — Registration Data Access Protocol queries for domains, IPs, ASNs and nameservers. The structured-JSON successor to WHOIS, answered by the registry's own service. Keyless.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1683+ live data sources.

## Tools

- `domain(name | domain, base?)` — domain registration record: registrar, registration/expiry dates, nameservers, status. A registry 404 is an **answer**, not an error — it comes back as `{registered: false}`, which is what makes availability sweeps work.
- `ip(address | ip)` — IP / netblock allocation record
- `asn(number)` — ASN allocation record
- `entity(handle, base?)` — registry entity by handle (e.g. registrant id)
- `nameserver(host, base?)` — nameserver (glue) record, where the registry supports it

## Auth

None. Every endpoint queried is a public registry RDAP service.

## TLD coverage — and the gap in IANA's bootstrap

Server discovery normally goes through [IANA's RDAP bootstrap](https://www.iana.org/dynamic/rdap/)
(`https://data.iana.org/rdap/dns.json`, cached 24h). **That file is incomplete.** As of
publication 2026-07-23 it lists 1,200 of the 1,438 delegated TLDs; the 238 it omits are
almost entirely ccTLDs that never registered their RDAP endpoint with IANA. Measured
against the Majestic Million on 2026-08-30, those 238 TLDs carry **23.4% of the world's
most-linked domains** — including `.io`, `.de`, `.us`, `.me` and `.ru`.

So the pack carries `FALLBACK_BASES` (see `src/index.ts`): registry RDAP endpoints for
TLDs IANA omits. IANA is still consulted first, so the map goes quiet on its own the day
a registry is added upstream. Currently covered beyond IANA:

| Base | TLDs |
|---|---|
| `rdap.identitydigital.services/rdap` | `.ac` `.ag` `.bz` `.gi` `.io` `.lc` `.me` `.mn` `.sc` `.sh` `.vc` |
| `rdap.denic.de` | `.de` |
| `rdap.nic.ch` / `rdap.nic.li` | `.ch` `.li` |
| `rdap.nic.us` | `.us` |
| `rdap.nic.kz` | `.kz` |
| `rdap.sgnic.sg/rdap` | `.sg` |
| `rdap.mynic.my/rdap` | `.my` |
| `rdap.website.ws` | `.ws` |

**Adding a TLD to that map — read this first.** Verify by fetching
`<base>/domain/<a-name-you-know-is-REGISTERED>` and requiring **HTTP 200 with a real
record**. `rdap.identitydigital.services` returns a well-formed RDAP **404 for TLDs it
does not serve**, so a 404 there is indistinguishable from "this domain is unregistered".
A wrong base URL therefore does not error — it reports every registered domain in that
TLD as available. That is the failure this pack is built to avoid.

Many ccTLDs run **no public RDAP service** at all. Probed 2026-08-30, the conventional
`rdap.*` hostnames for `.ru`, `.it`, `.eu`, `.se` and `.co` do not resolve (NXDOMAIN), so
there is nothing to add to the map for them. For
those, `domain` returns `{found: false, reason: "tld_not_in_iana_bootstrap"}` with a
message saying the gap is IANA's rather than ours, plus a `hint`: pass the registry's own
endpoint as `base` if you know it, otherwise use that registry's WHOIS page. It
deliberately does **not** throw — an upstream registry gap is not a Pipeworx defect and
should not book as one.

## Data sources

- IANA RDAP bootstrap: <https://data.iana.org/rdap/dns.json> (+ `ipv4`, `ipv6`, `asn`)
- IANA delegated-TLD list: <https://data.iana.org/TLD/tlds-alpha-by-domain.txt>
- Individual RIR / registry RDAP servers reached via the above

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "rdap": {
      "url": "https://gateway.pipeworx.io/rdap/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/rdap/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1683+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/rdap_domain \
  -H 'Content-Type: application/json' \
  -d '{"name":"example.com"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/rdap_domain`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "rdap": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-rdap"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-rdap
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Rdap data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
