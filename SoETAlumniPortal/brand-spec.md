# Brand spec — Alumni Portal for SOET

**System:** Fluent university career network — LinkedIn density + Internshala clarity + Microsoft Fluent surfaces. Primary blue for navigation and CTAs; green reserved for success/verified states only.

## Tokens (OKLch)

```css
:root {
  --bg: oklch(0.985 0.004 250);
  --surface: oklch(1 0 0);
  --fg: oklch(0.22 0.035 265);
  --muted: oklch(0.52 0.025 260);
  --border: oklch(0.90 0.012 260);
  --accent: oklch(0.55 0.19 255); /* #2563EB primary */
  --secondary: oklch(0.21 0.04 265); /* #0F172A */
  --success: oklch(0.70 0.17 149); /* #22C55E accent */
  --warn: oklch(0.78 0.14 75);
  --danger: oklch(0.58 0.20 25);
  --font-display: "Segoe UI", "Inter", system-ui, sans-serif;
  --font-body: "Segoe UI", "Inter", system-ui, sans-serif;
  --font-mono: "Cascadia Code", "SF Mono", ui-monospace, monospace;
}
```

## Hex anchors (from brief)

| Role | Hex |
|------|-----|
| Primary | `#2563EB` |
| Secondary | `#0F172A` |
| Success / verified | `#22C55E` |
| Background | `#FAFBFC` → white surfaces |

## Posture rules

1. **One primary CTA per view** in blue; green only for verified badges, success toasts, and positive metrics.
2. **Fluent elevation** — soft rest shadows, 1px borders, 8–12px radii; no purple gradients.
3. **Dense but breathable** — dashboard cards use tight grids; marketing pages get more whitespace.
4. **Type** — Segoe/Inter stack; UI labels medium weight + slight tracking; display headlines tight tracking.
5. **Dark mode** — secondary slate as chrome; surfaces lift with translucent white borders.
