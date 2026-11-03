import http from "node:http";
import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { injectPatch, startOverlayProxy, stopServer } from "../src/proxy.js";

describe("injectPatch", () => {
  it("inserts the patch script tag before </body>", () => {
    const out = injectPatch("<html><body><p>hi</p></body></html>");
    expect(out).toContain('<script src="/extapp-patch.js"></script></body>');
  });

  it("appends when no body tag exists", () => {
    const out = injectPatch("<html><p>hi</p></html>");
    expect(out.endsWith('<script src="/extapp-patch.js"></script>')).toBe(true);
  });

  it("matches case-insensitively", () => {
    const out = injectPatch("<HTML></BODY></HTML>");
    expect(out).toContain('<script src="/extapp-patch.js"></script>');
  });
});

describe("overlay proxy against stub backend", () => {
  let backend: http.Server;
  let backendPort = 0;
  let proxy: http.Server;
  let proxyPort = 0;

  beforeAll(async () => {
    backend = http.createServer((req, res) => {
      if (req.url === "/") {
        const body = "<html><body>ntfy</body></html>";
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-length": Buffer.byteLength(body),
        });
        res.end(body);
      } else if (req.url === "/topic/json?since=all&poll=1") {
        const body = '{"event":"message"}\n';
        res.writeHead(200, { "content-type": "application/json" });
        res.end(body);
      } else {
        res.writeHead(404);
        res.end("nope");
      }
    });
    await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
    backendPort = (backend.address() as { port: number }).port;
    proxy = await startOverlayProxy(
      { upstreamHost: "127.0.0.1", upstreamPort: backendPort, patchJs: "/*v*/" },
      0,
    );
    proxyPort = (proxy.address() as { port: number }).port;
  });

  afterAll(async () => {
    await stopServer(proxy);
    await new Promise<void>((resolve, reject) =>
      backend.close((e) => (e ? reject(e) : resolve())),
    );
  });

  it("binds loopback only", () => {
    expect((proxy.address() as { address: string }).address).toBe("127.0.0.1");
  });

  it("injects the patch into served HTML", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/`);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('<script src="/extapp-patch.js"></script>');
    expect(text).toContain("ntfy");
  });

  it("serves the variant patch with no-store JS content type", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/extapp-patch.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/javascript");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("/*v*/");
  });

  it("pipes API responses byte-identical", async () => {
    const via = await fetch(`http://127.0.0.1:${proxyPort}/topic/json?since=all&poll=1`);
    const direct = await fetch(`http://127.0.0.1:${backendPort}/topic/json?since=all&poll=1`);
    expect(via.status).toBe(direct.status);
    expect(await via.text()).toBe(await direct.text());
  });

  it("passes through upstream error statuses", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/missing`);
    expect(res.status).toBe(404);
  });

  it("pipes websocket upgrades to upstream", async () => {
    const upgradeBackend = http.createServer();
    await new Promise<void>((resolve) => upgradeBackend.listen(0, "127.0.0.1", resolve));
    const upstreamPort = (upgradeBackend.address() as { port: number }).port;
    const backendSockets = new Set<import("node:net").Socket>();
    upgradeBackend.on("connection", (s) => {
      backendSockets.add(s);
      s.on("close", () => backendSockets.delete(s));
    });
    upgradeBackend.on("upgrade", (req, sock) => {
      sock.end("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nUPSTREAM-HELLO");
    });
    const wsProxy = await startOverlayProxy(
      { upstreamHost: "127.0.0.1", upstreamPort, patchJs: "" },
      0,
    );
    const wsPort = (wsProxy.address() as { port: number }).port;
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const s = net.connect(wsPort, "127.0.0.1", () => {
          s.write(
            "GET /topic/ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
          );
        });
        let buf = "";
        s.on("data", (c) => {
          buf += c.toString();
          if (buf.includes("UPSTREAM-HELLO")) resolve(buf);
        });
        s.on("error", reject);
      });
      expect(raw).toContain("101 Switching Protocols");
      expect(raw).toContain("UPSTREAM-HELLO");
    } finally {
      await stopServer(wsProxy);
      for (const s of backendSockets) s.destroy();
      await new Promise<void>((resolve, reject) =>
        upgradeBackend.close((e) => (e ? reject(e) : resolve())),
      );
    }
  });
});
