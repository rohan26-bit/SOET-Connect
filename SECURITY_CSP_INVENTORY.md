# Content Security Policy Dependency Inventory

**Audited against:** `main` at commit `d22ab595565f9cc6166e236f6a4f19332c1ffc34` (2026-11-10)  
**Scope:** Next.js App Router frontend, browser-facing API usage, public image delivery, and production HTML/API responses.  
**Status:** Inventory only. No Content-Security-Policy header is enabled by this change.

## Findings

| Resource class | Observed dependency | CSP implication |
| --- | --- | --- |
| Scripts | Next.js App Router chunks are served from `/_next/static/chunks/`. The rendered document also contains Next.js inline Flight/hydration scripts. | Keep `script-src` same-origin, but an enforceable strict policy needs nonce/hash handling for Next.js inline scripts. Do not add a blanket `'unsafe-inline'` or `'unsafe-eval'` without validating the production build and all routes. |
| Styles | The app stylesheet is emitted as a same-origin Next.js CSS chunk. Tailwind is compiled at build time. | Start with same-origin styles; inspect inline style attributes and framework-generated style blocks in a report-only rollout before enforcing. |
| Fonts | The root layout imports `Geist` and `Geist_Mono` via `next/font/google`. Production HTML preloads WOFF2 files from `/_next/static/media/`. | Fonts are self-hosted by Next.js at runtime; no Google Fonts runtime origin is needed in `font-src`. |
| Images | Brand/campus images are local public assets. Gallery image responses are served through same-origin `/api/gallery/{id}/image`. The current public placement record also uses a same-origin gallery image path. | `img-src 'self'` is the expected baseline. Add `data:` or `blob:` only if runtime inspection proves the UI needs them. |
| Browser API connections | The location autocomplete component directly requests `https://photon.komoot.io/api/`. It also has a same-origin fallback at `/api/location-suggestions`. Other frontend API calls use same-origin `/api` routes. | A CSP preserving the current direct geocoding call needs `https://photon.komoot.io` in `connect-src`. Autocomplete is being moved to the same-origin `/location-suggestions` route, which performs the Photon request server-side and removes the third-party browser connection. |
| Backend / database | The frontend uses same-origin `/api` paths; Next.js rewrites these to the configured backend URL. Supabase database and Storage operations are performed by the backend. | Do not add Supabase or the backend origin to browser `connect-src` unless a future frontend feature starts calling them directly. |

## Production observations

The production homepage and `/api/health` both returned HTTP 200 after PR #95. Both responses included the six configured baseline headers: HSTS, nosniff, frame denial, strict-origin referrer policy, the restrictive Permissions Policy, and the cross-domain policy restriction.

The public `/api/placements` response was inspected: the current placement image URL is a relative `/api/gallery/{id}/image` path, not an external image host.

The updated preview route `/location-suggestions?type=city&q=Aurangabad` returned HTTP 200 with suggestions. Both `/register/student` and `/register/alumni` returned HTTP 200. The old `/api/location-suggestions` path correctly remains unavailable because Vercel reserves `/api/*` for the FastAPI service.

## Recommended CSP rollout

1. Remove the direct Photon browser request and use the same-origin `/location-suggestions` endpoint for autocomplete. The former `/api/location-suggestions` path was intercepted by Vercel's `/api/*` backend rewrite, so the Next.js route must live outside `/api`.
2. Implement nonce-based CSP support for Next.js App Router inline scripts. Do not ship an enforced policy that breaks hydration, login, registration, dashboards, chat, or gallery pages.
3. Add a report-only phase and exercise every role and major route. Record actual violations before moving to enforcement.
4. Start from restrictive directives such as `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, and `form-action 'self'`; finalize script/style/image/connect directives only after report-only validation.
5. Keep production CSP changes separate from this inventory so they can be tested and rolled back independently.

## Explicit non-findings / cautions

- No third-party script or iframe dependency was identified in the application-owned source inspected for this inventory. Platform-injected deployment tooling must not be mistaken for an application dependency.
- This inventory does not prove that every authenticated route has been exercised in a real browser. A report-only phase and role-based smoke testing are required before enforcement.
- Do not use `'unsafe-eval'` in production as a shortcut. Do not use a wildcard image or connection source to accommodate unknown URLs.
