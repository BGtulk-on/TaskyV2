
## Bug Fixes

- **Assigned To missing owner** — Owner now shows as assignable option for contributors.
- **Login error not shown** — Wrong password error now displays in login mode.
- **Mobile delete causing logout** — Added `.catch()` with rollback to prevent interceptor logout.
- **Priority not persisting** — Added `priority` column to SQLite and Neon schemas.
- **Double-tap on desktop** — New project double-tap now mobile only.
- **Subtask ghost-submit** — Input text clears on blur.
- **GitHub login ref conflict** — Separated OAuth dedup from double-tap ref.
- **Profile save logout** — Created dedicated `handleProfileUpdate` instead of reusing `handleLogin`.

## Improvements

- **Login button loading state** — Disables button during request to prevent spam.

## Performance

- **Memoized tree building** — `useMemo` on `build_tree` + sort.
- **Memoized context** — `useMemo` on `ctxVal`, `useCallback` on handlers.
- **Scoped shares query** — Filtered to user's tasks only.
- **Font loading** — 18 weights → 3, added preconnect.
- **Local state on contributor removal** — No more full refetch.
