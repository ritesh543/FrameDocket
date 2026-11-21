import { channels, kinds, assetStatus, releaseSummary, scopeProblems, sha256, canonicalJson, manifestRecord } from './model.js';

export const demoActor = '0x1111111111111111111111111111111111111111';
const demoKey = 'framedocket-demo-v1';
const demoTime = '2026-11-21T09:30:00Z';
const demoOwner = 'Demo production team';
const demonstrationGrants = [
  ['Harbor dawn footage', 'FOOTAGE', 'Mira Chen', ['WEB', 'STREAMING'],
    'Commercial web distribution of edited footage is permitted. No credit or link is required.'],
  ['Opening title artwork', 'ARTWORK', 'Mote Studio', ['WEB', 'SOCIAL'],
    'Use of the title artwork in commercial web releases is authorized. No notice is required.'],
  ['Coastline score', 'MUSIC', 'Ada Vale', ['WEB', 'STREAMING'],
    'Commercial web distribution is permitted if the artist is credited and a source link is included.'],
  ['Transit map graphic', 'IMAGE', 'Civic Atlas', ['EXHIBITION'],
    'The map may be used in in-person exhibitions only. Web distribution is prohibited.'],
  ['Behind-the-scenes stills', 'IMAGE', 'Mira Chen', ['WEB', 'SOCIAL'],
    'Commercial web publication of the supplied press stills is permitted. No attribution is required.'],
  ['Transit map web edition', 'IMAGE', 'Civic Atlas', ['WEB'],
    'Commercial web use is permitted if the provided map notice appears on the release page.']
];
const usages = [
  'Opening establishing shot of the harbor at sunrise.',
  'Title artwork composited over the opening frame.',
  'Music used under the final credits on the web release.',
  'Transit map shown during the route explanation.',
  'Press stills displayed on the documentary page.'
];

function id(prefix, number) {
  return prefix + '-' + String(number).padStart(4, '0');
}

function event(kind, reference, title, releaseId, time) {
  return { kind, reference, title, release_id: releaseId, actor: demoActor, at: time };
}

async function seed() {
  const grants = await Promise.all(demonstrationGrants.map(async ([title, kind, name, scope, terms], i) => {
    const grant = {
      id: id('G', i + 1), title, kind, issuer: demoActor, issuer_name: name, channels: scope,
      territory: 'WORLD', commercial_allowed: true, expires_on: '', terms, issued_at: demoTime
    };
    return { ...grant, sha256: await sha256(canonicalJson(grant)), revocation: null };
  }));
  const release = {
    id: 'R-0001', title: 'Harbor Light', owner: demoActor, owner_name: demoOwner, channel: 'WEB',
    territory: 'WORLD', commercial: true, release_on: '2026-12-12',
    brief: 'A short documentary about the people who keep a waterfront working. The planned release is a monetized web premiere.',
    created_at: demoTime, sealed_at: '', manifest_sha256: '', item_ids: usages.map((_, i) => id('A', i + 1))
  };
  const items = usages.map((usage, i) => {
    const item = { id: id('A', i + 1), grant_id: grants[i].id, attached_at: demoTime, usage, review: null, proofs: {} };
    if (i < 4) item.review = simulatedReview(release, grants[i], demoTime);
    if (i === 2) item.proofs.CREDIT = { note: 'Composer credit appears in the end titles.', at: demoTime };
    return item;
  });
  const activity = [
    event('RELEASE_CREATED', release.id, release.title, release.id, demoTime),
    ...items.map((item, i) => event('ASSET_ATTACHED', item.id, grants[i].title, release.id, demoTime)),
    ...items.slice(0, 4).map((item, i) => event('ASSET_REVIEWED', item.id, grants[i].title, release.id, demoTime)),
    event('OBLIGATION_RECORDED', 'A-0003', 'CREDIT', release.id, demoTime)
  ];
  return { grants, releases: [release], items, activity, manifests: {} };
}

function simulatedReview(release, grant, time) {
  const issues = scopeProblems(release, grant);
  if (issues.length) {
    return { decision: 'BLOCKED', obligations: [], quote: '', scope_problems: issues, basis: 'DECLARED_SCOPE', at: time };
  }
  const terms = grant.terms.toLowerCase();
  const quote = (grant.terms.match(/^.+?(?:\.\s|$)/)?.[0] || grant.terms).trim().slice(0, 180);
  const rules = [
    ['CREDIT', /\bif\b[^.]*\b(?:credit(?:ed)?|attribution)\b/],
    ['LINK', /\bif\b[^.]*\b(?:link)\b/],
    ['NOTICE', /\bif\b[^.]*\bnotice\b/]
  ];
  const flags = rules.filter(([, regex]) => regex.test(terms)).map(([flag]) => flag);
  let decision = 'NEEDS_REVIEW';
  if (/\b(not permitted|prohibited|not authorized)\b/.test(terms)) decision = 'BLOCKED';
  else if (/\b(permitted|authorized|may be used)\b/.test(terms)) {
    decision = flags.length ? 'CONDITIONAL' : (/\b(if|subject to|approval)\b/.test(terms) ? 'NEEDS_REVIEW' : 'CLEARED');
  }
  return { decision, obligations: decision === 'CONDITIONAL' ? flags : [], quote,
    scope_problems: [], basis: 'DEMO', at: time };
}

function record(records, key, label) {
  const value = records.find(entry => entry.id === key);
  if (!value) throw new Error(label + ' does not exist');
  return value;
}

function releaseView(db, release) {
  const assets = release.item_ids.map(key => {
    const item = record(db.items, key, 'Asset');
    const grant = record(db.grants, item.grant_id, 'Grant');
    return { ...item, grant, status: assetStatus(item, grant) };
  });
  return releaseSummary(release, assets);
}

function draft(db, key) {
  const release = record(db.releases, key, 'Release');
  if (release.sealed_at) throw new Error('This release is sealed');
  return release;
}

function attached(db, release, key) {
  if (!release.item_ids.includes(key)) throw new Error('Asset is not attached to this release');
  return record(db.items, key, 'Asset');
}

function page(records, offset = 0, limit = 20) {
  return records.slice().reverse().slice(offset, offset + limit);
}

function clean(text, min, max, name) {
  const result = text.trim();
  if (result.length < min || result.length > max) throw new Error(name + ' must be ' + min + '–' + max + ' characters');
  return result;
}

function country(value) {
  const result = value.trim().toUpperCase();
  if (!/^(WORLD|[A-Z]{2})$/.test(result)) throw new Error('Use WORLD or a two-letter country code.');
  return result;
}

function releaseDate(value, optional = false) {
  if (!value && optional) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value || value.startsWith('0000')) {
    throw new Error('Enter a valid release or expiry date.');
  }
  return value;
}

export function createDemo(storage, clock = () => new Date().toISOString()) {
  let db;
  let mutation = Promise.resolve();
  function save() {
    try { storage?.setItem(demoKey, JSON.stringify(db)); } catch { /* The current session still works. */ }
  }
  const ready = (async () => {
    try { db = JSON.parse(storage?.getItem(demoKey) || 'null'); } catch { db = null; }
    if (!db?.grants || !db?.releases || !db?.items || !db?.activity || !db?.manifests) {
      db = await seed();
      save();
    }
  })();
  const views = {
    get_overview: db => ({ version: '1.0.0', grants: db.grants.length, releases: db.releases.length, assets: db.items.length, events: db.activity.length }),
    list_releases: (db, ...args) => page(db.releases, ...args).map(release => {
      const { assets, ...summary } = releaseView(db, release);
      return summary;
    }),
    get_release: (db, key) => releaseView(db, record(db.releases, key, 'Release')),
    list_grants: (db, ...args) => page(db.grants, ...args),
    get_grant: (db, key) => record(db.grants, key, 'Grant'),
    get_events: (db, ...args) => page(db.activity, ...args),
    get_manifest: (db, key) => {
      const release = releaseView(db, record(db.releases, key, 'Release'));
      if (!db.manifests[key]) throw new Error('Seal the release to create a manifest.');
      return { ...db.manifests[key], status: release.status };
    }
  };
  const commands = {
    async publish_grant(db, time, title, kind, scope, territory, commercial, expiry, terms) {
      if (!Object.hasOwn(kinds, kind) || !scope.length || new Set(scope).size !== scope.length ||
          scope.some(channel => !Object.hasOwn(channels, channel))) throw new Error('Choose a valid asset kind and distribution channels.');
      if (db.grants.length >= 512) throw new Error('Grant limit reached');
      const grant = {
        id: id('G', db.grants.length + 1), title: clean(title, 3, 100, 'Title'), kind, issuer: demoActor,
        channels: scope.slice().sort(), territory: country(territory), commercial_allowed: commercial,
        expires_on: releaseDate(expiry, true), terms: clean(terms, 12, 1200, 'Issuer terms'), issued_at: time
      };
      const sha = await sha256(canonicalJson(grant));
      db.grants.push({ ...grant, sha256: sha, revocation: null });
      db.activity.push(event('GRANT_PUBLISHED', grant.id, grant.title, '', time));
      return grant.id;
    },
    revoke_grant(db, time, key, reason) {
      const grant = record(db.grants, key, 'Grant');
      if (grant.revocation) throw new Error('Grant is already revoked');
      grant.revocation = { at: time, reason: clean(reason, 6, 200, 'Revocation reason') };
      db.activity.push(event('GRANT_REVOKED', key, grant.title, '', time));
    },
    create_release(db, time, title, channel, territory, commercial, day, brief) {
      if (!Object.hasOwn(channels, channel)) throw new Error('Choose a distribution channel');
      if (db.releases.length >= 256) throw new Error('Release limit reached');
      const release = {
        id: id('R', db.releases.length + 1), title: clean(title, 3, 100, 'Title'), owner: demoActor,
        channel, territory: country(territory), commercial, release_on: releaseDate(day), brief: clean(brief, 8, 600, 'Release brief'),
        created_at: time, sealed_at: '', manifest_sha256: '', item_ids: []
      };
      db.releases.push(release);
      db.activity.push(event('RELEASE_CREATED', release.id, release.title, release.id, time));
      return release.id;
    },
    attach_asset(db, time, releaseId, grantId, usage) {
      const release = draft(db, releaseId);
      const grant = record(db.grants, grantId, 'Grant');
      if (grant.revocation) throw new Error('Grant is revoked');
      if (release.item_ids.length >= 16 || db.items.length >= 2048) throw new Error('Asset limit reached');
      if (release.item_ids.some(key => attached(db, release, key).grant_id === grantId)) throw new Error('Grant is already attached');
      const item = { id: id('A', db.items.length + 1), grant_id: grantId, usage: clean(usage, 8, 500, 'Planned use'),
        attached_at: time, review: null, proofs: {} };
      release.item_ids.push(item.id);
      db.items.push(item);
      db.activity.push(event('ASSET_ATTACHED', item.id, grant.title, releaseId, time));
      return item.id;
    },
    remove_asset(db, time, releaseId, key) {
      const release = draft(db, releaseId);
      const item = attached(db, release, key);
      const grant = record(db.grants, item.grant_id, 'Grant');
      release.item_ids = release.item_ids.filter(id => id !== key);
      db.activity.push(event('ASSET_REMOVED', key, grant.title, releaseId, time));
    },
    review_asset(db, time, releaseId, key) {
      const release = draft(db, releaseId);
      const item = attached(db, release, key);
      const grant = record(db.grants, item.grant_id, 'Grant');
      if (assetStatus(item, grant) !== 'PENDING') throw new Error('Asset must be pending with an active grant');
      item.review = simulatedReview(release, grant, time);
      db.activity.push(event('ASSET_REVIEWED', key, grant.title, releaseId, time));
    },
    record_obligation(db, time, releaseId, key, obligation, proof) {
      const release = draft(db, releaseId);
      const item = attached(db, release, key);
      const grant = record(db.grants, item.grant_id, 'Grant');
      if (assetStatus(item, grant) !== 'CONDITIONAL' || !item.review.obligations.includes(obligation) || item.proofs[obligation]) {
        throw new Error('This asset does not have that outstanding obligation');
      }
      item.proofs[obligation] = { note: clean(proof, 6, 280, 'Evidence note'), at: time };
      db.activity.push(event('OBLIGATION_RECORDED', key, obligation, releaseId, time));
    },
    async seal_release(db, time, releaseId) {
      const release = draft(db, releaseId);
      const view = releaseView(db, release);
      if (view.status !== 'READY') throw new Error('Every asset must clear the release gate');
      const manifest = canonicalJson(manifestRecord(release, view.assets, time));
      const digest = await sha256(manifest);
      release.sealed_at = time;
      release.manifest_sha256 = digest;
      db.manifests[releaseId] = { release_id: releaseId, sha256: digest, manifest_json: manifest };
      db.activity.push(event('RELEASE_SEALED', releaseId, release.title, releaseId, time));
      return digest;
    }
  };
  return {
    account: demoActor,
    async read(method, args = []) {
      await ready;
      return structuredClone(views[method](db, ...args));
    },
    write(method, args = []) {
      const operation = mutation.then(async () => {
        await ready;
        const next = structuredClone(db);
        const value = await commands[method](next, clock(), ...args);
        db = next;
        save();
        return { value, hash: null };
      });
      mutation = operation.catch(() => {});
      return operation;
    }
  };
}
