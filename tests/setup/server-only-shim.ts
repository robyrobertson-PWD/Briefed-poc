// No-op replacement for the `server-only` package during Vitest runs.
// In production, importing this package from a client module is a build-time
// error (its real entry throws "This module cannot be imported from a Client
// Component module"). In tests we only load engine.ts from a Node context,
// so we substitute an empty module via the vitest.config.ts resolve alias.
export {};
