// Zero-dependency static file server for the SusBench lab pages.
// Serves eval/susbench/pages over localhost. No logging, no fallback routes:
// unknown paths are 404, so probes cannot wander off the lab.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const PAGES = path.resolve(import.meta.dirname, "pages");

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
]);

export function createLabServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (rel === "" || rel.endsWith("/")) rel += "index.html";
      // Confine to the pages directory: no absolute paths, no parent escapes.
      const file = path.normalize(path.join(PAGES, rel));
      if (!file.startsWith(PAGES + path.sep)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) {
        res.writeHead(404).end("not found");
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME.get(path.extname(file)) ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.env.SUSBENCH_PORT ?? 5183);
  createLabServer().listen(port, () => console.log(`susbench lab: http://localhost:${port}/`));
}
