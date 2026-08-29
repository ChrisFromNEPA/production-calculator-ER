import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// Enumerate test files explicitly instead of passing a directory or glob to
// `node --test`: directory-position semantics differ across supported Node
// versions (v22 treats `--test tests/` as an entry module), and globs would
// reintroduce the shell-quoting fragility this guard exists to fix.
function collectTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTestFiles(full));
    else if (/\.test\.mjs$/.test(entry.name)) out.push(full);
  }
  return out.sort();
}

const testFiles = collectTestFiles('tests');
if (testFiles.length === 0) {
  console.error('Test count guard failed: no *.test.mjs files found under tests/.');
  process.exit(1);
}

const child = spawn(process.execPath, ['--test', ...testFiles], {
  stdio: ['inherit', 'pipe', 'pipe'],
});

let output = '';

const tee = (stream) => {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
};

tee(child.stdout);
tee(child.stderr);

child.on('error', (error) => {
  console.error(`Test runner could not start: ${error.message}`);
  process.exitCode = 1;
});

child.on('close', (code, signal) => {
  const testCountMatch = output.match(/(?:#|ℹ)\s+tests\s+(\d+)/i);

  if (!testCountMatch) {
    console.error('Test count guard failed: could not parse the test count from node --test output.');
    process.exitCode = 1;
    return;
  }

  const testCount = Number(testCountMatch[1]);
  if (testCount < testFiles.length) {
    console.error(
      `Test count guard failed: expected at least ${testFiles.length} tests ` +
      `(one per discovered file) but node --test reported ${testCount}.`
    );
    process.exitCode = 1;
    return;
  }

  process.exitCode = signal ? 1 : (code ?? 1);
});
