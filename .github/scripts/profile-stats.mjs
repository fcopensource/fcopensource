// Draws the profile's live cards (activity, stats, languages) from public GitHub data.
// Run by .github/workflows/profile.yml; the SVGs are published to the "output" branch.
import fs from "node:fs";

const LOGIN = process.env.LOGIN || "fcopensource";
const OUT = process.env.OUT || "dist";
const FONT = `-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US");

const QUERY = `query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 100, orderBy: { field: PUSHED_AT, direction: DESC }) {
      totalCount
      nodes { stargazerCount languages(first: 8, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } } }
    }
    contributionsCollection {
      totalCommitContributions totalPullRequestContributions totalIssueContributions restrictedContributionsCount
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
  }
}`;

async function load() {
  if (process.env.FIXTURE) return JSON.parse(fs.readFileSync(process.env.FIXTURE, "utf8"));
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json", "User-Agent": "fcopensource-profile" },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub API: ${res.status} ${JSON.stringify(json.errors || json)}`);
  return json.data.user;
}

function streaks(days) {
  let longest = 0, run = 0;
  for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let current = 0, i = days.length - 1;
  if (i >= 0 && days[i].contributionCount === 0) i--; // today may not have activity yet
  for (; i >= 0 && days[i].contributionCount > 0; i--) current++;
  const active = days.filter(d => d.contributionCount > 0).length;
  return { current, longest, active };
}

const frame = (w, h, title, sub, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<style>.f{font-family:${FONT}} .grow{animation:grow 1.2s cubic-bezier(.2,.8,.2,1) both;transform-box:fill-box;transform-origin:bottom} @keyframes grow{from{transform:scaleY(0)}}
.draw{stroke-dasharray:4000;stroke-dashoffset:4000;animation:draw 2.4s ease forwards} @keyframes draw{to{stroke-dashoffset:0}}
.fade{animation:fade .8s ease both} @keyframes fade{from{opacity:0}}</style>
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0c1c15"/><stop offset="1" stop-color="#07110d"/></linearGradient>
<linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3ef0b1"/><stop offset="1" stop-color="#0b8a5f"/></linearGradient>
<linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3ef0b1" stop-opacity=".35"/><stop offset="1" stop-color="#3ef0b1" stop-opacity="0"/></linearGradient></defs>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="18" fill="url(#bg)" stroke="#1f3a2e"/>
<g class="f"><text x="28" y="42" fill="#f2fbf6" font-size="19" font-weight="800">${esc(title)}</text>
<text x="${w - 28}" y="42" fill="#7fa596" font-size="13" text-anchor="end">${esc(sub)}</text></g>
${body}
</svg>`;

function activity(weeks) {
  const W = 1200, H = 290, L = 52, R = 28, T = 80, B = 46;
  const vals = weeks.map(w => w.contributionDays.reduce((a, d) => a + d.contributionCount, 0));
  const max = Math.max(1, ...vals);
  const cw = (W - L - R) / vals.length, ph = H - T - B;
  const pts = vals.map((v, i) => [L + i * cw + cw / 2, T + ph - (v / max) * ph]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts.at(-1)[0].toFixed(1)} ${T + ph} L${pts[0][0].toFixed(1)} ${T + ph}Z`;
  const grid = [0, .5, 1].map(f => { const y = T + ph - f * ph; return `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="#1d3a2d" stroke-dasharray="3 6"/><text x="${L - 10}" y="${y + 4}" fill="#5f8576" font-size="11.5" text-anchor="end">${Math.round(max * f)}</text>`; }).join("");
  const months = [];
  weeks.forEach((w, i) => { const d = new Date(w.contributionDays[0].date); if (d.getUTCDate() <= 7) months.push(`<text x="${L + i * cw + cw / 2}" y="${H - 18}" fill="#5f8576" font-size="11.5" text-anchor="middle">${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</text>`); });
  const bars = vals.map((v, i) => { const h = Math.max(2, (v / max) * ph); return `<rect class="grow" style="animation-delay:${(i * 0.012).toFixed(3)}s" x="${(L + i * cw + cw * .2).toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${(cw * .6).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="url(#bar)" opacity="${v ? .55 : .15}"/>`; }).join("");
  const peak = vals.indexOf(max), pp = pts[peak];
  const total = vals.reduce((a, b) => a + b, 0);
  return frame(W, H, "Commit activity", `${fmt(total)} contributions in the last 12 months · weekly`, `<g class="f">${grid}${months.join("")}</g>${bars}
<path d="${area}" fill="url(#area)" class="fade"/><path class="draw" d="${line}" fill="none" stroke="#3ef0b1" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
<g class="f fade" style="animation-delay:2s"><circle cx="${pp[0]}" cy="${pp[1]}" r="5" fill="#3ef0b1" stroke="#07110d" stroke-width="2"/>
${(() => { const tx = pp[0] > L + 160 ? pp[0] - 138 : pp[0] + 14; return `<rect x="${tx.toFixed(1)}" y="${(pp[1] - 13).toFixed(1)}" width="124" height="26" rx="8" fill="#123526" stroke="#2c6b52"/>
<text x="${(tx + 62).toFixed(1)}" y="${(pp[1] + 4.5).toFixed(1)}" fill="#cdeee0" font-size="12.5" font-weight="700" text-anchor="middle">Peak week: ${max}</text>`; })()}</g>`);
}

function stats(u, s) {
  const c = u.contributionsCollection;
  const stars = u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);
  const items = [
    ["Contributions", c.contributionCalendar.totalContributions, "last 12 months"],
    ["Commits", c.totalCommitContributions, "last 12 months"],
    ["Pull requests", c.totalPullRequestContributions, "last 12 months"],
    ["Public repos", u.repositories.totalCount, `${fmt(stars)} stars`],
    ["Active days", s.active, "last 12 months"],
    ["Longest streak", s.longest, s.longest === 1 ? "day" : "days"],
  ];
  const body = items.map(([k, v, sub], i) => { const x = 28 + (i % 3) * 182, y = 76 + Math.floor(i / 3) * 92;
    return `<g class="f fade" style="animation-delay:${i * 0.12}s"><rect x="${x}" y="${y}" width="168" height="78" rx="12" fill="#0f2119" stroke="#1f3a2e"/>
<text x="${x + 16}" y="${y + 24}" fill="#7fa596" font-size="12" font-weight="700" letter-spacing=".6">${esc(k.toUpperCase())}</text>
<text x="${x + 16}" y="${y + 55}" fill="#f2fbf6" font-size="27" font-weight="800">${fmt(v)}</text>
<text x="${x + 16}" y="${y + 70}" fill="#5f8576" font-size="11.5">${esc(sub)}</text></g>`; }).join("");
  return frame(600, 270, "GitHub at a glance", "updated daily", body);
}

function languages(u) {
  const totals = new Map();
  for (const r of u.repositories.nodes) for (const e of r.languages.edges) {
    const t = totals.get(e.node.name) || { size: 0, color: e.node.color || "#8b949e" };
    t.size += e.size; totals.set(e.node.name, t);
  }
  const all = [...totals.entries()].sort((a, b) => b[1].size - a[1].size);
  const top = all.slice(0, 8), sum = top.reduce((a, [, t]) => a + t.size, 0) || 1;
  let x = 28;
  const bar = top.map(([, t]) => { const w = (t.size / sum) * 544; const r = `<rect x="${x.toFixed(1)}" y="70" width="${Math.max(w - 2, 1).toFixed(1)}" height="14" fill="${t.color}"/>`; x += w; return r; }).join("");
  const legend = top.map(([n, t], i) => { const lx = 28 + (i % 2) * 280, ly = 118 + Math.floor(i / 2) * 34;
    return `<g class="f fade" style="animation-delay:${i * 0.1}s"><circle cx="${lx + 7}" cy="${ly - 5}" r="6.5" fill="${t.color}"/>
<text x="${lx + 22}" y="${ly}" fill="#e6f5ee" font-size="15" font-weight="700">${esc(n)}</text>
<text x="${lx + 252}" y="${ly}" fill="#7fa596" font-size="14" text-anchor="end">${((t.size / sum) * 100).toFixed(1)}%</text></g>`; }).join("");
  return frame(600, 270, "Top languages", "across public repositories", `<clipPath id="bc"><rect x="28" y="70" width="544" height="14" rx="7"/></clipPath><g clip-path="url(#bc)">${bar}</g>${legend}`);
}

const u = await load();
const days = u.contributionsCollection.contributionCalendar.weeks.flatMap(w => w.contributionDays);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/activity.svg`, activity(u.contributionsCollection.contributionCalendar.weeks));
fs.writeFileSync(`${OUT}/stats.svg`, stats(u, streaks(days)));
fs.writeFileSync(`${OUT}/languages.svg`, languages(u));
console.log(`Wrote cards for ${LOGIN}: ${u.contributionsCollection.contributionCalendar.totalContributions} contributions.`);
