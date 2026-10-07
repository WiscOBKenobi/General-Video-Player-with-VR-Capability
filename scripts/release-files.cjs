'use strict';
// Explicit allowlist: adding a source file to a public bundle requires review.
const sources = [
  '.gitignore', 'AGENTS.md', 'README.md', 'README.zh-CN.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
  'CONTRIBUTING.md', 'package.json', 'package-lock.json',
  'index.html', 'app.js', 'i18n.js', 'style.css', 'icon.svg',
  'tests/player.cjs', 'scripts/release-files.cjs', 'scripts/release-check.cjs',
  'scripts/package.cjs', 'docs/QUICKSTART.md', 'docs/RELEASE_REVIEW.md', 'docs/SESSION_PRIVACY.md',
  'scripts/demo-screenshots.cjs', 'docs/images/player-home.png', 'docs/images/player-vr.png'
];
const player = ['index.html', 'app.js', 'i18n.js', 'style.css', 'icon.svg', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
module.exports = { sources, player };
