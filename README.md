# @pipeworx/rdap

[RDAP](https://www.icann.org/rdap) MCP — Registration Data Access Protocol queries for domains, IPs, and ASNs. Successor to WHOIS, returns structured JSON. Keyless (uses IANA bootstrap).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `domain(name)` — domain registration record
- `ip(address)` — IP / netblock allocation record
- `asn(number)` — ASN allocation record
- `entity(handle, base?)` — registry entity by handle (e.g. registrant id)
- `nameserver(host)` — nameserver record (where supported)

## Data source

Bootstrapped via [IANA RDAP bootstrap files](https://www.iana.org/dynamic/rdap/) → individual RIR / registry RDAP servers.

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Rdap data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
