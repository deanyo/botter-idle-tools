"use strict";
(() => {
  const DATA = 'data/';
  const ASSETS = 'assets/tiles/';
  const DRAFT_KEY = 'botter-sprite-editor-v1';
  // Shared with item_wizard.js: the wizard seeds the editor, the editor hands sprites back.
  const SEED_KEY = 'botter-sprite-seed-v1';
  const HANDOFF_KEY = 'botter-sprite-handoff-v1';
  const SIZE = 32, VIEW = 512, CELL = VIEW / SIZE;
  const SLOTS = {weapon:'Weapon',armor:'Body armour',helm:'Helm',shield:'Shield',boots:'Boots',gloves:'Gloves',cloak:'Cloak',ring:'Ring',amulet:'Amulet'};
  const OVERLAYS = {weapon:'weapons',armor:'body',helm:'helm',shield:'shield',boots:'boots',gloves:'gloves',cloak:'cloak'};
  const BASE_PALETTE = ['#000000','#3b2a1a','#6b4a2b','#a07040','#d8b070','#f0e0b0','#ffffff','#7a7a7a','#4a4a52',
    '#2b3a6b','#4a6fd0','#7ac0f0','#2b6b2b','#5fc04a','#8b1a1a','#e04a3a','#f0a020','#8a3ac0','#e070c0'];
  const $ = id => document.getElementById(id);
  let items = [], icons = [], files = {}, bodies = [], bodyImage = null;
  let slot = 'helm', tab = 'icon', tool = 'pencil', colour = [200,160,80,255];
  let pickerPage = 0, drawing = null;
  const docs = {icon: blankDoc(), overlay: blankDoc()};
  const pix = document.createElement('canvas'); pix.width = pix.height = SIZE;
  const pctx = pix.getContext('2d');

  function blankDoc() { return {px:new Uint8ClampedArray(SIZE*SIZE*4), source:{kind:'blank'}, dirty:false, undo:[], redo:[]}; }
  const doc = () => docs[tab];
  const hasOverlay = () => Object.hasOwn(OVERLAYS, slot);
  const overlayOptions = s => (files['res://assets/tiles/player/' + OVERLAYS[s] + '/'] || []).map(f => f.replace(/\.png$/, ''));
  const shippedUrl = (kind, file) => ASSETS + (kind === 'icon' ? 'items/' + file : 'player/' + OVERLAYS[slot] + '/' + file + '.png');
  const hex = c => '#' + c.slice(0,3).map(v => v.toString(16).padStart(2,'0')).join('');
  const parseHex = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)).concat(255);
  const isBlank = d => !d.px.some((v,i) => i % 4 === 3 && v > 0);

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => img.naturalWidth ? resolve(img) : reject(new Error('The image is empty.'));
      img.onerror = () => reject(new Error('Could not load ' + url));
      img.src = url;
    });
  }
  function pixelsOf(img) {
    if (img.naturalWidth !== SIZE || img.naturalHeight !== SIZE) throw new Error(`Sprites must be exactly 32 × 32 pixels; this one is ${img.naturalWidth} × ${img.naturalHeight}.`);
    const c = document.createElement('canvas'); c.width = c.height = SIZE;
    const ctx = c.getContext('2d'); ctx.drawImage(img,0,0);
    return new Uint8ClampedArray(ctx.getImageData(0,0,SIZE,SIZE).data);
  }
  function pngOf(d) {
    pctx.putImageData(new ImageData(new Uint8ClampedArray(d.px),SIZE,SIZE),0,0);
    return pix.toDataURL('image/png');
  }

  function render() {
    const d = doc(), canvas = $('canvas'), ctx = canvas.getContext('2d');
    pctx.putImageData(new ImageData(new Uint8ClampedArray(d.px),SIZE,SIZE),0,0);
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0,0,VIEW,VIEW);
    const withBody = tab === 'overlay' && bodyImage && $('show-body').checked;
    if (withBody) { ctx.globalAlpha = .45; ctx.drawImage(bodyImage,0,0,VIEW,VIEW); ctx.globalAlpha = 1; }
    ctx.drawImage(pix,0,0,VIEW,VIEW);
    if ($('grid').checked) {
      ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 1; i < SIZE; i++) { ctx.moveTo(i*CELL+.5,0); ctx.lineTo(i*CELL+.5,VIEW); ctx.moveTo(0,i*CELL+.5); ctx.lineTo(VIEW,i*CELL+.5); }
      ctx.stroke();
    }
    if ($('mirror').checked) { ctx.strokeStyle = 'rgba(68,147,248,.7)'; ctx.beginPath(); ctx.moveTo(VIEW/2,0); ctx.lineTo(VIEW/2,VIEW); ctx.stroke(); }
    for (const scale of [1,2,4]) {
      const p = $('preview-' + scale).getContext('2d'); p.imageSmoothingEnabled = false; p.clearRect(0,0,SIZE*scale,SIZE*scale);
      if (tab === 'overlay' && bodyImage) p.drawImage(bodyImage,0,0,SIZE*scale,SIZE*scale);
      p.drawImage(pix,0,0,SIZE*scale,SIZE*scale);
    }
    $('undo').disabled = !d.undo.length; $('redo').disabled = !d.redo.length;
    $('source').textContent = describeSource(d);
  }
  function describeSource(d) {
    const s = d.source;
    const base = s.kind === 'shipped' ? `Started from ${s.file}${tab === 'overlay' ? '.png' : ''}` : s.kind === 'upload' ? 'Started from your uploaded PNG' : s.kind === 'wizard' ? 'Loaded from the item wizard' : 'Blank canvas';
    return base + (d.dirty ? ' · edited' : '');
  }
  function renderPalette() {
    const counts = new Map(), px = doc().px;
    for (let i = 0; i < px.length; i += 4) if (px[i+3] > 0) { const h = hex([px[i],px[i+1],px[i+2]]); counts.set(h,(counts.get(h) || 0) + 1); }
    const swatches = list => list.map(h => {
      const b = document.createElement('button'); b.type = 'button'; b.style.background = h; b.title = h; b.setAttribute('aria-label','Colour ' + h);
      b.setAttribute('aria-pressed', String(h === hex(colour)));
      b.addEventListener('click', () => setColour(parseHex(h))); return b;
    });
    $('sprite-palette').replaceChildren(...swatches([...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0,24).map(([h]) => h)));
    if (!counts.size) $('sprite-palette').textContent = 'No colours yet.';
    $('base-palette').replaceChildren(...swatches(BASE_PALETTE));
  }
  function setColour(c) { colour = c; $('colour').value = hex(c); $('colour-hex').textContent = hex(c); renderPalette(); }
  function setTool(name) { tool = name; document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === name))); }
  function setTab(name) {
    if (name === 'overlay' && !hasOverlay()) name = 'icon';
    tab = name;
    for (const b of document.querySelectorAll('[data-doc]')) b.setAttribute('aria-selected', String(b.dataset.doc === tab));
    $('tab-overlay').disabled = !hasOverlay(); $('tab-overlay').title = hasOverlay() ? '' : 'Jewellery has no sprite on the character';
    $('body-toggle').hidden = tab !== 'overlay';
    render(); renderPalette(); save();
  }

  function snapshot() { const d = doc(); d.undo.push(new Uint8ClampedArray(d.px)); if (d.undo.length > 100) d.undo.shift(); d.redo = []; }
  function commit() { doc().dirty = true; render(); renderPalette(); save(); }
  function undo(redo) {
    const d = doc(), from = redo ? d.redo : d.undo, to = redo ? d.undo : d.redo;
    if (!from.length) return;
    to.push(new Uint8ClampedArray(d.px)); d.px = from.pop(); commit();
  }
  function setPixel(x, y, rgba) {
    for (const px of $('mirror').checked ? [x, SIZE-1-x] : [x]) {
      if (px < 0 || y < 0 || px >= SIZE || y >= SIZE) continue;
      doc().px.set(rgba, (y*SIZE + px)*4);
    }
  }
  function line(a, b, rgba) {
    let [x0,y0] = a; const [x1,y1] = b, dx = Math.abs(x1-x0), dy = -Math.abs(y1-y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { setPixel(x0,y0,rgba); if (x0 === x1 && y0 === y1) break; const e2 = 2*err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  function fill(x, y, rgba) {
    const px = doc().px, at = (x*1 + y*SIZE)*4, target = px.slice(at, at+4);
    if (target.every((v,i) => v === rgba[i])) return;
    const same = i => px[i] === target[0] && px[i+1] === target[1] && px[i+2] === target[2] && px[i+3] === target[3];
    const stack = [[x,y]];
    while (stack.length) {
      const [cx,cy] = stack.pop(); if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;
      const i = (cy*SIZE + cx)*4; if (!same(i)) continue;
      px.set(rgba, i); stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
    }
  }
  function cellAt(e) {
    const r = $('canvas').getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / r.width * SIZE), Math.floor((e.clientY - r.top) / r.height * SIZE)];
  }
  function bindCanvas() {
    const canvas = $('canvas');
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      const [x,y] = cellAt(e), active = e.button === 2 ? 'eraser' : tool;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
      if (active === 'picker') { const i = (y*SIZE + x)*4, px = doc().px; if (px[i+3]) setColour([px[i],px[i+1],px[i+2],255]); return; }
      snapshot();
      const rgba = active === 'eraser' ? [0,0,0,0] : colour;
      if (active === 'fill') { fill(x,y,rgba); if ($('mirror').checked) fill(SIZE-1-x,y,rgba); commit(); return; }
      setPixel(x,y,rgba); drawing = {last:[x,y], rgba}; canvas.setPointerCapture(e.pointerId); render();
    });
    canvas.addEventListener('pointermove', e => {
      if (!drawing) return;
      const p = cellAt(e).map(v => Math.max(0, Math.min(SIZE-1, v)));
      line(drawing.last, p, drawing.rgba); drawing.last = p; render();
    });
    const end = () => { if (drawing) { drawing = null; commit(); } };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }

  function save() {
    try {
      const out = {version:1, slot, tab, body:$('body').value, docs:{}};
      for (const [k,d] of Object.entries(docs)) out.docs[k] = {png:pngOf(d), source:d.source, dirty:d.dirty};
      localStorage.setItem(DRAFT_KEY, JSON.stringify(out));
    } catch { /* storage is a convenience; the canvas still works without it */ }
  }
  async function loadDoc(kind, entry) {
    const d = blankDoc();
    if (entry?.png) { d.px = pixelsOf(await loadImage(entry.png)); d.source = entry.source || {kind:'wizard'}; d.dirty = !!entry.dirty; }
    else if (entry?.file) { d.px = pixelsOf(await loadImage(shippedUrl(kind, entry.file))); d.source = {kind:'shipped', file:entry.file}; }
    docs[kind] = d;
  }
  async function restore() {
    let raw = null; try { raw = localStorage.getItem(DRAFT_KEY); } catch {}
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Object.hasOwn(SLOTS, saved.slot)) return false;
    slot = saved.slot; tab = saved.tab === 'overlay' ? 'overlay' : 'icon';
    if (bodies.some(b => b.sprite === saved.body)) $('body').value = saved.body;
    for (const kind of ['icon','overlay']) if (saved.docs?.[kind]) await loadDoc(kind, saved.docs[kind]);
    return true;
  }
  async function consumeSeed() {
    let raw = null; try { raw = localStorage.getItem(SEED_KEY); localStorage.removeItem(SEED_KEY); } catch {}
    if (!raw) return '';
    const seed = JSON.parse(raw);
    if (!Object.hasOwn(SLOTS, seed.slot)) return '';
    if ((docs.icon.dirty || docs.overlay.dirty) && !confirm('Replace your current sprites with the ones from the item wizard?')) return 'Kept your current sprites.';
    slot = seed.slot;
    for (const kind of ['icon','overlay']) await loadDoc(kind, kind === 'overlay' && !hasOverlay() ? null : seed[kind]);
    return 'Loaded your item’s sprites from the item wizard.';
  }

  function handoffEntry(kind) {
    const d = docs[kind];
    if (kind === 'overlay' && !hasOverlay()) return null;
    if (d.source.kind === 'shipped' && !d.dirty) return {file:d.source.file};
    return isBlank(d) ? null : {png:pngOf(d)};
  }
  function send() {
    const payload = {version:1, slot, icon:handoffEntry('icon'), overlay:handoffEntry('overlay'), at:Date.now()};
    if (!payload.icon && !payload.overlay) { $('send-status').textContent = 'Both sprites are blank. Draw something first.'; return; }
    try { localStorage.setItem(HANDOFF_KEY, JSON.stringify(payload)); }
    catch { $('send-status').textContent = 'Browser storage is unavailable, so the wizard can’t receive it. Use Download PNG instead.'; return; }
    const parts = [payload.icon ? 'inventory icon' : '', payload.overlay ? 'character sprite' : ''].filter(Boolean).join(' and ');
    $('send-status').textContent = `Sent the ${parts}. Open the item wizard in this browser; it appears on the Sprites step.`;
  }
  function download() {
    const d = doc(); if (isBlank(d)) { $('send-status').textContent = 'This sprite is blank.'; return; }
    const a = document.createElement('a'); a.href = pngOf(d);
    a.download = (d.source.kind === 'shipped' ? d.source.file.replace(/\.png$/,'') + '_edit' : 'my_' + (tab === 'icon' ? 'icon' : 'character_sprite')) + '.png';
    a.click();
  }

  function openPicker() {
    pickerPage = 0; $('sprite-search').value = ''; $('sprite-all').checked = false;
    $('sprite-all-label').hidden = tab !== 'icon';
    $('picker-title').textContent = tab === 'icon' ? 'Start from an inventory sprite' : 'Start from a character sprite';
    renderPicker(); $('sprite-picker').showModal(); $('sprite-search').focus();
  }
  function renderPicker() {
    const search = $('sprite-search').value.trim().toLowerCase();
    const themed = new Set(items.filter(i => i.slot === slot).map(i => i.tile));
    let candidates = tab === 'overlay' ? overlayOptions(slot) : icons.filter(f => $('sprite-all').checked || themed.has(f));
    candidates = candidates.filter(f => f.toLowerCase().includes(search)).sort();
    const pages = Math.max(1, Math.ceil(candidates.length / 48)); pickerPage = Math.min(pickerPage, pages - 1);
    $('sprite-count').textContent = `${candidates.length} sprites · Page ${pickerPage+1} of ${pages}`;
    $('sprite-prev').disabled = pickerPage === 0; $('sprite-next').disabled = pickerPage >= pages - 1;
    $('sprites').replaceChildren(...candidates.slice(pickerPage*48, (pickerPage+1)*48).map(file => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sprite-option'; b.dataset.sprite = file;
      const stage = document.createElement('span'); stage.className = 'stage';
      if (tab === 'overlay' && bodyImage) { const base = document.createElement('img'); base.alt = ''; base.src = bodyImage.src; stage.append(base); }
      const img = document.createElement('img'); img.alt = ''; img.src = shippedUrl(tab, file); stage.append(img);
      const label = document.createElement('span'); label.textContent = file;
      b.append(stage, label);
      b.addEventListener('click', async () => {
        if (doc().dirty && !confirm('Replace this sprite? Your edits to it will be lost.')) return;
        try { await loadDoc(tab, {file}); $('sprite-picker').close(); setTab(tab); }
        catch (e) { $('sprite-count').textContent = e.message; }
      });
      return b;
    }));
    if (!candidates.length) $('sprites').textContent = 'No matching sprites.';
  }

  async function setBody() {
    const body = bodies.find(b => b.sprite === $('body').value) || bodies[0];
    try { bodyImage = await loadImage(ASSETS + 'player/species/' + body.sprite); } catch { bodyImage = null; }
    render(); save();
  }
  function bind() {
    $('slot').replaceChildren(...Object.entries(SLOTS).map(([v,t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
    $('slot').value = slot;
    $('slot').addEventListener('change', () => {
      slot = $('slot').value;
      // A shipped overlay belongs to the previous slot's folder; keep the pixels as the author's own.
      if (docs.overlay.source.kind === 'shipped') docs.overlay.dirty = true;
      setTab(tab);
    });
    for (const b of document.querySelectorAll('[data-doc]')) b.addEventListener('click', () => setTab(b.dataset.doc));
    for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => setTool(b.dataset.tool));
    for (const id of ['grid','mirror','show-body']) $(id).addEventListener('change', render);
    $('colour').addEventListener('input', () => setColour(parseHex($('colour').value)));
    $('undo').addEventListener('click', () => undo(false)); $('redo').addEventListener('click', () => undo(true));
    $('body').addEventListener('change', setBody);
    $('open-picker').addEventListener('click', openPicker);
    $('picker-close').addEventListener('click', () => $('sprite-picker').close());
    for (const id of ['sprite-search','sprite-all']) $(id).addEventListener('input', () => { pickerPage = 0; renderPicker(); });
    $('sprite-prev').addEventListener('click', () => { pickerPage--; renderPicker(); });
    $('sprite-next').addEventListener('click', () => { pickerPage++; renderPicker(); });
    $('upload').addEventListener('click', () => $('upload-file').click());
    $('upload-file').addEventListener('change', async () => {
      const file = $('upload-file').files[0]; $('upload-file').value = ''; if (!file) return;
      const url = URL.createObjectURL(file);
      try { const px = pixelsOf(await loadImage(url)); snapshot(); doc().px = px; doc().source = {kind:'upload'}; commit(); $('send-status').textContent = ''; }
      catch (e) { $('send-status').textContent = e.message; }
      finally { URL.revokeObjectURL(url); }
    });
    $('clear').addEventListener('click', () => {
      if (!confirm('Clear this sprite to a blank canvas?')) return;
      snapshot(); doc().px = new Uint8ClampedArray(SIZE*SIZE*4); doc().source = {kind:'blank'}; commit();
    });
    $('send').addEventListener('click', send); $('download').addEventListener('click', download);
    document.addEventListener('keydown', e => {
      if (e.target.matches('input[type=search], input[type=text], select, textarea') || $('sprite-picker').open) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); undo(e.shiftKey); return; }
      if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); undo(true); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tools = {b:'pencil', e:'eraser', g:'fill', i:'picker'};
      if (tools[key]) setTool(tools[key]);
      if (key === 'm') { $('mirror').checked = !$('mirror').checked; render(); }
    });
    window.addEventListener('focus', async () => { const note = await consumeSeed().catch(e => e.message); if (note) { $('slot').value = slot; setTab(tab); $('status').textContent = note; } });
    $('retry').addEventListener('click', () => location.reload());
  }
  async function init() {
    try {
      const docsJson = await Promise.all(['items.json','tile_dir_manifest.json','species.json'].map(async name => {
        const r = await fetch(DATA + name); if (!r.ok) throw new Error(name + ': HTTP ' + r.status); return r.json();
      }));
      items = docsJson[0].items.filter(i => Object.hasOwn(SLOTS, i.slot)); files = docsJson[1];
      icons = Object.entries(files).filter(([dir]) => dir.startsWith('res://assets/tiles/items/') && !dir.includes('/spells/')).flatMap(([dir,names]) => names.map(n => dir.slice('res://assets/tiles/items/'.length) + n));
      bodies = Object.values(docsJson[2].species).filter(s => s.sprite);
      if (!icons.length || !bodies.length) throw new Error('The sprite catalogue is empty.');
      $('body').replaceChildren(...bodies.map(b => { const o = document.createElement('option'); o.value = b.sprite; o.textContent = b.name; return o; }));
      let note = 'Ready. Pick a slot, then start from a game sprite or draw from scratch.';
      try { if (await restore()) note = 'Your saved sprites have been restored.'; } catch (e) { note = 'Could not restore your draft, so this is a fresh start. ' + e.message; }
      try { note = (await consumeSeed()) || note; } catch (e) { note = 'Could not load the sprites from the item wizard. ' + e.message; }
      bind(); setTool('pencil'); setColour(colour); $('slot').value = slot;
      await setBody(); setTab(tab); bindCanvas();
      $('workspace').hidden = false; $('status').textContent = note;
    } catch (e) { $('status').textContent = 'Could not load the sprite editor. ' + e.message; $('retry').hidden = false; }
  }
  init();
})();
