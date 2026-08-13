// Application code targets the browser and calls the standard Web Crypto
// API (crypto.randomUUID()) directly — correct there, since every browser
// provides it as a global. Vitest's 'node' test environment doesn't expose
// it the same way, so polyfill it here for tests only; nothing under src/
// should import from 'node:crypto' itself.
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}
