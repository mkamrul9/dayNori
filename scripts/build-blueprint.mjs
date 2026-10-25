import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'docs/roadmap/plan.json'), 'utf8'));
const data = JSON.stringify(plan).replaceAll('<', '\\u003c');
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daynori · Product blueprint</title>
<style>
:root{color-scheme:light;--bg:#F7F5EF;--surface:#fff;--ink:#172C2C;--secondary:#526363;--line:#D7DEDA;--accent:#146B63;--soft:#E6F0EB;--warn:#895617}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent);text-underline-offset:3px}
button{font:inherit;cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
header{max-width:1200px;margin:auto;padding:48px 32px 24px}
.eyebrow{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--secondary)}
h1{font-size:38px;line-height:1.15;margin:12px 0 16px;font-weight:650}
h2{font-size:23px;margin:0 0 14px;font-weight:600}
h3{font-size:18px;margin:0 0 10px}
p{margin:0 0 16px}
.intro{max-width:680px;color:var(--secondary)}
.status{display:inline-block;padding:6px 12px;background:var(--soft);color:var(--accent);border-radius:5px;font-size:14px;margin:8px 0 16px}
main{max-width:1200px;padding:12px 32px 48px;margin:auto}
.architecture{display:grid;grid-template-columns:1fr 1.6fr;gap:40px;padding:30px 0 38px;border-top:1px solid var(--line)}
.stack{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.layer{padding:18px;background:var(--surface);border:1px solid var(--line);border-radius:8px}
.layer small{display:block;color:var(--secondary);margin-top:5px}
.layer.wide{grid-column:1/-1}
.callout{border-left:3px solid var(--accent);padding-left:16px;margin:24px 0;color:var(--secondary)}
.roadmap{border-top:1px solid var(--line);padding-top:30px}
.groups{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}
.group{padding:8px 12px;min-height:44px;background:transparent;border:1px solid var(--line);color:var(--ink);border-radius:6px;font-size:14px}
.group[aria-pressed=true]{background:var(--accent);color:white;border-color:var(--accent)}
.explorer{display:grid;grid-template-columns:330px 1fr;gap:24px;align-items:start}
.phase-list{max-height:580px;overflow:auto;display:flex;flex-direction:column;gap:5px;padding:4px}
.phase{background:transparent;border:0;border-radius:5px;text-align:left;padding:12px;color:var(--ink);display:flex;gap:12px;min-height:48px}
.phase[aria-pressed=true]{background:var(--soft);color:var(--accent)}
.phase .num{font-variant-numeric:tabular-nums;color:var(--secondary)}
.detail{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:26px;min-height:410px}
.detail h2{margin:6px 0 12px}
.detail h3{margin-top:22px}
ul,ol{padding-left:22px}
li{margin:7px 0}
.meta{font-size:14px;color:var(--secondary)}
.commit{background:var(--bg);padding:12px;border-radius:5px;font:13px/1.6 ui-monospace,monospace;overflow-wrap:anywhere}
.reading{display:flex;flex-wrap:wrap;gap:10px 20px;margin-top:26px}
.reading a{font-size:14px}
footer{border-top:1px solid var(--line);margin-top:40px;padding-top:20px;font-size:14px;color:var(--secondary)}
@media(max-width:800px){header{padding:28px 20px 18px}main{padding:12px 20px 32px}h1{font-size:30px}.architecture{grid-template-columns:1fr;gap:20px}.explorer{grid-template-columns:1fr}.phase-list{max-height:240px}.detail{padding:20px}.stack{gap:8px}}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#0D1919;--surface:#132323;--ink:#E9F0ED;--secondary:#AEC0BB;--line:#40574B;--accent:#73C2B6;--soft:#26443A;--warn:#E0BC7C}.group[aria-pressed=true]{color:#0D1919}}
</style>
</head>
<body>
<header>
<div class="eyebrow">Daynori · Original baseline 13 October 2026 · V2 plan 25 October 2026</div>
<h1>Your day, gathered.</h1>
<p class="intro">One customizable home for everyday work and reflection. A focused personal organizer first, with more powerful capabilities introduced through deliberate release gates.</p>
<span class="status">Specification explorer · ${plan.phases.length} bounded phases</span>
<p class="meta">Working name. Brand clearance and production validation remain pending.</p>
</header>
<main>
<section class="architecture" aria-labelledby="architecture-title">
<div>
<h2 id="architecture-title">One source of truth.<br>Two interfaces that fit.</h2>
<p>Shared rules and contracts keep web and mobile consistent. Dedicated interfaces preserve native interaction quality and a comfortable desktop workspace.</p>
<div class="callout">Unified folders can hold a PDF, a note and a task. Notes, Tasks and Journal are focused views of authorized canonical records.</div>
<p class="meta">A testing preview exists with open release gates. V2 is planned; specifications do not establish completion. Read the progress register and phase reports for actual evidence.</p>
</div>
<div class="stack">
<div class="layer"><h3>Android first</h3>Expo · React Native<small>SQLite · native reminders · accessible touch</small></div>
<div class="layer"><h3>Responsive web</h3>Next.js · React<small>IndexedDB · browser capabilities · keyboard</small></div>
<div class="layer wide"><h3>Shared TypeScript</h3>Domain rules · contracts · synchronization · semantic design tokens</div>
<div class="layer wide"><h3>Modular backend</h3>Fastify API + durable worker<small>Authorized requests · mutation receipts · jobs · private uploads</small></div>
<div class="layer wide"><h3>Managed foundation</h3>Supabase Auth · PostgreSQL · private object storage<small>Tenant isolation · tested backups · ciphertext-only vault later</small></div>
</div>
</section>
<section class="roadmap" aria-labelledby="roadmap-title">
<h2 id="roadmap-title">Explore the delivery roadmap</h2>
<p class="meta">Choose a group, then a phase. Each phase produces its own evidence report and one reviewed local commit.</p>
<nav id="groups" class="groups" aria-label="Roadmap groups"></nav>
<div class="explorer">
<nav id="phase-list" class="phase-list" aria-label="Phases in selected group"></nav>
<article id="phase-detail" class="detail" aria-live="polite" aria-atomic="true"></article>
</div>
</section>
<nav class="reading" aria-label="Documentation">
<a href="README.md">Documentation index</a><a href="roadmap/v2/README.md">Version 2 plan</a><a href="roadmap/README.md">Full roadmap</a><a href="roadmap/progress.json">Actual progress</a><a href="product/requirements.md">Product requirements</a><a href="design/design-system.md">Design direction</a><a href="architecture/system-overview.md">Architecture</a><a href="engineering/handoff.md">Contributor handoff</a>
</nav>
<footer>Specs describe planned behavior. Progress and phase reports document actual delivery. Vault encryption, Drive folder access, notification timing, store policy, billing and AI each have explicit feasibility or release gates.</footer>
</main>
<script type="application/json" id="roadmap-data">${data}</script>
<script>
'use strict';
const plan=JSON.parse(document.getElementById('roadmap-data').textContent);
const groups=document.getElementById('groups');
const list=document.getElementById('phase-list');
const detail=document.getElementById('phase-detail');
const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const bullets=(items,ordered=false)=>'<'+(ordered?'ol':'ul')+'>'+items.map(s=>'<li>'+escapeText(s)+'</li>').join('')+'</'+(ordered?'ol':'ul')+'>';
let selectedGroup=plan.groups.some(g=>g.id==='v2-foundations')?'v2-foundations':'planning';
let selectedPhase=selectedGroup==='v2-foundations'?'64':'00';
function renderPhase(){
 const p=plan.phases.find(p=>p.id===selectedPhase);
 for(const button of list.children)button.setAttribute('aria-pressed',String(button.dataset.phase===p.id));
 detail.innerHTML='<div class="eyebrow">Phase '+p.id+' · '+escapeText(plan.groups.find(g=>g.id===p.group).title)+'</div><h2>'+escapeText(p.title)+'</h2><p class="meta">Prerequisites: '+(p.dependsOn.length?p.dependsOn.join(', '):'none')+' · Specification only; see progress for delivery status</p><h3>Implementation</h3>'+bullets(p.steps,true)+'<h3>Acceptance</h3>'+bullets(p.acceptance)+'<h3>Verification</h3>'+bullets(p.checks)+'<h3>Commit target</h3><div class="commit">'+escapeText(p.commit)+'</div><p style="margin-top:20px"><a href="roadmap/phases/'+p.id+'-'+slug(p.title)+'.md">Open full phase specification</a></p>';
}
function renderGroup(){
 for(const button of groups.children)button.setAttribute('aria-pressed',String(button.dataset.group===selectedGroup));
 list.replaceChildren();
 const phases=plan.phases.filter(p=>p.group===selectedGroup);
 if(!phases.some(p=>p.id===selectedPhase))selectedPhase=phases[0].id;
 for(const phase of phases){
  const button=document.createElement('button');button.className='phase';button.dataset.phase=phase.id;
  button.innerHTML='<span class="num">'+phase.id+'</span><span>'+escapeText(phase.title)+'</span>';
  button.addEventListener('click',()=>{selectedPhase=phase.id;renderPhase()});list.appendChild(button);
 }
 renderPhase();
}
for(const group of plan.groups){
 const button=document.createElement('button');button.className='group';button.dataset.group=group.id;
 button.textContent=group.title+' · '+group.range;
 button.addEventListener('click',()=>{selectedGroup=group.id;renderGroup()});groups.appendChild(button);
}
renderGroup();
</script>
</body>
</html>
`;
const target = path.join(root, 'docs/blueprint.html');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== page) {
    console.error('Blueprint is stale; run node scripts/build-blueprint.mjs');
    process.exitCode = 1;
  } else console.log('Blueprint is current.');
} else {
  fs.writeFileSync(target, page);
  console.log('Built interactive planning blueprint.');
}
