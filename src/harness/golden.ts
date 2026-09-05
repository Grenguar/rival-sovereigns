/** The seed and depth every determinism check runs against. */
export const GOLDEN_SEED = 0x5ea50f;

/**
 * 10,000 ticks — docs/06-testing.md §2. Deep enough that any divergence has had
 * thousands of chances to compound into a different hash.
 */
export const GOLDEN_TICKS = 10_000;
