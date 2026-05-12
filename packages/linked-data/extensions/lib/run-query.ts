/**
 * Thin async wrapper around `execFile` for running the Comunica CLI.
 *
 * Keeping this in its own module makes the I/O boundary easy to mock
 * in unit tests while still being exercised in integration tests.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** The maximum stdout/stderr buffer size (10 MiB). */
export const MAX_BUFFER = 10 * 1024 * 1024;

export interface QueryResult {
  /** Combined stdout + stderr output from the process. */
  output: string;
}

/**
 * The shape of the async executor used to spawn the Comunica process.
 * Keeping it injectable makes `runQuery` straightforward to unit-test.
 */
export type ExecFileAsync = (
  binary: string,
  args: string[],
  options: { cwd: string; maxBuffer: number }
) => Promise<{ stdout: string; stderr: string }>;

/** Default executor: promisified `child_process.execFile`. */
export const defaultExec: ExecFileAsync = promisify(execFile) as ExecFileAsync;

/**
 * Runs `binary` with `args` inside `cwd`.
 *
 * @param exec  Override the executor (for testing). Defaults to `defaultExec`.
 * @throws      The raw error from the executor (with `.stderr` / `.stdout`
 *              attached) so callers can surface the diagnostic text.
 */
export async function runQuery(
  binary: string,
  args: string[],
  cwd: string,
  exec: ExecFileAsync = defaultExec
): Promise<QueryResult> {
  const { stdout, stderr } = await exec(binary, args, {
    cwd,
    maxBuffer: MAX_BUFFER,
  });
  return { output: stdout || stderr };
}
