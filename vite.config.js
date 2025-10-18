import { defineConfig } from 'vite';
import { webcrypto } from 'node:crypto';

const cryptoSource =
  (typeof globalThis.crypto === 'object' &&
    typeof globalThis.crypto.getRandomValues === 'function'
      ? globalThis.crypto
      : undefined) ??
  (typeof webcrypto === 'object' &&
  typeof webcrypto.getRandomValues === 'function'
    ? webcrypto
    : undefined);

if (cryptoSource && globalThis.crypto !== cryptoSource) {
  Object.defineProperty(globalThis, 'crypto', {
    value: cryptoSource,
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

export default defineConfig({
  // configuration placeholder; extend as needed
});
