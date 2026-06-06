/** Tiny zero-dependency server: serves web/index.html + JSON API for the engine. */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { FRAMEWORKS, CATEGORIES, PRESET_CHAINS } from "./src/catalog.js";
import { getProvider } from "./src/providers/index.js";
import { createEngine } from "./src/engine.js";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const provider = getProvider();
const engine = createEngine(provider);
const PORT = Number(process.env.PORT || 3030);

const json = (res, code, data) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
};
const body = req => new Promise(r => {
  let b = ""; req.on("data", c => b += c); req.on("end", () => r(b ? JSON.parse(b) : {}));
});

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(readFileSync(new URL("./web/index.html", import.meta.url)));
    }
    if (req.method === "GET" && req.url === "/api/catalog") {
      return json(res, 200, { frameworks: FRAMEWORKS, categories: CATEGORIES, presets: PRESET_CHAINS, provider: provider.name });
    }
    if (req.method === "POST" && req.url === "/api/run") {
      const { mode, ids, inputs, opts } = await body(req);
      if (mode === "single") return json(res, 200, await engine.runSingle(ids[0], inputs, opts));
      if (mode === "all")    return json(res, 200, { results: await engine.runAll(ids, inputs, opts) });
      if (mode === "chain")  return json(res, 200, await engine.runChain(ids, inputs, opts));
      return json(res, 400, { error: "mode must be single|all|chain" });
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}).listen(PORT, () => console.log(`framework-lab UI → http://localhost:${PORT}  (provider: ${provider.name})`));
