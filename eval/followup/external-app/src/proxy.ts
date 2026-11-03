import http from "node:http";

/**
 * Overlay proxy for the external-app pilot. Forwards every request to the
 * pristine baseline ntfy container and injects one variant `patch.js` into
 * served HTML. Variants therefore differ ONLY in the UI overlay.
 *
 * Binds 127.0.0.1 exclusively; streaming (non-HTML) bodies are piped
 * byte-identical so ntfy's streaming /json endpoints keep working.
 */
export interface ProxyConfig {
  upstreamHost: string;
  upstreamPort: number;
  patchJs: string;
}

const PATCH_PATH = "/extapp-patch.js";
const INJECT_TAG = `<script src="${PATCH_PATH}"></script>`;

export function injectPatch(html: string): string {
  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx === -1) return html + INJECT_TAG;
  return html.slice(0, idx) + INJECT_TAG + html.slice(idx);
}

export function startOverlayProxy(config: ProxyConfig, port: number): Promise<http.Server> {
  const server = http.createServer((clientReq, clientRes) => {
    if (clientReq.url === PATCH_PATH && clientReq.method === "GET") {
      const body = config.patchJs;
      clientRes.writeHead(200, {
        "content-type": "application/javascript; charset=utf-8",
        "content-length": Buffer.byteLength(body),
        "cache-control": "no-store",
      });
      clientRes.end(body);
      return;
    }
    const headers = { ...clientReq.headers };
    delete headers["accept-encoding"]; // force identity so HTML edits stay byte-safe
    delete headers["host"];
    delete headers["connection"];
    const proxyReq = http.request(
      {
        host: config.upstreamHost,
        port: config.upstreamPort,
        path: clientReq.url,
        method: clientReq.method,
        headers,
      },
      (upstreamRes) => {
        const contentType = String(upstreamRes.headers["content-type"] ?? "");
        if (contentType.includes("text/html")) {
          const chunks: Buffer[] = [];
          upstreamRes.on("data", (c: Buffer) => chunks.push(c));
          upstreamRes.on("end", () => {
            const html = Buffer.concat(chunks).toString("utf-8");
            const patched = injectPatch(html);
            const outHeaders = { ...upstreamRes.headers };
            delete outHeaders["content-length"];
            delete outHeaders["content-encoding"];
            delete outHeaders["transfer-encoding"];
            const buf = Buffer.from(patched, "utf-8");
            outHeaders["content-length"] = String(buf.length);
            clientRes.writeHead(upstreamRes.statusCode ?? 502, outHeaders);
            clientRes.end(buf);
          });
          upstreamRes.on("error", () => clientRes.destroy());
          return;
        }
        // Non-HTML (API, SSE/streaming, assets): pipe byte-identical.
        const outHeaders = { ...upstreamRes.headers };
        delete outHeaders["content-length"]; // length may shift upstream; chunk it
        clientRes.writeHead(upstreamRes.statusCode ?? 502, outHeaders);
        upstreamRes.pipe(clientRes);
      },
    );
    proxyReq.on("error", () => {
      if (!clientRes.headersSent) clientRes.writeHead(502);
      clientRes.end("overlay proxy: upstream unreachable");
    });
    clientReq.pipe(proxyReq);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

export async function stopServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
