// Shared helpers for the Docs Studio setup scripts. No third-party deps
// besides `yaml`, which is already installed at the repo root.
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

/** Parses CLI args; prints `help` and exits when --help is passed. */
export function parseCli(options, help) {
  let parsed;
  try {
    parsed = parseArgs({
      options: { help: { type: 'boolean', short: 'h' }, ...options },
      allowPositionals: false,
      strict: true,
    });
  } catch (error) {
    console.error(`Error: ${error.message}\n`);
    console.error(help);
    process.exit(2);
  }
  if (parsed.values.help) {
    console.log(help);
    process.exit(0);
  }
  return parsed.values;
}

/** Runs a command without a shell. Returns { status, stdout, stderr }. */
export function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...opts,
  });
  if (result.error) {
    return { status: 127, stdout: '', stderr: result.error.message };
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function fail(message) {
  console.error(`\nError: ${message}`);
  process.exit(1);
}
