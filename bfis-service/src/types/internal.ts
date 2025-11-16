/**
 * Internal-only types for BFIS service.
 *
 * These types are not part of the shared schema contract with Olympus.
 * They are used internally for state management, polling, and service logic.
 *
 * Per constitution: Internal types should be kept separate from shared schemas
 * to maintain clear boundaries between BFIS internals and the BFIS ⇄ Olympus contract.
 *
 * TODO: Define internal types like PollState, SnapshotSummary, etc. as needed
 * during implementation of the snapshot reader and decision loop.
 */
