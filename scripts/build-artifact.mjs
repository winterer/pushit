// Baut eine Einzeldatei-Version (JS + CSS inline, ohne Service Worker),
// z. B. zum schnellen Ausprobieren als gehostete Seite.
// Aufruf: node scripts/build-artifact.mjs <ausgabe.html>
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = process.argv[2] ?? "pushit-single.html";
const dir = mkdtempSync(join(tmpdir(), "pushit-artifact-"));
execSync(`npx vite build --base ./ --outDir ${dir} --emptyOutDir`, {
  stdio: "inherit",
  env: { ...process.env, VITE_NO_SW: "1" },
});
const assets = readdirSync(join(dir, "assets"));
const read = (ext) =>
  assets.filter((f) => f.startsWith("index-") && f.endsWith(ext)).map((f) => readFileSync(join(dir, "assets", f), "utf8")).join("\n");
const css = read(".css");
const js = read(".js").replace(/<\/script/gi, "<\\/script");

writeFileSync(
  out,
  `<title>PushIt Liegestütz-Trainer</title>
<meta name="theme-color" content="#0b0f17">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`,
);
console.log(`→ ${out} (${(readFileSync(out).length / 1024).toFixed(0)} KB)`);
