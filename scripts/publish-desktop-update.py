"""Publish the tested desktop artifacts without rebuilding or changing version.

Run after committing and pushing the matching source to a release branch:
  python scripts/publish-desktop-update.py --publish --notes-file release-notes.md
Credentials stay in memory and come from the environment or Git Credential Manager.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from contextlib import contextmanager
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parent.parent


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--notes-file', type=Path)
    args = parser.parse_args()
    os.chdir(ROOT)
    subprocess.run(['node', 'scripts/verify-package.js'], check=True)
    package = json.loads(Path('package.json').read_text(encoding='utf-8'))
    version = package['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise RuntimeError('Only stable versions can be published to the automatic update channel')
    config = package['build']['publish'][0]
    if config['provider'] != 'github':
        raise RuntimeError('The configured update provider must be GitHub')
    owner, repo = config['owner'], config['repo']
    if not all(re.fullmatch(r'[\w.-]+', value) for value in [owner, repo]):
        raise RuntimeError('Invalid repository')
    if git('remote', 'get-url', 'origin') != f'https://github.com/{owner}/{repo}.git':
        raise RuntimeError('The source remote does not match the automatic update repository')
    for report_name in ['build', 'installer-payload', 'packaged', 'two-desktops']:
        report = json.loads(Path(f'docs/validation/{report_name}.json').read_text(encoding='utf-8'))
        if report.get('version') != version or (report_name != 'build' and report.get('passed') is not True):
            raise RuntimeError(f'Missing matching successful validation: {report_name}')
    artifacts = [Path(f'dist/MeuApp-Setup-{version}.exe'), Path(f'dist/MeuApp-Setup-{version}.exe.blockmap'), Path('dist/latest.yml')]
    hashes = {file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in artifacts}
    print(f'Validated update {version}: ' + ', '.join(hashes), flush=True)
    if not args.publish:
        return
    if not args.notes_file:
        raise RuntimeError('--notes-file is required for publication')
    notes = args.notes_file.read_text(encoding='utf-8')
    if git('diff', 'HEAD', '--', 'desktop', 'client/src', 'package.json', 'package-lock.json'):
        raise RuntimeError('Commit the tested application source before publishing')
    if git('ls-files', '--others', '--exclude-standard', 'desktop', 'client/src'):
        raise RuntimeError('Application source contains uncommitted new files')
    commit = git('rev-parse', 'HEAD')
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if not token:
        env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GCM_INTERACTIVE='never')
        result = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, env=env)
        credential = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
        token = credential.get('password') if result.returncode == 0 else None
    if not token:
        raise RuntimeError('GitHub publication credentials are unavailable')
    base = f'https://api.github.com/repos/{owner}/{repo}'

    def api(url, method='GET', data=None, content_type='application/json', missing_ok=False):
        headers = {'Authorization': 'Bearer ' + token, 'User-Agent': 'MeuApp-release-publisher', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
        body = data if isinstance(data, bytes) else json.dumps(data).encode('utf-8') if data is not None else None
        if body is not None:
            headers['Content-Type'] = content_type
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                content = response.read()
                return json.loads(content) if content else None
        except urllib.error.HTTPError as error:
            if missing_ok and error.code == 404:
                return None
            raise RuntimeError(f'GitHub API {method} failed with HTTP {error.code}') from None

    if api(base + '/commits/' + commit)['sha'] != commit:
        raise RuntimeError('The matching source commit is not available on GitHub')
    tag = 'v' + version
    ref = api(base + '/git/ref/tags/' + tag, missing_ok=True)
    if ref is not None and (ref['object']['type'] != 'commit' or ref['object']['sha'] != commit):
        raise RuntimeError('The release tag already points to different source; use a new version')

    @contextmanager
    def preserve_validated_artifacts():
        # Creating a tag through the REST API also emits push. Temporarily pause
        # the duplicate build workflow so it cannot overwrite tested artifacts.
        workflow = api(base + '/actions/workflows/release.yml', missing_ok=True)
        paused = False
        try:
            if workflow and workflow['state'] == 'active':
                api(base + '/actions/workflows/' + str(workflow['id']) + '/disable', 'PUT')
                paused = True
                print('Paused the duplicate tag rebuild during artifact publication', flush=True)
            runs = api(base + '/actions/runs?' + urllib.parse.urlencode({'head_sha': commit, 'event': 'push', 'per_page': 100}))
            for run in runs['workflow_runs']:
                if run['head_sha'] == commit and run['head_branch'] == tag and run['status'] != 'completed':
                    raise RuntimeError('A duplicate tag build is already running; finish or cancel that build before publishing tested artifacts')
            yield
        finally:
            if paused:
                api(base + '/actions/workflows/' + str(workflow['id']) + '/enable', 'PUT')
                print('Restored the original release workflow state', flush=True)

    with preserve_validated_artifacts():
        # Existing refs and previously published assets are never replaced.
        if ref is None:
            ref = api(base + '/git/refs', 'POST', {'ref': 'refs/tags/' + tag, 'sha': commit})
        release = api(base + '/releases/tags/' + tag, missing_ok=True)
        if release is None:
            release = api(base + '/releases', 'POST', {'tag_name': tag, 'target_commitish': commit, 'name': 'MeuApp ' + version, 'body': notes, 'draft': True, 'prerelease': False})
            print('Draft created for ' + tag, flush=True)
        existing = {asset['name']: asset for asset in release['assets']}
        upload_url = release['upload_url'].split('{')[0]
        for file in artifacts:
            asset = existing.get(file.name)
            if asset is None:
                if not release['draft']:
                    raise RuntimeError('An existing published release is incomplete; use a new version')
                print('Uploading ' + file.name, flush=True)
                asset = api(upload_url + '?' + urllib.parse.urlencode({'name': file.name}), 'POST', file.read_bytes(), 'text/yaml' if file.suffix == '.yml' else 'application/octet-stream')
            if asset.get('state') != 'uploaded' or asset['size'] != file.stat().st_size or asset.get('digest') != 'sha256:' + hashes[file.name]:
                raise RuntimeError('The uploaded artifact does not match the tested file: ' + file.name)
            print('Verified uploaded checksum: ' + file.name, flush=True)
        release = api(base + '/releases/' + str(release['id']), 'PATCH', {'draft': False, 'prerelease': False, 'make_latest': 'true', 'body': notes})
        if api(base + '/releases/latest')['tag_name'] != tag:
            raise RuntimeError('The new release is not the latest automatic update')
        print('Stable release published: ' + release['html_url'], flush=True)

    def public_download(url):
        # Deliberately omit credentials from download requests and redirects.
        request = urllib.request.Request(url, headers={'User-Agent': 'MeuApp-update-verification', 'Cache-Control': 'no-cache'})
        return urllib.request.urlopen(request, timeout=90)

    with public_download(f'https://github.com/{owner}/{repo}/releases/latest/download/latest.yml') as response:
        if response.read() != Path('dist/latest.yml').read_bytes():
            raise RuntimeError('The public latest update feed does not match the tested installer')
    downloads = []
    for file in artifacts:
        url = f'https://github.com/{owner}/{repo}/releases/download/{tag}/' + urllib.parse.quote(file.name)
        digest, count = hashlib.sha256(), 0
        with public_download(url) as response:
            while chunk := response.read(1024 * 1024):
                count += len(chunk)
                digest.update(chunk)
        if count != file.stat().st_size or digest.hexdigest() != hashes[file.name]:
            raise RuntimeError('The public download differs from the tested artifact: ' + file.name)
        downloads.append({'name': file.name, 'url': url, 'size': count, 'sha256': digest.hexdigest()})
        print('Verified public download: ' + file.name, flush=True)
    report = {'passed': True, 'version': version, 'sourceCommit': commit, 'releaseUrl': release['html_url'], 'publishedAt': release['published_at'], 'checkedAt': datetime.now(timezone.utc).isoformat(), 'publicFeedMatchesTestedInstaller': True, 'assets': downloads, 'previousReleasesPreserved': True}
    Path(f'docs/validation/release-publication-{version}.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
