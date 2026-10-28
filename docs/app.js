import { render } from './vendor/preact.mjs';
import { html, useState, useEffect, useStore, setStore, ui, Icon } from './ui/common.js';
import { createStore } from './lib/store.js';
import { loadSeed } from './lib/data.js';
import { fmtDay } from './lib/dates.js';
import { Dashboard } from './ui/dashboard.js';
import { Today } from './ui/today.js';
import { Plan } from './ui/plan.js';
import { Farm } from './ui/farm.js';
import { Report } from './ui/report.js';
import { SheetHost } from './ui/sheets.js';

const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', view: Dashboard },
  { id: 'today', label: 'Today', icon: 'today', view: Today },
  { id: 'plan', label: 'Plan', icon: 'plan', view: Plan },
  { id: 'farm', label: 'Farm', icon: 'farm', view: Farm },
  { id: 'report', label: 'Report', icon: 'report', view: Report },
];

const routeFromHash = () => ROUTES.find((r) => location.hash === `#/${r.id}`) || ROUTES[0];

function useRoute() {
  const [route, setRoute] = useState(routeFromHash());
  useEffect(() => {
    const on = () => { setRoute(routeFromHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

function SyncChip() {
  const { s, a } = useStore();
  const offline = s.sync === 'offline';
  const syncing = s.sync === 'syncing';
  const kind = offline ? 'warn' : syncing ? 'info' : 'good';
  const text = syncing ? 'Syncing' : offline ? (s.pending ? `${s.pending} waiting` : 'Offline') : 'Synced';
  const label = syncing ? 'Syncing changes' : offline ? `Offline, working locally. ${s.pending} changes waiting to upload. Tap to go back online.` : 'Online and synced. Tap to simulate going offline.';
  return html`<button type="button" class=${`chip btnlike ${kind}`} style="min-height:44px" onClick=${() => a.setOffline(!s.offline)} aria-label=${label} title="Demo control: simulate offline">
    <span class=${syncing ? 'spin' : ''} style="display:inline-flex"><${Icon} name=${offline ? 'offline' : syncing ? 'sync' : 'check'} /></span>${text}</button>`;
}

function App() {
  const { s, d, a } = useStore();
  const route = useRoute();
  const View = route.view;
  useEffect(() => { document.title = `${route.label} · FarmLand demo`; }, [route]);
  useEffect(() => {
    if (!s.toast) return;
    const t = setTimeout(a.clearToast, 3800);
    return () => clearTimeout(t);
  }, [s.toast]);
  const attention = d.alerts.filter((x) => x.level !== 'info').length;
  return html`<div class="app">
    <header class="top">
      <div class="brand"><b>${s.seed.farm.name}</b><span>Demo date ${fmtDay(d.now)}</span></div>
      <${SyncChip} />
      <button class="iconbtn" type="button" onClick=${() => ui.open('alerts')} aria-label=${`Alerts, ${attention} need attention`}><${Icon} name="bell" />${attention > 0 && html`<span class="badge" aria-hidden="true">${attention}</span>`}</button>
      <button class="iconbtn" type="button" onClick=${() => ui.open('settings')} aria-label="Settings and demo controls"><${Icon} name="gear" /></button>
    </header>
    <div class="demo-strip" role="note">Demo data. Weather and sync are simulated, and changes reset when you reload.</div>
    <nav class="tabs" aria-label="Main">
      ${ROUTES.map((r) => html`<a class="tab" href=${`#/${r.id}`} aria-current=${route.id === r.id ? 'page' : null}><${Icon} name=${r.icon} />${r.label}</a>`)}
    </nav>
    <main id="main" tabIndex="-1"><${View} /></main>
    <${SheetHost} />
    ${s.toast && html`<div class="toast" role="status" key=${s.toast.id}>${s.toast.msg}</div>`}
  </div>`;
}

async function boot() {
  const root = document.getElementById('app');
  try {
    const seed = await loadSeed(async (f) => {
      const r = await fetch(`data/${f}`);
      if (!r.ok) throw new Error(`Could not load ${f}`);
      return r.text();
    });
    const store = createStore(seed);
    setStore(store);
    setInterval(store.actions.tick, 250);
    root.textContent = '';
    render(html`<${App} />`, root);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  } catch (e) {
    root.innerHTML = `<p style="padding:24px;font:16px system-ui"><b>The demo could not start.</b><br>${e.message}. Serve this folder over http (for example <code>python3 -m http.server</code>) instead of opening the file directly.</p>`;
  }
}
boot();
