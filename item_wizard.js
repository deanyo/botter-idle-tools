"use strict";
(() => {
  const DATA = 'data/';
  const ASSETS = 'assets/tiles/';
  const DRAFT_KEY = 'botter-item-wizard-v1';
  const SLOTS = {weapon:'Weapon',armor:'Body armour',helm:'Helm',shield:'Shield',boots:'Boots',gloves:'Gloves',cloak:'Cloak',ring:'Ring',amulet:'Amulet'};
  const OVERLAYS = {weapon:'weapons',armor:'body',helm:'helm',shield:'shield',boots:'boots',gloves:'gloves',cloak:'cloak'};
  const RARITIES = ['common','uncommon','rare','epic','legendary'];
  const LABELS = ['Starting point','Story','Sprites','Details','Share'];
  const STAT_LABELS = {damage_min:'Minimum damage',damage_max:'Maximum damage',speed:'Attack interval (seconds)',armor:'Armour',evasion:'Evasion',block_chance:'Block chance (%)',block_amount:'Block amount'};
  const $ = id => document.getElementById(id);
  const copy = value => JSON.parse(JSON.stringify(value));
  let items = [], affixes = [], files = {}, icons = [], state, step = 0, furthest = 0;
  let pickerMode = 'icon', pickerPage = 0, selectionToken = 0;
  const loaded = new Set();
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const option = (value, text) => { const node = document.createElement('option'); node.value = value; node.textContent = text; return node; };
  const template = () => items.find(i => i.id === state.templateId);
  const current = () => ({...copy(template()), ...copy(state.edits)});
  const spriteUrl = (mode, value) => ASSETS + (mode === 'icon' ? 'items/' + value : 'player/' + OVERLAYS[current().slot] + '/' + value + '.png');
  const overlayOptions = slot => (files['res://assets/tiles/player/' + OVERLAYS[slot] + '/'] || []).map(f => f.replace(/\.png$/, ''));
  const availableAffixes = slot => affixes.filter(a => a.family !== 'eternal' && ((a.applies_to || []).includes(slot) || (a.applies_to || []).includes('any')));
  function imageReady(url) {
    if (loaded.has(url)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { if (img.naturalWidth) { loaded.add(url); resolve(); } else reject(new Error('Sprite is empty.')); };
      img.onerror = () => reject(new Error('Could not load sprite: ' + url));
      img.src = url;
    });
  }
  function initial(id) {
    const base = items.find(i => i.id === id);
    const edits = {name:'',lore:base.lore || '',id:'',tile:base.tile,implicit_affixes:[...(base.implicit_affixes || [])]};
    if (OVERLAYS[base.slot]) {
      const intended = (base.overlay || base.tile.replace(/\.png$/, '')).split('/').pop();
      edits.overlay = overlayOptions(base.slot).includes(intended) ? intended : overlayOptions(base.slot)[0];
    }
    return {version:1,templateId:id,edits,author:'',idea:''};
  }
  function save() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({...state,step,furthest})); $('draft-status').textContent = 'Draft saved in this browser.'; }
    catch { $('draft-status').textContent = 'Browser storage is unavailable. Keep this page open and download your proposal.'; }
  }
  function restore(raw) {
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !items.some(i => i.id === saved.templateId)) throw new Error('The saved starting item is no longer available.');
    const clean = initial(saved.templateId);
    for (const key of ['name','lore','id','tile','overlay','rarity','unique',...Object.keys(STAT_LABELS),'implicit_affixes']) {
      if (Object.hasOwn(saved.edits || {}, key)) clean.edits[key] = saved.edits[key];
    }
    clean.author = typeof saved.author === 'string' ? saved.author.slice(0,80) : '';
    clean.idea = typeof saved.idea === 'string' ? saved.idea.slice(0,2000) : '';
    const base = items.find(i => i.id === clean.templateId);
    if (!icons.includes(clean.edits.tile)) throw new Error('The saved inventory sprite is no longer available.');
    if (OVERLAYS[base.slot] && !overlayOptions(base.slot).includes(clean.edits.overlay)) throw new Error('The saved character sprite is no longer available.');
    for (const key of ['name','lore','id']) if (typeof clean.edits[key] !== 'string') throw new Error('Invalid saved text.');
    for (const key of Object.keys(STAT_LABELS)) if (Object.hasOwn(clean.edits,key) && (!Number.isFinite(clean.edits[key]) || !Object.hasOwn(base,key))) throw new Error('Invalid saved stats.');
    const allowed = new Set([...availableAffixes(base.slot).map(a => a.id),...(base.implicit_affixes || [])]);
    if (!Array.isArray(clean.edits.implicit_affixes) || !clean.edits.implicit_affixes.every(id => allowed.has(id))) throw new Error('A saved bonus is no longer available.');
    if (clean.edits.rarity && !RARITIES.includes(clean.edits.rarity)) throw new Error('Invalid saved rarity.');
    if (Object.hasOwn(clean.edits,'unique') && typeof clean.edits.unique !== 'boolean') throw new Error('Invalid saved unique setting.');
    state = clean;
    furthest = Number.isInteger(saved.furthest) ? Math.max(0,Math.min(4,saved.furthest)) : 0;
    step = Number.isInteger(saved.step) ? Math.max(0,Math.min(furthest,saved.step)) : 0;
  }
  function setTemplates(slot, selected) {
    const candidates = items.filter(i => i.slot === slot).sort((a,b) => a.item_tier - b.item_tier || a.name.localeCompare(b.name));
    $('template').replaceChildren(...candidates.map(i => option(i.id,`${i.name} · Tier ${i.item_tier} · ${i.rarity}`)));
    $('template').value = selected || candidates[0].id;
  }
  function updateFields() {
    const item = current();
    $('slot').value = item.slot; setTemplates(item.slot,state.templateId);
    $('name').value = state.edits.name; $('lore').value = item.lore;
    $('author').value = state.author; $('idea').value = state.idea;
    $('rarity').value = item.rarity; $('unique').checked = item.unique;
    $('template-info').textContent = `${template().name}: ${item.base_type.replaceAll('_',' ')}. Tier ${item.item_tier}. Its drop weights and other mechanics are retained for review.`;
    $('stats').replaceChildren();
    for (const [key,label] of Object.entries(STAT_LABELS)) {
      if (!Object.hasOwn(template(),key)) continue;
      const wrapper = document.createElement('div'); const lab = document.createElement('label');
      lab.htmlFor = 'stat-' + key; lab.textContent = label;
      const input = document.createElement('input'); input.type = 'number'; input.id = 'stat-' + key;
      input.min = key === 'speed' ? '0.01' : '0'; input.step = key === 'speed' ? '0.01' : '1';
      if (key === 'block_chance') input.max = '100';
      input.value = item[key]; input.addEventListener('input', () => { state.edits[key] = input.value === '' ? null : Number(input.value); changed(); });
      wrapper.append(lab,input); $('stats').append(wrapper);
    }
    renderBonuses(); renderSprites(); renderPreview(); showStep();
  }
  function renderBonuses() {
    const item = current(), query = $('bonus-search').value.toLowerCase();
    const inherited = new Set(template().implicit_affixes || []);
    const candidates = affixes.filter(a => availableAffixes(item.slot).some(b => b.id === a.id) || inherited.has(a.id));
    $('bonuses').replaceChildren(...candidates.filter(a => `${a.name} ${a.stat} ${a.id}`.toLowerCase().includes(query)).map(a => {
      const label = document.createElement('label'); label.className = 'bonus';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = a.id; input.checked = item.implicit_affixes.includes(a.id);
      input.addEventListener('change', () => {
        const chosen = new Set(current().implicit_affixes);
        if (input.checked) chosen.add(a.id); else chosen.delete(a.id);
        state.edits.implicit_affixes = [...chosen]; changed();
      });
      const text = document.createElement('span'); text.textContent = a.name;
      const detail = document.createElement('small'); detail.textContent = `${a.stat.replaceAll('_',' ')} · ${a.kind || 'bonus'}`;
      text.append(detail); label.append(input,text); return label;
    }));
    if (!$('bonuses').children.length) $('bonuses').textContent = 'No matching bonuses.';
  }
  function tintStyle(tint) {
    if (!tint?.mode || tint.mode === 'none') return '';
    const hue = Number(tint.hue || 0), sat = Number(tint.sat ?? 1);
    return tint.mode === 'colorize' ? `sepia(1) saturate(${sat * 3}) hue-rotate(${hue - 40}deg)` : `hue-rotate(${hue}deg) saturate(${sat})`;
  }
  function renderSprites() {
    const item = current();
    for (const id of ['chosen-icon','preview-icon']) { $(id).src = spriteUrl('icon',item.tile); $(id).style.filter = tintStyle(item.default_tint); }
    $('icon-path').textContent = item.tile;
    $('overlay-choice').hidden = !OVERLAYS[item.slot]; $('no-overlay').hidden = !!OVERLAYS[item.slot];
    if (OVERLAYS[item.slot]) { $('chosen-overlay').src = spriteUrl('overlay',item.overlay); $('chosen-overlay').style.filter = tintStyle(item.default_tint_overlay || item.default_tint); $('overlay-path').textContent = item.overlay + '.png'; }
  }
  function renderPreview() {
    const item = current(); $('preview-name').textContent = item.name || 'Your item name';
    $('preview-meta').textContent = `${SLOTS[item.slot]} · Tier ${item.item_tier} · ${item.rarity}${item.unique ? ' · Unique' : ''}`;
    $('item-card').style.borderTopColor = `var(--rarity-${item.rarity})`;
    $('preview-stats').textContent = Object.entries(STAT_LABELS).filter(([k]) => Object.hasOwn(item,k)).map(([k,label]) => `${label}: ${item[k] ?? '—'}`).join(' · ');
    $('preview-lore').textContent = item.lore;
    $('preview-bonuses').replaceChildren(...item.implicit_affixes.map(id => { const li = document.createElement('li'); const a = affixes.find(a => a.id === id); li.textContent = a ? `${a.name} (${a.stat.replaceAll('_',' ')})` : id; return li; }));
  }
  function payload() {
    return {_proposal:{format:1,tool:'Botter item wizard',based_on:state.templateId,author:state.author,design_notes:state.idea},items:[current()]};
  }
  function renderReview() {
    const item = current();
    $('review').innerHTML = `<strong>${escape(item.name)}</strong><br>Item ID: <code>${escape(item.id)}</code><br>Based on ${escape(template().name)} · ${escape(SLOTS[item.slot])} · Tier ${item.item_tier}<br>Inventory: <code>${escape(item.tile)}</code>${OVERLAYS[item.slot] ? '<br>Character: <code>' + escape(item.overlay) + '.png</code>' : ''}<br>Built-in bonuses: ${item.implicit_affixes.length}<br>Credit: ${escape(state.author || 'Not supplied')}<br>Baseline random affix pool, drop weights, tints and other mechanics are included in the JSON for review.`;
    $('json-preview').textContent = JSON.stringify(payload(),null,2);
  }
  function changed() { $('error').textContent = ''; save(); renderPreview(); if (step === 4) renderReview(); }
  function errorFor(target) {
    const item = current();
    if (target >= 1) {
      if (!item.name.trim() || item.name.length > 80) return 'Give your item a name (1–80 characters).';
      if (!/^community_[a-z0-9_]+$/.test(item.id)) return 'Use a name with at least one English letter or number so an item ID can be created.';
      if (items.some(i => i.id === item.id)) return 'This name already has an item ID in the game. Choose a different name.';
    }
    if (target >= 2) {
      if (!icons.includes(item.tile) || !loaded.has(spriteUrl('icon',item.tile))) return 'The inventory sprite is unavailable. Choose a working sprite or retry loading.';
      if (OVERLAYS[item.slot] && (!overlayOptions(item.slot).includes(item.overlay) || !loaded.has(spriteUrl('overlay',item.overlay)))) return 'The character sprite is unavailable. Choose a working sprite or retry loading.';
    }
    if (target >= 3) {
      if (!RARITIES.includes(item.rarity)) return 'Choose a valid rarity.';
      for (const key of Object.keys(STAT_LABELS)) if (Object.hasOwn(item,key)) {
        const value = item[key];
        if (!Number.isFinite(value) || value < 0 || (key === 'speed' && value < .01) || (key !== 'speed' && !Number.isInteger(value)) || (key === 'block_chance' && value > 100)) return 'Check the value for ' + STAT_LABELS[key].toLowerCase() + '.';
      }
      if (item.damage_min > item.damage_max) return 'Maximum damage must be at least minimum damage.';
    }
    return '';
  }
  async function validateSprites() {
    const item = current();
    await Promise.all([imageReady(spriteUrl('icon',item.tile)),...(OVERLAYS[item.slot] ? [imageReady(spriteUrl('overlay',item.overlay))] : [])]);
  }
  function showStep() {
    document.querySelectorAll('[data-step]').forEach(n => n.hidden = Number(n.dataset.step) !== step);
    $('steps').replaceChildren(...LABELS.map((label,index) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = `${index+1}. ${label}`; button.disabled = index > furthest;
      if (index === step) button.setAttribute('aria-current','step');
      button.addEventListener('click', () => go(index)); return button;
    }));
    $('back').disabled = step === 0; $('next').hidden = step === 4;
    if (step === 4) renderReview();
  }
  async function go(index) {
    if (index > step) {
      try { await validateSprites(); } catch (e) { $('error').textContent = e.message; return; }
      const error = errorFor(index - 1); if (error) { $('error').textContent = error; return; }
    }
    step = index; furthest = Math.max(furthest,step); $('error').textContent = ''; showStep(); save();
    const heading = document.querySelector(`[data-step="${step}"] h2`); heading.tabIndex = -1; heading.focus();
  }
  function changeBase(id) {
    if ((state.edits.name || state.idea) && !confirm('Changing the starting item resets this design. Continue?')) { updateFields(); return; }
    state = initial(id); step = 0; furthest = 0; updateFields(); save();
    validateSprites().catch(e => { $('status').textContent = e.message; });
  }
  function openPicker(mode) {
    pickerMode = mode; pickerPage = 0; $('sprite-search').value = ''; $('sprite-all').checked = false;
    $('sprite-all').parentElement.hidden = mode !== 'icon'; $('picker-error').textContent = '';
    $('picker-title').textContent = mode === 'icon' ? 'Choose an inventory sprite' : 'Choose a character sprite';
    renderPicker(); $('sprite-picker').showModal(); $('sprite-search').focus();
  }
  function renderPicker() {
    const item = current(), search = $('sprite-search').value.trim().toLowerCase();
    const themed = new Set(items.filter(i => i.slot === item.slot).map(i => i.tile));
    let candidates = pickerMode === 'overlay' ? overlayOptions(item.slot) : icons.filter(f => $('sprite-all').checked || themed.has(f));
    candidates = candidates.filter(f => f.toLowerCase().includes(search)).sort();
    const pages = Math.max(1,Math.ceil(candidates.length / 48)); pickerPage = Math.min(pickerPage,pages - 1);
    $('sprite-count').textContent = `${candidates.length} matches · Page ${pickerPage+1} of ${pages}`;
    $('sprite-prev').disabled = pickerPage === 0; $('sprite-next').disabled = pickerPage >= pages - 1;
    $('sprites').replaceChildren(...candidates.slice(pickerPage*48,(pickerPage+1)*48).map(file => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'sprite-option'; button.dataset.sprite = file;
      button.setAttribute('aria-label',file); button.setAttribute('aria-pressed',String(file === (pickerMode === 'icon' ? item.tile : item.overlay)));
      const stage = document.createElement('span'); stage.className = 'sprite-stage'; stage.style.display = 'block';
      if (pickerMode === 'overlay') { const base = document.createElement('img'); base.alt = ''; base.src = ASSETS + 'player/spriggan_female.png'; stage.append(base); }
      const image = document.createElement('img'); image.alt = ''; image.src = spriteUrl(pickerMode,file); stage.append(image);
      const label = document.createElement('span'); label.textContent = file; button.append(stage,label);
      image.addEventListener('error', () => { button.disabled = true; label.textContent = file + ' (unavailable)'; });
      button.addEventListener('click', async () => {
        const token = ++selectionToken, mode = pickerMode; button.disabled = true;
        try {
          await imageReady(spriteUrl(mode,file)); if (token !== selectionToken) return;
          state.edits[mode === 'icon' ? 'tile' : 'overlay'] = file;
          $('sprite-picker').close(); renderSprites(); changed();
        } catch (e) { $('picker-error').textContent = e.message; button.disabled = false; }
      });
      return button;
    }));
    if (!candidates.length) $('sprites').textContent = 'No matching sprites. Try a different search.';
  }
  async function exportProposal(clipboard) {
    try { await validateSprites(); } catch (e) { $('error').textContent = e.message; return; }
    const error = errorFor(3); if (error) { $('error').textContent = error; return; }
    const json = JSON.stringify(payload(),null,2) + '\n';
    if (clipboard) {
      try { await navigator.clipboard.writeText(json); $('status').textContent = 'Proposal copied. Send it to the developer for review.'; }
      catch { $('status').textContent = 'Clipboard unavailable. Use Download proposal to save a file.'; }
    } else {
      const url = URL.createObjectURL(new Blob([json],{type:'application/json'}));
      const a = document.createElement('a'); a.href = url; a.download = 'item_' + current().id + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url),1000); $('status').textContent = 'Proposal downloaded. Send the JSON file to the developer for review.';
    }
  }
  function bind() {
    $('slot').replaceChildren(...Object.entries(SLOTS).map(([value,text]) => option(value,text)));
    $('slot').addEventListener('change', () => { const candidate = items.find(i => i.slot === $('slot').value); changeBase(candidate.id); });
    $('template').addEventListener('change', () => changeBase($('template').value));
    for (const id of ['name','lore','author','idea']) $(id).addEventListener('input', () => {
      if (id === 'name') { state.edits.name = $('name').value; const slug = state.edits.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''); state.edits.id = slug ? 'community_' + slug : ''; }
      else if (id === 'lore') state.edits.lore = $('lore').value;
      else state[id] = $(id).value;
      changed();
    });
    $('rarity').addEventListener('change', () => { state.edits.rarity = $('rarity').value; changed(); });
    $('unique').addEventListener('change', () => { state.edits.unique = $('unique').checked; changed(); });
    $('bonus-search').addEventListener('input',renderBonuses);
    $('pick-icon').addEventListener('click', () => openPicker('icon'));
    $('pick-overlay').addEventListener('click', () => openPicker('overlay'));
    $('picker-close').addEventListener('click', () => { selectionToken++; $('sprite-picker').close(); });
    $('sprite-picker').addEventListener('cancel', () => selectionToken++);
    for (const id of ['sprite-search','sprite-all']) $(id).addEventListener('input', () => { pickerPage = 0; renderPicker(); });
    $('sprite-prev').addEventListener('click', () => { pickerPage--; renderPicker(); });
    $('sprite-next').addEventListener('click', () => { pickerPage++; renderPicker(); });
    $('next').addEventListener('click', () => go(step+1)); $('back').addEventListener('click', () => go(step-1));
    $('download').addEventListener('click', () => exportProposal(false)); $('copy').addEventListener('click', () => exportProposal(true));
    $('wizard-form').addEventListener('submit', e => e.preventDefault());
    $('reset').addEventListener('click', () => { if (confirm('Start over and clear this browser draft?')) { try { localStorage.removeItem(DRAFT_KEY); } catch {} state = initial(items.find(i => i.slot === 'weapon').id); step = 0; furthest = 0; updateFields(); save(); } });
    $('retry').addEventListener('click', () => location.reload());
  }
  async function init() {
    try {
      const docs = await Promise.all(['items.json','affixes.json','tile_dir_manifest.json'].map(async name => {
        const response = await fetch(DATA+name); if (!response.ok) throw new Error(name + ': HTTP ' + response.status); return response.json();
      }));
      items = docs[0].items.filter(i => Object.hasOwn(SLOTS,i.slot)); affixes = docs[1].affixes; files = docs[2];
      if (!items.length || !affixes.length) throw new Error('Item or bonus data is empty.');
      icons = Object.entries(files).filter(([dir]) => dir.startsWith('res://assets/tiles/items/') && !dir.includes('/spells/')).flatMap(([dir,names]) => names.map(n => dir.slice('res://assets/tiles/items/'.length) + n));
      if (!icons.length) throw new Error('Inventory sprite catalogue is empty.');
      for (const slot of Object.keys(OVERLAYS)) if (!overlayOptions(slot).length) throw new Error('Character sprites are missing for ' + slot + '.');
      state = initial(items.find(i => i.slot === 'weapon').id);
      let note = 'Ready. Your proposal stays in this browser until you share it.';
      try { const raw = localStorage.getItem(DRAFT_KEY); if (raw) { restore(raw); note = 'Your saved draft has been restored.'; } }
      catch(e) { note = 'Could not restore the draft. Starting fresh. ' + e.message; }
      bind(); updateFields(); $('workspace').hidden = false; $('status').textContent = note;
      try { await validateSprites(); } catch (e) { $('status').textContent = e.message; $('retry').hidden = false; }
    } catch (e) { $('status').textContent = 'Could not load the item wizard. ' + e.message; $('retry').hidden = false; }
  }
  init();
})();
