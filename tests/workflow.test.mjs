import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo } from '../dist/demo.js';
import { sha256, scopeProblems } from '../dist/model.js';
import { receiptSucceeded } from '../src/studionet.js';

test('the initial board loads five assets with visible evidence states', async () => {
  const demo = createDemo();
  const view = await demo.read('get_release', ['R-0001']);
  assert.equal(view.ready_count, 2);
  assert.equal(view.asset_count, 5);
  assert.deepEqual(view.assets.map(item => item.status), ['CLEAR', 'CLEAR', 'CONDITIONAL', 'BLOCKED', 'PENDING']);
});

test('complete the demo workflow, seal the exact bytes and then mark revocation', async () => {
  const api = createDemo();
  const id = 'R-0001';
  await assert.rejects(api.write('seal_release', [id]), /release gate/);
  await api.write('record_obligation', [id, 'A-0003', 'LINK', 'Source link added to the screening description.']);
  await api.write('remove_asset', [id, 'A-0004']);
  await api.write('review_asset', [id, 'A-0005']);
  const { value: replacement } = await api.write('attach_asset', [id, 'G-0006', 'Replacement map in the web premiere.']);
  await api.write('review_asset', [id, replacement]);
  await api.write('record_obligation', [id, replacement, 'NOTICE', 'Map notice is shown on the premiere page.']);
  assert.equal((await api.read('get_release', [id])).status, 'READY');
  await api.write('seal_release', [id]);
  const sealed = await api.read('get_manifest', [id]);
  assert.equal(await sha256(sealed.manifest_json), sealed.sha256);
  assert.equal(JSON.parse(sealed.manifest_json).assets.length, 5);
  await api.write('revoke_grant', ['G-0001', 'Withdrawing the fixture grant.']);
  const withdrawn = await api.read('get_manifest', [id]);
  assert.equal(withdrawn.status, 'WITHDRAWN');
  assert.equal(withdrawn.sha256, sealed.sha256);
});

test('demo state survives reload and failed writes leave it consistent', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const first = createDemo(storage);
  const { value: id } = await first.write('create_release', ['Premiere 2', 'WEB', 'US', false,
    '2027-01-03', 'A second fictional slate.']);
  await assert.rejects(first.write('attach_asset', [id, 'G-9999', 'An unsupported grant ID.']), /does not exist/);
  const second = createDemo(storage);
  const view = await second.read('get_release', [id]);
  assert.equal(view.title, 'Premiere 2');
  assert.deepEqual(view.assets, []);
});

test('scope enforces a nationwide restriction against a global release', () => {
  const flags = scopeProblems({ channel: 'WEB', territory: 'WORLD', commercial: true, release_on: '2026-12-20' },
    { channels: ['WEB'], territory: 'US', commercial_allowed: true, expires_on: '' });
  assert.equal(flags.length, 1);
  assert.match(flags[0], /Territory/);
});

test('a finalized receipt only succeeds when execution reports a return', () => {
  assert.equal(receiptSucceeded({ statusName: 'FINALIZED' }), false);
  assert.equal(receiptSucceeded({ consensus_data: { leader_receipt: [{ execution_result: 'SUCCESS' }] } }), true);
  assert.equal(receiptSucceeded({ consensus_data: { leader_receipt: [{ execution_result: 'ERROR' }] } }), false);
  assert.equal(receiptSucceeded({ txExecutionResultName: 'FINISHED_WITH_RETURN' }), true);
});
