import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadVideoData } from "../src/data.js";
import { loadFootage } from "../src/footage.js";

const videoDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
console.log(JSON.stringify({ data: loadVideoData(join(videoDir, "..")), footage: loadFootage(join(videoDir, "public")) }, null, 2));
