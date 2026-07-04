import path from "node:path";

/** Overridable via env so tests can point at an isolated tmp directory. */
export function getDataDir(): string {
  return process.env.BEYOND_READ_DATA_DIR
    ? path.resolve(process.env.BEYOND_READ_DATA_DIR)
    : path.join(process.cwd(), "data");
}
