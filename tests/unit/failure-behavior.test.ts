// tests/unit/failure-behavior.test.ts
// Verifies that bun test correctly reports a failing test with non-zero exit.
import { describe, it, expect } from 'bun:test'

describe('failure behavior', () => {
  it('intentionally fails so we can confirm the harness reports failures', () => {
    expect(1 + 1).toBe(3)
  })
})
