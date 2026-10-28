"use strict";
(() => {
  const DATA = 'data/';
  const ASSETS = 'assets/tiles/';
  const DRAFT_KEY = 'botter-item-wizard-v1';
  const SLOTS = {weapon:'Weapon',armor:'Body armour',helm:'Helm',shield:'Shield',boots:'Boots',gloves:'Gloves',cloak:'Cloak',ring:'Ring',amulet:'Amulet'};
  const OVERLAYS = {weapon:'weapons',armor:'body',helm:'helm',shield:'shield',boots:'boots',gloves:'gloves',cloak:'cloak'};
  const RARITIES = ['common','uncommon','rare','epic','legendary'];
  const LABELS = ['Starting point','Story','Sprites','Details','Share'];
  const STAT_LABELS = {damage_min:'Minimum damage',damage_max:'Maximum damage',speed:'Attack interval (seconds)',armor:'Armour',evasion:'Evasion',block_chance:'Block chance (%)'};
  const $ = id => document.getElementById(id);
  const copy = value => JSON.parse(JSON.stringify(value));
  let items = [], affixes = [], affixMap = new Map(), reference = {}, previewQuality = 'Standard', pool = new Set(), files = {}, icons = [], descriptions = {}, rarityIndices = {}, rarityCounts = {}, state, step = 0, furthest = 0;
  let pickerMode = 'icon', pickerPage = 0, selectionToken = 0;
  const loaded = new Set();
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const option = (value, text) => { const node = document.createElement('option'); node.value = value; node.textContent = text; return node; };
  const template = () => items.find(i => i.id === state.templateId);
  const current = () => {
    const item = {...copy(template()), ...copy(state.edits)};
    for (const key of ['default_tint','default_tint_overlay']) if (item[key] === null) delete item[key];
    return item;
  };
  const spriteUrl = (mode, value) => ASSETS + (mode === 'icon' ? 'items/' + value : 'player/' + OVERLAYS[current().slot] + '/' + value + '.png');
  const overlayOptions = slot => (files['res://assets/tiles/player/' + OVERLAYS[slot] + '/'] || []).map(f => f.replace(/\.png$/, ''));
  // Only the baseline (affixes.json random_pool) is offered; parked affixes stay on the items that already carry them.
  const availableAffixes = slot => affixes.filter(a => a.family !== 'eternal' && (!pool.size || pool.has(a.id)) && ((a.applies_to || []).includes(slot) || (a.applies_to || []).includes('any')));
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
    for (const key of ['name','lore','id','tile','overlay','rarity','unique',...Object.keys(STAT_LABELS),'implicit_affixes','default_tint','default_tint_overlay']) {
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
    for (const key of ['default_tint','default_tint_overlay']) {
      if (clean.edits[key] != null && !validTint(clean.edits[key])) throw new Error('Invalid saved sprite colour.');
    }
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
    renderColourControls(); renderStatGuide(); renderStatWarnings(); renderBonuses(); renderBonusGuide(); renderSprites(); renderPreview(); showStep();
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
      detail.textContent = bonusDescription(a);
      text.append(detail); label.append(input,text); return label;
    }));
    if (!$('bonuses').children.length) $('bonuses').textContent = 'No matching bonuses.';
  }
  const TINT_MODES = ['normal','colorize','shimmer','inverted','prismatic'];
  function validTint(tint) {
    return tint && typeof tint === 'object' && TINT_MODES.includes(tint.mode) &&
      Number.isFinite(tint.hue) && tint.hue >= 0 && tint.hue <= 360 &&
      Number.isFinite(tint.sat) && tint.sat >= 0 && tint.sat <= 2 &&
      (tint.colorize_strength === undefined || (Number.isFinite(tint.colorize_strength) && tint.colorize_strength >= 0 && tint.colorize_strength <= 1));
  }
  function tintStyle(tint) {
    if (!tint?.mode || tint.mode === 'none') return '';
    const hue = Number(tint.hue || 0), sat = Number(tint.sat ?? 1);
    if (tint.mode === 'colorize') return `sepia(${tint.colorize_strength ?? .7}) saturate(${sat * 3}) hue-rotate(${hue - 40}deg)`;
    return `hue-rotate(${hue}deg) saturate(${sat})${tint.mode === 'inverted' ? ' invert(1)' : ''}`;
  }
  function applyTint(image, tint) {
    image.style.filter = tintStyle(tint);
    image.style.setProperty('--sprite-hue', (tint?.hue || 0) + 'deg');
    image.style.setProperty('--sprite-sat', tint?.sat ?? 1);
    image.classList.toggle('tint-prismatic',tint?.mode === 'prismatic');
    image.classList.toggle('tint-shimmer',tint?.mode === 'shimmer');
  }
  function renderColourControls() {
    for (const surface of ['icon','overlay']) {
      const host = $(surface + '-colour'), key = surface === 'icon' ? 'default_tint' : 'default_tint_overlay';
      host.hidden = surface === 'overlay' && !OVERLAYS[current().slot];
      if (host.hidden) continue;
      const tint = current()[key], mode = tint?.mode || (surface === 'overlay' ? 'inherit' : 'none');
      host.innerHTML = `<label for="${surface}-mode">${surface === 'icon' ? 'Inventory' : 'Character'} colour effect</label><select id="${surface}-mode"></select><div id="${surface}-colour-fields"></div>`;
      const choices = [['none','Original colours'],['normal','Rotate existing colours'],['colorize','Colourize — choose a target hue'],['inverted','Invert colours'],['shimmer','Shimmer highlight'],['prismatic','Cycle through colours']];
      if (surface === 'overlay') choices.unshift(['inherit','Match the inventory colour']);
      $(surface+'-mode').replaceChildren(...choices.map(([value,label]) => option(value,label)));
      $(surface+'-mode').value = mode;
      $(surface+'-mode').addEventListener('change', () => {
        const chosen = $(surface+'-mode').value;
        state.edits[key] = ['inherit','none'].includes(chosen) ? (surface === 'overlay' && chosen === 'none' ? {mode:'normal',hue:0,sat:1} : null) : {...(current()[key] || {hue:0,sat:1}),mode:chosen};
        renderColourControls(); renderSprites(); changed();
      });
      if (mode === 'none' || mode === 'inherit') continue;
      const fields = $(surface+'-colour-fields');
      for (const [field,label,min,max,increment,fallback] of [['hue','Hue',0,360,1,0],['sat','Saturation',0,2,.05,1],...(mode === 'colorize' ? [['colorize_strength','Colour strength',0,1,.05,.7]] : [])]) {
        const row = document.createElement('div'); row.className = 'colour-slider';
        const lab = document.createElement('label'); lab.htmlFor = surface+'-'+field; lab.textContent = label;
        const input = document.createElement('input'); input.type = 'range'; input.id = lab.htmlFor; input.min = min; input.max = max; input.step = increment; input.value = tint?.[field] ?? fallback;
        const value = document.createElement('output'); value.htmlFor = input.id; value.textContent = input.value + (field === 'hue' ? '°' : '');
        input.addEventListener('input', () => { state.edits[key] = {...current()[key],[field]:Number(input.value)}; value.textContent = input.value + (field === 'hue' ? '°' : ''); renderSprites(); changed(); });
        row.append(lab,input,value); fields.append(row);
      }
      if (mode === 'colorize') {
        const label = document.createElement('label'); label.htmlFor = surface+'-target'; label.textContent = 'Pick a target hue (sprite shading stays intact)';
        const picker = document.createElement('input'); picker.type = 'color'; picker.id = label.htmlFor;
        const h = (tint?.hue || 0) / 60, x = 1 - Math.abs(h % 2 - 1), rgb = h < 1 ? [1,x,0] : h < 2 ? [x,1,0] : h < 3 ? [0,1,x] : h < 4 ? [0,x,1] : h < 5 ? [x,0,1] : [1,0,x];
        picker.value = '#' + rgb.map(c => Math.round(c*255).toString(16).padStart(2,'0')).join('');
        picker.addEventListener('input', () => {
          const [r,g,b] = picker.value.match(/[a-f0-9]{2}/gi).map(v => parseInt(v,16)/255), top = Math.max(r,g,b), delta = top - Math.min(r,g,b);
          const hue = delta === 0 ? 0 : ((top === r ? (g-b)/delta : top === g ? (b-r)/delta + 2 : (r-g)/delta + 4)*60 + 360) % 360;
          state.edits[key] = {...current()[key],hue:Math.round(hue),colorize_strength:1}; $(surface+'-hue').value = Math.round(hue); $(surface+'-colorize_strength').value = 1; for (const field of ['hue','colorize_strength']) $(surface+'-'+field).dispatchEvent(new Event('input')); renderSprites(); changed();
        });
        fields.append(label,picker);
      }
    }
  }
  function peers() { const item = current(); return items.filter(i => i.slot === item.slot && i.item_tier === item.item_tier); }
  function statsRange(list,key) {
    const values = list.filter(i => Number.isFinite(i[key])).map(i => i[key]).sort((a,b) => a-b);
    if (!values.length) return '—';
    return `${values[0]}–${values[values.length-1]} (middle: ${values[Math.floor(values.length/2)]})`;
  }
  function renderStatGuide() {
    const item = current(), comparable = peers(), keys = Object.keys(STAT_LABELS).filter(k => Object.hasOwn(template(),k));
    $('stat-guide').replaceChildren();
    const intro = document.createElement('p'); intro.textContent = `Base values for Tier ${item.item_tier} ${SLOTS[item.slot].toLowerCase()} items currently in the game. These exclude bonuses and rolled quality. Use the starting item's values as your first draft.`; $('stat-guide').append(intro);
    if (!keys.length) { const note = document.createElement('p'); note.textContent = 'Jewellery gets its identity from bonuses rather than base armour or damage.'; $('stat-guide').append(note); return; }
    const table = document.createElement('table'); table.innerHTML = '<thead><tr><th>Stat</th><th>Starting item</th><th>Regular items</th><th>Named uniques</th></tr></thead><tbody></tbody>';
    for (const key of keys) { const row = document.createElement('tr'); for (const value of [STAT_LABELS[key],template()[key],statsRange(comparable.filter(i => !i.unique),key),statsRange(comparable.filter(i => i.unique),key)]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); } table.tBodies[0].append(row); }
    const scroll = document.createElement('div'); scroll.className = 'guide-table'; scroll.append(table); $('stat-guide').append(scroll);
    const examples = document.createElement('p'); examples.className = 'hint'; examples.textContent = 'Examples: ' + comparable.slice(0,3).map(i => i.name + ' (' + keys.map(k => `${STAT_LABELS[k]} ${i[k] ?? '—'}`).join(', ') + ')').join('; ') + '.'; $('stat-guide').append(examples);
    const meaning = document.createElement('p'); meaning.className = 'hint'; meaning.textContent = 'Armour reduces physical damage per hit. Evasion adds to the character’s chance to dodge; the final chance is capped by the game. A lower attack interval means faster attacks.'; $('stat-guide').append(meaning);
  }
  function renderStatWarnings() {
    const item = current(), comparable = peers(), outliers = [];
    for (const key of Object.keys(STAT_LABELS)) {
      if (!Number.isFinite(item[key])) continue;
      const values = comparable.filter(i => Number.isFinite(i[key])).map(i => i[key]);
      if (values.length && (item[key] > Math.max(...values) || item[key] < Math.min(...values))) outliers.push(STAT_LABELS[key]);
    }
    $('stat-warning').textContent = outliers.length ? `${outliers.join(', ')} is outside the existing Tier ${item.item_tier} range for this slot. Check the comparison above or explain the exceptional value in your design notes.` : '';
  }
  function bonusDescription(affix) {
    const tiers = affix.tiers || [], band = tiers[Math.min(rarityIndices[current().rarity] || 0,tiers.length-1)] || 0;
    const lo = Math.trunc(Array.isArray(band) ? band[0] : band), hi = Math.trunc(Array.isArray(band) ? band[1] : band), middle = (lo+hi)/2;
    const value = Math.sign(middle) * Math.floor(Math.abs(middle)+.5);
    return (descriptions[affix.stat] || affix.desc || 'A special item effect; describe the intended use in your design notes.').replaceAll('{N}',value).replaceAll('{LO}',lo).replaceAll('{HI}',hi).replace(/\bHP\b/g,'health').replace(/\bXP\b/g,'experience').replace(/\bSTR\b/g,'Strength').replace(/\bDEX\b/g,'Dexterity').replace(/\bINT\b/g,'Intelligence');
  }
  function renderBonusGuide() {
    const item = current(), counts = peers().map(i => (i.implicit_affixes || []).length).sort((a,b) => a-b), max = Math.max(...counts), typical = counts[Math.floor(counts.length/2)], selected = item.implicit_affixes.length;
    $('bonus-guide').textContent = `${selected} guaranteed bonus${selected === 1 ? '' : 'es'} selected. Comparable Tier ${item.item_tier} items in this slot carry ${counts[0]}–${max}, with ${typical} as the middle value. Your starting item has ${(template().implicit_affixes || []).length}; keeping that count is a good starting point. ${selected > max ? 'You have selected more than any comparable item; consider trimming the list or explain the idea in your notes. ' : ''}At ${item.rarity} rarity the normal drop system can also add up to ${rarityCounts[item.rarity] ?? 0} random bonuses from the inherited pool. Those specific bonuses are not guaranteed. Effects shown below are the base built-in values before quality and character-wide modifiers.`;
    $('species-guide').textContent = item.requires_innate_tag ? `This starting item restricts its built-in bonuses to characters with the “${item.requires_innate_tag}” species trait.` : '';
  }
  function renderSprites() {
    const item = current();
    for (const id of ['chosen-icon','preview-icon']) { $(id).src = spriteUrl('icon',item.tile); applyTint($(id),item.default_tint); }
    $('icon-path').textContent = item.tile;
    $('overlay-choice').hidden = !OVERLAYS[item.slot]; $('no-overlay').hidden = !!OVERLAYS[item.slot];
    if (OVERLAYS[item.slot]) { $('chosen-overlay').src = spriteUrl('overlay',item.overlay); applyTint($('chosen-overlay'),item.default_tint_overlay || item.default_tint); $('overlay-path').textContent = item.overlay + '.png'; }
  }
  function renderPreview() {
    const item = current();
    const tiers = (reference.quality_tiers || {}).gear || [];
    const likely = Object.entries(item.affix_pool || {}).filter(([id]) => pool.has(id)).sort((a,b) => b[1]-a[1]).map(([id]) => affixMap.get(id)?.name).filter(Boolean);
    BotterTooltip.render($('game-tooltip'), {...item, name: item.name || 'Your item name'}, {reference, affixById: affixMap, rarityIndices, rarityCounts, likely, quality: tiers.find(t => t.name === previewQuality)});
    $('tooltip-quality').replaceChildren(...tiers.map(t => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = t.name === 'Standard' ? 'No prefix' : t.name;
      b.setAttribute('aria-pressed', String(t.name === previewQuality));
      b.addEventListener('click', () => { previewQuality = t.name; renderPreview(); }); return b;
    }));
  }
  function payload() {
    return {_proposal:{format:1,tool:'Botter item wizard',based_on:state.templateId,author:state.author,design_notes:state.idea},items:[current()]};
  }
  function renderReview() {
    const item = current();
    $('review').innerHTML = `<strong>${escape(item.name)}</strong><br>Item ID: <code>${escape(item.id)}</code><br>Based on ${escape(template().name)} · ${escape(SLOTS[item.slot])} · Tier ${item.item_tier}<br>Inventory: <code>${escape(item.tile)}</code>${OVERLAYS[item.slot] ? '<br>Character: <code>' + escape(item.overlay) + '.png</code>' : ''}<br>Built-in bonuses: ${item.implicit_affixes.length}<br>Credit: ${escape(state.author || 'Not supplied')}<br>Baseline random affix pool, drop weights, tints and other mechanics are included in the JSON for review.`;
    $('json-preview').textContent = JSON.stringify(payload(),null,2);
  }
  function changed() { $('error').textContent = ''; save(); renderPreview(); renderStatWarnings(); renderBonusGuide(); if (step === 4) renderReview(); }
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
      for (const key of ['default_tint','default_tint_overlay']) if (item[key] && !validTint(item[key])) return 'Check the sprite colour settings.';
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
    $('rarity').addEventListener('change', () => { state.edits.rarity = $('rarity').value; renderBonuses(); changed(); });
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
      items = docs[0].items.filter(i => Object.hasOwn(SLOTS,i.slot)); affixes = docs[1].affixes; affixMap = new Map(affixes.map(a => [a.id,a])); pool = new Set((docs[1].random_pool || {}).ids || []); files = docs[2]; rarityIndices = docs[1].rarity_tier_index; rarityCounts = docs[1].rarity_affix_count;
      const refResponse = await fetch('portal_reference.json'); if (!refResponse.ok) throw new Error('Bonus explanations: HTTP ' + refResponse.status); reference = await refResponse.json(); descriptions = reference.stat_descriptions;
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
