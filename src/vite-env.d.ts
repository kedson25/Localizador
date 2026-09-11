interface ImportMetaEnv {
  readonly VITE_FIRESTORE_EMULATOR_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}