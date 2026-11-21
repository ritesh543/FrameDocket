import { createDemo } from './demo.js';
import { channels, kinds, obligations, statuses, sha256 } from './model.js';
import { deployment } from './deployment.js';

const app = document.querySelector('#app');
const panel = document.querySelector('#panel');
const toast = document.querySelector('#notice');
let browserStorage;
try { browserStorage = window.localStorage; } catch { /* The demo can use memory. */ }
const demo = createDemo(browserStorage);
const params = new URLSearchParams(location.search);
const pageSize = 20;
const state = {
  mode: params.get('mode') === 'live' ? 'live' : 'demo', view: 'releases', filter: 'ALL',
  current: null, preferred: params.get('release') || '', overview: {}, releases: [], grants: [], events: [],
  loading: false, busy: false, error: '', grantQuery: ''
};
let studio;
let noticeTimer;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const short = value => value?.length > 18 ? value.slice(0, 7) + '…' + value.slice(-4) : value;
const territory = value => value === 'WORLD' ? 'Worldwide' : value;
const count = (n, singular, plural = singular + 's') => Number(n) + ' ' + (Number(n) === 1 ? singular : plural);
const statusText = value => statuses[value] || value;
const kindIcon = { FOOTAGE: '▣', ARTWORK: '✦', MUSIC: '♪', IMAGE: '◫' };
const eventLabels = {
  RELEASE_CREATED: 'Release created', GRANT_PUBLISHED: 'Grant published', GRANT_REVOKED: 'Grant revoked',
  ASSET_ATTACHED: 'Asset attached', ASSET_REMOVED: 'Asset removed', ASSET_REVIEWED: 'Asset reviewed',
  OBLIGATION_RECORDED: 'Condition evidence recorded', RELEASE_SEALED: 'Manifest sealed'
};
const modes = { demo: 'Demo', live: 'StudioNet' };
const explorer = path => deployment.explorer + path;
const contractLink = deployment.address ? explorer('/address/' + deployment.address) : '';
const isLive = () => state.mode === 'live';
const api = () => isLive() ? studio : demo;
const canChange = () => !isLive() || Boolean(studio?.account);
const ownsDraft = release => canChange() && !release.sealed_at && api().account === release.owner.toLowerCase();
const dateOnly = value => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
const eventTime = value => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const badge = status => `<span class="badge ${String(status).toLowerCase().replace(/[^a-z_]/g, '')}">${esc(statusText(status))}</span>`;
const button = (action, label, key = '', variant = '', disabled = false) =>
  `<button class="button ${variant}" type="button" data-action="${action}" data-key="${esc(key)}" ${disabled ? 'disabled' : ''}>${esc(label)}</button>`;
const kind = grant => `<span class="kind-chip ${esc(grant.kind.toLowerCase())}" aria-hidden="true">${kindIcon[grant.kind] || '□'}</span>`;
const options = (records, selected) => Object.entries(records).map(([id, label]) =>
  `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
const details = entries => `<dl class="details">${entries.map(([key, value]) =>
  `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`;

function notify(message, hash = '', hold = false) {
  clearTimeout(noticeTimer);
  toast.replaceChildren(document.createTextNode(message));
  if (hash) {
    const link = document.createElement('a');
    link.href = explorer('/tx/' + hash);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'View transaction';
    toast.append(link);
  }
  toast.hidden = false;
  if (!hold) noticeTimer = setTimeout(() => { toast.hidden = true; }, 6200);
}

function render() {
  const labels = { releases: ['▦', 'Releases'], grants: ['▤', 'Grant library'], activity: ['◷', 'Activity'] };
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><img src="assets/framedocket-logo.png" alt="" width="45" height="45"><strong>FrameDocket</strong></div>
        <nav aria-label="Workspace">
          ${Object.entries(labels).map(([route, [icon, label]]) =>
            `<button type="button" class="nav-button" aria-current="${route === state.view ? 'page' : 'false'}" data-action="navigate" data-key="${route}"><span class="nav-symbol" aria-hidden="true">${icon}</span>${label}</button>`).join('')}
        </nav>
        <div class="network-card"><div class="network-title"><span class="dot" aria-hidden="true"></span><strong>GenLayer StudioNet</strong></div><span>Chain 61999</span>
          ${contractLink ? `<p><a href="${esc(contractLink)}" target="_blank" rel="noopener">Contract explorer</a></p>` : ''}
        </div>
      </aside>
      <div class="workspace">
        <header class="topbar">
          <div class="topbar-title">Release workspace <span class="small">${isLive() ? 'Finalized state' : 'Local demo'}</span></div>
          <div class="topbar-actions">
            <div class="mode-switch" role="group" aria-label="Data mode">${Object.entries(modes).map(([key, label]) =>
              `<button type="button" data-action="mode" data-key="${key}" aria-pressed="${state.mode === key}">${label}</button>`).join('')}</div>
            ${isLive() ? button('wallet', studio?.account ? short(studio.account) : 'Connect wallet') : ''}
            ${button('new-release', '+ New release', '', 'primary')}
          </div>
        </header>
        <main class="content" id="main-content" aria-busy="${state.loading}">
          ${state.error ? `<div class="inline-message error" role="alert">${esc(state.error)} <span>${button('refresh', 'Retry', '', 'small-button')}</span></div>` : ''}
          ${state.loading ? '<p class="inline-message">Loading workspace…</p>' : ''}
          ${state.view === 'grants' ? grantPage() : state.view === 'activity' ? activityPage() : releasePage()}
        </main>
      </div>
    </div>`;
}

function releasePage() {
  const release = state.current;
  if (!release) {
    return `<div class="card empty"><h2>Releases</h2><p>${state.loading ? 'Reading release records…' : 'Create a release plan to start reviewing asset permissions.'}</p>
      <div class="actions">${button('new-release', '+ New release', '', 'primary')}${button('navigate', 'Browse grants', 'grants')}</div></div>`;
  }
  const percent = release.asset_count ? Math.round(Number(release.ready_count) / Number(release.asset_count) * 100) : 0;
  const headline = release.status === 'WITHDRAWN' ? 'Grant revoked after sealing'
    : release.status === 'SEALED' ? 'Manifest sealed' : release.status === 'READY' ? 'Ready to seal' : 'Release readiness';
  const picks = Object.fromEntries(state.releases.map(item => [item.id, item.title]));
  if (!Object.hasOwn(picks, release.id)) picks[release.id] = release.title;
  return `<div class="page-head"><div class="crumbs"><span>Releases</span><span aria-hidden="true">/</span><strong class="mono">${esc(release.id)}</strong></div>
    <div class="actions"><label class="sr-only" for="release-picker">Choose release</label>
    <select class="select release-picker" id="release-picker">${options(picks, release.id)}</select>
    ${state.releases.length < Number(state.overview.releases || 0) ? button('load-more', 'Older releases', 'releases', 'small-button') : ''}</div></div>
    <section class="hero" aria-labelledby="release-title">
      <div><div class="actions">${badge(release.status)}</div>
        <h1 id="release-title">${esc(release.title)}</h1><p class="brief">${esc(release.brief)}</p>
        <ul class="hero-meta"><li>${esc(channels[release.channel])}</li><li>${esc(territory(release.territory))}</li><li>${esc(dateOnly(release.release_on))}</li></ul>
      </div>
      <div class="readiness"><div class="meter" style="--progress:${percent}%;" aria-hidden="true"><span>${percent}%</span></div>
        <div><strong>${headline}</strong><p>${Number(release.ready_count)} of ${Number(release.asset_count)} assets cleared</p></div></div>
    </section>
    <div class="release-columns">
      <section class="card" aria-labelledby="assets-title">
        <header class="section-head card-head"><div><h2 id="assets-title">Asset reviews</h2><p class="muted small">${count(release.asset_count, 'asset')} attached</p></div>
          ${ownsDraft(release) ? button('attach', '+ Attach asset', '', 'small-button') : ''}</header>
        <div class="filter-bar" role="group" aria-label="Filter asset reviews">${Object.entries({ ALL: 'All assets', CLEAR: 'Cleared', ACTION: 'Action needed' }).map(([value, label]) =>
          `<button class="filter" type="button" data-action="filter" data-key="${value}" aria-pressed="${value === state.filter}">${label}</button>`).join('')}</div>
        ${assetRows(release)}
      </section>
      <div class="side-stack">
        <section class="card pad" aria-label="Release gate">${gate(release)}</section>
        <section class="card pad"><h2>Release plan</h2>${details([
          ['Distribution', release.commercial ? 'Commercial' : 'Non-commercial'],
          ['Owner', release.owner_name || short(release.owner)],
          ['Target date', dateOnly(release.release_on)]
        ])}</section>
      </div>
    </div>`;
}

function assetRows(release) {
  const assets = release.assets.filter(asset => state.filter === 'ALL' ||
    (state.filter === 'CLEAR' ? asset.status === 'CLEAR' : asset.status !== 'CLEAR'));
  if (!assets.length) {
    return `<div class="empty">${release.assets.length ? 'No assets match this filter.' : 'Attach a permission grant from your library to begin.'}</div>`;
  }
  return `<table class="table"><thead><tr><th>Asset</th><th>Review</th><th>Issuer</th><th><span class="sr-only">Details</span></th></tr></thead>
    <tbody>${assets.map(asset => `<tr><td><div class="asset-title">${kind(asset.grant)}<div><strong>${esc(asset.grant.title)}</strong>
      <span class="id">${esc(kinds[asset.grant.kind])} · ${esc(asset.id)}</span></div></div></td>
      <td>${badge(asset.status)}</td><td class="issuer-col small">${esc(asset.grant.issuer_name || short(asset.grant.issuer))}</td>
      <td>${button('asset', 'Open', asset.id, 'small-button')}</td></tr>`).join('')}</tbody></table>`;
}

function gate(release) {
  if (release.sealed_at) {
    return `<h2>Release manifest</h2><p class="card-note">${release.status === 'WITHDRAWN'
      ? 'An issuer revoked a grant used in this manifest.' : 'All attached asset reviews passed at sealing.'}</p>
      <p class="mono wrap meter-caption">${esc(release.manifest_sha256)}</p>
      <div class="actions meter-caption">${button('manifest', 'View and export', '', 'primary')}</div>`;
  }
  const items = [
    ['CONDITIONAL', 'Conditions due', 'var(--orange)'], ['PENDING', 'Pending reviews', 'var(--blue)'],
    ['BLOCKED', 'Blocked or revoked', 'var(--red)'], ['NEEDS_REVIEW', 'Needs manual review', 'var(--orange)']
  ].map(([key, label, color]) => ({ label, color, n: release.assets.filter(asset =>
    asset.status === key || (key === 'BLOCKED' && asset.status === 'REVOKED')).length }));
  const editable = ownsDraft(release);
  return `<h2>Release gate</h2>
    <ul class="queue">${items.map(({ label, color, n }) => `<li><span><span class="dot" aria-hidden="true" style="color:${color}"></span>${label}</span><strong>${n}</strong></li>`).join('')}</ul>
    ${button('seal', 'Seal release', '', release.status === 'READY' ? 'lime full' : 'primary full', !editable || release.status !== 'READY')}
    <p class="card-note">${!editable && isLive() ? 'The release owner can seal this plan.' :
      release.status === 'READY' ? 'Freeze the plan and export its SHA-256 manifest.' : 'Clear every attached asset to seal this release.'}</p>`;
}

function grantPage() {
  return `<div class="page-head"><div><h1>Grant library</h1><p class="muted">Issuer terms and distribution scope</p></div>
    ${button('new-grant', '+ Publish grant', '', 'primary')}</div>
    <div class="search-line"><label class="sr-only" for="grant-search">Search grants</label>
      <input id="grant-search" type="search" placeholder="Find a grant…" value="${esc(state.grantQuery)}"><span class="small muted">${count(state.overview.grants || 0, 'grant')}</span></div>
    <div id="grant-results" class="grant-grid">${grantCards()}</div>
    ${state.grants.length < Number(state.overview.grants || 0) ? `<div class="load-row">${button('load-more', 'Load older grants', 'grants')}</div>` : ''}`;
}

function grantCards() {
  const query = state.grantQuery.trim().toLowerCase();
  const visible = state.grants.filter(grant => [grant.id, grant.title, kinds[grant.kind], grant.issuer_name || grant.issuer]
    .some(value => value?.toLowerCase().includes(query)));
  if (!visible.length) return `<div class="card empty">${query ? 'No grants match this search.' : 'Publish an asset grant or switch to Demo to explore the workflow.'}</div>`;
  return visible.map(grant => `<article class="card pad grant-card">
    <div class="section-head"><span class="id">${esc(grant.id)}</span>${badge(grant.revocation ? 'REVOKED' : 'Active')}</div>
    <div class="asset-title">${kind(grant)}<div><strong>${esc(grant.title)}</strong><span class="small muted">${esc(grant.issuer_name || short(grant.issuer))}</span></div></div>
    <p class="scope">${esc(grant.channels.map(channel => channels[channel]).join(' · '))} · ${esc(territory(grant.territory))}</p>
    <div class="actions">${button('grant', 'View terms', grant.id, 'small-button')}</div></article>`).join('');
}

function activityPage() {
  return `<div class="page-head"><div><h1>Activity</h1><p class="muted">Grant, review and release changes</p></div>
    ${button('refresh', 'Refresh')}</div><section class="card" aria-label="Workspace activity">
    ${state.events.length ? `<ol class="events">${state.events.map(event =>
      `<li><span class="event-dot" aria-hidden="true">·</span><div><strong>${esc(eventLabels[event.kind] || event.kind)}</strong>
        <p class="small">${esc(obligations[event.title] || event.title)} <span class="id">· ${esc(event.reference)}</span></p></div>
        <time datetime="${esc(event.at)}">${esc(eventTime(event.at))}</time></li>`).join('')}</ol>`
      : '<p class="empty">Workspace activity will appear here.</p>'}
    ${state.events.length < Number(state.overview.events || 0) ? `<div class="load-row">${button('load-more', 'Load older activity', 'events')}</div>` : ''}</section>`;
}

function openPanel(title, body) {
  panel.innerHTML = `<header class="panel-head"><h2 id="panel-title">${esc(title)}</h2><button class="close" type="button" data-action="close" aria-label="Close">×</button></header>
    <div class="panel-body">${body}</div>`;
  if (!panel.open) panel.showModal();
}

function form(name, fields, label, key = '', extra = '') {
  return `<form class="form" data-form="${name}" data-key="${esc(key)}" data-extra="${esc(extra)}">
    ${fields}<button class="button primary" type="submit">${esc(label)}</button></form>`;
}

const field = (label, name, attrs = '') => `<label>${label}<input name="${name}" ${attrs}></label>`;
const area = (label, name, minimum, maximum) =>
  `<label>${label}<textarea name="${name}" required minlength="${minimum}" maxlength="${maximum}"></textarea></label>`;
const select = (label, name, entries, picked = '') =>
  `<label>${label}<select name="${name}" class="select" required>${options(entries, picked)}</select></label>`;
const check = (label, name, attrs = '') => `<label class="check"><input type="checkbox" name="${name}" ${attrs}>${label}</label>`;
const countryField = field('Territory', 'territory', 'value="WORLD" required maxlength="5" pattern="[A-Za-z]{2}|WORLD"');
const walletHint = '<p class="inline-message">Connect a StudioNet wallet to sign this operation.</p>';

function requireWallet() {
  if (canChange()) return true;
  openPanel('Connect wallet', walletHint + '<p>Use a compatible wallet on chain 61999.</p>' + button('wallet', 'Connect wallet', '', 'primary'));
  return false;
}

function showAsset(key) {
  const release = state.current;
  const asset = release.assets.find(item => item.id === key);
  if (!asset) return;
  const review = asset.review;
  const writable = ownsDraft(release);
  openPanel(asset.grant.title, `<div class="actions">${badge(asset.status)}<span class="id">${esc(asset.id)} · ${esc(asset.grant.id)}</span></div>
    ${details([['Issued by', asset.grant.issuer_name || asset.grant.issuer], ['Kind', kinds[asset.grant.kind]]])}
    <section><h3>Planned use</h3><p>${esc(asset.usage)}</p></section>
    <section><h3>Issuer terms</h3><blockquote class="quote">${esc(asset.grant.terms)}</blockquote></section>
    ${asset.grant.revocation ? `<p class="inline-message error">${esc(asset.grant.revocation.reason)}</p>` : ''}
    ${review ? `<section><h3>Review evidence</h3>
      <p class="small muted">${review.basis === 'DECLARED_SCOPE' ? 'Declared scope check' : review.basis === 'GENLAYER' ? 'Independent GenLayer review' : 'Demo review'}</p>
      ${review.scope_problems.map(issue => `<p>${esc(issue)}</p>`).join('')}
      ${review.quote ? `<blockquote class="quote">${esc(review.quote)}</blockquote>` : ''}</section>` : ''}
    ${review?.obligations.length ? `<section><h3>Required conditions</h3><ul class="obligation-list">
      ${review.obligations.map(flag => `<li><strong>${esc(obligations[flag])}</strong>
        ${asset.proofs[flag] ? `<p>${esc(asset.proofs[flag].note)}</p>` : writable && asset.status === 'CONDITIONAL'
          ? form('proof', field('Evidence note', 'note', 'required minlength="6" maxlength="280"'), 'Record evidence', asset.id, flag)
          : '<p class="small muted">Evidence due</p>'}</li>`).join('')}</ul></section>` : ''}
    ${writable ? `<div class="actions">${asset.status === 'PENDING' ? button('review', isLive() ? 'Run GenLayer review' : 'Run demo review', asset.id, 'primary') : ''}
      ${button('remove', 'Remove from release', asset.id, 'danger')}</div>` : ''}`);
}

function showGrant(grant) {
  openPanel(grant.title, `<div class="actions"><span class="id">${esc(grant.id)}</span>${badge(grant.revocation ? 'REVOKED' : 'Active')}</div>
    ${details([['Issuer', grant.issuer_name || grant.issuer], ['Channels', grant.channels.map(key => channels[key]).join(', ')],
      ['Territory', territory(grant.territory)], ['Commercial use', grant.commercial_allowed ? 'Permitted by scope' : 'Excluded'],
      ['Expiry', grant.expires_on ? dateOnly(grant.expires_on) : 'No expiry']])}
    <section><h3>Issuer terms</h3><blockquote class="quote">${esc(grant.terms)}</blockquote></section>
    <section><h3>Grant SHA-256</h3><p class="mono wrap">${esc(grant.sha256)}</p></section>
    ${grant.revocation ? `<p class="inline-message error">${esc(grant.revocation.reason)}</p>` :
      canChange() && api().account === grant.issuer.toLowerCase() ? button('revoke', 'Revoke grant', grant.id, 'danger') : ''}`);
}

async function showManifest() {
  const manifest = await api().read('get_manifest', [state.current.id]);
  const checksum = await sha256(manifest.manifest_json);
  const valid = checksum === manifest.sha256;
  openPanel('Release manifest', `<div class="actions">${badge(manifest.status)} <span class="id">${esc(manifest.release_id)}</span></div>
    <p>${valid ? 'SHA-256 matches the sealed manifest.' : 'SHA-256 verification failed.'}</p>
    <p class="mono wrap">${esc(manifest.sha256)}</p>
    ${valid ? button('download', 'Download manifest JSON', manifest.release_id, 'primary') : ''}
    <label for="verify-file"><strong>Verify a manifest file</strong></label><input id="verify-file" type="file" accept=".json,application/json">
    <p id="verify-result" role="status" class="small muted"></p>`);
  panel.dataset.manifest = manifest.sha256;
  panel.dataset.manifestText = valid ? manifest.manifest_json : '';
}

async function reload(preferred = state.current?.id || state.preferred) {
  state.loading = true;
  state.error = '';
  render();
  try {
    if (isLive() && !studio) {
      const { createStudioApi } = await import('./assets/studionet.js');
      studio = createStudioApi(deployment.address);
    }
    const client = api();
    const [overview, releases, grants, events] = await Promise.all([
      client.read('get_overview'), client.read('list_releases', [0, pageSize]),
      client.read('list_grants', [0, pageSize]), client.read('get_events', [0, pageSize])
    ]);
    const pick = releases.find(release => release.id === preferred) || releases[0];
    const current = pick ? await client.read('get_release', [pick.id]) : null;
    Object.assign(state, { overview, releases, grants, events, current });
  } catch (error) {
    state.error = error.message || 'Failed to load the workspace.';
  } finally {
    state.loading = false;
    render();
  }
}

async function mutate(name, args, message, options = {}) {
  if (state.busy || !requireWallet()) return;
  state.busy = true;
  panel.querySelectorAll('button[type="submit"]').forEach(control => { control.disabled = true; });
  if (isLive()) notify('Confirm the operation in your wallet.', '', true);
  try {
    const result = await api().write(name, args, hash => notify('Transaction submitted. Waiting for finality.', hash, true));
    if (panel.open) panel.close();
    const preferred = name === 'create_release' ? result.value || '' : state.current?.id;
    const currentView = options.view || state.view;
    state.view = currentView;
    await reload(preferred);
    if (options.asset && state.current) showAsset(options.asset);
    notify(message, result.hash);
  } catch (error) {
    notify(error.shortMessage || error.message || 'Operation failed.', error.hash, !!error.hash);
  } finally {
    state.busy = false;
    panel.querySelectorAll('button[type="submit"]').forEach(control => { control.disabled = false; });
  }
}

async function action(name, key) {
  if (state.busy || (state.loading && name !== 'close')) return;
  const release = state.current;
  if (name === 'close') panel.close();
  if (name === 'navigate') { state.view = key; render(); }
  if (name === 'mode' && state.mode !== key) {
    if (panel.open) panel.close();
    Object.assign(state, { mode: key, current: null, preferred: '', overview: {}, releases: [], grants: [], events: [], filter: 'ALL' });
    await reload('');
  }
  if (name === 'refresh') await reload();
  if (name === 'wallet') {
    if (!studio) throw new Error('StudioNet connection is unavailable.');
    if (studio.account) {
      studio.disconnect();
      render();
      notify('Wallet disconnected from FrameDocket.');
    } else {
      const address = await studio.connect();
      if (panel.open) panel.close();
      render();
      notify('StudioNet wallet connected ' + short(address));
    }
  }
  if (name === 'filter') { state.filter = key; render(); }
  if (name === 'load-more') {
    state.busy = true;
    try {
      const method = { releases: 'list_releases', grants: 'list_grants', events: 'get_events' }[key];
      const items = await api().read(method, [state[key].length, pageSize]);
      state[key].push(...items);
      render();
    } finally { state.busy = false; }
  }
  if (name === 'new-release' && requireWallet()) {
    openPanel('New release', form('create',
      field('Release title', 'title', 'required minlength="3" maxlength="100"') +
      `<div class="two">${select('Distribution channel', 'channel', channels, 'WEB')}${countryField}</div>` +
      field('Release date', 'day', 'type="date" required') + check('Commercial distribution', 'commercial') +
      area('Release brief', 'brief', 8, 600), 'Create release'));
  }
  if (name === 'new-grant' && requireWallet()) {
    openPanel('Publish grant', (isLive() ? '<p class="inline-message">Issuer terms and grant records are public on StudioNet.</p>' : '') +
      form('publish', field('Asset title', 'title', 'required minlength="3" maxlength="100"') + select('Asset kind', 'kind', kinds) +
        `<fieldset><legend>Allowed channels</legend><div class="check-grid">${Object.entries(channels).map(([id, label]) => check(label, 'scope', 'value="' + id + '"')).join('')}</div></fieldset>
        <div class="two">${countryField}${field('Expires on (optional)', 'expiry', 'type="date"')}</div>` +
        check('Allow commercial use', 'commercial') + area('Issuer terms', 'terms', 12, 1200), isLive() ? 'Publish on StudioNet' : 'Save demo grant'));
  }
  if (name === 'attach' && ownsDraft(release)) {
    const attached = new Set(release.assets.map(item => item.grant_id));
    const eligible = state.grants.filter(grant => !grant.revocation && !attached.has(grant.id));
    openPanel('Attach asset', (eligible.length ? form('attach',
      select('Choose a grant', 'grant', Object.fromEntries(eligible.map(grant => [grant.id, grant.title + ' · ' + grant.id]))) +
      area('Planned use', 'usage', 8, 500), 'Attach asset') : '<p>Publish an active grant to attach another asset.</p>') +
      (isLive() ? form('attach-by-id', field('Grant ID', 'grant', 'required pattern="G-[0-9]{4}" placeholder="G-0001"') +
        area('Planned use', 'usage', 8, 500), 'Attach by ID') : ''));
  }
  if (name === 'asset') showAsset(key);
  if (name === 'grant') showGrant(await api().read('get_grant', [key]));
  if (name === 'review') await mutate('review_asset', [release.id, key], 'Asset review recorded.', { asset: key });
  if (name === 'remove') openPanel('Remove asset', '<p>Remove this asset from the draft and keep its prior activity in the log.</p>' + form('remove', '', 'Remove asset', key));
  if (name === 'revoke') openPanel('Revoke grant', '<p>Releases using this grant will show it as revoked.</p>' +
    form('revoke', area('Revocation reason', 'reason', 6, 200), 'Revoke grant', key));
  if (name === 'seal') openPanel('Seal release', '<p>Freeze the current release plan, reviews and condition evidence into one verifiable manifest.</p>' +
    form('seal', '', 'Seal release'));
  if (name === 'manifest') await showManifest();
  if (name === 'download' && panel.dataset.manifestText) {
    const url = URL.createObjectURL(new Blob([panel.dataset.manifestText], { type: 'application/json' }));
    const file = document.createElement('a');
    file.href = url;
    file.download = 'framedocket-' + key.toLowerCase() + '.json';
    file.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function report(error) { notify(error.shortMessage || error.message || 'Operation failed.'); }

for (const container of [app, panel]) {
  container.addEventListener('click', event => {
    const control = event.target.closest('button[data-action]');
    if (control) action(control.dataset.action, control.dataset.key).catch(report);
  });
}
panel.addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });
panel.addEventListener('submit', event => {
  event.preventDefault();
  const { form: operation, key, extra } = event.target.dataset;
  const data = new FormData(event.target);
  const current = state.current?.id;
  const actions = {
    create: () => mutate('create_release', [data.get('title'), data.get('channel'), data.get('territory'), data.has('commercial'),
      data.get('day'), data.get('brief')], 'Release created.', { view: 'releases' }),
    publish: () => mutate('publish_grant', [data.get('title'), data.get('kind'), data.getAll('scope'), data.get('territory'),
      data.has('commercial'), data.get('expiry'), data.get('terms')], 'Grant published.', { view: 'grants' }),
    attach: () => mutate('attach_asset', [current, data.get('grant'), data.get('usage')], 'Asset attached.'),
    proof: () => mutate('record_obligation', [current, key, extra, data.get('note')], 'Evidence recorded.', { asset: key }),
    remove: () => mutate('remove_asset', [current, key], 'Asset removed from the draft.'),
    revoke: () => mutate('revoke_grant', [key, data.get('reason')], 'Grant revoked.'),
    seal: () => mutate('seal_release', [current], 'Release sealed.')
  };
  if (operation === 'publish' && !data.getAll('scope').length) return notify('Select at least one distribution channel.');
  if (operation === 'attach-by-id') actions.attach().catch(report);
  else actions[operation]?.().catch(report);
});
app.addEventListener('input', event => {
  if (event.target.id !== 'grant-search') return;
  state.grantQuery = event.target.value;
  document.querySelector('#grant-results').innerHTML = grantCards();
});
app.addEventListener('change', async event => {
  if (event.target.id !== 'release-picker' || state.busy || state.loading) return;
  state.busy = true;
  try {
    state.current = await api().read('get_release', [event.target.value]);
    state.filter = 'ALL';
    render();
  } catch (error) { report(error); }
  finally { state.busy = false; }
});
panel.addEventListener('change', async event => {
  if (event.target.id !== 'verify-file' || !event.target.files[0]) return;
  const file = event.target.files[0];
  if (file.size > 256000) return notify('Choose a FrameDocket manifest smaller than 256 KB.');
  try {
    const matches = await sha256(await file.arrayBuffer()) === panel.dataset.manifest;
    const status = document.querySelector('#verify-result');
    if (status) status.textContent = matches ? 'File matches the sealed SHA-256.' : 'File differs from the sealed manifest.';
  } catch (error) { report(error); }
});

window.ethereum?.on?.('accountsChanged', () => {
  if (!studio?.account) return;
  studio.disconnect();
  if (isLive()) render();
});

reload();
