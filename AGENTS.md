# Definition of Done

Preserve existing data and use additive database migrations. Do not trust client-supplied user identities.

Every change affecting the desktop application must finish with relevant tests, a frontend build, compilation of `desktop/NativeInputHost.cs`, and an Electron Windows installer containing the updated code and helper. Verify the helper in `resources/app.asar.unpacked/desktop/NativeInputHost.exe` and validate the packaged application. Report the exact installer path, version, build date/time, and test limitations. Source changes alone do not complete a desktop task. Do not delegate the build to the user.

Never run `npm run release`, commit, tag, push, publish, or deploy without an explicit user request. Local builds must use `--publish never`.
