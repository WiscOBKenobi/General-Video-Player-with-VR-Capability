'use strict';
// Creates README screenshots with a synthetic panorama, never personal media.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const images = path.join(root, 'docs', 'images');
const fixtures = path.join(root, 'test-results', 'demo');

(async () => {
  fs.mkdirSync(images, { recursive: true });
  fs.mkdirSync(fixtures, { recursive: true });
  const browser = await chromium.launch({
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.context().setOffline(true);
    await page.screenshot({ path: path.join(images, 'player-home.png'), fullPage: true });
    const bytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2048; canvas.height = 1024;
      const c = canvas.getContext('2d');
      function draw() {
        const sky = c.createLinearGradient(0, 0, 0, 1024);
        sky.addColorStop(0, '#091925'); sky.addColorStop(.5, '#316879'); sky.addColorStop(1, '#0a2535');
        c.fillStyle = sky; c.fillRect(0, 0, 2048, 1024);
        // A periodic horizon and coordinate grid make projection and dragging visible.
        c.fillStyle = '#153d4a'; c.beginPath(); c.moveTo(0, 1024);
        for (let x = 0; x <= 2048; x += 4) {
          const phase = x / 2048 * Math.PI * 2;
          c.lineTo(x, 560 - 65 * Math.sin(phase * 5) - 28 * Math.cos(phase * 11));
        }
        c.lineTo(2048, 1024); c.closePath(); c.fill();
        c.strokeStyle = '#a8ead52b'; c.lineWidth = 2;
        for (let x = 0; x <= 2048; x += 128) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 1024); c.stroke(); }
        for (let y = 128; y < 1024; y += 128) { c.beginPath(); c.moveTo(0, y); c.lineTo(2048, y); c.stroke(); }
        c.strokeStyle = '#9ce7ce88'; c.beginPath(); c.moveTo(0, 512); c.lineTo(2048, 512); c.stroke();
        c.fillStyle = '#d1f5e9'; c.textAlign = 'center'; c.font = '24px sans-serif';
        for (const [x, label] of [[256, 'WEST'], [768, 'NORTH'], [1280, 'EAST'], [1792, 'SOUTH']]) c.fillText(label, x, 480);
        c.fillStyle = '#d1f5e9bb'; c.font = '18px sans-serif'; c.fillText('SYNTHETIC 360° DEMO', 1024, 300);
        c.fillStyle = '#a5e4ce'; c.beginPath(); c.arc(1130, 400, 23, 0, Math.PI * 2); c.fill();
      }
      draw();
      const stream = canvas.captureStream(10), chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.start(); const timer = setInterval(draw, 100);
      await new Promise(resolve => setTimeout(resolve, 1600));
      recorder.stop(); await stopped; clearInterval(timer);
      stream.getTracks().forEach(track => track.stop());
      return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
    });
    const demo = path.join(fixtures, 'panorama-demo.webm');
    fs.writeFileSync(demo, Buffer.from(bytes));
    await page.locator('#file').setInputFiles(demo);
    await page.waitForFunction(() => document.getElementById('canvas').classList.contains('ready'));
    await page.evaluate(() => document.getElementById('video').pause());
    await page.locator('[data-mode=vr]').click();
    await page.locator('[data-projection="360"]').click();
    await page.locator('#layout').selectOption('mono');
    await page.locator('#fov').fill('95'); await page.locator('#fov').dispatchEvent('input');
    await page.mouse.move(1580, 980); await page.locator('#viewport').focus();
    await page.locator('#viewport').evaluate(element => element.blur());
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(images, 'player-vr.png'), fullPage: true });
    console.log('Created docs/images/player-home.png and player-vr.png with synthetic media.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
