# Definition of Done

Preserve existing data and use additive database migrations. Do not trust client-supplied user identities.

Every change affecting the desktop application must finish with relevant tests, a frontend build, compilation of `desktop/NativeInputHost.cs`, and an Electron Windows installer containing the updated code and helper. Verify the helper in `resources/app.asar.unpacked/desktop/NativeInputHost.exe` and validate the packaged application. Report the exact installer path, version, build date/time, and test limitations. Source changes alone do not complete a desktop task. Do not delegate the build to the user.

## Automatic update publication

The user granted standing authorization on 2026-10-06 to publish every validated desktop update to the automatic update channel. Commit, tag, push, and GitHub Release publication needed for those updates are authorized without asking again.

Permanent rule, explicitly reaffirmed by the user on 2026-10-06: whenever a new desktop version is created, publication to the automatic update channel is a mandatory part of delivering that version. This applies to the current pending version and all future versions. The user must never need to remind the agent to publish or repeat desktop publication approval. After validation, publish the exact tested artifacts and verify that an older packaged app detects and downloads the update. Do not finish a desktop update at a local build, source push, installer link, or draft release.

If a concrete dependency prevents a usable release, state the exact blocker and that automatic publication is still pending. Continue all independent authorized work. When the new version requires a backend deployment, request only the backend approval required below, with the tested change ready for review; do not ask again for desktop publication approval. Do not silently defer publication or describe an unpublished version as delivered to installed clients.

Every desktop update must finish with a published stable release in `GeanVitor1/DiscordPessoal`, containing the exact validated Windows installer, its `.blockmap`, and the matching `latest.yml`. Mark it as the latest release. Verify the public update feed, the downloadable assets and their checksums, and that the packaged updater detects the new version. A local installer or a draft release alone does not complete an update.

Local builds must use `--publish never`; publish only after the required checks pass. Use the version and artifacts already validated. Do not run `npm run release` blindly: it increments the version and triggers another build, which can publish a different artifact from the one tested. Preserve previously published releases and associate each release with the corresponding source commit. Use a release branch when publishing source would otherwise trigger an unrelated backend deployment.

The validated-artifact publisher is `python scripts/publish-desktop-update.py --publish --notes-file <release-notes.md>`. Commit and push the corresponding source before running it, staging application source, helper and relevant validation reports explicitly; keep local `artifacts/`, installer output, databases, uploads and credentials out of Git. The publisher validates the package and recorded acceptance checks, temporarily pauses the duplicate tag rebuild workflow, creates the release tag, uploads and checks a draft, publishes it as latest, restores the workflow state, and verifies public downloads. Finish by validating update detection/download from an older packaged app with an isolated test profile; prevent that test from installing over the user's actual app.

When the app is running from the usual output directory, build to `artifacts/desktop-<version>` with `electron-builder --win --publish never --config.directories.output=artifacts/desktop-<version>`. Pass that directory to `verify-package.js`, as the third argument to `verify-installer.js` after its extractor, and as `--output-dir` to the publisher. Set `MEUAPP_TEST_OUTPUT` to that directory for the two-client and published-updater tests. Keep the running installation untouched until its normal automatic update is applied.

Backend deployments and other unrelated publication still require an explicit user request.
