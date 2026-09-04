// Fill publication placeholders only after the destination is chosen.
const fs = require('node:fs');
const path = require('node:path');
const [owner, repo = 'fieldwave'] = process.argv.slice(2);
if (!owner || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(owner) || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(repo)) {
  console.error('Usage: node scripts/configure-repo.js GITHUB-ACCOUNT REPOSITORY'); process.exit(1);
}
const root = path.resolve(__dirname, '..');
for (const file of ['README.md', '.env.example', 'docs/UNRAID.md', 'unraid/fieldwave.xml']) {
  const target = path.join(root, file);
  let text = fs.readFileSync(target, 'utf8').replaceAll('YOUR_GITHUB_USER/fieldwave', `${owner}/${repo}`);
  text = text.replaceAll(`ghcr.io/${owner}/${repo}`, `ghcr.io/${owner.toLowerCase()}/${repo.toLowerCase()}`);
  text = text.replaceAll('/pkgs/container/fieldwave', `/pkgs/container/${repo.toLowerCase()}`);
  fs.writeFileSync(target, text);
}
console.log(`Configured github.com/${owner}/${repo}. No files have been uploaded.`);
