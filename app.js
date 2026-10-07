/* Standalone local-only player: no network requests, packages or remote scripts. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let video = $('video');
  const canvas = $('canvas'), viewport = $('viewport');
  const player = $('player'), transport = document.querySelector('.transport');
  let controlsTimer, keyboardNavigation = false;
  const state = { projection: 'flat', vrProjection: '180', layout: 'sbs', eye: 'left', yaw: 0, pitch: 0, fov: 75, rate: 1, url: null, loaded: false, generation: 0 };
  let playlist = [], activeItem = null, nextItemId = 1;
  let gl, program, texture, uniforms, frame = 0, noticeTimer, failed = false, drag = null, dragDepth = 0;
  let mediaEvents, rendererReady = false;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const vertex = `attribute vec2 position; varying vec2 screen; void main(){screen=position;gl_Position=vec4(position,0.,1.);}`;
  const fragment = `
    precision highp float;
    varying vec2 screen;
    uniform sampler2D image;
    uniform vec2 size, videoSize;
    uniform float yaw, pitch, fov;
    uniform int projection, layout, eye;
    const float PI=3.141592653589793;
    void main(){
      vec2 p=screen;
      float aspect=size.x/size.y;
      bool second=eye==1;
      if(eye==2){second=p.x>=0.;p.x=second?p.x*2.-1.:p.x*2.+1.;aspect*=0.5;}
      vec2 uv;
      if(projection==0){
        vec2 source=videoSize;
        if(layout==1) source.x*=0.5;
        if(layout==2) source.y*=0.5;
        float sourceAspect=source.x/source.y;
        vec2 q=p;
        if(aspect>sourceAspect) q.x*=aspect/sourceAspect;
        else q.y*=sourceAspect/aspect;
        if(abs(q.x)>1.||abs(q.y)>1.){gl_FragColor=vec4(0.,0.,0.,1.);return;}
        uv=q*.5+.5;
      }else{
        float t=tan(fov*PI/360.);
        vec3 d=normalize(vec3(p.x*aspect*t,p.y*t,-1.));
        d=vec3(d.x,d.y*cos(pitch)-d.z*sin(pitch),d.y*sin(pitch)+d.z*cos(pitch));
        d=vec3(d.x*cos(yaw)-d.z*sin(yaw),d.y,d.x*sin(yaw)+d.z*cos(yaw));
        float longitude=atan(d.x,-d.z);
        float latitude=asin(clamp(d.y,-1.,1.));
        if(projection==1 && abs(longitude)>PI*.5){gl_FragColor=vec4(.025,.04,.055,1.);return;}
        uv=vec2(longitude/(projection==1?PI:2.*PI)+.5,latitude/PI+.5);
      }
      // Texture Y is flipped on upload: the first/top eye occupies the upper half.
      if(layout==1) uv.x=uv.x*.5+(second?.5:0.);
      if(layout==2) uv.y=uv.y*.5+(second?0.:.5);
      // Stay inside each eye by half a texel to avoid bleeding across the seam.
      vec2 low=vec2(0.), high=vec2(1.);
      if(layout==1){low.x=second?.5:0.;high.x=second?1.:.5;}
      if(layout==2){low.y=second?0.:.5;high.y=second?.5:1.;}
      uv=clamp(uv,low+.5/videoSize,high-.5/videoSize);
      gl_FragColor=texture2D(image,uv);
    }`;

  function notify(message, error = false, persistent = false) {
    clearTimeout(noticeTimer);
    $('notice').textContent = message;
    $('notice').classList.toggle('error', error);
    $('notice').hidden = false;
    if (!persistent) noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 5000);
  }
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  function initializeRenderer() {
    rendererReady = false;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
      if (!gl) throw new Error('WebGL unavailable');
      program = gl.createProgram();
      const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
      gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.deleteShader(vs); gl.deleteShader(fs); gl.useProgram(program);
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(['image','size','videoSize','yaw','pitch','fov','projection','layout','eye'].map(key => [key, gl.getUniformLocation(program, key)]));
      texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.uniform1i(uniforms.image, 0);
      rendererReady = true;
      return true;
    } catch (error) {
      failed = true;
      notify('无法启用图形加速。请使用新版 Edge / Chrome，并在浏览器设置中开启图形加速后重新打开。', true, true);
      return false;
    }
  }
  function render() {
    frame = 0;
    if (!state.loaded || failed || video.readyState < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(viewport.clientWidth * dpr), height = Math.round(viewport.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height);
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      gl.uniform2f(uniforms.size, width, height);
      gl.uniform2f(uniforms.videoSize, video.videoWidth, video.videoHeight);
      gl.uniform1f(uniforms.yaw, state.yaw); gl.uniform1f(uniforms.pitch, state.pitch);
      gl.uniform1f(uniforms.fov, state.fov);
      gl.uniform1i(uniforms.projection, { flat: 0, '180': 1, '360': 2 }[state.projection]);
      const layout = state.projection === 'flat' ? 'mono' : state.layout;
      gl.uniform1i(uniforms.layout, { mono: 0, sbs: 1, tb: 2 }[layout]);
      gl.uniform1i(uniforms.eye, layout === 'mono' ? 0 : { left: 0, right: 1, both: 2 }[state.eye]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      canvas.classList.add('ready');
    } catch (error) {
      video.pause(); failed = true;
      notify('当前视频无法送入显卡渲染，请尝试较低分辨率或 H.264 编码的视频。', true, true);
      return;
    }
    if (!video.paused && !video.ended) requestRender();
  }
  function requestRender() { if (!frame) frame = requestAnimationFrame(render); }
  function resetView() { state.yaw = 0; state.pitch = 0; setFov(75); }
  function setFov(value) { state.fov = clamp(Number(value), 35, 110); $('fov').value = state.fov; $('fov-value').textContent = `${Math.round(state.fov)}°`; requestRender(); }
  function refreshSettings() {
    const normal = state.projection === 'flat';
    $('vr-settings').hidden = normal;
    viewport.classList.toggle('normal-video', normal);
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === (normal ? 'normal' : 'vr')));
    document.querySelectorAll('[data-projection]').forEach(b => b.setAttribute('aria-pressed', b.dataset.projection === state.projection));
    document.querySelectorAll('[data-eye]').forEach(b => b.setAttribute('aria-pressed', b.dataset.eye === state.eye));
    $('eye-options').disabled = state.layout === 'mono';
    $('fov').disabled = state.projection === 'flat';
    $('reset').disabled = state.projection === 'flat';
    $('reset').hidden = normal;
    requestRender();
  }
  function setMode(mode) {
    clearPictureClick();
    state.projection = mode === 'normal' ? 'flat' : state.vrProjection;
    resetView(); refreshSettings();
  }
  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '00:00';
    const total = Math.max(0, Math.floor(seconds)), h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
    return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function updateTime() {
    if (!state.url) {
      $('time').textContent = '00:00 / 00:00'; $('seek').value = 0; $('seek').disabled = true;
      return;
    }
    $('time').textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    $('seek').value = Number.isFinite(video.duration) && video.duration > 0 ? video.currentTime / video.duration * 100 : 0;
    $('seek').disabled = !state.loaded || !Number.isFinite(video.duration) || video.duration <= 0;
  }
  function syncPlayback() {
    $('play').textContent = video.paused ? '▶' : 'Ⅱ';
    $('play').setAttribute('aria-label', video.paused ? '播放' : '暂停');
    $('file-state').textContent = !state.loaded ? '等待打开' : video.ended ? '播放结束' : video.paused ? '已暂停' : '正在播放';
    showControls();
  }
  function canHideControls() {
    const focused = document.activeElement;
    const editingControls = transport.contains(focused) && (keyboardNavigation || focused.matches('input[type="number"],select'));
    return document.fullscreenElement === player && state.loaded && !video.paused && !video.ended && !drag && !transport.matches(':hover') && !editingControls;
  }
  function showControls() {
    clearTimeout(controlsTimer);
    player.classList.remove('controls-hidden'); transport.inert = false;
    if (!canHideControls()) return;
    controlsTimer = setTimeout(() => {
      if (!canHideControls()) return;
      // A button clicked with the mouse should not retain focus in a hidden bar.
      if (transport.contains(document.activeElement)) document.activeElement.blur();
      player.classList.add('controls-hidden'); transport.inert = true;
    }, 1000);
  }
  player.addEventListener('pointermove', showControls);
  player.addEventListener('pointerdown', () => { keyboardNavigation = false; showControls(); });
  player.addEventListener('pointerup', showControls);
  player.addEventListener('pointerleave', showControls);
  transport.addEventListener('pointerenter', showControls);
  transport.addEventListener('pointerleave', showControls);
  transport.addEventListener('focusin', showControls);
  transport.addEventListener('focusout', () => queueMicrotask(() => {
    if (!player.classList.contains('controls-hidden')) showControls();
  }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') keyboardNavigation = true;
    if (document.fullscreenElement === player) showControls();
  }, true);
  async function play() {
    const generation = state.generation;
    try { await video.play(); }
    catch (error) { if (generation === state.generation && error.name !== 'AbortError') notify('点击播放继续；若仍无法播放，请检查视频编码。'); }
  }
  function togglePlayback(source) {
    if (source !== 'picture') clearPictureClick();
    if (state.loaded) { if (video.paused) play(); else video.pause(); }
  }
  function seekBy(seconds) { if (state.loaded && Number.isFinite(video.duration)) video.currentTime = clamp(video.currentTime + seconds, 0, video.duration); }
  function applySpeed() {
    const rate = $('speed').valueAsNumber;
    if (!Number.isFinite(rate) || rate < .25 || rate > 4) {
      $('speed').value = state.rate;
      notify('请输入 0.25～4 之间的倍速，例如 1.05 或 1.1。');
      return;
    }
    try {
      video.playbackRate = rate;
      state.rate = rate; $('speed').value = rate;
    } catch {
      $('speed').value = state.rate;
      notify('当前浏览器不支持这个倍速，请换一个数值。');
    }
  }
  function releaseMedia() {
    clearPictureClick();
    // Invalidate pending play promises before unloading, including a stop during load.
    state.generation++; state.loaded = false;
    const previousUrl = state.url; state.url = null;
    cancelAnimationFrame(frame); frame = 0;
    mediaEvents?.abort();
    video.pause(); video.removeAttribute('src'); video.load();
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    delete video.dataset.size;
    // Chromium can retain currentSrc after load() with no src. A fresh element
    // removes that stale identity as well as decoder state and queued events.
    const freshVideo = video.cloneNode(false);
    freshVideo.volume = video.volume; freshVideo.muted = video.muted;
    video.replaceWith(freshVideo); video = freshVideo; bindVideoEvents();
  }
  function clearCurrentVideo() {
    releaseMedia();
    clearTimeout(noticeTimer);
    $('file').value = '';
    $('filename').textContent = '尚未打开视频'; $('filename').removeAttribute('title');
    $('fileinfo').textContent = '';
    $('notice').hidden = true; $('notice').textContent = ''; $('notice').classList.remove('error');
    $('empty').hidden = false; canvas.classList.remove('ready');
    // Replace GPU texture storage and clear the framebuffer, not just hide the last frame.
    if (gl && !gl.isContextLost() && texture) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0]));
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    drag = null; dragDepth = 0; viewport.classList.remove('dragging'); $('player').classList.remove('file-drag');
    state.yaw = 0; state.pitch = 0; state.fov = 75; $('fov').value = 75; $('fov-value').textContent = '75°';
    state.rate = 1; $('speed').value = 1; video.playbackRate = 1;
    $('play').disabled = true; $('back').disabled = true; $('stop').disabled = true;
    if ('mediaSession' in navigator) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; }
    updateTime(); syncPlayback();
  }
  function stopAndClear() {
    // Revoke the only active URL, then release every queued File reference.
    clearCurrentVideo();
    for (const item of playlist) item.file = null;
    playlist = []; activeItem = null; nextItemId = 1;
    renderPlaylist();
    state.vrProjection = '180'; state.layout = 'sbs'; state.eye = 'left'; $('layout').value = 'sbs';
    setMode('normal');
    $('playlist-status').textContent = '已清空播放列表。';
  }
  function fileSize(file) {
    return file.size >= 1024 ** 3 ? `${(file.size / 1024 ** 3).toFixed(2)} GB` : `${(file.size / 1024 ** 2).toFixed(1)} MB`;
  }
  function renderPlaylist() {
    const fragment = document.createDocumentFragment();
    playlist.forEach((item, index) => {
      const row = document.createElement('li'); row.className = 'playlist-item';
      const choose = document.createElement('button'); choose.className = 'playlist-select';
      choose.dataset.action = 'play'; choose.dataset.id = item.id;
      if (item.id === activeItem) choose.setAttribute('aria-current', 'true');
      const number = document.createElement('span'); number.className = 'playlist-number'; number.textContent = String(index + 1).padStart(2, '0');
      const detail = document.createElement('span'); detail.className = 'playlist-detail';
      const name = document.createElement('strong'); name.textContent = item.file.name;
      const meta = document.createElement('span'); meta.textContent = `${fileSize(item.file)}${item.id === activeItem ? ' · 当前视频' : ''}`;
      detail.append(name, meta); choose.append(number, detail);
      const remove = document.createElement('button'); remove.className = 'playlist-remove';
      remove.dataset.action = 'remove'; remove.dataset.id = item.id; remove.textContent = '×';
      remove.setAttribute('aria-label', `移除第 ${index + 1} 个视频`); remove.title = '从当前会话移除';
      row.append(choose, remove); fragment.append(row);
    });
    $('playlist-items').replaceChildren(fragment);
    $('playlist-count').textContent = `${playlist.length} 个视频`;
    $('clear-list').disabled = !playlist.length && !state.url;
    $('stop').disabled = !playlist.length && !state.url;
  }
  function selectItem(id) {
    const item = playlist.find(item => item.id === id);
    if (!item) return;
    if (loadFile(item.file)) { activeItem = id; renderPlaylist(); }
  }
  function removeItem(id) {
    const item = playlist.find(item => item.id === id);
    if (!item) return;
    if (activeItem === id) { clearCurrentVideo(); activeItem = null; }
    item.file = null; playlist = playlist.filter(item => item.id !== id);
    renderPlaylist();
    $('playlist-status').textContent = `已移除一个视频，当前列表剩余 ${playlist.length} 项。`;
  }
  function addFiles(files) {
    let firstId = null, count = 0, skipped = 0;
    for (const file of files) {
      if ((!file.type.startsWith('video/') && !/\.(mp4|webm|mkv|mov|m4v|ogv|ogg|avi|wmv|ts|m2ts)$/i.test(file.name)) || !file.size) { skipped++; continue; }
      const id = nextItemId++; playlist.push({ id, file }); count++;
      if (firstId === null) firstId = id;
    }
    if (count) {
      selectItem(firstId); renderPlaylist();
      $('playlist-status').textContent = `已添加 ${count} 个视频${skipped ? `，跳过 ${skipped} 个无效文件` : ''}。`;
    } else if (skipped) notify('请选择视频文件，例如 MP4 或 WebM；空文件无法播放。', true);
  }
  function loadFile(file) {
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mkv|mov|m4v|ogv|ogg|avi|wmv|ts|m2ts)$/i.test(file.name)) {
      notify('请选择视频文件，例如 MP4 或 WebM。', true); return;
    }
    if (!file.size) { notify('这个文件是空的，请选择其他视频。', true); return; }
    if (!rendererReady || gl.isContextLost()) { notify('图形加速不可用，请重新打开页面后再试。', true, true); return; }
    releaseMedia(); failed = false;
    state.url = URL.createObjectURL(file);
    $('stop').disabled = false;
    clearTimeout(noticeTimer); $('notice').hidden = true;
    $('empty').hidden = true; canvas.classList.remove('ready');
    $('play').disabled = true; $('back').disabled = true; $('seek').disabled = true;
    $('filename').textContent = file.name;
    $('filename').title = file.name;
    const units = fileSize(file);
    $('fileinfo').textContent = units;
    video.dataset.size = units;
    $('file-state').textContent = '正在加载';
    resetView();
    video.src = state.url; video.load(); updateTime();
    return true;
  }
  $('choose').onclick = $('add-files').onclick = () => { $('file').value = ''; $('file').click(); };
  $('file').onchange = event => {
    addFiles(Array.from(event.target.files));
    // The playlist owns session-only references; the chooser keeps no extra copy.
    event.target.value = '';
  };
  $('clear-list').onclick = stopAndClear;
  $('playlist-items').onclick = event => {
    const button = event.target.closest('button[data-action]');
    if (!button || !$('playlist-items').contains(button)) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === 'remove') removeItem(id); else selectItem(id);
  };
  ['dragenter','dragover','dragleave','drop'].forEach(type => document.addEventListener(type, event => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    if (type === 'dragenter') { dragDepth++; $('player').classList.add('file-drag'); }
    if (type === 'dragover') event.dataTransfer.dropEffect = 'copy';
    if (type === 'dragleave') { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('player').classList.remove('file-drag'); }
    if (type === 'drop') { dragDepth = 0; $('player').classList.remove('file-drag'); addFiles(Array.from(event.dataTransfer.files)); }
  }));
  function bindVideoEvents() {
    mediaEvents?.abort();
    mediaEvents = new AbortController();
    const boundVideo = video;
    const on = (type, handler) => boundVideo.addEventListener(type, event => {
      if (boundVideo === video) handler(event);
    }, { signal: mediaEvents.signal });
  on('loadedmetadata', () => {
    if (!state.url) return;
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (video.videoWidth > limit || video.videoHeight > limit) {
      notify(`视频分辨率超过当前显卡限制（单边 ${limit} 像素），请选择较低分辨率版本。`, true, true); $('file-state').textContent = '分辨率不支持'; return;
    }
    state.loaded = true;
    $('fileinfo').textContent = `${video.dataset.size} · ${video.videoWidth} × ${video.videoHeight}`;
    $('play').disabled = false; $('back').disabled = false;
    video.playbackRate = state.rate;
    updateTime(); play();
  });
  on('loadeddata', requestRender);
  // Decoding may stall after play; restart rendering when frames become available.
  on('playing', requestRender);
  on('canplay', requestRender);
  on('seeked', () => { requestRender(); updateTime(); });
  on('timeupdate', updateTime);
  on('play', () => { syncPlayback(); requestRender(); });
  on('pause', syncPlayback);
  on('ended', syncPlayback);
  on('error', () => {
    if (!state.url) return;
    state.loaded = false; $('play').disabled = true; $('back').disabled = true; $('seek').disabled = true;
    canvas.classList.remove('ready'); $('file-state').textContent = '无法播放';
    showControls();
    notify('浏览器无法解码这个视频，或文件已损坏。请尝试 H.264 + AAC 的 MP4，或 VP9 的 WebM。MKV / HEVC 等格式的支持取决于浏览器和系统。', true, true);
  });
  on('volumechange', () => {
    const muted = video.muted || video.volume === 0;
    $('mute').textContent = muted ? '×' : '♪'; $('mute').setAttribute('aria-label', muted ? '取消静音' : '静音');
    $('volume').value = video.muted ? 0 : video.volume;
  });
  }
  bindVideoEvents();
  $('play').onclick = togglePlayback; $('back').onclick = () => seekBy(-10);
  $('stop').onclick = stopAndClear;
  $('seek').oninput = event => { if (Number.isFinite(video.duration)) video.currentTime = video.duration * Number(event.target.value) / 100; };
  $('volume').oninput = event => { video.volume = Number(event.target.value); video.muted = video.volume === 0; };
  $('mute').onclick = () => { video.muted = !video.muted; };
  $('speed').onchange = applySpeed;
  $('speed').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); $('speed').blur(); } };
  async function fullscreen() {
    clearPictureClick();
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('player').requestFullscreen(); }
    catch { notify('当前窗口不支持全屏，请在 Edge / Chrome 中打开，或使用 F11。'); }
  }
  $('fullscreen').onclick = fullscreen;
  document.addEventListener('fullscreenchange', () => {
    $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '全屏');
    showControls(); requestRender();
  });
  $('reset').onclick = resetView; $('fov').oninput = event => setFov(event.target.value);
  $('layout').onchange = event => { state.layout = event.target.value; refreshSettings(); };
  document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => setMode(button.dataset.mode));
  document.querySelectorAll('[data-projection]').forEach(button => button.onclick = () => { state.vrProjection = button.dataset.projection; state.projection = state.vrProjection; resetView(); refreshSettings(); });
  document.querySelectorAll('[data-eye]').forEach(button => button.onclick = () => { state.eye = button.dataset.eye; refreshSettings(); });
  let pictureClick = null, pictureTimer = 0, pictureTap = false;
  function clearPictureClick() {
    clearTimeout(pictureTimer); pictureTimer = 0; pictureClick = null; pictureTap = false;
  }
  viewport.addEventListener('click', event => {
    if (!pictureTap || !state.loaded || event.target.closest('button')) return;
    pictureTap = false;
    if (event.detail === 2) { clearTimeout(pictureTimer); return; }
    clearPictureClick();
    pictureClick = { paused: video.paused, applied: false };
    pictureTimer = setTimeout(() => {
      pictureClick.applied = true;
      togglePlayback('picture');
    }, 300);
  });
  viewport.addEventListener('dblclick', event => {
    if (!pictureClick || !state.loaded || event.target.closest('button')) return;
    event.preventDefault();
    const previous = pictureClick;
    clearPictureClick();
    // A slower OS-recognized double click may follow the single-click delay.
    if (previous.applied) { if (previous.paused) video.pause(); else play(); }
    fullscreen();
  });
  viewport.addEventListener('pointerdown', event => {
    if (!state.loaded || event.target.closest('button') || event.button !== 0 || !event.isPrimary) return;
    viewport.focus({ preventScroll: true });
    drag = { pointerId: event.pointerId, moved: false, x: event.clientX, y: event.clientY, yaw: state.yaw, pitch: state.pitch };
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) { drag.moved = true; clearPictureClick(); }
    if (!drag.moved || state.projection === 'flat') return;
    viewport.classList.add('dragging');
    const scale = state.fov * Math.PI / 180 / viewport.clientHeight;
    state.yaw = drag.yaw - (event.clientX - drag.x) * scale;
    if (state.projection === '180') state.yaw = clamp(state.yaw, -Math.PI / 2, Math.PI / 2);
    state.pitch = clamp(drag.pitch + (event.clientY - drag.y) * scale, -Math.PI * .49, Math.PI * .49);
    requestRender();
  });
  const stopDrag = () => { drag = null; viewport.classList.remove('dragging'); };
  viewport.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const clicked = !drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 5;
    stopDrag();
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    pictureTap = clicked;
  });
  viewport.addEventListener('pointercancel', () => { stopDrag(); clearPictureClick(); }); viewport.addEventListener('lostpointercapture', stopDrag);
  viewport.addEventListener('wheel', event => { if (state.projection !== 'flat' && state.loaded) { event.preventDefault(); setFov(state.fov + Math.sign(event.deltaY) * 3); } }, { passive: false });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.target.isContentEditable) return;
    const editing = event.target.matches('input:not([type="range"]):not([type="file"]),select,textarea');
    if (editing) return;
    if (event.code === 'Space' && (document.fullscreenElement === player || player.contains(event.target) || event.target === document.body)) {
      event.preventDefault(); if (!event.repeat) togglePlayback(); return;
    }
    if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if (event.code === 'ArrowLeft') { event.preventDefault(); seekBy(-10); }
    else if (event.code === 'ArrowRight') { event.preventDefault(); seekBy(10); }
    else if (event.code === 'KeyF') fullscreen();
    else if (event.code === 'KeyR') resetView();
    else if (event.code === 'KeyM') video.muted = !video.muted;
  });
  new ResizeObserver(requestRender).observe(viewport);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); rendererReady = false; failed = true; video.pause(); notify('图形设备暂时不可用，正在等待恢复。', true, true); });
  canvas.addEventListener('webglcontextrestored', () => { failed = false; if (initializeRenderer()) { $('notice').hidden = true; requestRender(); } });
  // Also clear before a page is stored in the browser's back/forward cache.
  window.addEventListener('pagehide', stopAndClear);
  video.volume = .8; initializeRenderer(); refreshSettings();
})();
