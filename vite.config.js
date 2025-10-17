import { defineConfig } from 'vite';
import { randomFillSync, webcrypto } from 'node:crypto';

const existingCrypto = globalThis.crypto;
const cryptoObj = existingCrypto ?? webcrypto ?? {};

if (typeof cryptoObj.getRandomValues !== 'function') {
  cryptoObj.getRandomValues = (array) => randomFillSync(array);
}

if (!existingCrypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: cryptoObj,
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

export default defineConfig({
  // configuration placeholder; extend as needed
});
