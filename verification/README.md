# Verification

| Check | Result |
| --- | --- |
| Python contract tests | 15 passed, including exact review disagreement and revocation after sealing |
| JavaScript workflow tests | 5 passed, including proof, seal, manifest bytes and original SHA-256 |
| GenVM lint | Passed |
| StudioNet schema preflight | Accepted all 15 public methods |
| Deployment | Finalized with successful execution |
| Published source | Exact SHA-256 match with `contracts/frame_docket.py` |
| Live release | Grant, release, attachment, independent review and seal all finalized successfully |
| Desktop browser | Completed the local demo, downloaded its manifest and verified the live manifest |
| Mobile layout | Verified the dashboard at 390 CSS pixels without horizontal overflow |

**Deployed source SHA-256**  
`86c7358ccddf68e24e813fa57b409d299127e895d512d8648f8c5bcb6eabbdf4`

**Live manifest SHA-256 for R-0001**  
`7b42e4ae28f5092360ab7b5f000f2d7670c11fc4ed9a5081ac62ca7f291ecc58`

The Python tests use controlled output fixtures for leader and validator review. The live smoke test used a generated test signer and a fictional grant on StudioNet. Browser verification covered Demo writes and finalized live reads. Wallet writes require a connected test wallet.

[Full deployment and smoke receipts](deployment.json) · [StudioNet ABI](contract-schema.json)
