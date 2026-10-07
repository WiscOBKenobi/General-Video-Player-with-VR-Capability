'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { sources } = require('./release-files.cjs');
const root = path.resolve(__dirname, '..');

function checkRelease() {
  const checks = [
    ['machine-specific path', /[A-Za-z]:[\\/](?:Users|projects)[\\/]/i],
    ['private-key marker', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['GitHub token pattern', /gh[pousr]_[A-Za-z0-9]{20,}/],
    ['AWS access-key pattern', /AKIA[A-Z0-9]{16}/]
  ];
  const manifest = sources.map(name => {
    const file = path.join(root, name);
    assert.ok(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), `Not a regular source file: ${name}`);
    const bytes = fs.readFileSync(file);
    if (name.endsWith('.png')) {
      assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), `Invalid PNG: ${name}`);
      // Public demo screenshots must not carry embedded text or EXIF metadata.
      for (let offset=8; offset+12<=bytes.length;) {
        const size=bytes.readUInt32BE(offset), type=bytes.toString('ascii',offset+4,offset+8);
        assert.ok(['IHDR','IDAT','IEND','sRGB','gAMA','cHRM','pHYs'].includes(type), `Unexpected PNG metadata ${type}: ${name}`);
        assert.ok(offset+12+size<=bytes.length, `Truncated PNG: ${name}`);
        offset+=12+size;
      }
    } else {
      const text=bytes.toString('utf8');
      for (const [label, regex] of checks) assert.ok(!regex.test(text), `${label} in ${name}`);
      assert.ok(!/[^\S\r\n]+$/m.test(text), `Trailing whitespace in ${name}`);
    }
    return { file: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.private, true, 'Prevent accidental npm publication; this does not prevent GitHub open source');
  assert.equal(Object.keys(pkg.dependencies || {}).length, 0, 'Player must have no runtime packages');
  assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
  for (const [name, version] of Object.entries(pkg.devDependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `Unpinned package: ${name}`);
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
  }
  for (const [name, pkg] of Object.entries(lock.packages)) {
    if (!name) continue;
    assert.match(pkg.resolved, /^https:\/\/registry\.npmjs\.org\//);
    assert.match(pkg.integrity, /^sha512-/);
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const directive of ["connect-src 'none'", "media-src blob:", "object-src 'none'", "script-src 'self'"]) assert.ok(html.includes(directive), `Missing CSP: ${directive}`);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^[a-z]+:/i.test(match[1]), 'Remote runtime asset');
    assert.ok(fs.existsSync(path.join(root, match[1])), `Missing asset: ${match[1]}`);
  }
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.ok(!/\b(?:fetch|eval|WebSocket|XMLHttpRequest)\s*\(|\.innerHTML\s*=|\b(?:localStorage|sessionStorage|indexedDB)\b/.test(app), 'Unexpected network, dynamic code or persistence in player');
  return manifest;
}
if (require.main === module) {
  const manifest = checkRelease();
  const output = path.join(root, 'test-results'); fs.mkdirSync(output, {recursive: true});
  fs.writeFileSync(path.join(output, 'release-manifest.json'), JSON.stringify(manifest, null, 2)+'\n');
  console.log(`Release checks passed: ${manifest.length} allowlisted files; no flagged secrets or local paths. This is a targeted check, not a guarantee of absence.`);
}
module.exports = { checkRelease };
