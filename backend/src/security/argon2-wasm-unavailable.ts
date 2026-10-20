/**
 * Fallback only for the browser bundle. Password operations must run in Node;
 * this prevents Vite from following Argon2's optional WASI export on Windows.
 */
export async function hash(): Promise<never> {
  throw new Error("Argon2 só pode ser usado no servidor Node.");
}

export async function verify(): Promise<never> {
  throw new Error("Argon2 só pode ser usado no servidor Node.");
}
