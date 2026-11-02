// Sync the README pinned-projects table with the account's pinned repos.
// Zero dependencies; runs on the Node 20+ shipped with ubuntu-latest.
import { readFile, writeFile } from 'node:fs/promises';

const user = process.env.GH_USER;
const token = process.env.GH_TOKEN;
if (!user || !token) {
  console.error('GH_USER / GH_TOKEN missing');
  process.exit(1);
}

const query = `{
  user(login: "${user}") {
    pinnedItems(first: 6, types: REPOSITORY) {
      nodes {
        ... on Repository {
          name
          description
          url
          stargazerCount
          primaryLanguage { name }
        }
      }
    }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'pinned-repos-sync',
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
const nodes = json?.data?.user?.pinnedItems?.nodes ?? [];
console.log(`pinned repos found: ${nodes.length}`);

const esc = (s) => (s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
const rows = nodes.map((r) => {
  const meta = [
    r.stargazerCount ? `⭐ ${r.stargazerCount}` : null,
    r.primaryLanguage?.name ?? null,
  ].filter(Boolean).join(' · ');
  const desc = esc(r.description);
  const tail = meta ? `（${meta}）` : '';
  return `| [${r.name}](${r.url}) | ${desc}${tail} |`;
});

const table = [
  '| 项目 | 说明 |',
  '| --- | --- |',
  ...(rows.length ? rows : ['| _（暂无置顶仓库）_ | |']),
].join('\n');

const START = '<!-- PINNED:START -->';
const END = '<!-- PINNED:END -->';
const path = 'README.md';
const md = await readFile(path, 'utf8');
const i = md.indexOf(START);
const j = md.indexOf(END);
if (i < 0 || j < 0 || j < i) {
  console.error('PINNED markers not found in README.md');
  process.exit(1);
}
const next = md.slice(0, i + START.length) + '\n' + table + '\n' + md.slice(j);
if (next !== md) {
  await writeFile(path, next);
  console.log('README.md updated');
} else {
  console.log('README.md unchanged');
}
