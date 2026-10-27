"use strict";
(async function () {
  try {
    const response = await fetch('portal_catalog.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const pages = await response.json();
    const current = pages.find(p => p.href === location.pathname.split('/').pop());
    const nav = document.querySelector('nav.portal-nav');
    if (nav) {
      const links = [{href:'index.html', title:'Botter / tools'}, ...pages.filter(p => p.status !== 'archived'), {href:'archive.html', title:'Archive'}];
      nav.replaceChildren(...links.map(p => {
        const a = document.createElement('a'); a.href = p.href; a.textContent = p.title;
        a.className = 'nav-link' + (p.href === current?.href ? ' active' : '');
        if (p.href === current?.href) a.setAttribute('aria-current', 'page');
        return a;
      }));
    }
    if (current?.note) {
      const note = document.createElement('aside'); note.className = 'tool-notice';
      note.textContent = current.note;
      if (current.status === 'archived') {
        note.classList.add('archived');
        const a = document.createElement('a'); a.href = 'archive.html'; a.textContent = ' Browse archive'; note.append(a);
      }
      (document.querySelector('body > header') || document.querySelector('#topbar') || document.body.firstElementChild).after(note);
    }
    for (const section of document.querySelectorAll('[data-catalog]')) {
      const archived = section.dataset.catalog === 'archived';
      section.replaceChildren(...pages.filter(p => (p.status === 'archived') === archived).map(p => {
        const a = document.createElement('a'); a.className = 'catalog-row'; a.href = p.href;
        const title = document.createElement('strong'); title.textContent = p.title;
        const description = document.createElement('span'); description.textContent = p.description;
        const badge = document.createElement('small'); badge.textContent = p.status === 'player' ? 'For players' : archived ? 'Archived' : 'Developer';
        a.append(title, description, badge); return a;
      }));
    }
  } catch (error) {
    for (const section of document.querySelectorAll('[data-catalog]')) section.textContent = 'Could not load the tool catalogue. Reload to retry. ' + error.message;
  }
})();
