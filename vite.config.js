import { defineConfig } from 'vite';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto && webcrypto) {
  globalThis.crypto = webcrypto;
}

export default defineConfig({
  // configuration placeholder; extend as needed
});
