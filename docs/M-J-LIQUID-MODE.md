# M-J — Liquid Mode (QuickLiquid optical-refraction theme)
#project/comfyui-video-ui #roadmap/m-j-liquid-mode #polish/theming #quickliquid

> Status: **PLANNED** (post-MVP) · Approved by Gui 2026-09-14 · Non-essential polish
> Vendor: github.com/amarnath3003/quickLiquid (MIT, ★128, active Jun 2026 – Sep 2026)

## Vision (Gui)
A third display mode alongside Dark/Light: **Liquid mode** — real optical refraction bending
the actual pixels behind UI elements (genuine Apple-style depth, not blur+transparency fakery).
Opt-in, user can disable if distracting. Differentiates the app; polished and unique.

## What QuickLiquid is
WebGL shader engine computing real optical refraction through curved surfaces. SVG refraction
with CSS-only fallback; adapts tint/lighting/shadow for light and dark backdrops; exports the
glass engine + reusable animation primitives. Source: githubsignals reel (945 likes, Sept 12).

## Scope (deliberately small — anti-slop R-10 dose cap)
- Liquid mode = dark base + liquid-glass accents on **1-2 hero surfaces ONLY**: the
  export-complete celebration overlay + preview panel edge. NOT app-wide glass.
- Purpose statement (anti-slop R-31, required): *"depth cue for the completed-render moment —
  the reward frame."* Cite R-10 in the PR.
- Theme switcher gains: Dark / Light / **Liquid** (Liquid = dark base + glass accents).

## Preparations (cheap, do anytime)
- [ ] Confirm CSS theme variables are a single source (tokens file) so a third theme is a
  data change, not a refactor.
- [ ] Vendor plan: copy quickLiquid source into `frontend/src/vendor/` with attribution in
  THIRD-PARTY notices at implementation time (pin source, don't npm-install).
- [ ] GPU note: WebGL shader per glass element — negligible next to ComfyUI renders, but
  document that they don't compete for VRAM (frontend compositing only).
- [ ] Fallback: CSS-only mode for weak GPUs (library ships it — keep the toggle).

## Implementation sketch (post-MVP)
1. `theme: 'dark' | 'light' | 'liquid'` in the settings store (persisted like other settings).
2. Vendor quickLiquid; wrap in `<LiquidGlass>` with WebGL feature-detect (else flat dark).
3. Apply to export-complete overlay + preview panel header only.
4. Anti-slop PR: purpose statement + R-10 citation.

## References
- Repo: github.com/amarnath3003/quickLiquid (MIT) · Reel: instagram.com/reel/DdNATzSAur2
- Archive: ig-ddnatzsaur2-quickliquid · Roadmap: docs/ROADMAP.md § M-J
- Theme gate: antislop-core skill (R-10 glassmorphism, R-01 gradients)