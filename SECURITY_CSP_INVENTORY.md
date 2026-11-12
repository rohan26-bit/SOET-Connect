# Content Security Policy Dependency Inventory

**Production baseline:** `main` at commit `9b7dcd42c1a2bf1c889aa6c55c0d028723ab8979` (2026-11-11)  
**Scope:** Next.js App Router frontend, browser-facing API usage, public image delivery, and production HTML/API responses.  
**Validation branch:** `security/csp-report-only-mainline` at commit `353e42553dadf888f68d09a5743be052856523bc`  
**Status:** A nonce-based, preview-only `Content-Security-Policy-Report-Only` canary is staged. Production does not receive a CSP header.

## Findings

| Resource class | Observed dependency | CSP implication |
| --- | --- | --- |
| Scripts | Next.js App Router chunks are served from `/_next/static/chunks/`. The rendered document also contains Next.js inline Flight/hydration scripts. | Keep `script-src` same-origin, but an enforceable strict policy needs nonce/hash handling for Next.js inline scripts. Do not add a blanket `'unsafe-inline'` or `'unsafe-eval'` without validating the production build and all routes. |
| Styles | The app stylesheet is emitted as a same-origin Next.js CSS chunk. Tailwind is compiled at build time. | Start with same-origin styles; inspect inline style attributes and framework-generated style blocks in a report-only rollout before enforcing. |
| Fonts | The root layout imports `Geist` and `Geist_Mono` via `next/font/google`. Production HTML preloads WOFF2 files from `/_next/static/media/`. | Fonts are self-hosted by Next.js at runtime; no Google Fonts runtime origin is needed in `font-src`. |
| Images | Brand/campus images are local public assets. Gallery image responses are served through same-origin `/api/gallery/{id}/image`. The current public placement record also uses a same-origin gallery image path. | `img-src 'self'` is the expected baseline. Add `data:` or `blob:` only if runtime inspection proves the UI needs them. |
| Browser API connections | The location autocomplete component uses the same-origin Next.js route `/location-suggestions`, which performs the Photon request server-side. The original `/api/location-suggestions` path was shadowed by Vercel's `/api/*` backend rewrite and returned a FastAPI 404. Other frontend API calls use same-origin `/api` routes. | The browser does not need Photon in `connect-src`; the same-origin `/location-suggestions` route performs geocoding server-side. |
| Backend / database | The frontend uses same-origin `/api` paths; Next.js rewrites these to the configured backend URL. Supabase database and Storage operations are performed by the backend. | Do not add Supabase or the backend origin to browser `connect-src` unless a future frontend feature starts calling them directly. |

## Production observations

The production homepage and `/api/health` both returned HTTP 200 after PR #95. Both responses included the six configured baseline headers: HSTS, nosniff, frame denial, strict-origin referrer policy, the restrictive Permissions Policy, and the cross-domain policy restriction.

The public `/api/placements` response was inspected: the current placement image URL is a relative `/api/gallery/{id}/image` path, not an external image host.

The preview route `/location-suggestions?type=city&q=Aurangabad` returned HTTP 200 with suggestions. Both `/register/student` and `/register/alumni` returned HTTP 200. The old `/api/location-suggestions` path returned the FastAPI 404 as expected after moving the handler outside the reserved backend prefix.

## Preview report-only validation (2026-11-12)

The preview deployment for commit `353e425` was exercised with Chromium/Playwright after the production deployment remained unchanged.

- Nine public routes returned HTTP 200: `/`, `/login`, `/register`, `/register/student`, `/register/alumni`, `/register/admin`, `/forgot-password`, `/gallery`, and `/gallery/placements`.
- No application CSP violations or JavaScript page errors were observed across those routes. Next.js inline Flight/hydration scripts carried nonces.
- The homepage placement marquee rendered with its animation intact after moving its CSS from a runtime-injected `styled-jsx` block into `app/globals.css`.
- The login role selector remained interactive. Student-registration city autocomplete returned HTTP 200 from the same-origin `/location-suggestions` route.
- A controlled synthetic `style-src-attr` violation was emitted by the browser and the preview-only `/csp-report` collector returned HTTP 204.
- One initial preview call to `/api/placements` returned 503; this was not reproduced. Subsequent preview checks of `/api/health`, `/api/placements`, and `/api/gallery?limit=6` returned HTTP 200. The same production endpoints returned HTTP 200 on repeated checks.

A separate role-layout pass used isolated Playwright profile mocks (not real JWTs or production accounts) to exercise 25 protected views: 9 student, 3 alumni, and 13 administrator routes, including the shared Active Sessions page. Four negative role-routing checks redirected to the expected role home pages. These views returned HTTP 200 with no CSP violations, JavaScript page errors, or 5xx responses. The profile and session/security-event endpoints were stubbed for the test; other business API calls were not authenticated, so this is a rendering/CSP check, not an end-to-end authentication or data-access acceptance test. Real signed-cookie flows and representative data operations still require a test account in a non-production environment.

## Recommended CSP rollout

1. Keep autocomplete on the same-origin `/location-suggestions` endpoint. The Next.js handler must stay outside `/api` because Vercel reserves `/api/*` for the FastAPI service.
2. Implement nonce-based CSP support for Next.js App Router inline scripts. Do not ship an enforced policy that breaks hydration, login, registration, dashboards, chat, or gallery pages.
3. Add a report-only phase and exercise every role and major route. Record actual violations before moving to enforcement.
4. Start from restrictive directives such as `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, and `form-action 'self'`; finalize script/style/image/connect directives only after report-only validation.
5. Keep production CSP changes separate from this inventory so they can be tested and rolled back independently.

## Explicit non-findings / cautions

- No third-party script or iframe dependency was identified in the application-owned source inspected for this inventory. Platform-injected deployment tooling must not be mistaken for an application dependency.
- This inventory does not prove that every authenticated route has been exercised in a real browser. A report-only phase and role-based smoke testing are required before enforcement.
- Do not use `'unsafe-eval'` in production as a shortcut. Do not use a wildcard image or connection source to accommodate unknown URLs.
