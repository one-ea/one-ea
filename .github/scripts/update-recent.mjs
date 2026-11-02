// Sync the README "recent activity" list with the account's most
// recently pushed public repos. Zero dependencies; Node 20+.
import { readFile, writeFile } from 'node:fs/promises';

const user = process.env.GH_USER;
const token = process.env.GH_TOKEN;
if (!user || !token) {
  console.error('GH_USER / GH_TOKEN missing');
  process.exit(1);
}

const query = `{
  user(login: "${user}") {
    repositories(first: 20, orderBy: {field: PUSHED_AT, direction: DESC}, ownerAffiliations: OWNER, privacy: PUBLIC) {
      nodes {
        name
        description
        url
        stargazerCount
        isFork
        pushedAt
        primaryLanguage { name }
      }
    }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'recent-activity-sync',
  },
  body: JSON.stringify({ query }),
});
if (!res.ok) {
  console.error('GraphQL HTTP', res.status, await res.text());
  process.exit(1);
}
const json = await res.json();
if (json.errors) {
  console.error('GraphQL errors', JSON.stringify(json.errors));
  process.exit(1);
}

const all = json?.data?.user?.repositories?.nodes ?? [];
// Skip forks and the profile repo itself (its bot commits would pin it on top forever).
const nodes = all.filter((r) => !r.isFork && r.name !== user).slice(0, 5);
console.log(`recent repos listed: ${nodes.length}`);

const esc = (s) => (s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const rows = nodes.map((r) => {
  const meta = [
    r.stargazerCount ? `⭐ ${r.stargazerCount}` : null,
    r.primaryLanguage?.name ?? null,
    r.pushedAt ? `${dateFmt.format(new Date(r.pushedAt))} 更新` : null,
  ].filter(Boolean).join(' · ');
  const desc = esc(r.description);
  const head = desc ? `[${r.name}](${r.url}) — ${desc}` : `[${r.name}](${r.url})`;
  return meta ? `- ${head}（${meta}）` : `- ${head}`;
});

const block = rows.length ? rows.join('\n') : '- _（暂无公开仓库动态）_';

const START = '<!-- RECENT:START -->';
const END = '<!-- RECENT:END -->';
const path = 'README.md';
const md = await readFile(path, 'utf8');
const i = md.indexOf(START);
const j = md.indexOf(END);
if (i < 0 || j < 0 || j < i) {
  console.error('RECENT markers not found in README.md');
  process.exit(1);
}
const next = md.slice(0, i + START.length) + '\n' + block + '\n' + md.slice(j);
if (next !== md) {
  await writeFile(path, next);
  console.log('README.md updated');
} else {
  console.log('README.md unchanged');
}
