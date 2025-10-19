import { defineConfig } from 'vite';
import { webcrypto as nodeWebcrypto } from 'node:crypto';

const hasBrowserCrypto =
  typeof globalThis.crypto === 'object' &&
  typeof globalThis.crypto?.getRandomValues === 'function';

if (!hasBrowserCrypto && typeof nodeWebcrypto?.getRandomValues === 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    value: nodeWebcrypto,
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

export default defineConfig({
  // configuration placeholder; extend as needed
});
