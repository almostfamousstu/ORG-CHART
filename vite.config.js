import { defineConfig } from 'vite';
import * as nodeCrypto from 'node:crypto';

const { randomFillSync, webcrypto } = nodeCrypto;
const fallbackCrypto = webcrypto ? Object.create(webcrypto) : {};

if (typeof fallbackCrypto.getRandomValues !== 'function' && typeof randomFillSync === 'function') {
  fallbackCrypto.getRandomValues = (array) => randomFillSync(array);
}

const globalCrypto = globalThis.crypto;

if (!globalCrypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: fallbackCrypto,
    configurable: true,
    enumerable: false,
    writable: true,
  });
} else if (
  typeof globalCrypto.getRandomValues !== 'function' &&
  typeof fallbackCrypto.getRandomValues === 'function'
) {
  globalCrypto.getRandomValues = fallbackCrypto.getRandomValues.bind(fallbackCrypto);
}

if (
  typeof nodeCrypto.getRandomValues !== 'function' &&
  typeof fallbackCrypto.getRandomValues === 'function'
) {
  Reflect.set(nodeCrypto, 'getRandomValues', fallbackCrypto.getRandomValues.bind(fallbackCrypto));
}

export default defineConfig({
  // configuration placeholder; extend as needed
});
