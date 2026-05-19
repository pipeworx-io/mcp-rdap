interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * RDAP MCP — Registration Data Access Protocol via IANA bootstrap.
 */


const UA = 'pipeworx-mcp-rdap/1.0 (+https://pipeworx.io)';
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const BOOTSTRAPS = {
  dns: 'https://data.iana.org/rdap/dns.json',
  ipv4: 'https://data.iana.org/rdap/ipv4.json',
  ipv6: 'https://data.iana.org/rdap/ipv6.json',
  asn: 'https://data.iana.org/rdap/asn.json',
};
const CACHE: Partial<Record<keyof typeof BOOTSTRAPS, { at: number; services: [string[], string[]][] }>> = {};

const tools: McpToolExport['tools'] = [
  { name: 'domain', description: 'Domain registration record.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'ip', description: 'IP/netblock allocation record.', inputSchema: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] } },
  { name: 'asn', description: 'ASN allocation record.', inputSchema: { type: 'object', properties: { number: { type: 'number' } }, required: ['number'] } },
  { name: 'entity', description: 'Entity by handle. Pass base RDAP url to skip bootstrap.', inputSchema: { type: 'object', properties: { handle: { type: 'string' }, base: { type: 'string' } }, required: ['handle'] } },
  { name: 'nameserver', description: 'Nameserver record.', inputSchema: { type: 'object', properties: { host: { type: 'string' } }, required: ['host'] } },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'domain': {
      const d = reqStr(args, 'name', '"example.com"').toLowerCase();
      const tld = d.split('.').pop() ?? '';
      const base = await pickBootstrap('dns', tld);
      if (!base) throw new Error(`RDAP: no DNS bootstrap for ".${tld}"`);
      return rdapGet(`${trimSlash(base)}/domain/${encodeURIComponent(d)}`);
    }
    case 'ip': {
      const ip = reqStr(args, 'address', '"8.8.8.8"');
      const family = ip.includes(':') ? 'ipv6' : 'ipv4';
      const base = await pickBootstrap(family, ip);
      if (!base) throw new Error(`RDAP: no ${family} bootstrap for ${ip}`);
      return rdapGet(`${trimSlash(base)}/ip/${encodeURIComponent(ip)}`);
    }
    case 'asn': {
      const n = (args.number as number) | 0;
      if (!n) throw new Error('Required argument "number" must be a positive ASN.');
      const base = await pickBootstrap('asn', String(n));
      if (!base) throw new Error(`RDAP: no ASN bootstrap for ${n}`);
      return rdapGet(`${trimSlash(base)}/autnum/${n}`);
    }
    case 'entity': {
      const handle = reqStr(args, 'handle', '"<handle>"');
      const base = (args.base as string | undefined) ?? 'https://rdap.arin.net/registry';
      return rdapGet(`${trimSlash(base)}/entity/${encodeURIComponent(handle)}`);
    }
    case 'nameserver': {
      const host = reqStr(args, 'host', '"ns1.example.com"');
      const tld = host.split('.').pop() ?? '';
      const base = await pickBootstrap('dns', tld);
      if (!base) throw new Error(`RDAP: no DNS bootstrap for ".${tld}"`);
      return rdapGet(`${trimSlash(base)}/nameserver/${encodeURIComponent(host)}`);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function pickBootstrap(kind: keyof typeof BOOTSTRAPS, key: string): Promise<string | null> {
  const now = Date.now();
  const c = CACHE[kind];
  if (!c || now - c.at >= BOOTSTRAP_TTL_MS) {
    const res = await fetch(BOOTSTRAPS[kind], { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`RDAP bootstrap ${kind}: ${res.status}`);
    const json = (await res.json()) as { services: [string[], string[]][] };
    CACHE[kind] = { at: now, services: json.services };
  }
  const services = CACHE[kind]!.services;
  // For DNS: keys are TLDs (e.g. "com"). Match exact (case-insensitive).
  // For IP: keys are CIDRs. Simple longest-prefix match (basic IPv4; IPv6 falls through to first).
  if (kind === 'dns') {
    const lc = key.toLowerCase();
    for (const [keys, urls] of services) if (keys.map((k) => k.toLowerCase()).includes(lc)) return urls[0];
    return null;
  }
  if (kind === 'asn') {
    const n = parseInt(key, 10);
    for (const [keys, urls] of services) {
      for (const range of keys) {
        const [lo, hi] = range.split('-').map((x) => parseInt(x, 10));
        if (n >= lo && n <= (Number.isFinite(hi) ? hi : lo)) return urls[0];
      }
    }
    return null;
  }
  // ipv4 / ipv6: best-effort first match (longest-prefix match left as future improvement).
  for (const [keys, urls] of services) {
    for (const cidr of keys) {
      if (ipInCidr(key, cidr)) return urls[0];
    }
  }
  return services[0]?.[1]?.[0] ?? null;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [net, prefix] = cidr.split('/');
  const p = parseInt(prefix, 10);
  if (ip.includes(':') !== net.includes(':')) return false;
  if (!ip.includes(':')) {
    const toN = (s: string) => s.split('.').reduce((a, x) => (a << 8) + parseInt(x, 10), 0) >>> 0;
    const mask = p === 0 ? 0 : (~0 << (32 - p)) >>> 0;
    return (toN(ip) & mask) === (toN(net) & mask);
  }
  // crude IPv6 prefix-match on hex strings
  const exp = (s: string) => {
    const parts = s.split('::');
    let head = parts[0] ? parts[0].split(':') : [];
    let tail = parts[1] ? parts[1].split(':') : [];
    while (head.length + tail.length < 8) head.push('0');
    return [...head, ...tail].map((p) => p.padStart(4, '0')).join('');
  };
  const a = exp(ip);
  const b = exp(net);
  const hexBits = Math.ceil(p / 4);
  return a.slice(0, hexBits) === b.slice(0, hexBits);
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

async function rdapGet(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/rdap+json, application/json', 'User-Agent': UA } });
  if (res.status === 404) throw new Error('RDAP: not found');
  if (!res.ok) throw new Error(`RDAP: ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
  return res.json();
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Required argument "${key}" is missing. Pass a string like ${example}.`);
  return v;
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
