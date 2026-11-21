import hashlib
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from typing import get_origin


ISSUER = '0x' + '1' * 40
PRODUCER = '0x' + '2' * 40
OUTSIDER = '0x' + '3' * 40
NOW = '2026-11-21T12:00:00Z'
TERMS = 'Commercial use on the web is permitted. Credit the artist and link to the source.'


class UserError(Exception):
    pass


class Return:
    def __init__(self, calldata):
        self.calldata = calldata


class Contract:
    def __getattr__(self, field):
        concrete = get_origin(type(self).__annotations__.get(field))
        if concrete in (dict, list):
            result = concrete()
            setattr(self, field, result)
            return result
        raise AttributeError(field)


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.responses = []
        self.prompts = []
        self.gl = types.SimpleNamespace(
            Contract=Contract,
            public=types.SimpleNamespace(write=lambda function: function, view=lambda function: function),
            vm=types.SimpleNamespace(Return=Return, UserError=UserError,
                                     run_nondet_unsafe=self.consensus),
            message=types.SimpleNamespace(sender_address=ISSUER),
            message_raw={'datetime': NOW},
            nondet=types.SimpleNamespace(exec_prompt=self.evaluate))
        sdk = types.ModuleType('genlayer')
        sdk.gl, sdk.TreeMap, sdk.DynArray, sdk.u32 = self.gl, dict, list, int
        sdk.__all__ = ['gl', 'TreeMap', 'DynArray', 'u32']
        prior = sys.modules.get('genlayer')
        sys.modules['genlayer'] = sdk
        try:
            path = Path(__file__).resolve().parent.parent / 'contracts' / 'frame_docket.py'
            spec = importlib.util.spec_from_file_location('frame_docket_test', path)
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
        finally:
            if prior is None:
                sys.modules.pop('genlayer', None)
            else:
                sys.modules['genlayer'] = prior
        self.contract = self.module.FrameDocket()

    def evaluate(self, prompt, response_format):
        self.assertEqual(response_format, 'json')
        self.prompts.append(prompt)
        return self.responses.pop(0)

    def consensus(self, leader, validator):
        result = leader()
        if not validator(Return(result)):
            raise UserError('validator disagreement')
        return result

    def sender(self, actor):
        self.gl.message.sender_address = actor

    def grant(self, **changes):
        values = {'title': 'Sample composition', 'kind': 'MUSIC', 'channels': ['WEB'],
                  'territory': 'WORLD', 'commercial_allowed': True, 'expires_on': '', 'terms': TERMS}
        self.sender(ISSUER)
        return self.contract.publish_grant(**(values | changes))

    def release(self, grant=None, **changes):
        self.sender(PRODUCER)
        values = {'title': 'Short documentary', 'channel': 'WEB', 'territory': 'WORLD',
                  'commercial': True, 'release_on': '2026-12-18', 'brief': 'Fictional web release for a demo.'}
        release = self.contract.create_release(**(values | changes))
        asset = self.contract.attach_asset(release, grant, 'Use the asset in the opening scene.') if grant else ''
        return release, asset

    def judgment(self, decision='CONDITIONAL', flags=None, quote='Credit the artist'):
        return {'decision': decision, 'obligations': flags if flags is not None else ['CREDIT'], 'quote': quote}

    def review(self, release, asset, judgment=None):
        result = judgment or self.judgment()
        self.responses = [result, result]
        self.contract.review_asset(release, asset)

    def test_empty_overview(self):
        self.assertEqual(self.contract.get_overview(),
                         {'version': '1.0.0', 'grants': 0, 'releases': 0, 'assets': 0, 'events': 0})

    def test_issuer_is_signed_sender_and_digest_covers_terms(self):
        grant = self.contract.get_grant(self.grant())
        digest = grant.pop('sha256')
        self.assertIsNone(grant.pop('revocation'))
        self.assertEqual(grant['issuer'], ISSUER)
        self.assertEqual(digest, hashlib.sha256(self.module._pack(grant).encode()).hexdigest())

    def test_distribution_scope_uses_exact_fields(self):
        grant = self.grant(channels=['EXHIBITION'], territory='US', commercial_allowed=False,
                           expires_on='2026-11-01')
        release, asset = self.release(grant)
        self.contract.review_asset(release, asset)
        review = self.contract.get_release(release)['assets'][0]['review']
        self.assertEqual(review['decision'], 'BLOCKED')
        self.assertEqual(review['basis'], 'DECLARED_SCOPE')
        self.assertEqual(len(review['scope_problems']), 4)
        self.assertEqual(self.prompts, [])

    def test_same_exact_decision_and_flags_allows_different_grounded_quotes(self):
        release, asset = self.release(self.grant())
        self.responses = [self.judgment(flags=['CREDIT', 'LINK']),
                          self.judgment(flags=['LINK', 'CREDIT'], quote='link to the source')]
        self.contract.review_asset(release, asset)
        item = self.contract.get_release(release)['assets'][0]
        self.assertEqual(item['review']['obligations'], ['CREDIT', 'LINK'])
        self.assertEqual(item['status'], 'CONDITIONAL')
        self.assertEqual(len(self.prompts), 2)
        self.assertEqual(self.prompts[0], self.prompts[1])

    def test_different_consequential_labels_reject_without_writes(self):
        for first in self.module.DECISIONS:
            for second in self.module.DECISIONS:
                if first == second:
                    continue
                with self.subTest(leader=first, validator=second):
                    release, asset = self.release(self.grant())
                    before = self.contract.get_overview()
                    self.responses = [
                        self.judgment(first, ['CREDIT'] if first == 'CONDITIONAL' else []),
                        self.judgment(second, ['CREDIT'] if second == 'CONDITIONAL' else [])
                    ]
                    with self.assertRaisesRegex(UserError, 'disagreement'):
                        self.contract.review_asset(release, asset)
                    self.assertEqual(self.contract.get_overview(), before)
                    self.assertEqual(self.contract.get_release(release)['assets'][0]['status'], 'PENDING')

    def test_different_required_conditions_reject(self):
        release, asset = self.release(self.grant())
        self.responses = [self.judgment(flags=['LINK']), self.judgment(flags=['CREDIT'])]
        with self.assertRaisesRegex(UserError, 'disagreement'):
            self.contract.review_asset(release, asset)
        self.assertIsNone(self.contract.get_release(release)['assets'][0]['review'])

    def test_invalid_quote_unknown_flag_and_wrong_shape_reject(self):
        bad = [
            self.judgment(quote='This quotation does not exist.'),
            self.judgment(flags=['APPROVAL']),
            self.judgment(flags=['LINK', 'LINK']),
            self.judgment('BLOCKED', ['LINK']),
            self.judgment() | {'extra': 'field'}
        ]
        for review in bad:
            with self.assertRaisesRegex(UserError, 'invalid review output'):
                self.module._parse_review(review, TERMS)

    def test_empty_release_cannot_seal(self):
        release, _ = self.release()
        with self.assertRaisesRegex(UserError, 'at least one asset'):
            self.contract.seal_release(release)

    def test_obligation_evidence_required_before_sealing(self):
        release, asset = self.release(self.grant())
        self.review(release, asset, self.judgment(flags=['CREDIT', 'LINK']))
        with self.assertRaisesRegex(UserError, 'release gate'):
            self.contract.seal_release(release)
        self.contract.record_obligation(release, asset, 'CREDIT', 'Credit in the closing sequence.')
        with self.assertRaisesRegex(UserError, 'already recorded'):
            self.contract.record_obligation(release, asset, 'CREDIT', 'Second competing credit.')
        self.assertEqual(self.contract.get_release(release)['status'], 'DRAFT')
        self.contract.record_obligation(release, asset, 'LINK', 'Source link in the release description.')
        self.assertEqual(self.contract.get_release(release)['status'], 'READY')
        digest = self.contract.seal_release(release)
        manifest = self.contract.get_manifest(release)
        self.assertEqual(manifest['status'], 'SEALED')
        self.assertEqual(digest, hashlib.sha256(manifest['manifest_json'].encode()).hexdigest())
        decoded = json.loads(manifest['manifest_json'])
        self.assertEqual(sorted(decoded['assets'][0]['proofs']), ['CREDIT', 'LINK'])

    def test_sealed_plan_is_immutable(self):
        release, asset = self.release(self.grant())
        self.review(release, asset, self.judgment('CLEARED', []))
        self.contract.seal_release(release)
        with self.assertRaisesRegex(UserError, 'sealed'):
            self.contract.remove_asset(release, asset)

    def test_only_release_owner_can_change_plan_or_start_review(self):
        release, asset = self.release(self.grant())
        self.sender(OUTSIDER)
        with self.assertRaisesRegex(UserError, 'release owner'):
            self.contract.review_asset(release, asset)
        with self.assertRaisesRegex(UserError, 'release owner'):
            self.contract.remove_asset(release, asset)

    def test_only_issuer_can_revoke_and_seal_remains_verifiable(self):
        grant = self.grant()
        release, asset = self.release(grant)
        self.review(release, asset, self.judgment('CLEARED', []))
        self.contract.seal_release(release)
        before = self.contract.get_manifest(release)
        with self.assertRaisesRegex(UserError, 'grant issuer'):
            self.contract.revoke_grant(grant, 'Withdrawn from future public use.')
        self.sender(ISSUER)
        self.contract.revoke_grant(grant, 'Withdrawn from future public use.')
        after = self.contract.get_manifest(release)
        self.assertEqual(after['status'], 'WITHDRAWN')
        self.assertEqual(after['sha256'], before['sha256'])
        self.assertEqual(after['manifest_json'], before['manifest_json'])
        self.assertEqual(self.contract.get_release(release)['assets'][0]['status'], 'REVOKED')

    def test_duplicate_attachment_and_removed_item_rejected(self):
        grant = self.grant()
        release, asset = self.release(grant)
        with self.assertRaisesRegex(UserError, 'already attached'):
            self.contract.attach_asset(release, grant, 'Duplicate asset use in the project.')
        self.contract.remove_asset(release, asset)
        with self.assertRaisesRegex(UserError, 'not attached'):
            self.contract.review_asset(release, asset)

    def test_revoked_grant_cannot_be_attached(self):
        grant = self.grant()
        self.contract.revoke_grant(grant, 'This sample was withdrawn.')
        release, _ = self.release()
        with self.assertRaisesRegex(UserError, 'revoked'):
            self.contract.attach_asset(release, grant, 'Use revoked hypothetical material.')

    def test_dates_and_pagination(self):
        for day in ('20261201', '2026-02-31', '0000-01-01'):
            with self.assertRaisesRegex(UserError, 'valid date'):
                self.release(release_on=day)
        first, _ = self.release()
        second, _ = self.release(release_on='2028-02-29')
        self.assertEqual(self.contract.list_releases(0, 1)[0]['id'], second)
        self.assertEqual(self.contract.list_releases(1, 1)[0]['id'], first)
        self.assertEqual(self.contract.list_releases(2, 1), [])
        with self.assertRaisesRegex(UserError, 'page size'):
            self.contract.get_events(0, 21)


if __name__ == '__main__':
    unittest.main()
