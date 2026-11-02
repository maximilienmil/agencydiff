import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LiveEvent } from "@agencydiff/core";

export function encodeSse(event: LiveEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function parseSseChunk(text: string): LiveEvent[] {
  const out: LiveEvent[] = [];
  for (const block of text.split("\n\n")) {
    const data = block.split("\n").find((l) => l.startsWith("data:"));
    if (!data) continue;
    try { out.push(JSON.parse(data.slice(5).trim()) as LiveEvent); } catch { /* partial */ }
  }
  return out;
}

const MIME: Record<string, string> = { ".png": "image/png", ".json": "application/json" };

export class LiveHub {
  private clients = new Set<(chunk: string) => void>();
  private buffer: LiveEvent[] = [];
  private server: Server | null = null;
  readonly port: number;
  private traceRoot: string | null = null;

  constructor(port = 5175) { this.port = port; }

  get url(): string { return `http://localhost:${this.port}`; }
  get eventCount(): number { return this.buffer.length; }
  buffered(): LiveEvent[] { return [...this.buffer]; }

  emit(event: LiveEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > 2000) this.buffer.splice(0, this.buffer.length - 2000);
    const chunk = encodeSse(event);
    for (const send of this.clients) { try { send(chunk); } catch { /* closed */ } }
  }

  serveTraces(root: string): void { this.traceRoot = path.resolve(root); }

  async start(): Promise<string> {
    if (this.server) return this.url;
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", this.url);
      res.setHeader("access-control-allow-origin", "*");
      if (url.pathname === "/health") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, events: this.buffer.length })); return; }
      if (url.pathname === "/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        for (const e of this.buffer) res.write(encodeSse(e));
        const send = (c: string) => res.write(c);
        this.clients.add(send);
        req.on("close", () => this.clients.delete(send));
        return;
      }
      if (url.pathname.startsWith("/traces/") && this.traceRoot) {
        const rel = decodeURIComponent(url.pathname.slice("/traces/".length));
        const file = path.resolve(this.traceRoot, rel);
        if (!file.startsWith(this.traceRoot)) { res.writeHead(403); res.end(); return; }
        readFile(file).then((buf) => { res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" }); res.end(buf); }, () => { res.writeHead(404); res.end(); });
        return;
      }
      res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "not found" }));
    });
    await new Promise<void>((resolve, reject) => { this.server!.once("error", reject); this.server!.listen(this.port, resolve); });
    return this.url;
  }

  async close(): Promise<void> {
    this.clients.clear();
    if (!this.server) return;
    const s = this.server; this.server = null;
    await new Promise<void>((r) => s.close(() => r()));
  }
}

export function livePortFrom(values: { live?: boolean; "live-port"?: string }): number | null {
  if (!values.live) return null;
  const p = Number(values["live-port"] ?? 5175);
  if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error(`--live-port must be 1-65535 (got ${values["live-port"]})`);
  return p;
}
