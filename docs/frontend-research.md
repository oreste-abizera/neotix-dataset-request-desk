# Frontend research

Dates: 2026-10-03. Versions and last-publish dates come from the npm registry on that day; sizes are minified+gzipped from bundlephobia (whole package, before tree-shaking) unless stated. Claims about other products come only from the cited pages.

## 1. Current state and audit

**Product.** Dataset Request Desk: clients request robot-data datasets; operators fulfil them by assigning recorded episodes (and watch per-episode export jobs); clients accept or reject; admins manage users; staff import a CSV and read analytics. Three roles, ~9 screens, live updates over SSE.

**Stack today.** React 19.3, TypeScript 5.9 (strict), Vite 8, hand-rolled hash router, one 45-line CSS file, `fetch` wrapper, `useEffect` data loading, a `refreshKey` counter to refetch after SSE events. 1,250 lines, 3 runtime deps, **no tests, no linter**, 242 kB JS (74 kB gzip), no code splitting.

**Baseline measurements** (Lighthouse 13.5, local build, authenticated via session cookie):

| Page | Perf | A11y | Best practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| Login (mobile) | 96 | 100 | 96 | 82 | 2.4 s | 0 | 0 |
| Request list (mobile) | 95 | 100 | 100 | 82 | 2.6 s | 0 | 0.028 |
| Request detail (mobile) | **80** | **96** | 100 | 82 | 2.6 s | **490 ms** | **0.098** |
| Request list (desktop) | 100 | 100 | 100 | 82 | 0.6 s | 0 | 0.011 |

Detail page fails `color-contrast`; SEO 82 = no meta description.

**Concrete weaknesses found** (by walking every screen at 375 px and desktop width):

| Area | Finding |
|---|---|
| Visual identity | No brand, no icons, default blue underlined links as navigation, no active-nav state, every card has the same weight, one type scale, ad-hoc spacing, light theme only |
| Layout and responsiveness | Header wraps into three stacked rows on phones. Tables are clipped with **no scroll affordance** (the Status column is cut off on the request list). The detail page scrolls horizontally as a whole (assignment table). Episode ids and dates wrap mid-token ("EP-" / "00153"). Only the tiny `#` id is a link in a row. Checkboxes and "Remove" text buttons are far below 24 px targets |
| Loading, empty, error | Plain "Loading…" text, no skeletons, layout shifts when data arrives (CLS 0.098). Empty states are one grey sentence with no action. Errors are inline red text with no retry. Unknown URL silently shows the list. "Request not found" has no way back |
| Feedback | No success feedback (assigning, removing, importing, deactivating). No optimistic updates. Two destructive actions (remove episode, deactivate user) happen with no confirmation; two others use blocking `window.confirm`, which cannot be styled or themed |
| Forms | HTML5 validation only, messages not tied to fields, server field errors collapse into one red string, no password visibility toggle, no field-level `aria-invalid`/`aria-describedby` |
| Accessibility | No skip link; focus is not moved on navigation and the document title never changes; `role="alert"` only on errors; tables have no captions; contrast failure on muted text; no `prefers-reduced-motion` or `prefers-color-scheme` handling |
| Operator workflow | No search; filters and pagination are lost on reload and are not shareable; selecting episodes across filters gives no feedback about what is selected; no keyboard shortcuts; no overview of "what needs my attention" |
| Analytics | Numbers and tables only: the per-day, per-robot data cries out for a chart; the 30-day grid is a wide table that overflows on phones |
| State management | Each page re-implements loading/error state; no caching, so every navigation flashes "Loading…"; no request cancellation (stale responses can overwrite newer ones); `refreshKey` prop-drilling; `any` in `describeError` |
| Code quality | No lint rules, no tests; duplicated table markup; business labels spread across files |

## 2. Domain and competitor research

Seven reference products, chosen because they are what this product's users already know: dataset/data-ops platforms (the clients and operators work in this space) and request/queue tools (the workflow is a service desk).

| Product | What it does well (cited) | Complaints or limits (cited) | Pattern we take |
|---|---|---|---|
| **Labelbox** (Catalog) | Users cite easy setup and instant access after sign-in; Catalog offers advanced metadata filters to surface data ([Labelbox blog](https://labelbox.com/blog/catalog-the-launchpad-for-managing-and-curating-unstructured-data/), [review roundup](https://www.productowl.io/mlops/labelbox)) | Occasional lag and UI glitches reported ([G2 comparison](https://www.g2.com/compare/labelbox-vs-roboflow)) | Metadata filters as first-class UI; **speed and stability beat features** |
| **Encord** | Reviewers call the UI polished and built for large teams ([comparison](https://thectoclub.com/tools/roboflow-vs-encord/)); positioned for robotics/physical AI | Pricing and enterprise weight | Dense but calm layout for operators working all day |
| **Roboflow** | Reviewers prefer it for its UI and simplicity ([G2](https://www.g2.com/products/roboflow/reviews?qs=pros-and-cons), [comparison](https://thectoclub.com/tools/roboflow-vs-encord/)) | Aimed at medium-sized projects | Clear defaults; low friction for the non-expert (our clients) |
| **Scale AI** | Handles very large projects ([comparison](https://www.labellerr.com/blog/scale-ai-vs-labellerr-vs-roboflow/)) | Called overkill and opaque for smaller teams | Keep the client view simple; keep operational complexity on the operator side |
| **Linear** | Strong hierarchy, restrained visual noise, compact density, keyboard-first, contextual panes that keep your place ([overview](https://github.com/regutierrez/traicr/issues/9), [shortcuts](https://www.shortcutfoo.com/app/dojos/linear-app-mac/cheatsheet)); `Cmd+K` command menu, `/` to filter | n/a | **Command menu, a few global shortcuts, compact list rows, peek-style detail** |
| **Jira Service Management** | Queues give agents a focused, filterable work list; configurable columns; customer portal shows request status in real time; advice to mask internal statuses from customers ([Atlassian queues](https://support.atlassian.com/jira-service-management-cloud/docs/what-are-queues/), [queue guide](https://deviniti.com/blog/customer-it-service/jira-queue-management/), [portal best practices](https://www.praecipio.com/resources/articles/jira-service-management-request-type-best-practices)) | Heavy configuration | **Queue-style request list with status filter tabs; customer-facing request page with a progress timeline** |
| **Hugging Face dataset viewer** | Paginated table (100 rows/page), column filters, search, click-a-histogram-bar to filter ([viewer docs](https://huggingface.co/docs/hub/en/datasets-viewer), [first rows](https://huggingface.co/docs/dataset-viewer/en/first_rows)) | n/a | Server-side pagination with visible totals, search, filter chips, preview of rows |

**Standard UX patterns in this space (synthesis):**
1. A **queue/list as the home screen**, with status tabs or chips and counts, search, and stateful filters.
2. **Detail view with a status timeline** (who changed what, when) and the primary action prominent.
3. **Data tables with filters, pagination, row selection and bulk actions**; metadata filters rather than free-text only.
4. **Keyboard-first operation** for power users (command menu, `?` for help).
5. **Live status** without refreshing, with a visible connection indicator.
6. **Audience-appropriate views**: customers see simple status and progress; operators see internal detail (export status).
7. **Fast and stable over feature-rich**: the most-cited complaint across these tools is lag and glitchiness.

## 3. Accessibility target: WCAG 2.2 AA

The new 2.2 criteria that affect this app ([W3C: What's new in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)):

| SC | What it means for us |
|---|---|
| 2.4.11 Focus Not Obscured (AA) | Sticky header must never hide the focused element: use `scroll-padding-top`, keep the header compact |
| 2.5.7 Dragging Movements (AA) | No drag-only interactions (the CSV import offers drag-and-drop **and** a button) |
| 2.5.8 Target Size (AA) | Every control at least 24x24 CSS px; we use 40 px (mobile) / 32 px (desktop) minimum |
| 3.3.7 Redundant Entry (A) | Filters and page live in the URL; nothing the user already typed is asked again |
| 3.3.8 Accessible Authentication (AA) | Login keeps `autocomplete` attributes and allows paste; no cognitive tests |
| 3.2.6 Consistent Help (A) | Keyboard help (`?`) is reachable from the same place on every page |

Plus: skip link, landmarks, one `h1` per page, `aria-live` regions for toasts and async status, visible focus rings, contrast >= 4.5:1 text and 3:1 UI in both themes, `prefers-reduced-motion`, `prefers-color-scheme`.

## 4. Technical decisions

Registry data (2026-10-03). "Peer" is the declared React range; all candidates support React 19.

### 4.1 Decisions

| Need | Chosen | Alternatives considered | Why |
|---|---|---|---|
| **Styling** | **Tailwind CSS 4.3** via `@tailwindcss/vite`, design tokens as CSS variables | Keep hand-written CSS; CSS Modules; Panda/vanilla-extract | v4 is CSS-first (`@theme` tokens in CSS), no config file, ~10 kB CSS output after purge, no runtime. Tokens stay plain CSS variables, so themes are a class swap. Utility classes keep components self-contained. Vite plugin supports Vite 8 |
| **Accessible primitives** | **`radix-ui` 1.6.7** (unified package, imported per primitive: Dialog/AlertDialog, DropdownMenu, Tooltip, Tabs, Select, Checkbox, Label, VisuallyHidden) | Headless UI 2.2 (63 kB gz, fewer components, last release Apr 2026); React Aria Components 1.21 (excellent a11y but a different mental model and bigger API); shadcn/ui CLI as a dependency; MUI 9 (155 kB gz + styling engine, opinionated look); build modals ourselves | Radix handles focus trapping, roving tabindex, ARIA, typeahead, collision handling, which are the parts that are easy to get wrong. Maintained (published 2026-07), tree-shakes per primitive. **shadcn/ui is used as a pattern, not a dependency**: its docs describe it as copy-paste components over Radix + Tailwind, so we write only the ~12 components we use and own them ([shadcn docs](https://ui.shadcn.com/docs)) |
| **Server state** | **TanStack Query 5.104** (13.8 kB gz) | Hand-written hooks (status quo); SWR; RTK Query; Apollo | Replaces three problems at once: loading/error state per page, caching (no "Loading…" flash when navigating back), and **SSE-driven refetch via `invalidateQueries`** instead of the `refreshKey` hack. Request dedupe, cancellation, retries, and the mutation lifecycle that makes optimistic updates with rollback straightforward ([TanStack docs](https://tanstack.com/query/latest/docs/framework/react/overview)). v5 is the current major |
| **Routing** | **react-router 8.4** (declarative mode, `BrowserRouter`) | TanStack Router; keep the hash router; wouter | Real URLs (`/requests/12`), nested layouts, `NavLink` active state, `useSearchParams` to keep filters/pagination in the URL (WCAG 3.3.7, shareable links, back button works), `React.lazy` pages. Needs React >= 19.2.7 (we have 19.3). 60 kB gz is the whole package; we measure the real tree-shaken cost in the plan and have a fallback. nginx already serves `index.html` for unknown paths, so no server change |
| **Forms** | **React Hook Form 7.89** (14.8 kB) with its built-in rules | RHF + Zod 4 (zod 88.6 kB gz before tree-shaking); Formik; native only | Forms are small (login, new request, create user, filters). RHF gives field-level state, `aria-invalid` wiring, focus-first-error, and cheap re-renders. **Zod is deliberately not added**: the server is the source of truth for validation and the client rules are 5-6 trivial constraints. We map server `validation_error` details onto fields instead. Revisit if forms grow |
| **Icons** | **lucide-react** (named imports, tree-shaken, about 0.5-1 kB per icon) | Heroicons; Phosphor; Radix Icons; inline SVG | Largest consistent set, actively published (2026-10-03), shadcn default. Whole package is 194 kB gz so we **only ever import named icons** and verify in the bundle report |
| **Toasts** | **sonner 2.0.8** (9.4 kB) | Radix Toast; react-hot-toast; react-toastify | Accessible live region, stacking, promise toasts, undo action, small; works in a React 19 tree |
| **Command menu** | **cmdk 1.1.1** (14.9 kB), **lazy-loaded** on first open | Hand-built palette; kbar | Standard in this space (Linear's `Cmd+K`). Last published Aug 2025 but it is stable and tiny; lazy loading keeps it out of the initial bundle |
| **Animation** | **CSS transitions/keyframes only**, gated by `prefers-reduced-motion` | Motion 14 (47.6 kB gz); Auto-animate; GSAP | The app needs fades, a slide-over, skeleton shimmer and a progress sweep, all of which CSS does with zero JS. Motion would add about half the current bundle for little gain |
| **Tables** | **Semantic `<table>` + our own `DataTable` styles**; server-side pagination | TanStack Table 9 (31.8 kB); AG Grid; MUI DataGrid | Sorting/filtering/pagination are server-side; the client would only render rows. A headless table adds weight and an abstraction we do not need |
| **Charts** | **Hand-written accessible SVG** (bar chart with a `<table>` fallback) | Recharts 3.10 (151 kB gz); visx; Chart.js; uPlot | One chart type (stacked daily bars per robot). 150 kB for that is unjustified; SVG with `role="img"`, a text summary and an expandable data table is fully accessible |
| **Dates** | **`Intl.DateTimeFormat` / `Intl.RelativeTimeFormat`** | date-fns 4.4 (17.5 kB); dayjs | Zero bytes; locale-correct; all we need is "3 Oct, 18:20" and "2 hours ago" |
| **i18n** | **None; all UI strings in one `copy.ts`** | react-i18next; Lingui | Single-language internal tool. Centralised strings keep a later move to i18n mechanical |
| **Fonts** | **Inter variable, self-hosted** via `@fontsource-variable/inter` (latin subset loaded by unicode-range), `font-display: swap`, system-font fallback | System font stack only; Google Fonts CDN | Consistent identity without a third-party request; falls back to the system stack instantly. Verified against LCP in the plan; if it regresses we revert to the system stack |
| **Theme** | Own 30-line hook: `light` / `dark` / `system`, stored in `localStorage`, applied by an inline script before paint | next-themes | No flash of wrong theme, no dependency |
| **Lint** | **ESLint 9.39** + `typescript-eslint` 8.71 + `eslint-plugin-react-hooks` 7.1 + `eslint-plugin-jsx-a11y` 6.10 | ESLint 10 (jsx-a11y peer range stops at ESLint 9); Biome | Static a11y rules catch missing labels and bad roles before runtime. `jsx-a11y` was last published Oct 2024 and only declares ESLint <= 9, so we stay on ESLint 9 and back it with runtime axe checks |
| **Format** | **Prettier 3.9** | none | Consistent diffs; trivial |
| **Unit/component tests** | **Vitest 5.0 + Testing Library 16 + user-event 14 + jest-dom 7 + jsdom 30** | Jest; Playwright component tests; Cypress | Same Vite pipeline as the app; Vitest 5 supports Vite 8; Testing Library is the standard for behaviour-level tests |
| **Runtime a11y checks** | **`axe-core` 4.13** called from a 10-line test helper, plus Lighthouse, plus a manual keyboard pass | `vitest-axe` 0.1.0 (last published Jan 2025) | `axe-core` is actively maintained (published 2026-10-02); the wrapper is trivial, so we avoid a stale dependency |

### 4.2 Considered and rejected, in one line each
- **MUI / Chakra / Mantine:** large, own styling runtimes, strong default look that is hard to make feel bespoke, and heavy for a tool whose brief says "keep it small".
- **shadcn CLI:** needs interactive setup; we copy the patterns by hand and keep only what is used.
- **Zustand/Redux:** there is no meaningful client state; server state is in Query, UI state is local or in the URL.
- **Storybook:** valuable for a design-system team; here the cost exceeds the value. Component tests plus a `/dev/kitchen-sink` route is not added either; the app itself is the catalogue.

### 4.3 Risks recorded
- `eslint-plugin-jsx-a11y` and `cmdk` are slow-moving. Mitigation: they are build-time / lazy-loaded; runtime axe tests and Lighthouse back the lint rules.
- `react-router` 8 and `vitest` 5 are new majors. Mitigation: pinned exact versions, covered by tests; fallback for routing is a ~40-line custom router.
- Bundle growth vs. "keep it small". Mitigation: explicit budget in the plan (initial JS <= 120 kB gz, every page lazy), measured after each phase.

## 5. Sources
Labelbox: [catalog blog](https://labelbox.com/blog/catalog-the-launchpad-for-managing-and-curating-unstructured-data/), [review](https://www.productowl.io/mlops/labelbox), [G2 comparison](https://www.g2.com/compare/labelbox-vs-roboflow) · Encord/Roboflow/Scale: [CTO Club](https://thectoclub.com/tools/roboflow-vs-encord/), [G2 Roboflow](https://www.g2.com/products/roboflow/reviews?qs=pros-and-cons), [Labellerr](https://www.labellerr.com/blog/scale-ai-vs-labellerr-vs-roboflow/) · Linear: [design summary](https://github.com/regutierrez/traicr/issues/9), [shortcuts](https://www.shortcutfoo.com/app/dojos/linear-app-mac/cheatsheet), [Linear docs](https://linear.app/docs/board-layout) · Jira Service Management: [queues](https://support.atlassian.com/jira-service-management-cloud/docs/what-are-queues/), [queue guide](https://deviniti.com/blog/customer-it-service/jira-queue-management/), [request types](https://www.praecipio.com/resources/articles/jira-service-management-request-type-best-practices) · Hugging Face: [Data Studio](https://huggingface.co/docs/hub/en/datasets-viewer), [first rows](https://huggingface.co/docs/dataset-viewer/en/first_rows) · [WCAG 2.2 what's new](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) · [shadcn/ui docs](https://ui.shadcn.com/docs) · [TanStack Query overview](https://tanstack.com/query/latest/docs/framework/react/overview) · npm registry and [bundlephobia](https://bundlephobia.com) for versions and sizes.
