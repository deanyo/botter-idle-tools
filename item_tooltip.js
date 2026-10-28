"use strict";
// Approximate in-game item tooltip for the authoring portal (item wizard and
// item editor). Mirrors item_tooltip.gd's order and wording: title (quality
// prefix), rarity · slot · class, quality line, Weapon / Defense blocks,
// heritage requirement, Unique (built-in bonuses at the rarity's mid value),
// random affix count, and lore. Labels, colours and weapon styles come from
// portal_reference.json, which build_portal_reference.py reads from the game.
window.BotterTooltip = (() => {
  const SLOT_LABELS = {weapon:'Weapon',armor:'Body Armor',helm:'Helm',shield:'Shield',boots:'Boots',gloves:'Gloves',cloak:'Cloak',ring:'Ring',amulet:'Amulet'};
  const cap = s => String(s || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  function el(tag, cls, text, colour) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    if (colour) node.style.color = colour;
    return node;
  }
  function midValue(affix, rarity, rarityIndices) {
    const tiers = affix.tiers || [];
    if (!tiers.length) return {value: 0};
    const band = tiers[Math.max(0, Math.min(rarityIndices[rarity] || 0, tiers.length - 1))];
    if (Array.isArray(band)) {
      const out = {value: Math.round((band[0] + band[1]) / 2)};
      if (affix.kind === 'range') { out.min = band[0]; out.max = band[1]; }
      return out;
    }
    return {value: Number(band)};
  }
  // item_tooltip.gd::_format_affix_line
  function affixLine(affix, rolled, tip) {
    const stat = affix.stat || '', kind = affix.kind || 'flat';
    if (kind === 'range') return `+${rolled.min}-${rolled.max} ${cap(stat.replace('_extra', ''))}`;
    if (kind === 'pct') {
      if (stat === 'spell_cdr_pct') return `-${rolled.value}% Spell Cooldown`;
      return `${rolled.value < 0 ? '' : '+'}${rolled.value}% ${tip.pct_labels[stat] || affix.name}`;
    }
    if (kind === 'flag') return affix.name;
    return `${rolled.value < 0 ? '' : '+'}${rolled.value} ${tip.flat_labels[stat] || affix.name}`;
  }
  function render(host, item, ctx) {
    const ref = ctx.reference || {}, tip = ref.tooltip || {pct_labels: {}, flat_labels: {}, stat_colors: {}, damage_colors: {}, weapon_styles: {}};
    const rarity = item.rarity || 'common', rarityColour = `var(--rarity-${rarity})`;
    host.replaceChildren(); host.classList.add('game-tooltip'); host.style.borderColor = rarityColour;
    const section = (text, gold) => host.append(el('p', 'tt-section' + (gold ? ' gold' : ''), text));
    const quality = ctx.quality && ctx.quality.name !== 'Standard' ? ctx.quality : null;
    host.append(el('p', 'tt-title', (quality ? quality.name + ' ' : '') + (item.name || 'Unnamed item'), rarityColour));
    const sub = [cap(rarity), SLOT_LABELS[item.slot] || cap(item.slot)];
    if (item.slot === 'weapon' && item.weapon_class) sub.push(item.weapon_class);
    host.append(el('p', 'tt-sub', sub.join(' · ')));
    if (quality) {
      const pct = Math.round((quality.mult - 1) * 100);
      host.append(el('p', 'tt-quality ' + (pct >= 0 ? 'up' : 'down'), `${quality.name} · ${pct >= 0 ? '+' : ''}${pct}%`));
    }
    const q = quality ? quality.mult : 1;
    if (item.slot === 'weapon' && (item.damage_min > 0 || item.damage_max > 0)) {
      section('Weapon');
      const lo = Math.round(item.damage_min * q), hi = Math.round(item.damage_max * q), type = item.damage_type || 'physical';
      host.append(el('p', 'tt-damage', `${lo === hi ? lo : lo + '-' + hi} ${cap(type)}`, tip.damage_colors[type]));
      host.append(el('p', 'tt-body', `${Number(item.speed).toFixed(2)}s Attack Speed`));
      const style = tip.weapon_styles[item.base_type];
      if (style) host.append(el('p', 'tt-style', 'Style: ' + style));
    }
    const armor = Math.round((item.armor || 0) * q), evasion = Math.round((item.evasion || 0) * q);
    if (armor > 0 || evasion > 0 || item.block_chance > 0) {
      section('Defense');
      if (armor > 0) host.append(el('p', 'tt-body', `Armor: ${armor}`));
      if (evasion > 0) host.append(el('p', 'tt-body', `Evasion: +${evasion}%`));
      if (item.block_chance > 0) host.append(el('p', 'tt-body', `Block Chance: ${Math.round(item.block_chance * q)}%`));
    }
    if (item.requires_innate_tag) host.append(el('p', 'tt-heritage', `${cap(item.requires_innate_tag)} heritage required`));
    const implicits = (item.implicit_affixes || []).map(id => ctx.affixById.get(id)).filter(Boolean);
    if (implicits.length) {
      section('Unique', true);
      for (const affix of implicits) {
        // A drawback renders red, as in item_tooltip.gd, so its cost is never read as a bonus.
        const drawback = affix.family === 'drawback';
        const line = el('p', 'tt-implicit' + (drawback ? ' drawback' : ''), affixLine(affix, midValue(affix, rarity, ctx.rarityIndices), tip), drawback ? undefined : tip.stat_colors[affix.stat]);
        host.append(line);
        if (affix.kind === 'flag' && ref.stat_descriptions?.[affix.stat]) host.append(el('p', 'tt-desc', ref.stat_descriptions[affix.stat]));
      }
    }
    const n = (ctx.rarityCounts || {})[rarity] || 0;
    if (n) {
      section('Affixes');
      const likely = (ctx.likely || []).slice(0, 3);
      host.append(el('p', 'tt-random', `+ ${n} random affix${n === 1 ? '' : 'es'}${likely.length ? ', often ' + likely.join(', ') : ''}`));
    }
    if (item.lore) { section('Item'); host.append(el('p', 'tt-lore', `"${item.lore}"`)); }
  }
  return {render, midValue, affixLine};
})();
