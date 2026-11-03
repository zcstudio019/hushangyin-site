(() => {
  'use strict';
  const header = document.querySelector('.site-header');
  const menu = header?.querySelector('.menu-toggle');
  const nav = header?.querySelector('.main-nav');
  if (!menu || !nav) return;
  const setOpen = (open, restoreFocus = false) => {
    nav.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? '收起导航菜单' : '打开导航菜单');
    if (restoreFocus) menu.focus();
  };
  menu.addEventListener('click', () => setOpen(menu.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('open')) setOpen(false, true);
  });
  document.addEventListener('click', event => {
    if (!header.contains(event.target)) setOpen(false);
  });
  header.addEventListener('focusout', event => {
    if (!header.contains(event.relatedTarget)) setOpen(false);
  });
  let collapsed;
  const fit = () => {
    const shell = header.querySelector('.nav-shell');
    const logo = header.querySelector('.logo');
    const cta = header.querySelector('.nav-cta');
    nav.classList.add('nav-measure');
    const required = logo.offsetWidth + nav.scrollWidth + cta.offsetWidth + 72;
    nav.classList.remove('nav-measure');
    const next = window.innerWidth <= 1240 || required > shell.clientWidth;
    header.classList.toggle('nav-collapsed', next);
    if (collapsed !== next) {
      const focusWasInNav = nav.contains(document.activeElement);
      setOpen(false, next && focusWasInNav);
    }
    collapsed = next;
  };
  new ResizeObserver(fit).observe(header.querySelector('.nav-shell'));
  window.addEventListener('resize', fit);
  document.fonts.ready.then(fit);
  window.addEventListener('pageshow', () => { setOpen(false); fit(); });
  fit();
})();
