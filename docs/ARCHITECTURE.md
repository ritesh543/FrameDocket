# FrameDocket architecture

## Records and participants

| Record | Writer | Effect |
| --- | --- | --- |
| Grant | Issuer wallet | Records exact terms, scoped distribution and a canonical SHA-256 |
| Release plan | Producer wallet | Freezes intended distribution, territory, commercial status, date and brief for its asset reviews |
| Asset item | Release owner | Links a grant and an intended use, with one review and evidence per required condition |
| Revocation | Original grant issuer | Marks the grant unavailable and withdraws affected sealed releases |
| Sealed manifest | Release owner | Freezes the plan, attached asset reviews, grant digests and evidence |
| Activity | Contract | Appends an event for each state-changing action |

A wallet signature identifies the address that published a grant. Teams are responsible for confirming the issuer's authority and keeping private terms off a public chain. Condition evidence records the producer's attestation.

## Review and release gate

`review_asset` first applies deterministic checks to channel, territory, commercial scope and scheduled expiry. A scope mismatch yields `BLOCKED` without a model call. Otherwise, the leader and validators each interpret the same signed terms and planned use.

The contract requires exact agreement on the consequential decision and canonical obligation set. Grounded excerpts may differ. A disagreement keeps the item pending. The subset of supported conditions is credit, source link and notice. Ambiguous terms or conditions outside that set route to manual review.

| Review decision | Gate effect |
| --- | --- |
| `CLEARED` | Eligible to seal |
| `CONDITIONAL` | Eligible when evidence exists for every required condition |
| `BLOCKED` | Blocks sealing |
| `NEEDS_REVIEW` | Blocks sealing until the producer replaces or removes the item |

The producer must clear every attached asset before sealing. The contract serializes a canonical JSON manifest and records its SHA-256. The UI hashes the original bytes it reads or imports. A revocation changes eligibility and marks an affected sealed release withdrawn. The historical manifest remains available with its original hash.

## Contract interface

| Writes | Reads |
| --- | --- |
| `publish_grant` | `get_overview` |
| `revoke_grant` | `list_releases` |
| `create_release` | `get_release` |
| `attach_asset` | `get_grant` |
| `remove_asset` | `list_grants` |
| `review_asset` | `get_events` |
| `record_obligation` | `get_manifest` |
| `seal_release` | |

List views accept an offset and a limit from 1 to 20. Release drafts hold up to 16 assets. The contract enforces cumulative storage bounds of 512 grants, 256 releases and 2,048 attachments.

## App state

Demo mode uses local fixtures and a deterministic review simulation. StudioNet mode reads finalized state through the bundled GenLayer JS client. The connected wallet signs each write, and the UI checks the receipt's execution result after finality. The application never asks for a wallet private key.
