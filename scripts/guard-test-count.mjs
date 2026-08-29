import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['--test', 'tests/'], {
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
  if (testCount === 0) {
    console.error('Test count guard failed: node --test discovered 0 tests.');
    process.exitCode = 1;
    return;
  }

  process.exitCode = signal ? 1 : (code ?? 1);
});
