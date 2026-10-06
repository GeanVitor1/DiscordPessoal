# Definition of Done

Preserve existing data and use additive database migrations. Do not trust client-supplied user identities.

Every change affecting the desktop application must finish with relevant tests, a frontend build, compilation of `desktop/NativeInputHost.cs`, and an Electron Windows installer containing the updated code and helper. Verify the helper in `resources/app.asar.unpacked/desktop/NativeInputHost.exe` and validate the packaged application. Report the exact installer path, version, build date/time, and test limitations. Source changes alone do not complete a desktop task. Do not delegate the build to the user.

## Automatic update publication

The user granted standing authorization on 2026-10-06 to publish every validated desktop update to the automatic update channel. Commit, tag, push, and GitHub Release publication needed for those updates are authorized without asking again.

Every desktop update must finish with a published stable release in `GeanVitor1/DiscordPessoal`, containing the exact validated Windows installer, its `.blockmap`, and the matching `latest.yml`. Mark it as the latest release. Verify the public update feed, the downloadable assets and their checksums, and that the packaged updater detects the new version. A local installer or a draft release alone does not complete an update.

Local builds must use `--publish never`; publish only after the required checks pass. Use the version and artifacts already validated. Do not run `npm run release` blindly: it increments the version and triggers another build, which can publish a different artifact from the one tested. Preserve previously published releases and associate each release with the corresponding source commit. Use a release branch when publishing source would otherwise trigger an unrelated backend deployment.

The validated-artifact publisher is `python scripts/publish-desktop-update.py --publish --notes-file <release-notes.md>`. Commit and push the corresponding source before running it. It validates the package and recorded acceptance checks, creates the release tag without rebuilding the artifacts, uploads and checks a draft, publishes it as latest, and verifies public downloads. Finish by validating update detection/download from an older packaged app with an isolated test profile; prevent that test from installing over the user's actual app.

Backend deployments and other unrelated publication still require an explicit user request.
