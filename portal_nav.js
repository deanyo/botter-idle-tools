"use strict";
(async function () {
  const ICONS = {
    menu:'<path d="M2 4h12M2 8h12M2 12h12"/>',
    home:'<path d="m1.5 7 6.5-5.5L14.5 7M3 6v8h4v-4h3v4h3V6"/>',
    wizard:'<path d="m3 13 8-8m-1-2 3 3M4 2v4M2 4h4m6 5v5m-2-2h4"/>',
    sprites:'<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M6 2v12M10 2v12M2 6h12M2 10h12"/>',
    atlas:'<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
    affixes:'<path d="M3 2v12M8 2v12m5-12v12M1 5h4m1 5h4m1-5h4"/>',
    enemies:'<path d="m8 1 6 3v4c0 3-6 7-6 7s-6-4-6-7V4zM5 8h6"/>',
    items:'<path d="m2 12 2 2L14 4V2h-2L2 12zm0-2 4 4"/>',
    archive:'<path d="M3 5v9h10V5M2 2h12v3H2zM6 8h4"/>',
    search:'<circle cx="6.5" cy="6.5" r="4.5"/><path d="m10 10 4 4"/>',
    repo:'<path d="M3 2h10v12H3a2 2 0 0 1 0-4h10M3 2a1 1 0 0 0-1 1v9M5 4v4"/>',
    arrow:'<path d="M3 8h10m-4-4 4 4-4 4"/>'
  };
  const icon = name => `<svg class="portal-icon" viewBox="0 0 16 16" aria-hidden="true">${ICONS[name] || ICONS.repo}</svg>`;
  try {
    const response = await fetch('portal_catalog.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const pages = await response.json();
    const file = location.pathname.split('/').pop() || 'index.html';
    const current = pages.find(p => p.href === file);
    const archivedPages = pages.filter(p => p.status === 'archived');
    const tools = pages.filter(p => p.status !== 'archived');
    const oldNav = document.querySelector('nav.portal-nav');
    if (oldNav) {
      const host = oldNav.parentElement; oldNav.remove();
      if (host.tagName === 'HEADER' && !host.children.length && !host.textContent.trim()) host.remove();
    }
    document.querySelector('body > .repo-header')?.remove();
    const content = document.createElement('div'); content.className = 'portal-content'; content.id = 'portal-main';
    if (['index.html','archive.html','item_wizard.html'].includes(file)) content.classList.add('portal-document');
    for (const node of [...document.body.childNodes]) {
      if (node.nodeType === Node.ELEMENT_NODE && ['SCRIPT','DIALOG'].includes(node.tagName)) continue;
      content.append(node);
    }
    document.body.classList.add('portal-shell');
    document.body.append(content);
    const topbar = document.createElement('div'); topbar.className = 'portal-topbar';
    topbar.innerHTML = `<button class="portal-icon-button" id="portal-menu" aria-label="Toggle navigation" aria-controls="portal-sidebar">${icon('menu')}</button><a class="portal-brand" href="index.html"><span class="portal-brand-mark">B</span><span class="portal-owner">deanyo</span><span class="portal-slash">/</span><strong>botter-tools</strong><span class="portal-public">Public</span></a><button class="portal-search-trigger" id="portal-search-trigger">${icon('search')}<span>Type <kbd>/</kbd> to find a tool</span><kbd class="portal-search-shortcut">/</kbd></button><a class="portal-icon-button" href="https://github.com/deanyo/botter-idle-tools" aria-label="Open the public tools repository" target="_blank" rel="noopener">${icon('repo')}</a>`;
    const sidebar = document.createElement('aside'); sidebar.className = 'portal-sidebar'; sidebar.id = 'portal-sidebar';
    sidebar.innerHTML = '<a class="portal-workspace" href="index.html"><span class="portal-avatar">B</span><span><strong>Botter</strong><small>Authoring workspace</small></span></a><nav class="portal-views" aria-label="Authoring tools"></nav><div class="portal-sidebar-bottom"><span class="portal-online-dot"></span>Made for the dungeon.<p>Player designs are reviewed before they enter the game.</p></div>';
    const views = sidebar.querySelector('nav');
    function link(href,title,which,active,badge) {
      const a = document.createElement('a'); a.href = href; a.className = 'portal-view-link';
      a.innerHTML = icon(which);
      const text = document.createElement('span'); text.textContent = title; a.append(text);
      if (active) a.setAttribute('aria-current','page');
      if (badge) { const tag = document.createElement('small'); tag.className = badge === 'Players' ? 'portal-player-tag' : badge === 'Update' ? 'portal-update-tag' : 'portal-counter'; tag.textContent = badge; a.append(tag); }
      return a;
    }
    views.append(link('index.html','Overview','home',file === 'index.html'));
    for (const player of pages.filter(p => p.status === 'player')) views.append(link(player.href,player.title,player.id,file === player.href,'Players'));
    const label = document.createElement('p'); label.className = 'portal-sidebar-heading'; label.textContent = 'Developer tools'; views.append(label);
    for (const p of tools.filter(p => p.status !== 'player')) views.append(link(p.href,p.title,p.id,file === p.href,p.status === 'outdated' ? 'Update' : null));
    const divider = document.createElement('div'); divider.className = 'portal-nav-divider'; views.append(divider);
    views.append(link('archive.html','Archive','archive',file === 'archive.html' || current?.status === 'archived',String(archivedPages.length)));
    const scrim = document.createElement('button'); scrim.className = 'portal-sidebar-scrim'; scrim.setAttribute('aria-label','Close navigation'); scrim.hidden = true;
    document.body.prepend(topbar,sidebar,scrim);
    let mobile = matchMedia('(max-width: 900px)').matches;
    const menu = document.getElementById('portal-menu');
    function setNavigation(open) {
      document.body.classList.toggle('portal-nav-open',open);
      document.body.classList.toggle('portal-nav-closed',!open);
      menu.setAttribute('aria-expanded',String(open)); sidebar.inert = !open;
      content.inert = mobile && open; scrim.hidden = !mobile || !open;
    }
    setNavigation(!mobile);
    menu.addEventListener('click', () => setNavigation(menu.getAttribute('aria-expanded') !== 'true'));
    scrim.addEventListener('click', () => {setNavigation(false); menu.focus();});
    addEventListener('resize', () => {const next = matchMedia('(max-width: 900px)').matches;if (next !== mobile) {mobile = next;setNavigation(!mobile);}});
    const search = document.createElement('dialog'); search.className = 'portal-search-dialog';
    search.setAttribute('aria-label','Find an authoring tool');
    search.innerHTML = `<div class="portal-search-heading">${icon('search')}<input id="portal-tool-query" type="search" placeholder="Find an editor, atlas or archived study…" aria-label="Find a tool"><button id="portal-search-close" type="button">Esc</button></div><div class="portal-search-results"></div>`;
    document.body.append(search);
    const query = search.querySelector('input'), results = search.querySelector('.portal-search-results');
    function renderSearch() {
      const q = query.value.trim().toLowerCase();
      const matches = pages.filter(p => `${p.title} ${p.description} ${p.status}`.toLowerCase().includes(q));
      results.replaceChildren(...matches.map(p => {
        const a = document.createElement('a'); a.href = p.href;
        const title = document.createElement('strong'); title.textContent = p.title;
        const detail = document.createElement('small'); detail.textContent = p.status === 'outdated' ? 'Out of date — update needed' : p.status === 'archived' ? 'Archived reference' : p.description;
        a.append(title,detail); return a;
      }));
      if (!matches.length) results.textContent = 'No matching tools.';
    }
    function openSearch() {query.value = '';renderSearch();search.showModal();query.focus();}
    document.getElementById('portal-search-trigger').addEventListener('click',openSearch);
    document.getElementById('portal-search-close').addEventListener('click',() => search.close()); query.addEventListener('input',renderSearch);
    document.addEventListener('keydown', event => {
      if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) {event.preventDefault();openSearch();}
      if (event.key === 'Escape' && search.open) {event.preventDefault();search.close();document.getElementById('portal-search-trigger').focus();}
      else if (event.key === 'Escape' && mobile) {setNavigation(false);menu.focus();}
    });
    if (current?.note && current.status !== 'player') {
      const note = document.createElement('aside'); note.className = 'tool-notice'; note.textContent = current.note;
      if (current.status === 'outdated') note.classList.add('outdated');
      if (current.status === 'archived') {note.classList.add('archived');const a = document.createElement('a');a.href = 'archive.html';a.textContent = ' Browse archive';note.append(a);}
      content.prepend(note);
    }
    for (const section of document.querySelectorAll('[data-catalog]')) {
      const archived = section.dataset.catalog === 'archived';
      section.replaceChildren(...pages.filter(p => (p.status === 'archived') === archived).map(p => {
        const a = document.createElement('a'); a.className = 'catalog-row'; a.href = p.href;
        const name = document.createElement('span'); name.className = 'catalog-name'; name.innerHTML = icon(archived ? 'archive' : p.id);
        const title = document.createElement('strong'); title.textContent = p.title; name.append(title);
        const description = document.createElement('span'); description.textContent = p.description;
        const badge = document.createElement('small'); badge.textContent = p.status === 'player' ? 'For players' : archived ? 'Archived' : p.status === 'outdated' ? 'Update needed' : 'Developer';
        if (p.status === 'outdated') badge.className = 'portal-update-tag';
        a.append(name,description,badge); return a;
      }));
    }
    for (const node of document.querySelectorAll('[data-archive-count]')) node.textContent = archivedPages.length;
    for (const node of document.querySelectorAll('[data-listed-count]')) node.textContent = tools.length;
    if (document.querySelector('[data-atlas-count]')) {
      const ref = await fetch('portal_reference.json'); if (ref.ok) {const count = Object.keys((await ref.json()).atlas_roots).length;for (const node of document.querySelectorAll('[data-atlas-count]')) node.textContent = count.toLocaleString();}
    }
  } catch (error) {
    for (const section of document.querySelectorAll('[data-catalog]')) section.textContent = 'Could not load the tool catalogue. Reload to retry. ' + error.message;
  }
})();
