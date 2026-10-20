/** Single-page demo UI. Plain HTML/JS, no external assets. Output is rendered with textContent only. */
export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ToolCargo Demo</title>
<style>
:root{--bg:#f7f7f4;--fg:#1d1d1b;--muted:#6b6b66;--card:#fff;--line:#e2e2dc;--accent:#d9480f}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ecece8;--muted:#9a9a94;--card:#1e1e1c;--line:#33332f;--accent:#ff8a4c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px}h1{margin:0 0 4px;font-size:26px}.muted{color:var(--muted)}
.badge{display:inline-block;font-size:12px;padding:2px 8px;border:1px solid var(--accent);color:var(--accent);border-radius:999px;margin-left:8px;vertical-align:middle}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin:20px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;cursor:pointer}
.card[aria-pressed=true]{border-color:var(--accent)}.icon{font-weight:700;color:var(--accent)}
.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}
select,textarea,button{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px;width:100%}
textarea{min-height:110px;font-family:ui-monospace,monospace;font-size:13px}button{background:var(--accent);color:#fff;border:0;width:auto;padding:8px 18px;cursor:pointer;margin-top:10px}
pre{white-space:pre-wrap;word-break:break-word;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;font-size:13px;max-height:480px;overflow:auto}
label{display:block;margin:10px 0 4px;font-weight:600}
</style></head><body><main>
<h1>ToolCargo <span class="badge">portfolio / demo edition</span></h1>
<p class="muted">Genuine ToolCargo connector code served over MCP. <span id="mode"></span> The hosted product is at <a href="https://toolcargo.com">toolcargo.com</a>.</p>
<div class="grid" id="grid"></div>
<div class="panel">
<label for="tool">Tool</label><select id="tool"></select>
<p class="muted" id="desc"></p>
<label for="args">Arguments (JSON)</label><textarea id="args"></textarea>
<button id="run">Run tool</button>
<label>Result</label><pre id="out">Pick a tool and run it.</pre>
</div></main>
<script>
const examples={audit_page:{url:"https://example.com/"},check_links:{url:"https://example.com/",scope:"all",max_links:10},check_crawl_rules:{url:"https://example.com/",user_agent:"Googlebot"},check_social_preview:{url:"https://example.com/"},search_publications:{query:"connector reliability",limit:2},publication_details:{doi:"10.5555/demo.2024.001"},europe_pmc_search_publications:{query:"reproducible demos",limit:1},europe_pmc_publication_details:{source:"MED",id:"90000001"},python_package_details:{name:"example-package"},compare_python_packages:{names:["alpha-demo","beta-demo"]}};
const $=id=>document.getElementById(id);let tools=[];
function pickConnector(c){document.querySelectorAll(".card").forEach(e=>e.setAttribute("aria-pressed",e.dataset.slug===c.slug));$("tool").replaceChildren(...c.tools.map(n=>{const o=document.createElement("option");o.value=o.textContent=n;return o}));pickTool()}
function pickTool(){const n=$("tool").value,t=tools.find(x=>x.name===n);$("desc").textContent=t?t.description:"";$("args").value=JSON.stringify(examples[n]||{},null,2)}
fetch("/api/catalog").then(r=>r.json()).then(d=>{tools=d.tools;$("mode").textContent=d.mode==="live"?"Live mode: calls the real public APIs.":"Offline mode: answers come from synthetic fixtures.";
d.connectors.forEach(c=>{const el=document.createElement("div");el.className="card";el.dataset.slug=c.slug;el.tabIndex=0;el.setAttribute("role","button");
const i=document.createElement("div");i.className="icon";i.textContent=c.icon;const h=document.createElement("strong");h.textContent=c.name;const p=document.createElement("div");p.className="muted";p.textContent=c.tagline;
el.append(i,h,p);el.onclick=()=>pickConnector(c);el.onkeydown=e=>{if(e.key==="Enter")pickConnector(c)};$("grid").append(el)});pickConnector(d.connectors[0])});
$("tool").onchange=pickTool;
$("run").onclick=async()=>{let args;try{args=JSON.parse($("args").value)}catch{ $("out").textContent="Arguments must be valid JSON.";return}
$("out").textContent="Running...";const r=await fetch("/api/call",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:$("tool").value,arguments:args})});const d=await r.json();
$("out").textContent=d.error?d.error:(d.content||[]).map(c=>c.text).join("\\n")+(d.isError?"\\n\\n(tool returned an error)":"")};
</script></body></html>`;
