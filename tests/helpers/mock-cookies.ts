// tests/helpers/mock-cookies.ts
// Minimal mock for Next.js request-context helpers used by some route tests.
// This does not change production behavior. It is only used where a test needs
// to simulate a request context without running the full server.

export function mockSessionCookie(token: string): { cookies: { get: (name: string) => { value: string } | undefined } } {
  return {
    cookies: {
      get: (name: string) => (name === 'mvmp_session' ? { value: token } : undefined),
    },
  }
}

export function mockNoSession(): { cookies: { get: (name: string) => undefined } } {
  return {
    cookies: {
      get: () => undefined,
    },
  }
}
