import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const provenance = JSON.parse(readFileSync(join(root, 'data', 'asset-provenance.json'), 'utf8'));
const publicFiles = JSON.parse(readFileSync(join(root, 'public-files.json'), 'utf8'));

const cases = [
  {
    asset: 'fonts/jetbrains-mono-latin.woff2',
    notice: 'fonts/OFL-JetBrains-Mono.txt',
    copyright: 'Copyright 2020 The JetBrains Mono Project Authors',
  },
  {
    asset: 'fonts/orbitron-latin.woff2',
    notice: 'fonts/OFL-Orbitron.txt',
    copyright: 'Copyright 2018 The Orbitron Project Authors',
  },
];

for (const font of cases) {
  test(`${font.asset} ships with verified OFL evidence`, () => {
    assert.equal(existsSync(join(root, font.notice)), true, `missing ${font.notice}`);
    const notice = readFileSync(join(root, font.notice), 'utf8');
    assert.match(notice, new RegExp(`^${font.copyright}`));
    assert.match(notice, /SIL OPEN FONT LICENSE Version 1\.1/);

    const record = provenance.records.find(entry => entry.path === font.asset);
    assert.ok(record, `missing provenance record for ${font.asset}`);
    assert.equal(record.status, 'approved');
    assert.match(record.license_or_permission, /SIL Open Font License 1\.1/i);
    assert.match(record.evidence, new RegExp(font.notice.replaceAll('.', '\\.')));
  });
}

test('Pages runtime allowlist distributes font license notices with the webfonts', () => {
  assert.ok(publicFiles.runtime.includes('fonts/*.txt'));
});
