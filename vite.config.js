import { defineConfig } from 'vite';
import { webcrypto as nodeWebCrypto } from 'node:crypto';

if (
  typeof globalThis.crypto?.getRandomValues !== 'function' &&
  typeof nodeWebCrypto?.getRandomValues === 'function'
) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    enumerable: false,
    value: nodeWebCrypto,
    writable: false,
  });
}

export default defineConfig({
  // configuration placeholder; extend as needed
});
