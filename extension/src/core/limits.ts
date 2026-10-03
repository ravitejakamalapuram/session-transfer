// Every time limit and size limit in one place, with the reason for each value.

/** How long the extension accepts a package after export (the replay window). */
export const TRANSFER_TTL_MS = 5 * 60 * 1000;
/** A package may not claim to live longer than a transfer does, plus 30 s of clock difference. */
export const MAX_PACKAGE_LIFETIME_MS = TRANSFER_TTL_MS + 30 * 1000;
/** Hard ceiling for the finished package (after base64). Bigger sessions are refused. */
export const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;
/** Above this the popup warns that the package is large. */
export const LARGE_WARN_BYTES = 20 * 1024 * 1024;
/** Collecting a very large session takes about a minute; past this the flow counts as stuck. */
export const COLLECT_TIMEOUT_MS = 3 * 60 * 1000;
/** How long the Receive screen keeps an unfinished draft. */
export const DRAFT_TTL_MS = 30 * 60 * 1000;

/** PBKDF2 rounds for new encrypted packages (OWASP guidance for SHA-256). */
export const PBKDF2_ITERATIONS = 600_000;
/** Rounds used before 1.3.0; packages without an `iterations` field were made with this. */
export const LEGACY_PBKDF2_ITERATIONS = 210_000;
/** A package may ask for at most this many rounds, so a crafted file cannot hang the receiver. */
export const MAX_PBKDF2_ITERATIONS = 2_000_000;
