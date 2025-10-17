import { defineConfig } from 'vite';

if (typeof globalThis.crypto?.getRandomValues !== 'function') {
  const { webcrypto } = await import('node:crypto');

  if (webcrypto) {
    globalThis.crypto = webcrypto;
  }
}

export default defineConfig({
  // configuration placeholder; extend as needed
});
