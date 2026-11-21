export const channels = {
  WEB: 'Web', SOCIAL: 'Social media', STREAMING: 'Streaming', EXHIBITION: 'Exhibition'
};
export const kinds = { MUSIC: 'Music', FOOTAGE: 'Footage', IMAGE: 'Image', ARTWORK: 'Artwork' };
export const obligations = { CREDIT: 'Credit the issuer', LINK: 'Add a source link', NOTICE: 'Include the notice' };
export const statuses = {
  CLEAR: 'Cleared', CONDITIONAL: 'Conditions due', BLOCKED: 'Blocked',
  NEEDS_REVIEW: 'Needs review', REVOKED: 'Grant revoked', PENDING: 'Pending',
  DRAFT: 'In review', READY: 'Ready to seal', SEALED: 'Sealed', WITHDRAWN: 'Withdrawn'
};

export function scopeProblems(plan, grant) {
  const issues = [];
  if (!grant.channels.includes(plan.channel)) issues.push('Distribution channel is outside the declared grant.');
  if (grant.territory !== 'WORLD' && grant.territory !== plan.territory) issues.push('Territory is outside the declared grant.');
  if (plan.commercial && !grant.commercial_allowed) issues.push('The grant excludes commercial use.');
  if (grant.expires_on && plan.release_on > grant.expires_on) issues.push('The grant expires before the release date.');
  return issues;
}

export function assetStatus(item, grant) {
  if (grant.revocation) return 'REVOKED';
  if (!item.review) return 'PENDING';
  if (item.review.decision === 'CLEARED') return 'CLEAR';
  if (item.review.decision === 'CONDITIONAL') {
    return item.review.obligations.every(flag => item.proofs[flag]) ? 'CLEAR' : 'CONDITIONAL';
  }
  return item.review.decision;
}

export function releaseSummary(release, assets) {
  const ready = assets.filter(asset => asset.status === 'CLEAR').length;
  let status = 'DRAFT';
  if (release.sealed_at) status = assets.some(asset => asset.status === 'REVOKED') ? 'WITHDRAWN' : 'SEALED';
  else if (assets.length && assets.length === ready) status = 'READY';
  return { ...release, status, ready_count: ready, asset_count: assets.length, assets };
}

export async function sha256(text) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function manifestRecord(release, assets, sealedAt) {
  const { title, channel, territory, commercial, release_on, brief } = release;
  return {
    schema: 'framedocket/1', release_id: release.id, owner: release.owner,
    plan: { title, channel, territory, commercial, release_on, brief }, sealed_at: sealedAt,
    assets: assets.map(({ id, grant, usage, review, proofs }) => ({
      item_id: id, asset_title: grant.title, grant_id: grant.id, grant_sha256: grant.sha256,
      issuer: grant.issuer, intended_use: usage, review, proofs
    }))
  };
}
