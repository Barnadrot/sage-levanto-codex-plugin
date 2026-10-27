import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const modules = process.env.SAGE_RENDER_MODULES;
if (!modules) throw new Error("Set SAGE_RENDER_MODULES to the bundled node_modules directory.");
const sharpUrl = pathToFileURL(path.join(modules, "sharp", "dist", "index.mjs")).href;
const sharp = (await import(sharpUrl)).default;
const input = new URL("../reports/sage-recruiter-screener-x.svg", import.meta.url);
const output = new URL("../reports/sage-recruiter-screener-x.png", import.meta.url);
const result = await sharp(fileURLToPath(input), { density: 144 }).png({ compressionLevel: 9 }).toFile(fileURLToPath(output));
console.log(JSON.stringify({ output: output.pathname, width: result.width, height: result.height, bytes: result.size }, null, 2));
