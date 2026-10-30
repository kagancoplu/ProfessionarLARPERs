/**
 * Single import point for @bsv/sdk (MASTER §3.1, ESM/CJS rule).
 *
 * wallet-toolbox is CommonJS and loads the CJS build of @bsv/sdk. Every app that
 * runs a wallet-toolbox wallet imports the SDK from here, and the build/test
 * configuration points '@bsv/sdk' at the CJS build, so SDK classes are one copy.
 * Symptom when this is broken: `script[serializedBytes] is not a function`.
 */
export * from '@bsv/sdk'
