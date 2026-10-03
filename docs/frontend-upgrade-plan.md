# Frontend upgrade plan

Inputs: [frontend-research.md](frontend-research.md) (audit, competitor patterns, library decisions). Work happens on branch `frontend-upgrade`; `main` auto-deploys, so nothing merges until the verification checklist at the end passes.

## 1. Goals and non-goals

**Goals.** A production-grade UI for three roles: fast, accessible (WCAG 2.2 AA), responsive from 360 px phones to wide desktops, light and dark themes, with deliberate loading, empty and error states.

**Non-goals.** No backend behaviour or API contract changes (none are planned; if one proves necessary it is flagged in the summary). No new product features beyond UX around existing ones. No i18n.

**Honest tension with the brief.** The brief says "keep it small". This upgrade adds dependencies and code, which makes the project harder to defend line by line. Mitigations: lean library list (each justified in the research doc), every dependency has a single obvious job, tests for behaviour, an explicit bundle budget, and a plain folder structure.

## 2. Design system

All tokens are CSS variables defined once in `src/styles/index.css` under Tailwind v4's `@theme`, switched by a `.dark` class (set before first paint by an inline script, so no flash). Components never use raw colors, only semantic tokens.

### 2.1 Color (semantic tokens; final hex values are contrast-checked by `scripts/check-contrast.mjs`, which runs in tests)

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | slate-50 `#f8fafc` | `#0b1120` | page |
| `surface` | `#ffffff` | `#111a2e` | cards, tables |
| `surface-muted` | slate-100 `#f1f5f9` | `#1a2438` | table header, inputs hover, skeleton base |
| `border` / `border-strong` | `#e2e8f0` / `#cbd5e1` | `#243049` / `#35435f` | dividers / inputs |
| `foreground` | slate-900 `#0f172a` | `#e6ebf5` | text |
| `muted-foreground` | slate-600 `#475569` | `#9aa8c2` | secondary text (>= 4.5:1 on `surface` and `surface-muted`) |
| `primary` / `primary-foreground` | indigo-700 `#4338ca` / white | `#7c83f5` / `#0b1120` | main actions, links, focus ring |
| `danger`, `success`, `warning`, `info` | red-700, green-700, amber-700, sky-700 text with 100-level tints | lighter text on 15% tints | destructive actions, toasts, alerts |

Request status colors (always paired with a text label and an icon, never color alone): `submitted` indigo, `in_progress` amber, `delivered` cyan, `accepted` green, `rejected` red; export statuses reuse the same set (`pending` neutral, `running` amber, `succeeded` green, `failed` red).

### 2.2 Typography
Inter variable (self-hosted, latin subset, `font-display: swap`), system stack fallback. Scale (rem): `xs 0.75 / sm 0.8125 / base 0.875 / md 1 / lg 1.25 / xl 1.5 / 2xl 1.875`, line-heights 1.5 body and 1.2 headings, weights 400/500/600. **Tabular numerals** for counts and times; **monospace** (`ui-monospace`) for episode and request ids. Headings: `h1` 1.5 rem page title, `h2` 1 rem section title. Body text 14 px on desktop, 16 px on inputs (prevents iOS zoom).

### 2.3 Spacing, radius, elevation, motion
- Spacing: Tailwind 4 px grid; page gutters 16 / 24 / 32 px (mobile / tablet / desktop); card padding 16 / 20; control heights 40 px (touch), 32 px (dense desktop tables).
- Radius: `sm 6`, `md 8` (controls), `lg 12` (cards), `full` (badges, pills).
- Shadows: `xs` (cards), `sm` (hover), `md` (popovers), `lg` (dialogs). In dark mode shadows are replaced by borders.
- Motion: durations 120 / 180 / 260 ms, easing `cubic-bezier(.2,.8,.2,1)`. Used for: popover/dialog fade+scale, sheet slide, toast, skeleton shimmer, progress sweep, live-dot pulse, button press. Under `prefers-reduced-motion: reduce` all durations collapse to ~0 and shimmer/pulse stop.
- Focus: 2 px `primary` ring with 2 px offset on every interactive element; `scroll-padding-top` equals the sticky header height so focus is never obscured (WCAG 2.4.11).
- Targets: >= 40 px on touch layouts, never below 24 px (WCAG 2.5.8).

### 2.4 Breakpoints
`sm 640`, `md 768` (nav switches from sheet to inline tabs; tables switch from cards to rows), `lg 1024` (detail page gains a side column), `xl 1280` (max content width 1200).

## 3. Libraries (rationale in the research doc, section 4)

Runtime: `tailwindcss` + `@tailwindcss/vite`, `radix-ui`, `lucide-react`, `sonner`, `cmdk` (lazy), `@tanstack/react-query`, `react-router`, `react-hook-form`, `clsx`, `tailwind-merge`, `@fontsource-variable/inter`.
Dev: `eslint@9` + `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y`, `prettier`, `vitest` + `@testing-library/*` + `jsdom`, `axe-core`.
Not added on purpose: Zod, Motion, Recharts, MUI/Headless UI, TanStack Table, date-fns, i18n, Zustand.

**Bundle budget.** Initial JS <= 120 kB gzip (today 74 kB), every route is its own lazy chunk (<= 25 kB gzip each), CSS <= 15 kB gzip, `cmdk` and the chart load on demand. Measured after each phase with `vite build` output and Lighthouse; if the budget is blown, fallbacks are: custom router (~40 lines), system fonts.

## 4. Information architecture and routes

```
/login                       public
/requests                    queue (all roles; clients see only their own)   status chips + pagination in the URL
/requests/new                client: new request form
/requests/:id                request detail (timeline, actions, episodes, assign panel for staff)
/imports                     staff: upload + report + recent imports
/analytics                   staff: range presets, KPIs, chart, top tasks
/users                       admin
*                            404 with a way home
```
Old hash URLs (`#/requests/12`) are redirected to the new paths once on load so existing bookmarks keep working.

**App shell.** Sticky top bar (brand, primary nav as tabs on `md+` / a menu sheet below, live-connection pill for staff, user menu with theme and shortcuts and sign-out), skip link, `main` landmark, route-change focus moves to the page `h1` and updates `document.title`.

## 5. Page and component plan, by user impact

| Priority | Item | Key UX decisions |
|---|---|---|
| **P0 Foundation** | Tooling (Tailwind, ESLint, Prettier, Vitest), tokens and theme, `ui/` kit, router + Query + auth provider, API client, SSE bridge | Query defaults (stale time 15 s, retry once, no retry on 4xx); SSE events call `invalidateQueries` for the affected request and the list; 401 clears the session via one place |
| **P1 Everyday flows** | Login | Brand panel, show/hide password, autofill-friendly, server error mapped under the form, session-expired notice |
| | Request queue | Status chips, rows on `md+`, **cards on phones**, whole row clickable plus visible link, id/task/client/progress bar (assigned/requested)/deadline with "due in N days" and overdue tint, skeleton rows, empty states per role with a primary action, error state with retry, URL-driven filter + page |
| | Request detail | Page header with status and the primary action, **status timeline** (who/when), details card, assigned-episodes table with export badges, accept/reject and other transitions behind an `AlertDialog` (no `window.confirm`), optimistic remove-episode with undo toast, toasts for every mutation |
| | New request | Inline validation (touched/blur), character counter, date picker min = today, success toast and redirect |
| **P2 Operator depth** | Assign panel | Desktop: side-by-side with the assigned list; phone: bottom **sheet**. Filters (task, quality) in the URL, "select page" with an `n selected` bar, bad-quality rows visibly not selectable with a tooltip reason, mismatch warning, results count |
| | Import | Drop zone **and** button (no drag-only), file validation before upload, progress state, report with stat tiles, skipped rows table filterable by reason, recent imports list |
| | Users | Table with role select, active switch behind a confirm dialog, create-user dialog with inline validation, "you" badge, self-change disabled with explanation |
| **P3 Polish** | Analytics | Range presets (7/30/90 days, custom), KPI tiles (requests by status, median time to delivery), accessible SVG stacked bar chart per day and robot with a data-table fallback, top tasks as horizontal bars |
| | Command palette (`Cmd/Ctrl+K`) and shortcuts | `g r / g i / g a / g u` navigation, `n` new request, `/` focus filter, `?` help dialog; disabled while typing in fields |
| | 404, offline banner, `prefers-color-scheme`, meta description, favicon, theme-color | |

### Shared components (`src/components/ui`)
Button, IconButton, Input, Textarea, Field (label + hint + error wiring), Select, Checkbox, Switch, Badge, StatusBadge, ExportBadge, Card, Skeleton, Spinner, EmptyState, ErrorState, ConfirmDialog (AlertDialog), Dialog, Sheet, DropdownMenu, Tooltip, SegmentedControl/Tabs, Pagination, Table primitives, Timeline, ProgressBar, Stat, BarChart, Kbd, Toaster.

## 6. Folder structure

```
frontend/src/
  main.tsx
  app/            App.tsx · routes.tsx · providers.tsx · AppShell.tsx · RequireAuth.tsx
  api/            client.ts · types.ts · errors.ts · events.ts · queries/{requests,episodes,users,imports,analytics,auth}.ts
  components/ui/  design-system components (no domain knowledge)
  components/     domain pieces shared across pages (StatusTimeline, ExportBadge, EpisodeTable, ...)
  features/       login · requests · assign · imports · analytics · users   (page + feature-specific parts)
  hooks/          useTheme · useHotkeys · useDocumentTitle · useMediaQuery · useLiveEvents
  lib/            cn.ts · format.ts · copy.ts
  styles/         index.css  (tokens, base, utilities)
  test/           setup.ts · render.tsx · fixtures.ts
```

## 7. How existing behaviour is protected

1. **Branch and CI.** Work stays on `frontend-upgrade`. CI (typecheck, lint, tests, build) must pass before merging; merging deploys, and the existing deploy job health-checks and rolls back.
2. **API contract inventory.** The UI uses exactly these calls today: `auth/login|logout|me`, `requests` (list with `limit/offset/status`, detail, create, `transitions`, `assignments` POST/DELETE, `exports/retry`), `episodes` (+ `task-names`), `imports` (POST), `analytics`, `users` (GET/POST/PATCH), `events` (SSE). A test asserts the new `api/queries` modules call these paths with these shapes, and the manual regression pass in section 9 exercises every one.
3. **Port, don't rewrite blindly.** Each page is migrated with its logic (error mapping `describeError`, filters, transitions list from `allowed_transitions`, selection rules) moved into typed hooks first, then re-skinned.
4. **Behaviour tests before deletion.** For every screen: a Testing Library test of its main flow (including error and empty states) passes against the new implementation before the old file is removed.
5. **Server stays the authority.** Optimistic updates are limited to cases where rollback is trivial (remove an episode, toggle a user's active flag, change a role); transitions and assignments wait for the server because they enforce domain rules.

## 8. Test strategy

- **Unit:** `format` helpers, API error mapping, hotkey parser, contrast checker.
- **Component/flow (Vitest + Testing Library, fetch stubbed):** login success/failure, queue states (loading, empty per role, error + retry, pagination in URL), request detail actions with confirm dialogs, optimistic remove with rollback on error, assign flow selection rules, import report rendering, users guard rails (cannot change self), route guards (client cannot reach `/users`).
- **Accessibility:** `axe-core` on each page in light and dark, plus keyboard tests for dialogs (focus trap, Escape, focus return).
- **Static:** strict TypeScript, ESLint with `jsx-a11y`, Prettier check; all run in CI.
- **Manual and tooling:** Lighthouse (mobile and desktop) before and after, axe in the browser at 375 / 768 / 1280 px in both themes, keyboard-only walkthrough, reduced-motion check.

## 9. Verification checklist (Phase 5): results

- [x] `npm run lint`, `typecheck`, `test`, `build` green; no `any`; no runtime console errors on signed-in pages (the only console message is the expected 401 from the session probe when a signed-out visitor opens a protected URL)
- [x] Every page checked at 390 and 1280 px, in light and dark: no horizontal page scroll, targets >= 24 px (one 21 px link found and fixed). **Correction:** my first "mobile" checks in the browser pane silently ran at 656 px because the viewport emulation had reset, so they missed a real overflow; it was found later with true device emulation (see below)
- [x] Lighthouse (final run, local build): see the table below. Accessibility 100, Best Practices 100 everywhere
- [x] axe-core in a real browser (real layout, so contrast is included): **0 violations** on queue, detail, import, analytics and users in both themes; axe in jsdom for login, queue, detail, new request, users, import, analytics
- [x] Bundle budget met: entry **76 kB** gzip (budget 120, was 74 before the upgrade), CSS **8.9 kB** gzip, every page its own lazy chunk (largest 6 kB), signed-in shell 12.7 kB lazy, command palette 5.5 kB lazy
- [x] Full regression pass as client, operator and admin against the local stack: login (incl. deep link back after sign-in), create request with inline validation, transitions with confirmation dialogs and toasts, assign (sheet, selection rules, live update), export status live, import with report, analytics, command palette, shortcuts, theme toggle, session expiry (tested), old hash bookmarks (tested)
- [x] No backend change: `git diff main -- backend` is empty

### Measured results (Lighthouse 13.5, mobile = simulated slow 4G + 4x CPU slowdown)

| Page | Before (perf / a11y / best / SEO) | After (perf / a11y / best / SEO) | LCP before -> after | CLS before -> after |
|---|---|---|---|---|
| Login, mobile | 96 / 100 / 96 / 82 | **95** / **100** / **100** / 63* | 2.4 s -> 2.5 s | 0 -> 0 |
| Queue, mobile | 95 / 100 / 100 / 82 | **93** / **100** / **100** / 63* | 2.6 s -> 2.9 s | 0.028 -> 0 |
| Request detail, mobile | 80 / 96 / 100 / 82 | **91** / **100** / **100** / 63* | 2.6 s -> 3.2 s | 0.098 -> 0 |
| Queue, desktop | 100 / 100 / 100 / 82 | **100** / **100** / **100** / 63* | 0.6 s -> 0.7 s | 0.011 -> 0 |

\* SEO is 63 because of one audit, `is-crawlable`: the app is an authenticated internal tool, so it ships `<meta name="robots" content="noindex">` and `robots.txt` `Disallow: /` **on purpose**. Every other SEO audit passes. Remove both to get 91+ if public indexing of the login page were ever wanted.

The new UI does much more per page (design system, dialogs, toasts, live updates), so mobile LCP is slightly higher than the old minimal page, but detail-page TBT fell from 490 ms to 0, layout shift from 0.098 to 0, and accessibility reached 100 on every page. The numbers were bad (perf ~71, LCP ~5 s) until Phase 5 found and fixed: **no gzip on the static server** (610 kB transferred for the login page, now ~190 kB), and the whole signed-in shell shipping in the entry bundle (112 kB -> 76 kB gzip).

### Deviations from the plan, and what Phase 5 found
- **Native `<select>` and checkboxes** instead of Radix Select/Checkbox (simpler, better on phones).
- **Assign episodes is always a sheet** (bottom sheet on phones, side panel on desktop), not inline on desktop: one implementation, keeps the request visible behind it.
- **Command palette and chart** as planned; the chart is plain elements, weekly buckets above 45 days.
- **Real defects found by tests or measurement, all fixed:** session-expiry left the UI on a dead session (`queryClient.clear()` detaches observers; fixed with `resetSession()`); focus was lost to `<body>` after closing a dialog opened by a click that did not focus its button (fixed with `useFocusReturn`); duplicate `aria-describedby` ids on the Users page (axe only reports these as "needs review", so there is now an explicit unique-id test); a 21 px back link; the sticky assign footer floating above the sheet's bottom edge; no response compression; shell and toaster in the entry bundle.
- **Found later, with real device emulation (Chrome, 390 px):** every request page with episodes was 244-316 px wider than a phone, for two reasons: a grid column that could not shrink below its table's width (fixed with `grid-cols-1` and `min-w-0`), and a visually-hidden `sr-only` label inside the table's scroll container that was positioned against the page (fixed with `position: relative` on the container). Episodes now render as compact rows on phones. After the fixes, a script measuring `scrollWidth` on every page at 390 px (13 routes, three roles) reports 0 overflow, and axe in real Chrome reports 0 violations in desktop-light and mobile-dark.
- **Mutation checks:** 9 deliberate breakages of UI rules (confirmation removed, role guard opened, bad-quality selectable, self-protection removed, optimistic update/rollback removed, staff column leaked to clients, 401 handling removed, focus return removed, duplicate ids) are each caught by the test-suite (67 tests).

## 10. Risks

| Risk | Mitigation |
|---|---|
| Scope creep and a deadline tomorrow | Priorities above; P0-P1 first and shippable on their own; P3 is cut first |
| Bundle growth | Budget, lazy routes, named icon imports, `cmdk` and chart lazy, measure each phase |
| Regressions in a working app | Section 7; tests before deletion; manual regression; merge only when green |
| Defending every line live | Small components, no clever abstractions, copy-paste-style UI kit with readable code, decisions documented |
| New majors (react-router 8, vitest 5) | Exact pins, tests, fallback router noted |
