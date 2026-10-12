# API contracts, frontend SDK and releases

The dependency chain is **backend OpenAPI → generated TypeScript client contracts → `cyberwave` helpers → React / environment-3d packages → examples and packed consumer tests → npm**. Generated files stay separate from handwritten helpers and components.

## Check locally

With Node 24 and pnpm 10.28.0:

```sh
pnpm install --frozen-lockfile
pnpm ci:check
python -m pip install -r examples/training/requirements-test.txt
python -m unittest discover -s examples/training -v
```

`ci:check` regenerates from the pinned schemas, checks for generated drift, builds all three packages and nineteen examples, runs the tests, then packs and installs the packages outside this workspace. Consumer checks cover TypeScript and server-side imports, including optional GIS/annotation/video entry points. Training tests use local fixtures and Python 3.12; no model inference or production credentials are needed.

To validate an API change, export OpenAPI from the matching backend and regenerate **both** base and preview contracts from the same document:

```sh
curl --fail --max-time 60 http://localhost:8000/api/v1/openapi.json -o /tmp/cyberwave-openapi.json
pnpm generate --schema-from=/tmp/cyberwave-openapi.json
pnpm build
pnpm test
pnpm pack:check
```

Review and commit `schema/` and `src/generated/` together. `--schema-from` intentionally requires all preview endpoints, so a stale API cannot silently retain incompatible overrides. `--refresh` refreshes only the stable base from `CYBERWAVE_API_URL` (default `https://api.cyberwave.com`); use it when preview endpoints have not yet been deployed. Ordinary builds never fetch a moving production schema.

The backend repository's SDK check also runs when backend inputs change. It uses the existing local-backend setup, regenerates from the checked-out API, then builds/tests the enriched SDK and consumer tarballs. It uploads the generated contract as a review artifact. Its optional export opens a contract-only PR here; standalone CI then checks it against the current public SDK. Authenticated integration scenarios remain separate from these contract checks: a successful compile does not prove live device or model availability.

The platform frontend builds from its own Docker context. Until it consumes a published SDK version, its SDP-normalization helper is an identical checked-in copy of `src/video-sdp.ts`; monorepo CI checks byte-for-byte parity on changes to either copy. Update them together. Do not import SDK source outside the frontend build directory: workspace unit tests can resolve that path while production builds cannot.

## Publish a reviewed version

1. Merge the SDK and API-contract changes into `main`. Deploy the backend endpoints required by the release, or document preview availability clearly.
2. Update `version` in the root package, `packages/react/package.json` and `packages/environment-3d/package.json` together. Keep component dependencies on `cyberwave` as `workspace:^`; packing writes the concrete version range. Update the lockfile with `pnpm install` and commit the changes.
3. Run `node scripts/check-release.mjs v0.1.0` with the intended version and run the local checks. Create and push that `vVERSION` tag on a commit already in `main`.
4. `publish.yml` rebuilds and tests the tag, checks package versions, and uploads the **exact consumer-tested tarballs**. The `npm` environment job publishes them with provenance: prereleases use `next`, stable releases use `latest`. A partial release can be retried: already published archives are skipped only when their registry integrity matches exactly. Different bytes require a new version.

Configure each of the three npm packages to trust GitHub organization `cyberwave-os`, repository `cyberwave-node`, workflow **`publish.yml`**, environment **`npm`**, with direct `npm publish` permitted. Configure the GitHub `npm` environment's reviewer/tag rules according to your release policy. A maintainer must establish ownership/bootstrap any new scoped package before automated releases can work. No npm credentials are embedded in the repository or browser examples. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [provenance](https://docs.npmjs.com/generating-provenance-statements/).

Tag publication is an explicit release action. Normal pushes, PRs and backend contract exports never publish packages or move npm tags. The `0.1.0` source is a development increment over the original `0.0.1` package: applications should migrate imports to `createCyberwave` / the typed `rest` interface and use an ESM-capable bundler or Node 24. It is not a drop-in CommonJS replacement.
