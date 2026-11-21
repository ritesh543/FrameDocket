# FrameDocket

FrameDocket helps production teams clear music, footage, imagery and artwork against a planned release. An issuer publishes signed permission terms and a producer attaches the grant to a release plan. The contract checks channel, territory, commercial permission and expiry before validators independently assess the written terms.

## Run the app

The ZIP includes the ready-to-serve app and the bundled GenLayer JS client. Extract the ZIP, open the `FrameDocket` folder and run:

```sh
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Python can serve the same files with `python3 -m http.server 4173 --directory dist`.

**Demo** opens a fictional documentary with five assets and saves work locally in the browser. **StudioNet** reads the finalized contract. Connect a compatible EIP-1193 wallet on chain `61999` to sign writes. Any wallet may publish a grant or own a release.

## Try a complete release

1. Open **Coastline score** and record evidence for the source link. The credit condition already has evidence.
2. Open **Behind-the-scenes stills** and run a demo review.
3. Remove the blocked **Transit map graphic**. Attach **Transit map web edition**, run the review and record evidence for the required notice.
4. Select **Seal release**, then **View and export**. Save the JSON and select that file in the verification control to compare its SHA-256 with the sealed checksum.

Open **Grant library** to publish or inspect a grant. A grant issuer can revoke their grant. A sealed release that uses it then shows **Withdrawn** while its historical manifest remains verifiable.

## StudioNet deployment

| Record | Value |
| --- | --- |
| Contract | `0xBB16f39C11e769EB98e9012EBc9658f031d5D056` |
| Network | StudioNet · 61999 |
| Deployment | Finalized · GenVM success |
| Live sample | `R-0001` · StudioNet demo trailer · Sealed |
| Contract source | `contracts/frame_docket.py` |

[Contract explorer](https://explorer-studio.genlayer.com/address/0xBB16f39C11e769EB98e9012EBc9658f031d5D056) · [Deployment transaction](https://explorer-studio.genlayer.com/tx/0xf5f452edc0c78501ab3fdf9ca43ac18ebef94cb7e93871fed0730aaf139c3563)

The StudioNet sample published a fictional grant, created and attached to a release, ran the GenLayer review and sealed a manifest. The transaction hashes and source checksum are in [deployment evidence](verification/deployment.json).

## Build and test

Use Node 22+ and Python 3.11+.

```sh
npm ci
npm run build
npm test
python3 -m unittest discover -s tests -v
python3 scripts/check_package.py
```

The dashboard modules are in `dist/`. The wallet adapter source is `src/studionet.js`, and the build bundles it into `dist/assets/studionet.js`. The transparent PNG mark is `dist/assets/framedocket-logo.png`.

The protocol, contract methods and consensus rules are documented in [Architecture](docs/ARCHITECTURE.md). See [Verification](verification/README.md) for the checked release evidence.
