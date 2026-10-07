'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { checkRelease } = require('./release-check.cjs');
const { player } = require('./release-files.cjs');
const root = path.resolve(__dirname, '..');
const manifest = checkRelease();
const { version } = require('../package.json');
const releaseRoot = path.join(root, 'release'); fs.mkdirSync(releaseRoot, {recursive: true});
// Always use a new output directory: never overwrite or keep stale extra files.
const output = fs.mkdtempSync(path.join(releaseRoot, `general-video-player-${version}-`));
function copy(source, destination) {
  const target = path.join(output, destination); fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(path.join(root, source), target);
}
for (const entry of manifest) copy(entry.file, `source/${entry.file}`);
for (const name of player) copy(name, `player/${name}`);
copy('docs/QUICKSTART.md', 'player/README.md');
fs.writeFileSync(path.join(output, 'source-manifest.json'), JSON.stringify(manifest, null, 2)+'\n');
console.log(`Prepared locally: ${output}\nsource/ is ready for repository review; player/ is the offline app. Nothing has been uploaded.`);
