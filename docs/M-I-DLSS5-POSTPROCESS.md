# M-I — DLSS 5 Neural Post-Process (render enhancer)
#project/comfyui-video-ui #roadmap/m-i-dlss5 #dlss5 #postprocess #nvidia-only

> Status: **INSTALLED + SELFTEST PASSED** (2026-09-14) · Approved by Gui 2026-09-14
> Node pack installed on the workstation; UI integration pending (after M-C ships).

## What it is
DLSS 5 neural rendering (NGX feature 18) as a POST-PROCESSING step over rendered video/images —
real material reconstruction (skin subsurface, hair light transmission, fabric) + optional 1.5x-3x
upscaling. Frames go to NVIDIA's native renderer and come back reconstructed (not a filter).

## Architecture (verified working)
ComfyUI node (Blueforcer/ComfyUI-DLSS5-Enhancer, MIT) speaks a binary protocol to a native
D3D12 worker (ReShade carrier → RenoDX DLSS5 add-on → NGX feature 18) from
Merserk/dlss5-visual-enhancer. Optical flow (OpenCV DIS) estimates motion vectors per frame;
auto history resets on scene cuts. **No game hooks** — the worker owns its own D3D12 session,
which is why the POOLS in-game driver fault does NOT apply here.

## Install state (this workstation, RTX 5070 Ti, driver 616.92)
- Node pack: C:\ComfyUI_Portable\ComfyUI\custom_nodes\ComfyUI-DLSS5-Enhancer (git clone)
- Runtime: C:\Users\Guilherme\Documents\ComfyUI\dlss5-runtime (flat layout from official
  Merserk 3.0 zip — 467MB; dlssnr sha 6EB209E764F3)
- ffmpeg: C:\Users\Guilherme\Documents\ComfyUI\ffmpeg\bin
- Config: custom_nodes\ComfyUI-DLSS5-Enhancer\config.json (runtime_dir + ffmpeg_dir)
- Deps: opencv-contrib-python 5.0.0 in the Documents ComfyUI venv
- **Selftest PASSED**: feature 18 verified, inline evaluation succeeded (512x512, 5 frames)
- Standalone app also installed: hermes\projects\dlss5-visual-enhancer (app.py + bin)

## Hardware answer (Gui's question)
**NVIDIA ONLY**: RTX 30/40/50 (RTX 20 refused; AMD/Intel unsupported — proprietary NGX).
The UI step must GPU-detect and gray out with an explanatory note on non-NVIDIA hardware
(same pattern as other hardware-gated features in the app).

## Sub-features
- **I-1**: render output → "Enhance with DLSS 5" opt-in step in export flow. One worker per
  render; prefer one long batch. Output caps: 7680px long edge / 4320px short edge.
- **I-2**: non-NVIDIA fallback — SeedVR2/Real-ESRGAN upscale nodes as the equivalent step,
  clearly labeled for non-NVIDIA hardware.
- **I-3**: upscale tiers — 0.2MP draft → 2x finish (pairs with M-A reference-sheet entry;
  from the MiniMax H3 tutorial, yt-fjweg8so8y0).

## Gotchas (each cost a cycle — see dlss5-modding skill)
- Runtime layout must be FLAT (worker = nvngx.dll at root; old {host,dlss,dlssnr}/ layout
  fails Win32 126). Official 3.0 zip ships flat — download it rather than hand-reconstructing.
- install_runtime.py prompts y/N — pipe 'y\n' non-interactively.
- ffmpeg resolves: DLSS5_FFMPEG_DIR > config ffmpeg_dir > node-dir/ffmpeg/bin >
  runtime_root.parent/ffmpeg/bin > PATH.
- Video node: one worker at a time; HDR clips without tone-mapping; MKV/WebM trigger an
  ffprobe counting pass (queue looks idle).

## References
- Nodes: github.com/Blueforcer/ComfyUI-DLSS5-Enhancer (MIT) · Tutorial: youtu.be/hIICmGr-J38
- Runtime upstream: github.com/Merserk/dlss5-visual-enhancer (installed locally)
- Compatibility matrix: github.com/jlrouzies-fr/DLSS5-Feeder README (driver × consumer table)
- Archive: yt-hiicmgr-j38 · Roadmap: docs/ROADMAP.md § M-I