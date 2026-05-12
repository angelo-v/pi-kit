/**
 * Unit tests for run-query.ts
 *
 * Rather than mocking `node:child_process` at the ESM level, we use the
 * `exec` dependency-injection parameter that `runQuery` accepts as its
 * fourth argument. This keeps mocking simple and explicit.
 */

import { describe, it, expect, vi } from "vitest";
import { runQuery, MAX_BUFFER } from "../run-query.js";
import type { ExecFileAsync } from "../run-query.js";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Create a stub executor that resolves with the given stdout/stderr. */
function makeExec(stdout: string, stderr: string = ""): ExecFileAsync {
  return vi.fn().mockResolvedValue({ stdout, stderr });
}

/** Create a stub executor that rejects with an error carrying extra fields. */
function makeFailingExec(errProps: Record<string, string>): ExecFileAsync {
  const err = Object.assign(new Error("process failed"), errProps);
  return vi.fn().mockRejectedValue(err);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("runQuery", () => {
  it("returns stdout when the process succeeds", async () => {
    const exec = makeExec("results here");

    const result = await runQuery("/bin/comunica", [], "/cwd", exec);

    expect(result.output).toBe("results here");
  });

  it("falls back to stderr when stdout is empty", async () => {
    const exec = makeExec("", "warning output");

    const result = await runQuery("/bin/comunica", [], "/cwd", exec);

    expect(result.output).toBe("warning output");
  });

  it("passes the binary path as the first argument to the executor", async () => {
    const exec = makeExec("ok");

    await runQuery("/custom/binary", [], "/cwd", exec);

    expect(exec).toHaveBeenCalledWith(
      "/custom/binary",
      expect.any(Array),
      expect.any(Object)
    );
  });

  it("passes all args to the executor unchanged", async () => {
    const exec = makeExec("");
    const args = ["file:///a.ttl", "-q", "SELECT *", "-t", "table"];

    await runQuery("/bin/comunica", args, "/cwd", exec);

    expect(exec).toHaveBeenCalledWith(
      expect.any(String),
      args,
      expect.any(Object)
    );
  });

  it("includes cwd in the options object", async () => {
    const exec = makeExec("");

    await runQuery("/bin/comunica", [], "/my/workspace", exec);

    expect(exec).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: "/my/workspace" })
    );
  });

  it("sets maxBuffer to MAX_BUFFER in the options object", async () => {
    const exec = makeExec("");

    await runQuery("/bin/comunica", [], "/cwd", exec);

    expect(exec).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ maxBuffer: MAX_BUFFER })
    );
  });

  it("propagates errors thrown by the executor", async () => {
    const exec = makeFailingExec({ stderr: "bad query syntax" });

    await expect(runQuery("/bin/comunica", [], "/cwd", exec)).rejects.toMatchObject({
      stderr: "bad query syntax",
    });
  });

  it("does not swallow errors that lack a stderr field", async () => {
    const exec = makeFailingExec({ stdout: "partial output" });

    await expect(runQuery("/bin/comunica", [], "/cwd", exec)).rejects.toThrow(
      "process failed"
    );
  });
});

describe("MAX_BUFFER", () => {
  it("is 10 MiB", () => {
    expect(MAX_BUFFER).toBe(10 * 1024 * 1024);
  });
});
