// Shared portal navigation. Drop this into every editor/viewer page:
//
//   <nav class="portal-nav" data-active="atlas" data-title="DCSS Atlas"></nav>
//   <script src="portal_nav.js" defer></script>
//
// data-active picks the highlighted link from the PAGES table below.
// data-title is optional; if present, renders a leading title chip.
//
// One source of truth for the link list — when we add a new page,
// add one row here and every page picks it up. 2026-06-05.

(function () {
  const PAGES = [
    { id: 'atlas',     href: 'atlas_viewer.html',  label: 'Atlas' },
    { id: 'items',     href: 'item_editor.html',   label: 'Items' },
    { id: 'biomes',    href: 'biome_editor.html',  label: 'Biomes' },
    { id: 'affixes',   href: 'affix_editor.html',  label: 'Bonuses' },
    { id: 'drops',     href: 'drop_tuning.html',   label: 'Drop rates' },
    { id: 'flowchart', href: 'roll_flowchart.html',label: 'Roll flowchart' },
    { id: 'matrix',    href: 'build_matrix.html', label: 'Build matrix' },
    { id: 'enemies',   href: 'enemy_resistance_editor.html', label: 'Enemies' },
    { id: 'proposal',  href: 'slot_proposal.html', label: 'Slot proposal' },
    { id: 'card-mockups', href: 'item_card_mockups.html', label: 'Card mockups' },
  ];

  function build() {
    const nav = document.querySelector('nav.portal-nav');
    if (!nav) return;
    const active = nav.dataset.active || '';
    const title = nav.dataset.title || '';
    const parts = [];
    parts.push('<a href="index.html" class="nav-home" title="Authoring Portal home">← portal</a>');
    if (title) parts.push(`<span class="nav-title">${title}</span>`);
    for (const p of PAGES) {
      const cls = p.id === active ? 'nav-link active' : 'nav-link';
      parts.push(`<a href="${p.href}" class="${cls}">${p.label}</a>`);
    }
    parts.push('<span class="nav-spacer"></span>');
    nav.innerHTML = parts.join('');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
