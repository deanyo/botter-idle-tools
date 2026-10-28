"use strict";
// Developer item editor. Reads data/items.json directly, edits gear
// items in place, and writes the whole document back with the same
// serialization the game's data gate expects (tabs, real UTF-8, trailing
// newline, Python's number spellings kept per field).
(() => {
  const DATA = 'data/';
  const ASSETS = 'assets/tiles/';
  const DRAFT_KEY = 'botter-item-editor-v2';
  const SLOTS = {weapon:'Weapon',armor:'Body armour',helm:'Helm',shield:'Shield',boots:'Boots',gloves:'Gloves',cloak:'Cloak',ring:'Ring',amulet:'Amulet'};
  const OVERLAYS = {weapon:'weapons',armor:'body',helm:'helm',shield:'shield',boots:'boots',gloves:'gloves',cloak:'cloak'};
  const RARITIES = ['common','uncommon','rare','epic','legendary'];
  const STAT_FIELDS = {damage_min:'Minimum damage',damage_max:'Maximum damage',speed:'Attack interval (seconds)',armor:'Armor',evasion:'Evasion',block_chance:'Block chance (%)'};
  const DAMAGE_TYPES = ['physical','fire','cold','lightning','holy','poison','dark','arcane'];
  const WEAPON_CLASSES = ['1H','2H','caster'];
  // Fields whose new whole-number values are still written as floats, matching the data.
  const FLOAT_KEYS = new Set(['speed','enchant_chance']);
  const DECORATIVE_TAGS = new Set(['bloody','bloodlust','tide']);
  const TINT_MODES = ['normal','colorize','shimmer','inverted','prismatic'];
  const $ = id => document.getElementById(id);
  const copy = value => JSON.parse(JSON.stringify(value));
  const option = (value, text) => { const node = document.createElement('option'); node.value = value; node.textContent = text; return node; };

  let doc = null, sourceSignature = '', numberTokens = new Map();
  let working = [], originals = new Map(), affixes = [], affixById = new Map(), pool = new Set();
  let rarityIndices = {}, rarityCounts = {}, files = {}, icons = [], reference = {}, species = [], biomeIds = [];
  let selectedId = null, previewQuality = 'Standard', pickerMode = 'icon', pickerPage = 0, selectionToken = 0;
  const loaded = new Set();

  // ── Serialization ──────────────────────────────────────────────────────
  // JSON.parse forgets whether a number was written "1" or "1.0". Record each
  // number's original spelling keyed by item id + path inside the item, so
  // untouched fields re-serialize byte for byte even after items move.
  function tokenKey(path) {
    if (path[0] === 'items' && path.length > 1 && typeof path[1] === 'string') return 'item:' + path[1] + ':' + JSON.stringify(path.slice(2));
    return JSON.stringify(path);
  }
  function rememberNumberTokens(source, parsed) {
    numberTokens = new Map();
    const tokens = source.match(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\]:,]/g);
    let at = 0;
    function walk(path) {
      const token = tokens[at++];
      if (token === '{') {
        while (tokens[at] !== '}') { const key = JSON.parse(tokens[at++]); at++; walk([...path, key]); if (tokens[at] === ',') at++; }
        at++;
      } else if (token === '[') {
        let index = 0;
        while (tokens[at] !== ']') {
          const step = path.length === 1 && path[0] === 'items' ? parsed.items[index].id : index;
          index++; walk([...path, step]); if (tokens[at] === ',') at++;
        }
        at++;
      } else if (/^-?\d/.test(token)) numberTokens.set(tokenKey(path), token);
    }
    walk([]);
  }
  function pyNumber(value, key) {
    if (!Number.isFinite(value)) throw new Error('Numbers must be finite.');
    if (Number.isInteger(value)) return FLOAT_KEYS.has(key) ? value.toFixed(1) : String(value);
    // Python writes exponents with at least two digits (1e-05, not 1e-5).
    return String(value).replace(/e([+-])(\d)$/, 'e$10$2');
  }
  function serialize(value, path = [], depth = 0) {
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') {
      const token = numberTokens.get(tokenKey(path));
      if (token !== undefined && Number(token) === value) return token;
      if (token?.includes('.') && Number.isInteger(value)) return value.toFixed(1);
      return pyNumber(value, path[path.length - 1]);
    }
    if (value === null || typeof value === 'boolean') return JSON.stringify(value);
    const array = Array.isArray(value);
    const entries = array ? value.map((v, i) => [i, v]) : Object.entries(value);
    if (!entries.length) return array ? '[]' : '{}';
    const inItems = path.length === 1 && path[0] === 'items';
    const indent = '\t'.repeat(depth + 1), close = '\t'.repeat(depth);
    const rows = entries.map(([key, v]) => indent + (array ? '' : JSON.stringify(key) + ': ') + serialize(v, [...path, inItems ? v.id : key], depth + 1));
    return (array ? '[' : '{') + '\n' + rows.join(',\n') + '\n' + close + (array ? ']' : '}');
  }
  const fullText = () => serialize({...doc, items: working}) + '\n';
  function changesText() {
    const changed = working.filter(it => isEdited(it.id));
    return JSON.stringify({items: changed}, null, '\t') + '\n';
  }
  function signature(text) {
    let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return text.length + ':' + h;
  }

  // ── State helpers ──────────────────────────────────────────────────────
  const gear = () => working.filter(it => Object.hasOwn(SLOTS, it.slot));
  const current = () => working.find(it => it.id === selectedId);
  const isNew = id => !originals.has(id);
  const isEdited = id => { const it = working.find(i => i.id === id); return !!it && (isNew(id) || JSON.stringify(it) !== originals.get(id)); };
  const deletedIds = () => [...originals.keys()].filter(id => !working.some(i => i.id === id));
  const appliesTo = (affix, item) => ((affix.applies_to || []).includes(item.slot) || (affix.applies_to || []).includes('any')) &&
    (!(affix.base_types || []).length || affix.base_types.includes(item.base_type));
  const overlayOptions = slot => (files['res://assets/tiles/player/' + OVERLAYS[slot] + '/'] || []).map(f => f.replace(/\.png$/, ''));
  const spriteUrl = (mode, value, item = current()) => ASSETS + (mode === 'icon' ? 'items/' + value : 'player/' + OVERLAYS[item.slot] + '/' + value + '.png');
  function overlayOf(item) {
    if (!OVERLAYS[item.slot]) return null;
    const stem = (item.overlay || item.tile.replace(/\.png$/, '')).split('/').pop();
    return overlayOptions(item.slot).includes(stem) ? stem : null;
  }

  function save() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({version: 2, signature: sourceSignature, items: working, selected: selectedId}));
    } catch { $('status').textContent = 'Browser storage is unavailable. Download your changes before closing this page.'; }
  }
  function restore() {
    let raw = null;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch { return 'Browser storage is unavailable; edits will not survive a reload.'; }
    if (!raw) return '';
    try {
      const saved = JSON.parse(raw);
      if (saved.version !== 2 || !Array.isArray(saved.items)) throw new Error('unknown format');
      if (saved.signature !== sourceSignature) {
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        return 'items.json changed since your last session, so your unsaved browser edits were cleared.';
      }
      working = saved.items; selectedId = working.some(i => i.id === saved.selected) ? saved.selected : null;
      return 'Restored your unsaved edits from this browser.';
    } catch (e) { return 'Could not restore your saved edits (' + e.message + '). Starting from items.json.'; }
  }
  function setField(key, value) {
    const it = current(); if (!it) return;
    const empty = value === '' || value === null || value === undefined || (Array.isArray(value) && !value.length && !['flavor_tags','drop_weights','implicit_affixes'].includes(key));
    if (empty && !['name','lore','base_type'].includes(key)) delete it[key]; else it[key] = value;
    changed();
  }
  function changed() { save(); renderList(); renderPreview(); renderProblems(); renderSummary(); $('item-json').textContent = current() ? JSON.stringify(current(), null, 2) : ''; }

  // ── Validation ─────────────────────────────────────────────────────────
  function validTint(tint) {
    return tint && typeof tint === 'object' && TINT_MODES.includes(tint.mode) &&
      Number.isFinite(tint.hue) && tint.hue >= 0 && tint.hue <= 360 &&
      Number.isFinite(tint.sat) && tint.sat >= 0 && tint.sat <= 2 &&
      (tint.colorize_strength === undefined || (Number.isFinite(tint.colorize_strength) && tint.colorize_strength >= 0 && tint.colorize_strength <= 1));
  }
  function problemsFor(it) {
    const out = [];
    if (!String(it.name || '').trim()) out.push('Name is empty.');
    if (!/^[a-z0-9_]+$/.test(it.id || '')) out.push('Item ID must use lowercase letters, numbers and underscores.');
    if (working.filter(i => i.id === it.id).length > 1) out.push('Item ID is used by another item.');
    if (!String(it.base_type || '').trim()) out.push('Base type is empty.');
    if (![1,2,3,4,5].includes(it.item_tier)) out.push('Tier must be 1–5.');
    if (!RARITIES.includes(it.rarity)) out.push('Rarity is not valid.');
    if (!icons.includes(it.tile)) out.push('Inventory sprite is not a shipped file.');
    if (it.overlay !== undefined && !overlayOptions(it.slot).includes(it.overlay)) out.push('Character sprite is not a shipped file.');
    for (const key of Object.keys(STAT_FIELDS)) if (Object.hasOwn(it, key)) {
      const v = it[key];
      if (!Number.isFinite(v) || v < 0 || (key === 'speed' ? v < .01 : !Number.isInteger(v)) || (key === 'block_chance' && v > 100)) out.push(STAT_FIELDS[key] + ' is not valid.');
    }
    if (Number.isFinite(it.damage_min) && Number.isFinite(it.damage_max) && it.damage_min > it.damage_max) out.push('Maximum damage is below minimum damage.');
    if (!Array.isArray(it.drop_weights) || it.drop_weights.length !== 5 || !it.drop_weights.every(w => Number.isInteger(w) && w >= 0)) out.push('Drop weights need five whole numbers of 0 or more.');
    if (!Number.isFinite(it.enchant_chance) || it.enchant_chance < 0 || it.enchant_chance > 1) out.push('Enchant chance must be between 0 and 1.');
    for (const id of it.implicit_affixes || []) if (!affixById.has(id)) out.push(`Built-in bonus "${id}" does not exist.`);
    for (const [id, w] of Object.entries(it.affix_pool || {})) {
      if (!affixById.has(id)) out.push(`Pool affix "${id}" does not exist.`);
      else if (!(Number.isFinite(w) && w > 0)) out.push(`Pool weight for ${affixById.get(id).name} must be above 0.`);
    }
    for (const key of ['default_tint','default_tint_overlay']) if (it[key] !== undefined && !validTint(it[key])) out.push('Sprite colour settings are not valid.');
    return out;
  }
  function allProblems() {
    const out = [];
    for (const it of gear()) { const p = problemsFor(it); if (p.length) out.push([it, p]); }
    return out;
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  function renderSummary() {
    const edited = working.filter(i => originals.has(i.id) && isEdited(i.id)).length, added = working.filter(i => isNew(i.id)).length, removed = deletedIds().length;
    $('change-summary').textContent = edited + added + removed
      ? `Unsaved changes: ${edited} edited, ${added} new, ${removed} deleted. Download items.json to keep them.`
      : `${gear().length} gear items. No changes yet.`;
  }
  function renderList() {
    const slot = $('slot-filter').value, q = $('search').value.trim().toLowerCase(), tier = $('tier-filter').value, rarity = $('rarity-filter').value;
    const rows = gear().filter(it => it.slot === slot &&
      (!q || `${it.name} ${it.id} ${it.base_type}`.toLowerCase().includes(q)) &&
      (!tier || String(it.item_tier) === tier) && (!rarity || it.rarity === rarity) &&
      (!$('unique-filter').checked || it.unique) && (!$('edited-filter').checked || isEdited(it.id)))
      .sort((a, b) => a.item_tier - b.item_tier || a.name.localeCompare(b.name));
    $('list-count').textContent = `${rows.length} item${rows.length === 1 ? '' : 's'}`;
    $('item-list').replaceChildren(...rows.map(it => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'item-row'; b.dataset.id = it.id; b.setAttribute('role', 'listitem');
      b.setAttribute('aria-current', String(it.id === selectedId));
      const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.src = ASSETS + 'items/' + it.tile;
      const text = document.createElement('span');
      const name = document.createElement('span'); name.className = 'row-name'; name.textContent = it.name || '(unnamed)'; name.style.color = `var(--rarity-${it.rarity})`;
      const meta = document.createElement('span'); meta.className = 'row-meta'; meta.textContent = `T${it.item_tier} · ${it.rarity} · ${String(it.base_type || '').replaceAll('_', ' ')}`;
      text.append(name, meta);
      const badges = document.createElement('span'); badges.className = 'row-badges';
      const badge = (cls, label) => { const s = document.createElement('span'); s.className = 'badge ' + cls; s.textContent = label; badges.append(s); };
      if (it.unique) badge('unique', 'U');
      if (isNew(it.id)) badge('new', 'new'); else if (isEdited(it.id)) badge('edited', 'edited');
      b.append(img, text, badges);
      b.addEventListener('click', () => select(it.id));
      return b;
    }));
    if (!rows.length) $('item-list').textContent = 'No items match.';
  }
  function select(id) {
    selectedId = id; save(); renderList(); renderEditor();
  }
  function renderEditor() {
    const it = current();
    $('editor-form').hidden = !it;
    if (!it) return;
    $('edit-eyebrow').textContent = `${SLOTS[it.slot].toUpperCase()} / ${it.id}`;
    $('f-name').value = it.name; $('f-id').value = it.id; $('f-id').readOnly = !isNew(it.id);
    $('id-hint').textContent = isNew(it.id) ? 'New item: choose a permanent ID.' : 'Existing IDs are fixed; saves and tables refer to them.';
    $('f-base_type').value = it.base_type || '';
    $('base-types').replaceChildren(...[...new Set(gear().filter(i => i.slot === it.slot).map(i => i.base_type))].sort().map(b => option(b, b)));
    $('f-item_tier').value = String(it.item_tier); $('f-rarity').value = it.rarity; $('f-unique').checked = !!it.unique; $('f-lore').value = it.lore || '';
    $('recolor-note').hidden = !it.recolor_of;
    if (it.recolor_of) $('recolor-note').textContent = `Recolour of ${working.find(i => i.id === it.recolor_of)?.name || it.recolor_of}: shares its sprite and differs by tint and stats.`;
    const tags = [...new Set(species.flatMap(s => s.innate_tags || []).concat(gear().map(i => i.requires_innate_tag).filter(Boolean)))].sort();
    $('f-requires_innate_tag').replaceChildren(option('', 'None'), ...tags.map(t => option(t, t)));
    $('f-requires_innate_tag').value = it.requires_innate_tag || '';
    $('f-boss_drop').value = it.boss_drop || ''; $('f-vault_drop').value = it.vault_drop || '';
    $('bosses').replaceChildren(...[...new Set(gear().map(i => i.boss_drop).filter(Boolean))].sort().map(b => option(b, b)));
    $('special-sources').open = !!(it.requires_innate_tag || it.boss_drop || it.vault_drop || (it.biome_pool || []).length);
    renderChips('biome-chips', biomeIds, it.biome_pool || [], v => setField('biome_pool', v), id => id.replaceAll('_', ' '));
    renderSprites(); renderColourControls(); renderStats(); renderDrops(); renderImplicits(); renderPool();
    changed();
  }
  function renderChips(host, values, chosen, onChange, labelOf = v => v, titleOf = () => '') {
    $(host).replaceChildren(...values.map(v => {
      const label = document.createElement('label'); label.className = 'chip'; label.title = titleOf(v);
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = v; input.checked = chosen.includes(v);
      input.addEventListener('change', () => {
        const next = values.filter(x => x === v ? input.checked : chosen.includes(x));
        chosen = next; onChange(next);
      });
      label.append(input, document.createTextNode(labelOf(v))); return label;
    }));
  }
  function renderStats() {
    const it = current(), host = $('stats'); host.replaceChildren();
    const keys = Object.keys(STAT_FIELDS).filter(k => Object.hasOwn(it, k) || gear().some(i => i.slot === it.slot && Object.hasOwn(i, k)));
    for (const key of keys) {
      const wrap = document.createElement('div'), lab = document.createElement('label'), input = document.createElement('input');
      lab.htmlFor = 'stat-' + key; lab.textContent = STAT_FIELDS[key];
      input.type = 'number'; input.id = 'stat-' + key; input.min = key === 'speed' ? '0.01' : '0'; input.step = key === 'speed' ? '0.01' : '1';
      if (key === 'block_chance') input.max = '100';
      input.value = it[key] ?? ''; input.placeholder = 'None';
      input.addEventListener('input', () => { setField(key, input.value === '' ? null : Number(input.value)); renderStatWarning(); });
      wrap.append(lab, input); host.append(wrap);
    }
    if (it.slot === 'weapon') {
      for (const [key, label, values] of [['damage_type', 'Damage type', DAMAGE_TYPES], ['weapon_class', 'Weapon class', WEAPON_CLASSES]]) {
        const wrap = document.createElement('div'), lab = document.createElement('label'), sel = document.createElement('select');
        lab.htmlFor = 'f-' + key; lab.textContent = label; sel.id = 'f-' + key;
        sel.replaceChildren(...values.map(v => option(v, v))); sel.value = it[key] || values[0];
        sel.addEventListener('change', () => setField(key, sel.value));
        wrap.append(lab, sel); host.append(wrap);
      }
    }
    if (!keys.length) host.innerHTML = '<p class="hint wide">Jewellery has no base stats; its identity comes from bonuses.</p>';
    renderStatWarning(); renderStatGuide(keys);
  }
  const peers = it => gear().filter(i => i.slot === it.slot && i.item_tier === it.item_tier && i.id !== it.id);
  function statsRange(list, key) {
    const values = list.filter(i => Number.isFinite(i[key])).map(i => i[key]).sort((a, b) => a - b);
    return values.length ? `${values[0]}–${values[values.length - 1]} (middle ${values[Math.floor(values.length / 2)]})` : '—';
  }
  function renderStatGuide(keys) {
    const it = current(), comparable = peers(it);
    $('stat-guide').replaceChildren();
    if (!keys.length) { $('stat-guide').hidden = true; return; }
    $('stat-guide').hidden = false;
    const p = document.createElement('p'); p.textContent = `Other Tier ${it.item_tier} ${SLOTS[it.slot].toLowerCase()} items, before quality and bonuses.`;
    const table = document.createElement('table'); table.innerHTML = '<thead><tr><th>Stat</th><th>This item</th><th>Regular items</th><th>Uniques</th></tr></thead><tbody></tbody>';
    for (const key of keys) {
      const row = document.createElement('tr');
      for (const v of [STAT_FIELDS[key], it[key] ?? '—', statsRange(comparable.filter(i => !i.unique), key), statsRange(comparable.filter(i => i.unique), key)]) { const td = document.createElement('td'); td.textContent = v; row.append(td); }
      table.tBodies[0].append(row);
    }
    const scroll = document.createElement('div'); scroll.className = 'guide-table'; scroll.append(table);
    $('stat-guide').append(p, scroll);
  }
  function renderStatWarning() {
    const it = current(), comparable = peers(it), outliers = [];
    for (const key of Object.keys(STAT_FIELDS)) {
      if (!Number.isFinite(it[key])) continue;
      const values = comparable.filter(i => Number.isFinite(i[key])).map(i => i[key]);
      if (values.length && (it[key] > Math.max(...values) || it[key] < Math.min(...values))) outliers.push(STAT_FIELDS[key]);
    }
    $('stat-warning').textContent = outliers.length ? `${outliers.join(', ')} is outside the range of other Tier ${it.item_tier} items in this slot.` : '';
  }
  function renderDrops() {
    const it = current();
    $('drop-weights').replaceChildren(...[0, 1, 2, 3, 4].map(i => {
      const wrap = document.createElement('div'), lab = document.createElement('label'), input = document.createElement('input');
      lab.htmlFor = 'drop-' + i; lab.textContent = 'Tier ' + (i + 1); input.id = 'drop-' + i; input.type = 'number'; input.min = '0'; input.step = '1';
      input.value = (it.drop_weights || [])[i] ?? 0;
      input.addEventListener('input', () => { const w = [...(current().drop_weights || [0, 0, 0, 0, 0])]; w[i] = input.value === '' ? NaN : Number(input.value); setField('drop_weights', w); });
      wrap.append(lab, input); return wrap;
    }));
    $('f-enchant_chance').value = it.enchant_chance ?? '';
    const blurbs = reference.flavor_tags || {};
    const tags = Object.keys(blurbs).sort();
    renderChips('flavor-chips', tags, it.flavor_tags || [], v => setField('flavor_tags', v), v => v.replaceAll('_', ' '), v => blurbs[v]);
    const rollable = tags.filter(t => !DECORATIVE_TAGS.has(t));
    renderChips('enchant-chips', rollable, it.enchant_pool || [], v => setField('enchant_pool', v), v => v.replaceAll('_', ' '), v => blurbs[v]);
    $('enchant-pool-box').open = !!(it.enchant_pool || []).length;
  }
  function bonusValue(affix, rarity) {
    const tiers = affix.tiers || [], band = tiers[Math.min(rarityIndices[rarity] || 0, tiers.length - 1)] || 0;
    const lo = Math.trunc(Array.isArray(band) ? band[0] : band), hi = Math.trunc(Array.isArray(band) ? band[1] : band);
    const middle = (lo + hi) / 2;
    return {lo, hi, mid: Math.sign(middle) * Math.floor(Math.abs(middle) + .5)};
  }
  function bonusDescription(affix, rarity) {
    const {lo, hi, mid} = bonusValue(affix, rarity);
    const text = (reference.stat_descriptions || {})[affix.stat] || 'A special effect.';
    return text.replaceAll('{N}', mid).replaceAll('{LO}', lo).replaceAll('{HI}', hi).replaceAll('+-', '-');
  }
  function affixLine(affix, rarity, button) {
    const row = document.createElement('div'); row.className = 'affix-line';
    const text = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = affix.name; text.append(name);
    if (affix.family === 'drawback') name.className = 'drawback-name';
    else if (!pool.has(affix.id) && affix.family !== 'eternal') { const tag = document.createElement('span'); tag.className = 'parked-tag'; tag.textContent = 'parked'; text.append(tag); }
    const small = document.createElement('small'); small.textContent = bonusDescription(affix, rarity); text.append(small);
    row.append(text, button); return row;
  }
  function renderImplicits() {
    const it = current(), chosen = it.implicit_affixes || [];
    $('implicit-list').replaceChildren(...chosen.map(id => {
      const affix = affixById.get(id) || {id, name: id, stat: ''};
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Remove';
      b.addEventListener('click', () => { setField('implicit_affixes', (current().implicit_affixes || []).filter(x => x !== id)); renderImplicits(); });
      return affixLine(affix, it.rarity, b);
    }));
    const q = $('implicit-search').value.trim().toLowerCase();
    const options = affixes.filter(a => a.family !== 'eternal' && a.family !== 'drawback' && appliesTo(a, it) && !chosen.includes(a.id) &&
      ($('show-parked').checked || pool.has(a.id)) && (!q || `${a.name} ${a.stat} ${a.id}`.toLowerCase().includes(q)))
      .sort((a, b) => Number(pool.has(b.id)) - Number(pool.has(a.id)) || a.name.localeCompare(b.name));
    $('implicit-options').replaceChildren(...options.map(a => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Add';
      b.addEventListener('click', () => { setField('implicit_affixes', [...(current().implicit_affixes || []), a.id]); renderImplicits(); });
      return affixLine(a, it.rarity, b);
    }));
    if (!options.length) $('implicit-options').textContent = 'No matching bonuses.';
    $('drawback-options').replaceChildren(...affixes.filter(a => a.family === 'drawback' && appliesTo(a, it) && !chosen.includes(a.id)).map(a => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Add';
      b.addEventListener('click', () => { setField('implicit_affixes', [...(current().implicit_affixes || []), a.id]); renderImplicits(); });
      return affixLine(a, it.rarity, b);
    }));
    if (!$('drawback-options').children.length) $('drawback-options').textContent = 'Every drawback is already on this item.';
  }
  function renderPool() {
    const it = current(), weights = it.affix_pool || {};
    const total = Object.values(weights).filter(w => w > 0).reduce((a, b) => a + b, 0);
    const baseline = affixes.filter(a => pool.has(a.id) && appliesTo(a, it));
    const parked = Object.keys(weights).filter(id => !pool.has(id));
    $('pool-intro').textContent = `At ${it.rarity} rarity a drop rolls ${rarityCounts[it.rarity] ?? 0} random affix${rarityCounts[it.rarity] === 1 ? '' : 'es'}, picked by weight from this pool (no repeats). Leave a weight blank to exclude that affix. Only baseline affixes roll.`;
    const tbody = $('pool-table').tBodies[0];
    tbody.replaceChildren(...[...baseline.map(a => [a, false]), ...parked.map(id => [affixById.get(id) || {id, name: id}, true])].map(([a, isParked]) => {
      const row = document.createElement('tr');
      const name = document.createElement('td'); name.textContent = a.name;
      if (isParked) { const tag = document.createElement('span'); tag.className = 'parked-tag'; tag.textContent = 'parked — never rolls'; name.append(tag); }
      const wcell = document.createElement('td'), input = document.createElement('input');
      input.type = 'number'; input.min = '0'; input.step = '1'; input.value = weights[a.id] ?? ''; input.setAttribute('aria-label', 'Weight for ' + a.name);
      input.addEventListener('change', () => {
        const next = {...(current().affix_pool || {})};
        if (input.value === '' || Number(input.value) === 0) delete next[a.id]; else next[a.id] = Number(input.value);
        current().affix_pool = next; changed(); renderPool();
      });
      wcell.append(input);
      const share = document.createElement('td'), w = weights[a.id] || 0, pct = total && !isParked ? w / total * 100 : 0;
      share.innerHTML = `<span class="share-bar"><i style="width:${Math.min(100, pct * 3).toFixed(1)}%"></i></span>`;
      share.append(document.createTextNode(w ? pct.toFixed(1) + '%' : '—'));
      row.append(name, wcell, share); return row;
    }));
    $('pool-parked').textContent = parked.length ? `${parked.length} parked affix${parked.length === 1 ? ' is' : 'es are'} still listed; parked affixes never roll. Clear the weight to tidy the pool.` : '';
  }
  function renderPreview() {
    const it = current(); if (!it) return;
    const tiers = (reference.quality_tiers || {}).gear || [];
    const likely = Object.entries(it.affix_pool || {}).filter(([id, w]) => pool.has(id) && w > 0).sort((a, b) => b[1] - a[1]).map(([id]) => affixById.get(id).name);
    BotterTooltip.render($('game-tooltip'), it, {reference, affixById, rarityIndices, rarityCounts, likely, quality: tiers.find(t => t.name === previewQuality)});
    $('tooltip-quality').replaceChildren(...tiers.map(t => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = t.name === 'Standard' ? 'No prefix' : t.name;
      b.setAttribute('aria-pressed', String(t.name === previewQuality));
      b.addEventListener('click', () => { previewQuality = t.name; renderPreview(); }); return b;
    }));
    const w = it.drop_weights || [];
    $('preview-drops').textContent = `${String(it.base_type || '').replaceAll('_', ' ')} · item tier ${it.item_tier} · drop weight by dungeon tier ${w.join(' / ')}.`;
    $('preview-icon').src = ASSETS + 'items/' + it.tile; applyTint($('preview-icon'), it.default_tint);
    const ov = overlayOf(it);
    $('preview-doll').hidden = !ov;
    if (ov) { $('preview-overlay').src = spriteUrl('overlay', ov, it); applyTint($('preview-overlay'), it.default_tint_overlay || it.default_tint); }
  }
  function renderProblems() {
    const it = current(), mine = it ? problemsFor(it) : [], all = allProblems();
    const host = $('problems'); host.replaceChildren();
    const head = document.createElement('p');
    if (!mine.length) { head.className = 'ok'; head.textContent = 'This item is valid.'; host.append(head); }
    else { head.textContent = 'Fix before downloading:'; const ul = document.createElement('ul'); ul.replaceChildren(...mine.map(m => { const li = document.createElement('li'); li.textContent = m; return li; })); host.append(head, ul); }
    const others = all.filter(([i]) => i.id !== selectedId);
    if (others.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = `${others.length} other item${others.length === 1 ? ' has' : 's have'} problems: ${others.slice(0, 5).map(([i]) => i.name || i.id).join(', ')}${others.length > 5 ? '…' : ''}.`; host.append(p); }
  }

  // ── Sprites and colour (shared look with the wizard) ───────────────────
  function imageReady(url) {
    if (loaded.has(url)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { if (img.naturalWidth) { loaded.add(url); resolve(); } else reject(new Error('Sprite is empty.')); };
      img.onerror = () => reject(new Error('Could not load sprite: ' + url));
      img.src = url;
    });
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
    image.classList.toggle('tint-prismatic', tint?.mode === 'prismatic');
    image.classList.toggle('tint-shimmer', tint?.mode === 'shimmer');
  }
  function renderSprites() {
    const it = current();
    $('chosen-icon').src = ASSETS + 'items/' + it.tile; applyTint($('chosen-icon'), it.default_tint);
    $('icon-path').textContent = it.tile;
    const worn = !!OVERLAYS[it.slot];
    $('overlay-choice').hidden = !worn; $('no-overlay').hidden = worn;
    if (worn) {
      const ov = overlayOf(it);
      $('chosen-overlay').hidden = !ov;
      if (ov) { $('chosen-overlay').src = spriteUrl('overlay', ov); applyTint($('chosen-overlay'), it.default_tint_overlay || it.default_tint); }
      $('overlay-path').textContent = it.overlay ? it.overlay + '.png' : (ov ? `${ov}.png (matches the inventory icon)` : 'No matching character sprite; the inventory icon is used.');
      $('clear-overlay').hidden = !it.overlay;
    }
  }
  function renderColourControls() {
    for (const surface of ['icon', 'overlay']) {
      const host = $(surface + '-colour'), key = surface === 'icon' ? 'default_tint' : 'default_tint_overlay';
      host.hidden = surface === 'overlay' && !OVERLAYS[current().slot];
      if (host.hidden) continue;
      const tint = current()[key], mode = tint?.mode || (surface === 'overlay' ? 'inherit' : 'none');
      host.innerHTML = `<label for="${surface}-mode">${surface === 'icon' ? 'Inventory' : 'Character'} colour effect</label><select id="${surface}-mode"></select><div id="${surface}-colour-fields"></div>`;
      const choices = [['none', 'Original colours'], ['normal', 'Rotate existing colours'], ['colorize', 'Colourize — choose a target hue'], ['inverted', 'Invert colours'], ['shimmer', 'Shimmer highlight'], ['prismatic', 'Cycle through colours']];
      if (surface === 'overlay') choices.unshift(['inherit', 'Match the inventory colour']);
      $(surface + '-mode').replaceChildren(...choices.map(([v, l]) => option(v, l)));
      $(surface + '-mode').value = mode;
      $(surface + '-mode').addEventListener('change', () => {
        const chosen = $(surface + '-mode').value;
        setField(key, ['inherit', 'none'].includes(chosen) ? (surface === 'overlay' && chosen === 'none' ? {hue: 0, sat: 1, mode: 'normal'} : null) : {...(current()[key] || {hue: 0, sat: 1}), mode: chosen});
        renderColourControls(); renderSprites();
      });
      if (mode === 'none' || mode === 'inherit') continue;
      const fields = $(surface + '-colour-fields');
      for (const [field, label, min, max, step, fallback] of [['hue', 'Hue', 0, 360, 1, 0], ['sat', 'Saturation', 0, 2, .05, 1], ...(mode === 'colorize' ? [['colorize_strength', 'Colour strength', 0, 1, .05, .7]] : [])]) {
        const row = document.createElement('div'); row.className = 'colour-slider';
        const lab = document.createElement('label'); lab.htmlFor = surface + '-' + field; lab.textContent = label;
        const input = document.createElement('input'); input.type = 'range'; input.id = lab.htmlFor; input.min = min; input.max = max; input.step = step; input.value = tint?.[field] ?? fallback;
        const out = document.createElement('output'); out.htmlFor = input.id; out.textContent = input.value + (field === 'hue' ? '°' : '');
        input.addEventListener('input', () => { setField(key, {...current()[key], [field]: Number(input.value)}); out.textContent = input.value + (field === 'hue' ? '°' : ''); renderSprites(); });
        row.append(lab, input, out); fields.append(row);
      }
    }
  }
  function openPicker(mode) {
    pickerMode = mode; pickerPage = 0; $('sprite-search').value = ''; $('sprite-all').checked = false;
    $('sprite-all').parentElement.hidden = mode !== 'icon'; $('picker-error').textContent = '';
    $('picker-title').textContent = mode === 'icon' ? 'Choose an inventory sprite' : 'Choose a character sprite';
    renderPicker(); $('sprite-picker').showModal(); $('sprite-search').focus();
  }
  function renderPicker() {
    const it = current(), search = $('sprite-search').value.trim().toLowerCase();
    const themed = new Set(gear().filter(i => i.slot === it.slot).map(i => i.tile));
    let candidates = pickerMode === 'overlay' ? overlayOptions(it.slot) : icons.filter(f => $('sprite-all').checked || themed.has(f));
    candidates = candidates.filter(f => f.toLowerCase().includes(search)).sort();
    const pages = Math.max(1, Math.ceil(candidates.length / 48)); pickerPage = Math.min(pickerPage, pages - 1);
    $('sprite-count').textContent = `${candidates.length} matches · Page ${pickerPage + 1} of ${pages}`;
    $('sprite-prev').disabled = pickerPage === 0; $('sprite-next').disabled = pickerPage >= pages - 1;
    const chosen = pickerMode === 'icon' ? it.tile : overlayOf(it);
    $('sprites').replaceChildren(...candidates.slice(pickerPage * 48, (pickerPage + 1) * 48).map(file => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'sprite-option'; button.dataset.sprite = file;
      button.setAttribute('aria-label', file); button.setAttribute('aria-pressed', String(file === chosen));
      const stage = document.createElement('span'); stage.className = 'sprite-stage'; stage.style.display = 'block';
      if (pickerMode === 'overlay') { const base = document.createElement('img'); base.alt = ''; base.src = ASSETS + 'player/spriggan_female.png'; stage.append(base); }
      const image = document.createElement('img'); image.alt = ''; image.src = spriteUrl(pickerMode, file); stage.append(image);
      const label = document.createElement('span'); label.textContent = file; button.append(stage, label);
      image.addEventListener('error', () => { button.disabled = true; label.textContent = file + ' (unavailable)'; });
      button.addEventListener('click', async () => {
        const token = ++selectionToken, mode = pickerMode; button.disabled = true;
        try {
          await imageReady(spriteUrl(mode, file)); if (token !== selectionToken) return;
          setField(mode === 'icon' ? 'tile' : 'overlay', file);
          $('sprite-picker').close(); renderSprites(); renderList();
        } catch (e) { $('picker-error').textContent = e.message; button.disabled = false; }
      });
      return button;
    }));
    if (!candidates.length) $('sprites').textContent = 'No matching sprites. Try a different search.';
  }

  // ── Actions ────────────────────────────────────────────────────────────
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function blockedByProblems() {
    const all = allProblems();
    if (!all.length) return false;
    $('status').textContent = `Fix ${all.length} item${all.length === 1 ? '' : 's'} with problems first: ${all.slice(0, 5).map(([i]) => i.name || i.id).join(', ')}.`;
    select(all[0][0].id); $('slot-filter').value = all[0][0].slot; renderList();
    return true;
  }
  function downloadFull() {
    if (blockedByProblems()) return;
    download('items.json', fullText());
    $('status').textContent = 'Downloaded items.json. Replace data/items.json with it, then run python3 tools/sync_manifests_from_items_json.py.';
  }
  function downloadChanges() {
    if (blockedByProblems()) return;
    const changedItems = working.filter(i => isEdited(i.id));
    if (!changedItems.length && !deletedIds().length) { $('status').textContent = 'There are no changes to download.'; return; }
    download('items_changes.json', changesText());
    $('status').textContent = `Downloaded ${changedItems.length} changed item${changedItems.length === 1 ? '' : 's'} for python3 tools/sync_items.py items_changes.json.` +
      (deletedIds().length ? ' Deletions are not in this file; download items.json to apply them.' : '');
  }
  function duplicate() {
    const it = current(); if (!it) return;
    const fresh = copy(it); let id = it.id + '_copy', n = 2;
    while (working.some(i => i.id === id)) id = it.id + '_copy' + n++;
    fresh.id = id; fresh.name = it.name + ' (copy)';
    working.splice(working.indexOf(it) + 1, 0, fresh);
    select(id); $('status').textContent = 'Created a copy. Give it a new name and a permanent ID.'; $('f-name').focus();
  }
  function revertItem() {
    const it = current(); if (!it) return;
    if (isNew(it.id)) { if (!confirm('Remove this new item?')) return; working.splice(working.indexOf(it), 1); select(null); }
    else { working[working.indexOf(it)] = JSON.parse(originals.get(it.id)); renderEditor(); }
    changed();
  }
  function deleteItem() {
    const it = current(); if (!it || !confirm(`Delete ${it.name}? Download items.json to apply it.`)) return;
    working.splice(working.indexOf(it), 1); selectedId = null; renderEditor(); changed();
  }
  async function copyItem() {
    try { await navigator.clipboard.writeText(JSON.stringify(current(), null, '\t')); $('status').textContent = 'Copied the item JSON.'; }
    catch { $('status').textContent = 'Clipboard unavailable. Open “View item JSON” and copy it from there.'; }
  }
  async function importFile(file) {
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : data.id ? [data] : [];
      const usable = incoming.filter(i => i && typeof i.id === 'string' && Object.hasOwn(SLOTS, i.slot));
      if (!usable.length) throw new Error('No gear items found in that file.');
      const replacing = usable.filter(i => working.some(w => w.id === i.id));
      if (replacing.length && !confirm(`Replace ${replacing.length} existing item${replacing.length === 1 ? '' : 's'} (${replacing.map(i => i.id).join(', ')})?`)) return;
      for (const item of usable) {
        const at = working.findIndex(w => w.id === item.id);
        if (at >= 0) working[at] = item; else working.push(item);
      }
      $('slot-filter').value = usable[0].slot; select(usable[0].id); changed();
      $('status').textContent = `Imported ${usable.length} item${usable.length === 1 ? '' : 's'}${data._proposal?.author ? ' from ' + data._proposal.author : ''}. Review sprites, stats and bonuses before downloading.`;
    } catch (e) { $('status').textContent = 'Could not import: ' + e.message; }
    finally { $('import-file').value = ''; }
  }
  function discardAll() {
    if (!confirm('Discard every unsaved change and reload items.json?')) return;
    working = JSON.parse(JSON.stringify(doc.items)); selectedId = null;
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    renderEditor(); renderList(); renderSummary(); $('status').textContent = 'All changes discarded.';
  }

  function bind() {
    $('slot-filter').replaceChildren(...Object.entries(SLOTS).map(([v, t]) => option(v, t)));
    for (const id of ['slot-filter', 'search', 'tier-filter', 'rarity-filter', 'unique-filter', 'edited-filter']) $(id).addEventListener('input', renderList);
    $('f-name').addEventListener('input', () => setField('name', $('f-name').value));
    $('f-id').addEventListener('change', () => {
      const it = current(), next = $('f-id').value.trim();
      if (!isNew(it.id) || next === it.id) return;
      if (working.some(i => i.id === next)) { $('status').textContent = 'That ID is already used.'; $('f-id').value = it.id; return; }
      it.id = next; selectedId = next; changed();
    });
    $('f-base_type').addEventListener('change', () => { setField('base_type', $('f-base_type').value.trim()); renderImplicits(); renderPool(); });
    $('f-item_tier').addEventListener('change', () => { setField('item_tier', Number($('f-item_tier').value)); renderStats(); });
    $('f-rarity').addEventListener('change', () => { setField('rarity', $('f-rarity').value); renderImplicits(); renderPool(); });
    $('f-unique').addEventListener('change', () => setField('unique', $('f-unique').checked));
    $('f-lore').addEventListener('input', () => setField('lore', $('f-lore').value));
    $('f-requires_innate_tag').addEventListener('change', () => setField('requires_innate_tag', $('f-requires_innate_tag').value));
    $('f-boss_drop').addEventListener('change', () => setField('boss_drop', $('f-boss_drop').value.trim()));
    $('f-vault_drop').addEventListener('change', () => setField('vault_drop', $('f-vault_drop').value.trim()));
    $('f-enchant_chance').addEventListener('input', () => setField('enchant_chance', $('f-enchant_chance').value === '' ? NaN : Number($('f-enchant_chance').value)));
    $('implicit-search').addEventListener('input', renderImplicits);
    $('show-parked').addEventListener('change', renderImplicits);
    $('pick-icon').addEventListener('click', () => openPicker('icon'));
    $('pick-overlay').addEventListener('click', () => openPicker('overlay'));
    $('clear-overlay').addEventListener('click', () => { setField('overlay', null); renderSprites(); });
    $('picker-close').addEventListener('click', () => { selectionToken++; $('sprite-picker').close(); });
    $('sprite-picker').addEventListener('cancel', () => selectionToken++);
    for (const id of ['sprite-search', 'sprite-all']) $(id).addEventListener('input', () => { pickerPage = 0; renderPicker(); });
    $('sprite-prev').addEventListener('click', () => { pickerPage--; renderPicker(); });
    $('sprite-next').addEventListener('click', () => { pickerPage++; renderPicker(); });
    $('editor-form').addEventListener('submit', e => e.preventDefault());
    $('new-item').addEventListener('click', duplicate);
    $('download-full').addEventListener('click', downloadFull);
    $('download-changes').addEventListener('click', downloadChanges);
    $('discard').addEventListener('click', discardAll);
    $('import-file').addEventListener('change', () => { if ($('import-file').files[0]) importFile($('import-file').files[0]); });
    $('copy-item').addEventListener('click', copyItem);
    $('revert-item').addEventListener('click', revertItem);
    $('delete-item').addEventListener('click', deleteItem);
    $('retry').addEventListener('click', () => location.reload());
  }

  async function init() {
    try {
      const fetchText = async name => { const r = await fetch(name); if (!r.ok) throw new Error(name.split('/').pop() + ': HTTP ' + r.status); return r.text(); };
      const [itemsText, affixText, manifestText, speciesText, biomesText, refText] = await Promise.all([
        fetchText(DATA + 'items.json'), fetchText(DATA + 'affixes.json'), fetchText(DATA + 'tile_dir_manifest.json'),
        fetchText(DATA + 'species.json'), fetchText(DATA + 'biomes.json'), fetchText('portal_reference.json')]);
      doc = JSON.parse(itemsText); rememberNumberTokens(itemsText, doc); sourceSignature = signature(itemsText);
      const affixDoc = JSON.parse(affixText);
      affixes = affixDoc.affixes; affixById = new Map(affixes.map(a => [a.id, a]));
      pool = new Set((affixDoc.random_pool || {}).ids || []);
      rarityIndices = affixDoc.rarity_tier_index; rarityCounts = affixDoc.rarity_affix_count;
      files = JSON.parse(manifestText); reference = JSON.parse(refText);
      species = JSON.parse(speciesText).species; biomeIds = Object.keys(JSON.parse(biomesText).biomes).filter(b => !b.startsWith('portal_')).sort();
      icons = Object.entries(files).filter(([dir]) => dir.startsWith('res://assets/tiles/items/') && !dir.includes('/spells/')).flatMap(([dir, names]) => names.map(n => dir.slice('res://assets/tiles/items/'.length) + n));
      if (!doc.items?.length || !affixes.length || !icons.length) throw new Error('Item, affix or sprite data is empty.');
      working = JSON.parse(JSON.stringify(doc.items));
      originals = new Map(doc.items.map(i => [i.id, JSON.stringify(i)]));
      const note = restore();
      bind();
      const first = current() || gear()[0];
      $('slot-filter').value = first.slot; selectedId = first.id;
      $('workspace').hidden = false; renderList(); renderEditor(); renderSummary();
      $('status').textContent = note || 'Ready. Edits stay in this browser until you download them.';
      window.itemEditor = {items: () => working, select, fullText, changesText, setField, problems: allProblems};
    } catch (e) { $('status').textContent = 'Could not load the item editor. ' + e.message; $('retry').hidden = false; }
  }
  init();
})();
