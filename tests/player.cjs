// Test-only dependencies: playwright and pngjs. No dependencies in the player.
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const channel = process.argv[2] || (process.platform === 'win32' ? 'msedge' : 'chromium');
assert.ok(['msedge','chrome','chromium'].includes(channel), 'Supported test browsers: msedge, chrome, chromium');
const out = path.join(root, 'test-results', channel);
fs.mkdirSync(out, { recursive: true });
const checks = [];
function pass(name) { checks.push(name); console.log('PASS', name); }
(async () => {
  const browser = await chromium.launch({ ...(channel === 'chromium' ? {} : {channel}), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      window.__audit = { created: [], revoked: [], writes: [] };
      const create = URL.createObjectURL;
      URL.createObjectURL = function(blob) { const url=create.call(this,blob); window.__audit.created.push(url); return url; };
      const revoke = URL.revokeObjectURL;
      URL.revokeObjectURL = function(url) { window.__audit.revoked.push(url); return revoke.call(this, url); };
      for (const [owner, method, label] of [[Storage.prototype,'setItem','storage'],[IDBFactory.prototype,'open','indexedDB'],[CacheStorage.prototype,'open','cache']]) {
        const original = owner[method];
        owner[method] = function(...args) { window.__audit.writes.push(label); return original.apply(this,args); };
      }
      const cookie = Object.getOwnPropertyDescriptor(Document.prototype,'cookie');
      if (cookie?.set) Object.defineProperty(Document.prototype,'cookie',{...cookie,set(value){window.__audit.writes.push('cookie');cookie.set.call(this,value);}});
      if (globalThis.FileSystemFileHandle) {
        const createWritable=FileSystemFileHandle.prototype.createWritable;
        FileSystemFileHandle.prototype.createWritable=function(...args){window.__audit.writes.push('file-write');return createWritable.apply(this,args);};
      }
      if (navigator.storage?.getDirectory) {
        const getDirectory=navigator.storage.getDirectory.bind(navigator.storage);
        navigator.storage.getDirectory=(...args)=>{window.__audit.writes.push('origin-private-filesystem');return getDirectory(...args);};
      }
    });
    const errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.screenshot({ path: path.join(out, 'desktop-empty.png'), fullPage: true });
    assert.equal(await page.locator('#notice').isVisible(), false, 'WebGL shader initializes');
    assert.equal(await page.locator('#play').isDisabled(), true);
    assert.equal(await page.locator('[data-mode=normal]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#vr-settings').isVisible(),false);
    pass('Direct file URL startup and WebGL initialization');
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert.equal(await page.locator('#choose').innerText(),'Choose video files');
    assert.equal(await page.locator('#stop').getAttribute('title'),'Stop playback and clear the session playlist');
    assert.equal(await page.evaluate(()=>{
      const text=document.body.innerText.replace('中文','') + [...document.querySelectorAll('[title],[aria-label]')].map(e=>(e.title||'')+(e.getAttribute('aria-label')||'')).join('');
      return /[\u4e00-\u9fff]/.test(text);
    }),false,'default UI and tooltips must be English');
    await page.locator('[data-language="zh-CN"]').click();
    assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
    assert.equal(await page.locator('#choose').innerText(),'选择视频文件');
    assert.equal(await page.locator('#filename').innerText(),'尚未打开视频');
    assert.equal(await page.locator('#playlist-count').innerText(),'0 个视频');
    await page.locator('[data-mode=vr]').click();
    assert.equal(await page.locator('#layout option:checked').innerText(),'左右分屏（SBS）');
    await page.locator('[data-language=en]').click();
    assert.equal(await page.locator('#layout option:checked').innerText(),'Side by side (SBS)');
    await page.locator('[data-mode=normal]').click();
    pass('English by default; Chinese and English include settings, tooltips and empty states');
    const settingsBox=await page.locator('.settings').boundingBox();
    const playerBox=await page.locator('#player').boundingBox();
    const queueBox=await page.locator('.playlist').boundingBox();
    assert.ok(settingsBox.x+settingsBox.width<playerBox.x && playerBox.x+playerBox.width<queueBox.x);
    assert.equal(settingsBox.y,queueBox.y);
    for (const width of [1000,760,390]) {
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'responsive layout must not overflow');
    }
    await page.setViewportSize({width:1440,height:1000});
    pass('Settings left, player center, queue right with responsive layouts');
    const bytes = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256;
      const ctx = c.getContext('2d');
      function draw() {
        for (const [color,x,y] of [['#ed2020',0,0],['#20ed20',256,0],['#2020ed',0,128],['#eded20',256,128]]) { ctx.fillStyle = color; ctx.fillRect(x,y,256,128); }
      }
      draw(); const stream = c.captureStream(12), chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.start(); const timer = setInterval(draw, 80);
      await new Promise(resolve => setTimeout(resolve, 2200));
      recorder.stop(); await stopped; clearInterval(timer); stream.getTracks().forEach(t => t.stop());
      return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
    });
    const fixture = path.join(out, 'stereo-fixture.webm'); fs.writeFileSync(fixture, Buffer.from(bytes));
    const fixtureHash = createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
    await page.context().setOffline(true);
    await page.locator('#file').setInputFiles(fixture);
    await page.waitForFunction(() => document.getElementById('canvas').classList.contains('ready'));
    await page.evaluate(() => document.getElementById('video').pause());
    assert.match(await page.locator('#fileinfo').innerText(), /512 × 256/);
    pass('Offline local video decode and playback');
    async function pixel(x=.5,y=.4) {
      await page.waitForTimeout(100);
      const png = PNG.sync.read(await page.locator('#canvas').screenshot());
      const i = (Math.floor(png.height*y)*png.width+Math.floor(png.width*x))*4;
      return [...png.data.subarray(i,i+3)];
    }
    function color(actual, expected, label) { assert.ok(actual.every((v,i) => Math.abs(v-expected[i])<45), `${label}: ${actual} vs ${expected}`); }
    color(await pixel(.3,.35),[237,32,32],'default full frame top left');
    color(await pixel(.7,.65),[237,237,32],'default full frame bottom right');
    await page.locator('[data-mode=vr]').click();
    assert.equal(await page.locator('#vr-settings').isVisible(),true);
    await page.locator('#layout').selectOption('tb');
    await page.locator('[data-eye=right]').click();
    await page.locator('[data-mode=normal]').click();
    color(await pixel(.3,.35),[237,32,32],'normal ignores prior stereo choices');
    color(await pixel(.7,.65),[237,237,32],'normal preserves entire frame');
    assert.equal(await page.locator('#layout').isVisible(),false);
    await page.locator('[data-mode=vr]').click();
    await page.locator('#layout').selectOption('sbs');
    await page.locator('[data-eye=left]').click();
    pass('Normal mode is the default, hides stereo settings and always uses the complete frame');
    color(await pixel(), [237,32,32], 'left eye upper');
    color(await pixel(.5,.6), [32,32,237], 'left eye lower');
    await page.locator('[data-eye=right]').click(); color(await pixel(), [32,237,32], 'right eye upper');
    color(await pixel(.5,.6), [237,237,32], 'right eye lower');
    pass('SBS eye selection and correct vertical orientation');
    await page.locator('[data-eye=both]').click();
    color(await pixel(.25,.4), [237,32,32], 'split left'); color(await pixel(.75,.4), [32,237,32], 'split right');
    pass('Both-eye split rendering');
    await page.locator('#layout').selectOption('tb'); await page.locator('[data-eye=left]').click();
    color(await pixel(.4,.5), [237,32,32], 'top eye left'); color(await pixel(.6,.5), [32,237,32], 'top eye right');
    await page.locator('[data-eye=right]').click();
    color(await pixel(.4,.5), [32,32,237], 'bottom eye left'); color(await pixel(.6,.5), [237,237,32], 'bottom eye right');
    pass('Top/bottom eye selection');
    await page.locator('#layout').selectOption('mono'); await page.locator('[data-projection="360"]').click();
    assert.equal(await page.locator('[data-eye=left]').isDisabled(), true);
    const view = await page.locator('#viewport').boundingBox();
    const before = await pixel(.5,.4);
    await page.mouse.move(view.x+view.width*.5,view.y+view.height*.4); await page.mouse.down();
    await page.mouse.move(view.x+view.width*.7,view.y+view.height*.4,{steps:8}); await page.mouse.up();
    color(await pixel(.5,.4), [237,32,32], 'drag reveals left hemisphere');
    assert.notDeepEqual(before, await pixel(.5,.4));
    await page.mouse.wheel(0,-100); await page.waitForTimeout(100);
    assert.equal(await page.locator('#fov-value').innerText(), '72°');
    await page.locator('#reset').click(); assert.equal(await page.locator('#fov-value').innerText(), '75°');
    await page.screenshot({path:path.join(out,'vr-controls-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(out,'vr-controls-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#fullscreen').click(); await page.waitForFunction(()=>!!document.fullscreenElement);
    await page.screenshot({path:path.join(out,'vr-controls-fullscreen.png')});
    await page.locator('#fullscreen').click(); await page.waitForFunction(()=>!document.fullscreenElement);
    pass('360 drag, zoom and reset while paused');
    const beforeLanguage=await page.evaluate(()=>{
      const v=document.getElementById('video');
      return {src:v.src,time:v.currentTime,rate:v.playbackRate,volume:v.volume,paused:v.paused,fov:document.getElementById('fov').value,layout:document.getElementById('layout').value};
    });
    await page.locator('[data-language="zh-CN"]').click();
    assert.match(await page.locator('.playlist-detail').first().innerText(),/当前视频/);
    assert.equal(await page.locator('.playlist-remove').first().getAttribute('aria-label'),'移除第 1 个视频');
    await page.locator('[data-language=en]').click();
    assert.match(await page.locator('.playlist-detail').first().innerText(),/Current video/);
    assert.deepEqual(await page.evaluate(()=>{
      const v=document.getElementById('video');
      return {src:v.src,time:v.currentTime,rate:v.playbackRate,volume:v.volume,paused:v.paused,fov:document.getElementById('fov').value,layout:document.getElementById('layout').value};
    }),beforeLanguage);
    assert.equal(await page.locator('[data-projection="360"]').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>{const v=document.getElementById('video');v.loop=true;v.currentTime=0;return v.play();});
    await page.locator('[data-language="zh-CN"]').click();
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),false,'language switch must not interrupt playback');
    await page.locator('[data-language=en]').click();
    await page.evaluate(()=>{const v=document.getElementById('video');v.pause();v.loop=false;v.currentTime=0;});
    pass('Language switching preserves the current file, playlist, playback and VR settings');
    await page.locator('[data-mode=normal]').click();
    color(await pixel(.3,.35), [237,32,32], 'flat top left'); color(await pixel(.7,.65), [237,237,32], 'flat bottom right');
    assert.equal(await page.locator('#fov').isDisabled(), true);
    pass('Flat projection with preserved aspect ratio');
    await page.locator('#seek').fill('50'); await page.locator('#seek').dispatchEvent('input');
    await page.waitForFunction(() => Math.abs(document.getElementById('video').currentTime/document.getElementById('video').duration-.5)<.03);
    await page.locator('#speed').fill('1.5'); await page.locator('#speed').press('Enter'); assert.equal(await page.locator('#video').evaluate(v=>v.playbackRate),1.5);
    await page.locator('#mute').click(); assert.equal(await page.locator('#video').evaluate(v=>v.muted), true);
    await page.locator('#file').setInputFiles(fixture); await page.waitForFunction(() => document.getElementById('video').readyState>=2);
    await page.locator('#mute').click(); assert.ok(await page.locator('#video').evaluate(v=>!v.muted && v.volume>.5));
    await page.evaluate(() => document.getElementById('video').pause());
    pass('Seek, speed, mute and replacement without losing volume');
    await page.locator('#fullscreen').click(); await page.waitForFunction(() => !!document.fullscreenElement);
    await page.locator('#fullscreen').click(); await page.waitForFunction(() => !document.fullscreenElement);
    pass('Enter and exit fullscreen');
    for (const paused of [true,false]) {
      await page.evaluate(paused=>{
        const v=document.getElementById('video'); v.loop=true; v.currentTime=0;
        if(paused)v.pause();else v.play();
      },paused);
      await page.waitForFunction(paused=>document.getElementById('video').paused===paused,paused);
      await page.locator('#viewport').dblclick();
      await page.waitForFunction(()=>!!document.fullscreenElement);
      await page.waitForTimeout(400);
      assert.equal(await page.locator('#video').evaluate(v=>v.paused),paused);
      await page.locator('#viewport').dblclick();
      await page.waitForFunction(()=>!document.fullscreenElement);
      await page.waitForTimeout(400);
      assert.equal(await page.locator('#video').evaluate(v=>v.paused),paused);
    }
    await page.evaluate(()=>document.getElementById('video').pause());
    await page.locator('#viewport').click();
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),false,'keyboard playback cancels a pending picture click');
    await page.evaluate(()=>document.getElementById('video').pause());
    pass('Double click enters and exits fullscreen without changing playback state');
    await page.evaluate(() => { const v=document.getElementById('video'); v.loop=true; v.currentTime=0; });
    await page.locator('#play').click();
    await page.locator('#fullscreen').click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    const fullBounds = await page.locator('#player').boundingBox();
    const canvasBounds = await page.locator('#viewport').boundingBox();
    assert.deepEqual(canvasBounds,fullBounds,'video viewport covers the whole fullscreen area');
    const barBounds = await page.locator('.transport').boundingBox();
    assert.ok(barBounds.y+barBounds.height<=fullBounds.y+fullBounds.height+1);
    assert.equal(await page.locator('.transport').evaluate(e=>getComputedStyle(e).position),'absolute');
    await page.locator('.transport').hover();
    await page.screenshot({path:path.join(out,'fullscreen-overlay.png')});
    pass('Fullscreen video fills canvas behind translucent overlay');
    await page.mouse.move(fullBounds.width/2,fullBounds.height/2);
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#player').evaluate(p=>p.classList.contains('controls-hidden')),false);
    await page.waitForFunction(() => document.getElementById('player').classList.contains('controls-hidden'),{},{timeout:1500});
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.transport').evaluate(e=>getComputedStyle(e).opacity),'0');
    assert.equal(await page.locator('.transport').evaluate(e=>e.inert),true);
    assert.equal(await page.locator('#viewport').evaluate(e=>getComputedStyle(e).cursor),'none');
    await page.screenshot({path:path.join(out,'fullscreen-hidden.png')});
    await page.mouse.move(fullBounds.width/2+20,fullBounds.height/2);
    assert.equal(await page.locator('.transport').evaluate(e=>e.inert),false);
    await page.locator('.transport').hover(); await page.waitForTimeout(1250);
    assert.equal(await page.locator('#player').evaluate(p=>p.classList.contains('controls-hidden')),false);
    await page.locator('#speed').focus();
    await page.mouse.move(fullBounds.width/2,fullBounds.height/2); await page.waitForTimeout(1250);
    assert.equal(await page.locator('#player').evaluate(p=>p.classList.contains('controls-hidden')),false);
    await page.locator('#viewport').focus();
    await page.waitForFunction(() => document.getElementById('player').classList.contains('controls-hidden'));
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.transport').evaluate(e=>e.inert),false);
    await page.evaluate(() => document.getElementById('video').pause()); await page.waitForTimeout(1250);
    assert.equal(await page.locator('#player').evaluate(p=>p.classList.contains('controls-hidden')),false);
    await page.locator('#fullscreen').click();
    await page.waitForFunction(() => !document.fullscreenElement);
    assert.equal(await page.locator('.transport').evaluate(e=>getComputedStyle(e).position),'static');
    await page.evaluate(() => { const v=document.getElementById('video'); v.loop=false; v.currentTime=0; });
    pass('One-second idle hide, pointer/keyboard restore and controls stay during interaction or pause');
    await page.locator('#viewport').click(); await page.waitForTimeout(350);
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),false);
    await page.locator('#viewport').click(); await page.waitForTimeout(350);
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),true);
    await page.locator('#fullscreen').click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),false,'space on focused fullscreen button plays');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),true);
    assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true,'space must not re-click the fullscreen button');
    await page.locator('#seek').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),false,'space after seeking plays');
    await page.locator('#viewport').click(); await page.waitForTimeout(350);
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),true,'fullscreen picture click pauses');
    await page.locator('#speed').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),true,'editing a number must not toggle playback');
    await page.locator('#fullscreen').click();
    await page.waitForFunction(() => !document.fullscreenElement);
    await page.locator('[data-mode=vr]').click();
    const vrView=await page.locator('#viewport').boundingBox();
    await page.mouse.move(vrView.x+vrView.width*.5,vrView.y+vrView.height*.4); await page.mouse.down();
    await page.mouse.move(vrView.x+vrView.width*.6,vrView.y+vrView.height*.5,{steps:6}); await page.mouse.up();
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),true,'VR drag does not toggle playback');
    await page.mouse.down({clickCount:2}); await page.mouse.up({clickCount:2});
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false,'a drag cannot be the first click of fullscreen');
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),true);
    await page.locator('#viewport').click(); await page.waitForTimeout(350);
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),false,'VR tap plays');
    await page.locator('#viewport').click(); await page.waitForTimeout(350);
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),true);
    await page.locator('[data-mode=normal]').click();
    pass('Picture click and fullscreen space toggle playback; VR dragging and input editing do not');
    await page.locator('#viewport').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),false); await page.keyboard.press('Space');
    assert.equal(await page.locator('#video').evaluate(v=>v.paused),true);
    pass('Keyboard playback');
    await page.evaluate(() => {
      const data = new DataTransfer(); data.items.add(new File(['invalid'], 'notes.txt', {type:'text/plain'}));
      document.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));
    });
    assert.match(await page.locator('#notice').innerText(), /Choose video files/);
    await page.locator('[data-language="zh-CN"]').click();
    assert.match(await page.locator('#notice').innerText(), /请选择视频文件/);
    await page.locator('[data-language=en]').click();
    assert.match(await page.locator('#notice').innerText(), /Choose video files/);
    await page.locator('#file').setInputFiles({name:'broken.mp4',mimeType:'video/mp4',buffer:Buffer.from('broken')});
    await page.waitForFunction(() => document.getElementById('file-state').textContent==='Cannot play');
    await page.locator('[data-language="zh-CN"]').click();
    assert.equal(await page.locator('#file-state').textContent(),'无法播放');
    assert.match(await page.locator('#notice').innerText(),/浏览器无法解码/);
    await page.locator('[data-language=en]').click();
    assert.match(await page.locator('#notice').innerText(),/cannot decode/);
    pass('Active error messages and playback error status follow the selected language');
    assert.equal(await page.locator('#play').isDisabled(),true);
    await page.locator('#file').setInputFiles(fixture);
    await page.waitForFunction(() => document.getElementById('canvas').classList.contains('ready'));
    pass('Invalid drop, codec error and recovery');
    await page.evaluate(() => document.getElementById('video').pause());
    await page.screenshot({path:path.join(out,'desktop-playing.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    pass('Mobile layout without horizontal overflow');
    for (const rate of ['1.05','1.1','0.25','4']) {
      await page.locator('#speed').fill(rate); await page.locator('#speed').press('Enter');
      assert.equal(await page.locator('#video').evaluate(v=>v.playbackRate),Number(rate));
    }
    for (const invalid of ['', '0', '-1', '5']) {
      await page.locator('#speed').fill(invalid); await page.locator('#speed').press('Enter');
      assert.equal(await page.locator('#video').evaluate(v=>v.playbackRate),4);
      assert.equal(await page.locator('#speed').inputValue(),'4');
    }
    await page.locator('#speed').fill('1.05'); await page.locator('#speed').press('Enter');
    await page.locator('#file').setInputFiles(fixture);
    await page.waitForFunction(() => document.getElementById('video').readyState>=2);
    assert.equal(await page.locator('#video').evaluate(v=>v.playbackRate),1.05);
    pass('Custom decimal rates, range validation and rate retained on replacement');
    const activeUrl = await page.locator('#video').getAttribute('src');
    await page.locator('#stop').click();
    async function assertCleared() {
      await page.waitForFunction(() => !document.getElementById('video').currentSrc && document.getElementById('video').readyState===0);
      assert.equal(await page.locator('#video').getAttribute('src'),null);
      assert.equal(await page.locator('#video').evaluate(v=>v.paused),true);
      assert.equal(await page.locator('#video').getAttribute('data-size'),null);
      assert.equal(await page.locator('#file').evaluate(v=>v.files.length),0);
      assert.equal(await page.locator('#filename').innerText(),'No video selected');
      assert.equal(await page.locator('#filename').getAttribute('title'),null);
      assert.equal(await page.locator('#time').innerText(),'00:00 / 00:00');
      assert.equal(await page.locator('#seek').inputValue(),'0');
      assert.equal(await page.locator('#speed').inputValue(),'1');
      assert.equal(await page.locator('#empty').isVisible(),true);
      assert.equal(await page.locator('#notice').isVisible(),false);
      assert.equal(await page.locator('#canvas').evaluate(c=>c.classList.contains('ready')),false);
      for (const id of ['play','back','stop','seek']) assert.equal(await page.locator('#'+id).isDisabled(),true);
      assert.equal(await page.locator('body').innerText().then(s=>s.includes('stereo-fixture')),false);
      assert.equal(await page.evaluate(() => navigator.mediaSession.metadata),null);
      assert.equal(await page.locator('#playlist-items li').count(),0);
      assert.equal(await page.locator('#playlist-count').innerText(),'0 videos');
      assert.equal(await page.locator('#clear-list').isDisabled(),true);
    }
    await assertCleared();
    assert.ok(await page.evaluate(url=>window.__audit.revoked.includes(url),activeUrl));
    await page.locator('#viewport').focus(); await page.keyboard.press('Space'); await page.waitForTimeout(100);
    await assertCleared();
    await page.screenshot({path:path.join(out,'mobile-cleared.png'),fullPage:true});
    pass('Stop unloads media, revokes URL, clears identity/progress/frame and cannot resume');
    await page.locator('#file').setInputFiles(fixture);
    await page.waitForFunction(() => document.getElementById('canvas').classList.contains('ready'));
    await page.locator('#stop').click(); await assertCleared();
    await page.evaluate(data => {
      const input = document.getElementById('file'), transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(data)],'stereo-fixture.webm',{type:'video/webm'}));
      input.files=transfer.files; input.dispatchEvent(new Event('change'));
      document.getElementById('stop').click();
    },bytes);
    await page.waitForTimeout(150); await assertCleared();
    await page.locator('#file').setInputFiles({name:'broken.mp4',mimeType:'video/mp4',buffer:Buffer.from('broken')});
    await page.waitForFunction(() => document.getElementById('file-state').textContent==='Cannot play');
    await page.locator('#stop').click(); await assertCleared();
    pass('Stop during loading, after decode error and repeated reopen');
    assert.deepEqual(await page.evaluate(() => window.__audit.writes),[]);
    assert.equal(await page.evaluate(() => localStorage.length+sessionStorage.length),0);
    await page.locator('#file').setInputFiles(fixture);
    await page.waitForFunction(() => document.getElementById('canvas').classList.contains('ready'));
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    await assertCleared();
    await page.reload(); await assertCleared();
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:path.join(out,'desktop-cleared.png'),fullPage:true});
    pass('No persistent playback writes; pagehide and reload leave no active video');
    await page.locator('#file').setInputFiles(fixture);
    await page.waitForFunction(() => document.getElementById('canvas').classList.contains('ready'));
    await page.evaluate(() => { window.detachedVideo=document.getElementById('video'); });
    await page.locator('#stop').click();
    await page.locator('#file').setInputFiles(fixture);
    await page.waitForFunction(() => document.getElementById('canvas').classList.contains('ready'));
    await page.evaluate(() => {
      window.detachedVideo.dispatchEvent(new Event('error'));
      window.detachedVideo.dispatchEvent(new Event('loadedmetadata'));
      delete window.detachedVideo;
    });
    assert.equal(await page.locator('#notice').isVisible(),false,'events from a discarded video must not affect its replacement');
    assert.equal(await page.locator('#play').isDisabled(),false);
    pass('Discarded media events cannot corrupt the active file');
    await page.evaluate(() => document.getElementById('video').pause());
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      document.getElementById('canvas').classList.remove('ready');
      document.getElementById('video').dispatchEvent(new Event('playing'));
    });
    await page.waitForFunction(() => document.getElementById('canvas').classList.contains('ready'));
    pass('Decoder resume events restart rendering');
    await page.locator('#file').setInputFiles({name:'<svg onload=alert(1)>.webm',mimeType:'video/webm',buffer:Buffer.from(bytes)});
    await page.waitForFunction(() => document.getElementById('canvas').classList.contains('ready'));
    assert.equal(await page.locator('#filename').textContent(),'<svg onload=alert(1)>.webm');
    assert.equal(await page.locator('#filename svg').count(),0);
    assert.equal(await page.title(),'General Video Player with VR Capability');
    assert.ok(!page.url().includes('svg'));
    await page.locator('#stop').click(); await assertCleared();
    pass('Untrusted filenames remain plain text and never enter title or URL');
    await page.locator('#file').setInputFiles(fixture);
    await page.waitForFunction(() => document.getElementById('canvas').classList.contains('ready'));
    await page.evaluate(() => {
      window.__loss = document.getElementById('canvas').getContext('webgl').getExtension('WEBGL_lose_context');
      if (!window.__loss) throw new Error('Test browser must support context-loss simulation');
      document.getElementById('canvas').classList.remove('ready'); window.__loss.loseContext();
    });
    await page.waitForFunction(() => document.getElementById('notice').textContent.includes('Waiting for recovery'));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__loss.restoreContext());
    await page.waitForFunction(() => document.getElementById('canvas').classList.contains('ready'));
    assert.equal(await page.locator('#notice').isVisible(),false);
    await page.locator('#stop').click(); await assertCleared();
    pass('Graphics context loss pauses safely and restores the image');
    for (const fault of ['unavailable','shader','limit']) {
      const probe = await browser.newPage();
      probe.on('pageerror',error=>errors.push(error.message));
      await probe.addInitScript(fault => {
        if (fault==='unavailable') {
          const original=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args);};
        } else if (fault==='shader') {
          WebGLRenderingContext.prototype.getShaderParameter=()=>false;
        } else {
          const original=WebGLRenderingContext.prototype.getParameter;
          WebGLRenderingContext.prototype.getParameter=function(p){return p===this.MAX_TEXTURE_SIZE?16:original.call(this,p);};
        }
      },fault);
      await probe.goto(pathToFileURL(path.join(root,'index.html')).href);
      await probe.locator('#file').setInputFiles(fixture);
      await probe.waitForFunction(() => !document.getElementById('notice').hidden);
      assert.equal(await probe.locator('#play').isDisabled(),true);
      assert.equal(await probe.locator('#canvas').evaluate(c=>c.classList.contains('ready')),false);
      if (fault==='limit') { await probe.locator('#stop').click(); assert.equal(await probe.locator('#empty').isVisible(),true); }
      await probe.close();
    }
    pass('Missing WebGL, shader failures and oversized videos fail safely');
    const queued = name => ({name,mimeType:'video/webm',buffer:Buffer.from(bytes)});
    await page.locator('#file').setInputFiles([queued('session-first.webm'),queued('session-second.webm'),queued('session-third.webm')]);
    await page.waitForFunction(() => document.getElementById('canvas').classList.contains('ready'));
    assert.equal(await page.locator('#playlist-items li').count(),3);
    const rows=await page.locator('#playlist-items li').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom,width:r.width};}));
    assert.ok(rows.every((row,i)=>row.x===rows[0].x && (!i || row.y>=rows[i-1].bottom)),'one video per row');
    await page.screenshot({path:path.join(out,'three-column-playlist.png'),fullPage:true});
    assert.equal(await page.locator('#filename').innerText(),'session-first.webm');
    const firstUrl=await page.locator('#video').getAttribute('src');
    await page.locator('.playlist-select').nth(1).click();
    await page.waitForFunction(() => document.getElementById('video').readyState>=2);
    assert.equal(await page.locator('#filename').innerText(),'session-second.webm');
    assert.ok(await page.evaluate(url=>window.__audit.revoked.includes(url),firstUrl));
    await page.locator('.playlist-remove').nth(0).click();
    assert.equal(await page.locator('#playlist-items li').count(),2);
    assert.equal(await page.locator('#filename').innerText(),'session-second.webm');
    await page.locator('.playlist-remove').nth(0).click();
    assert.equal(await page.locator('#playlist-items li').count(),1);
    assert.equal(await page.locator('#video').getAttribute('src'),null);
    await page.locator('.playlist-select').click();
    await page.waitForFunction(() => document.getElementById('video').readyState>=2);
    assert.equal(await page.locator('#filename').innerText(),'session-third.webm');
    await page.screenshot({path:path.join(out,'playlist-active.png'),fullPage:true});
    await page.locator('#clear-list').click(); await assertCleared();
    pass('Multi-file session queue selects, removes and releases active/inactive entries correctly');
    await page.evaluate(data=>{
      const transfer=new DataTransfer();
      for(const name of ['drop-one.webm','drop-two.webm'])transfer.items.add(new File([new Uint8Array(data)],name,{type:'video/webm'}));
      document.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
      document.getElementById('clear-list').click();
    },bytes);
    await page.waitForTimeout(100); await assertCleared();
    assert.deepEqual(await page.evaluate(()=>window.__audit.created.filter(url=>!window.__audit.revoked.includes(url))),[]);
    assert.deepEqual(await page.evaluate(()=>window.__audit.writes),[]);
    const stores=await page.evaluate(async()=>({
      local:localStorage.length,session:sessionStorage.length,
      databases:await indexedDB.databases(),
      caches:await caches.keys().catch(error=>{if(error.name==='SecurityError')return 'unavailable on file origin';throw error;})
    }));
    assert.equal(stores.local,0); assert.equal(stores.session,0); assert.deepEqual(stores.databases,[]);
    assert.ok(stores.caches==='unavailable on file origin' || stores.caches.length===0);
    assert.deepEqual(await page.context().cookies(),[]);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const prototype=await cdp.send('Runtime.evaluate',{expression:'File.prototype',objectGroup:'file-audit'});
    const objects=await cdp.send('Runtime.queryObjects',{prototypeObjectId:prototype.result.objectId,objectGroup:'file-audit'});
    const count=await cdp.send('Runtime.callFunctionOn',{objectId:objects.objects.objectId,functionDeclaration:'function(){return this.length}',returnByValue:true});
    assert.equal(count.result.value,0,'no reachable File wrappers should remain after clearing the session');
    await cdp.send('Runtime.releaseObjectGroup',{objectGroup:'file-audit'}); await cdp.detach();
    pass('Queue clear revokes every URL, releases File objects and leaves browser site stores empty');
    await page.locator('#file').setInputFiles([queued('refresh-one.webm'),queued('refresh-two.webm')]);
    await page.locator('[data-language="zh-CN"]').click();
    await page.reload(); await assertCleared();
    assert.equal(await page.locator('#vr-settings').isVisible(),false);
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    pass('Reload forgets the whole session queue and returns to normal video mode');
    assert.equal(createHash('sha256').update(fs.readFileSync(fixture)).digest('hex'),fixtureHash);
    pass('Playback leaves source video bytes unchanged');
    assert.deepEqual(errors,[]); assert.deepEqual(network,[]);
    pass('No JavaScript errors and no external network requests');
    const privacyVerification={siteStores:stores,cookies:0,reachableFileObjects:count.result.value,unrevokedUrls:0,persistenceOrWriteCalls:0};
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({channel,browserVersion:browser.version(),checks,privacyVerification,errors,network},null,2));
    console.log(`${checks.length} checks passed`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
