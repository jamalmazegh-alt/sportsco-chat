/**
 * Re-export of `@/config/features` for Playwright specs.
 * Playwright does not resolve tsconfig `@/*` paths; keep a single import site.
 */
export { isV2, V2_FLAGS, type V2Flag } from "../../../src/config/features";
