import * as child from "node:child_process";
import util from "node:util";

const execFile = util.promisify(child.execFile);

/**
 * If timeout is greater than 0, the parent will send the signal
 * identified by the killSignal property (the default is 'SIGTERM')
 * if the child runs longer than timeout milliseconds.
 */
const defaultTimeout = 5 * 60 * 1000; // ms

/**
 * Run a command directly in the DAPPMANAGER container.
 * If the child process exits with code > 0, rejects
 */
export async function shell(
  file: string,
  args: readonly string[],
  options?: { timeout?: number; maxBuffer?: number }
): Promise<string> {
  const timeout = options?.timeout ?? defaultTimeout;
  const maxBuffer = options?.maxBuffer;

  try {
    const { stdout = "" } = await execFile(file, args, { timeout, maxBuffer });
    return stdout.trim();
  } catch (error) {
    // Rethrow a typed error, and ignore the internal NodeJS stack trace
    const err = error as child.ExecFileException;
    if (err.signal === "SIGTERM")
      throw new ShellError(
        err,
        `process timeout ${timeout} ms, command: ${file}`
      );
    throw new ShellError(err);
  }
}

/**
 * Typed error implementing the native node child exception error
 * Can be rethrow to ignore the internal NodeJS stack trace
 */
export class ShellError extends Error {
  cmd?: string;
  killed?: boolean;
  code?: string | number;
  signal?: NodeJS.Signals;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  constructor(e: child.ExecFileException, message?: string) {
    super(message || e.message);
    this.cmd = e.cmd;
    this.killed = e.killed;
    this.code = e.code ?? undefined;
    this.signal = e.signal;
    this.stdout = e.stdout;
    this.stderr = e.stderr;
  }
}
