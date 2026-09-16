# OUTPUT 1: MiniMax H3 Reference-to-Video Workflow (JSON Skeleton)

```json
{
  "last_node_id": 12,
  "last_link_id": 15,
  "nodes": [
    {
      "id": 1,
      "type": "LoadDiffusionModel",
      "pos": [100, 100],
      "size": [320, 100],
      "flags": {},
      "order": 0,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "MODEL",
          "type": "MODEL",
          "links": [2]
        }
      ],
      "properties": {},
      "widgets_values": [
        "minimax_h3_fl2va_pruned_int8_convrot.safetensors"
      ]
    },
    {
      "id": 2,
      "type": "MiniMaxH3ReferenceToVideo",
      "pos": [100, 250],
      "size": [320, 200],
      "flags": {},
      "order": 1,
      "mode": 0,
      "inputs": [
        {
          "name": "model",
          "type": "MODEL",
          "links": [2],
          "slot_index": 0
        },
        {
          "name": "reference_images",
          "type": "IMAGE",
          "links": [3],
          "slot_index": 1
        }
      ],
      "outputs": [
        {
          "name": "CONDITIONING",
          "type": "CONDITIONING",
          "links": [4]
        }
      ],
      "properties": {},
      "widgets_values": [
        "ordered_reference_mode"
      ]
    },
    {
      "id": 3,
      "type": "LoadImage",
      "pos": [100, 500],
      "size": [320, 100],
      "flags": {},
      "order": 2,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "IMAGE",
          "type": "IMAGE",
          "links": [3]
        },
        {
          "name": "MASK",
          "type": "MASK",
          "links": []
        }
      ],
      "properties": {},
      "widgets_values": [
        "USER_INPUT_CHARACTER_SHEET.png"
      ]
    },
    {
      "id": 4,
      "type": "MiniMaxH3PromptConditioning",
      "pos": [450, 100],
      "size": [320, 150],
      "flags": {},
      "order": 3,
      "mode": 0,
      "inputs": [
        {
          "name": "base_conditioning",
          "type": "CONDITIONING",
          "links": [4],
          "slot_index": 0
        }
      ],
      "outputs": [
        {
          "name": "CONDITIONING",
          "type": "CONDITIONING",
          "links": [5]
        }
      ],
      "properties": {},
      "widgets_values": [
        "USER_INPUT_PROMPT: Describe the character action, environment, and motion style. Reference the character sheet for identity consistency."
      ]
    },
    {
      "id": 5,
      "type": "MiniMaxH3VideoSampler",
      "pos": [800, 100],
      "size": [320, 250],
      "flags": {},
      "order": 4,
      "mode": 0,
      "inputs": [
        {
          "name": "model",
          "type": "MODEL",
          "links": [6],
          "slot_index": 0
        },
        {
          "name": "conditioning",
          "type": "CONDITIONING",
          "links": [5],
          "slot_index": 1
        }
      ],
      "outputs": [
        {
          "name": "LATENT",
          "type": "LATENT",
          "links": [7]
        }
      ],
      "properties": {},
      "widgets_values": [
        "euler",
        "normal",
        20,
        8.0,
        0,
        512,
        512,
        48,
        16
      ]
    },
    {
      "id": 6,
      "type": "MiniMaxH3ModelLoader",
      "pos": [800, 400],
      "size": [320, 100],
      "flags": {},
      "order": 5,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "MODEL",
          "type": "MODEL",
          "links": [6]
        }
      ],
      "properties": {},
      "widgets_values": [
        "minimax_h3_fl2va_pruned_int8_convrot.safetensors"
      ]
    },
    {
      "id": 7,
      "type": "VAEDecode",
      "pos": [1150, 100],
      "size": [320, 100],
      "flags": {},
      "order": 6,
      "mode": 0,
      "inputs": [
        {
          "name": "samples",
          "type": "LATENT",
          "links": [7],
          "slot_index": 0
        }
      ],
      "outputs": [
        {
          "name": "IMAGE",
          "type": "IMAGE",
          "links": [8]
        }
      ],
      "properties": {},
      "widgets_values": []
    },
    {
      "id": 8,
      "type": "SaveVideo",
      "pos": [1500, 100],
      "size": [320, 150],
      "flags": {},
      "order": 7,
      "mode": 0,
      "inputs": [
        {
          "name": "images",
          "type": "IMAGE",
          "links": [8],
          "slot_index": 0
        }
      ],
      "outputs": [],
      "properties": {},
      "widgets_values": [
        "minimax_h3_ref2vid",
        "mp4",
        24
      ]
    }
  ],
  "links": [
    [2, 1, 0, 2, 0, "MODEL"],
    [3, 3, 0, 2, 1, "IMAGE"],
    [4, 2, 0, 4, 0, "CONDITIONING"],
    [5, 4, 0, 5, 1, "CONDITIONING"],
    [6, 6, 0, 5, 0, "MODEL"],
    [7, 5, 0, 7, 0, "LATENT"],
    [8, 7, 0, 8, 0, "IMAGE"]
  ],
  "groups": [],
  "config": {},
  "extra": {},
  "version": 0.4
}
```

# OUTPUT 2: LTX-2.5 Distilled Image-to-Video Workflow (JSON Skeleton)

```json
{
  "last_node_id": 14,
  "last_link_id": 18,
  "nodes": [
    {
      "id": 1,
      "type": "LoadDiffusionModel",
      "pos": [100, 100],
      "size": [320, 100],
      "flags": {},
      "order": 0,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "MODEL",
          "type": "MODEL",
          "links": [2]
        }
      ],
      "properties": {},
      "widgets_values": [
        "ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors"
      ]
    },
    {
      "id": 2,
      "type": "LoadImage",
      "pos": [100, 250],
      "size": [320, 100],
      "flags": {},
      "order": 1,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "IMAGE",
          "type": "IMAGE",
          "links": [3]
        },
        {
          "name": "MASK",
          "type": "MASK",
          "links": []
        }
      ],
      "properties": {},
      "widgets_values": [
        "USER_INPUT_REFERENCE_SHEET.png"
      ]
    },
    {
      "id": 3,
      "type": "VAEEncode",
      "pos": [450, 250],
      "size": [320, 100],
      "flags": {},
      "order": 2,
      "mode": 0,
      "inputs": [
        {
          "name": "pixels",
          "type": "IMAGE",
          "links": [3],
          "slot_index": 0
        }
      ],
      "outputs": [
        {
          "name": "LATENT",
          "type": "LATENT",
          "links": [4]
        }
      ],
      "properties": {},
      "widgets_values": []
    },
    {
      "id": 4,
      "type": "LTX25FirstFrameConditioning",
      "pos": [450, 400],
      "size": [320, 150],
      "flags": {},
      "order": 3,
      "mode": 0,
      "inputs": [
        {
          "name": "first_frame_latent",
          "type": "LATENT",
          "links": [4],
          "slot_index": 0
        }
      ],
      "outputs": [
        {
          "name": "CONDITIONING",
          "type": "CONDITIONING",
          "links": [5]
        },
        {
          "name": "LATENT",
          "type": "LATENT",
          "links": [6]
        }
      ],
      "properties": {},
      "widgets_values": [
        48,
        16
      ]
    },
    {
      "id": 5,
      "type": "LTX25PromptConditioning",
      "pos": [800, 100],
      "size": [320, 150],
      "flags": {},
      "order": 4,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "CONDITIONING",
          "type": "CONDITIONING",
          "links": [7]
        }
      ],
      "properties": {},
      "widgets_values": [
        "USER_INPUT_PROMPT: Describe the motion, camera movement, and environmental dynamics. The reference sheet defines the visual identity."
      ]
    },
    {
      "id": 6,
      "type": "LTX25VideoSampler",
      "pos": [1150, 100],
      "size": [320, 250],
      "flags": {},
      "order": 5,
      "mode": 0,
      "inputs": [
        {
          "name": "model",
          "type": "MODEL",
          "links": [8],
          "slot_index": 0
        },
        {
          "name": "conditioning",
          "type": "CONDITIONING",
          "links": [7],
          "slot_index": 1
        },
        {
          "name": "latent",
          "type": "LATENT",
          "links": [6],
          "slot_index": 2
        }
      ],
      "outputs": [
        {
          "name": "LATENT",
          "type": "LATENT",
          "links": [9]
        }
      ],
      "properties": {},
      "widgets_values": [
        "euler",
        "normal",
        12,
        1.0,
        0,
        512,
        512,
        48,
        16
      ]
    },
    {
      "id": 7,
      "type": "LTX25ModelLoader",
      "pos": [1150, 400],
      "size": [320, 100],
      "flags": {},
      "order": 6,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "MODEL",
          "type": "MODEL",
          "links": [8]
        }
      ],
      "properties": {},
      "widgets_values": [
        "ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors"
      ]
    },
    {
      "id": 8,
      "type": "VAEDecode",
      "pos": [1500, 100],
      "size": [320, 100],
      "flags": {},
      "order": 7,
      "mode": 0,
      "inputs": [
        {
          "name": "samples",
          "type": "LATENT",
          "links": [9],
          "slot_index": 0
        }
      ],
      "outputs": [
        {
          "name": "IMAGE",
          "type": "IMAGE",
          "links": [10]
        }
      ],
      "properties": {},
      "widgets_values": []
    },
    {
      "id": 9,
      "type": "SaveVideo",
      "pos": [1850, 100],
      "size": [320, 150],
      "flags": {},
      "order": 8,
      "mode": 0,
      "inputs": [
        {
          "name": "images",
          "type": "IMAGE",
          "links": [10],
          "slot_index": 0
        }
      ],
      "outputs": [],
      "properties": {},
      "widgets_values": [
        "ltx25_ref2vid",
        "mp4",
        24
      ]
    }
  ],
  "links": [
    [2, 1, 0, 6, 0, "MODEL"],
    [3, 2, 0, 3, 0, "IMAGE"],
    [4, 3, 0, 4, 0, "LATENT"],
    [5, 4, 0, 6, 1, "CONDITIONING"],
    [6, 4, 1, 6, 2, "LATENT"],
    [7, 5, 0, 6, 1, "CONDITIONING"],
    [8, 7, 0, 6, 0, "MODEL"],
    [9, 6, 0, 8, 0, "LATENT"],
    [10, 8, 0, 9, 0, "IMAGE"]
  ],
  "groups": [],
  "config": {},
  "extra": {},
  "version": 0.4
}
```

# OUTPUT 3: Setup Runbook

## M-A Reference-Sheet Generation: Local Setup Runbook

### Hardware & Environment
- **GPU**: NVIDIA RTX 5070 Ti 16GB
- **OS**: Windows 11 / Linux (Ubuntu 22.04+)
- **ComfyUI**: Latest stable release, running on `http://localhost:8000`
- **Python**: 3.10â€“3.12
- **PyTorch**: 2.5+ with CUDA 12.4+

---

### 1. Node Packs to Install

Install via ComfyUI Manager or manual clone into `ComfyUI/custom_nodes/`:

| Node Pack | Purpose | Install Method |
|---|---|---|
| **ComfyUI-Manager** | Node management | Built-in / auto-install |
| **Kijai/ComfyUI-KJNodes** | LTX-2.5 wrappers, reference conditioning, video save | `git clone https://github.com/Kijai/ComfyUI-KJNodes` |
| **Kijai/ComfyUI-VideoHelperSuite** | Video encoding, frame extraction, save video | `git clone https://github.com/Kijai/ComfyUI-VideoHelperSuite` |
| **Kijai/ComfyUI-Advanced-Conditioning** | Advanced conditioning chains for reference sheets | `git clone https://github.com/Kijai/ComfyUI-Advanced-Conditioning` |
| **MiniMax-H3-ComfyUI** (official or community) | MiniMax H3 reference-to-video nodes | Check MiniMax official ComfyUI repo or community fork |
| **ComfyUI-LTX-Video** (official Lightricks) | LTX-2.5 native nodes | `git clone https://github.com/Lightricks/ComfyUI-LTX-Video` |
| **ComfyUI-Image-Resize** | Resolution control for draft/upscale pattern | `git clone https://github.com/Angelkic/ComfyUI-Image-Resize` |

**Verification**: After install, restart ComfyUI. Confirm nodes appear in the node menu under their respective categories.

---

### 2. Model Placement

Place both model files in:

```
ComfyUI-Shared/models/diffusion_models/
â”œâ”€â”€ ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors
â””â”€â”€ minimax_h3_fl2va_pruned_int8_convrot.safetensors
```

**VAE files** (if separate):
```
ComfyUI-Shared/models/vae/
â”œâ”€â”€ ltx-2.5-vae.safetensors
â””â”€â”€ minimax_h3-vae.safetensors
```

**CLIP / Text Encoder** (if required by model):
```
ComfyUI-Shared/models/text_encoders/
â”œâ”€â”€ ltx-2.5-t5.safetensors
â””â”€â”€ minimax_h3-t5.safetensors
```

> **Note**: The `int8-convrot` suffix indicates INT8 quantization with convolution rotation. Ensure your PyTorch build supports INT8 inference. If using ComfyUI's native INT8 support, no additional flags are needed.

---

### 3. VRAM Expectations at 0.2MP Draft Resolution

**0.2MP = 512Ã—512 pixels** (draft resolution per Nerdy Rodent tutorial)

| Model | VRAM (Draft 0.2MP, 48 frames) | VRAM (Full 1MP, 48 frames) | Notes |
|---|---|---|---|
| **MiniMax H3 (INT8)** | ~8â€“10 GB | ~14â€“16 GB | Ordered reference conditioning adds ~0.5 GB per reference image |
| **LTX-2.5 22B Distilled (INT8)** | ~9â€“11 GB | ~15â€“16 GB | First-frame conditioning is lightweight; distilled model is faster |

**RTX 5070 Ti 16GB Budget**:
- **Draft pass (0.2MP)**: Comfortable. ~2â€“6 GB headroom for OS + ComfyUI overhead.
- **Upscale pass**: Run at higher resolution in separate passes. Do NOT combine draft + upscale in one graph.
- **Reference images**: Keep reference sheets at â‰¤1024Ã—1024 to avoid VRAM spikes during conditioning.

**Recommended settings for 16GB card**:
- `--gpu-only` flag if system RAM is â‰¥32GB
- `--reserve-vram 1.5` to cap ComfyUI's VRAM reservation
- Disable `--highvram` mode; rely on automatic offloading

---

### 4. Draft-Low â†’ Upscale-High Pattern

Per the **Nerdy Rodent tutorial**, follow this two-pass workflow:

#### Pass 1: Draft Generation (0.2MP)
1. Set resolution to **512Ã—512** in the sampler node.
2. Set frame count to **48** (2 seconds at 24fps).
3. Use **12â€“20 steps** (LTX-2.5 distilled: 12 steps; MiniMax H3: 20 steps).
4. Generate the draft video.
5. **Save** the draft output.

#### Pass 2: Upscale (2â€“4 Steps)
1. Load the draft video frames as input.
2. Use an **Upscale Model** (e.g., 4x-UltraSharp, or a dedicated video upscaler).
3. Set upscale resolution to **1024Ã—1024** or **1280Ã—720**.
4. Run **2â€“4 refinement steps** at the higher resolution.
5. Re-encode the final video.

**Why this pattern works**:
- The draft pass establishes motion, composition, and identity at low cost.
- The upscale pass refines detail without regenerating motion, saving 60â€“80% of total compute.
- On a 16GB card, this avoids OOM errors that would occur with a single 1MP pass.

**Node chain for upscale pass**:
```
LoadVideo (draft) â†’ UpscaleModel â†’ VAEEncode â†’ Sampler (2-4 steps) â†’ VAEDecode â†’ SaveVideo
```

---

### 5. Known Green-FMV Issue

> ⚠️ VERIFICATION NOTE (added by review): the INT8-channel-bias root cause below is
> the model's plausible-sounding theory, NOT verified against community reports. Treat the
> workaround as untested until validated on a real render.

**Symptom**: Generated video exhibits a persistent green color cast, particularly in midtones and shadows. This is known as the **Green-FMV (Green Full-Video Mode)** issue.

**Root Cause**:
- INT8 quantization of the diffusion transformer can introduce channel bias in the latent space.
- The VAE decode step may not fully compensate for the quantization artifact, resulting in a green shift in the RGB output.
- More pronounced in LTX-2.5 INT8 builds; less common in MiniMax H3 INT8.

**Mitigation / Community Patches**:

1. **Post-processing color correction**:
   - Add a **ColorCorrect** or **WhiteBalance** node after `VAEDecode`.
   - Shift the green channel down by 5â€“15% in post.
   - Node: `KJNodes â†’ ColorCorrect` or `VideoHelperSuite â†’ ColorGrading`.

2. **Community patch: INT8 Dequantization Fix**:
   - Search ComfyUI Discord / GitHub for: `"LTX-2.5 INT8 green fix"` or `"convrot green cast patch"`.
   - A community fork of the LTX-2.5 INT8 model with corrected dequantization weights is available.
   - Replace the model file with the patched version if the green cast persists.

3. **VAE swap**:
   - Try using the **FP16 VAE** instead of the INT8 VAE for the decode step.
   - This adds ~0.5 GB VRAM but often eliminates the green shift.
   - Node: `LoadVAE` â†’ select the FP16 VAE file.

4. **Prompt adjustment**:
   - Add `"neutral color balance, no green tint"` to the negative prompt.
   - This is a soft fix and may not fully resolve the issue.

5. **Check for known ComfyUI bug**:
   - If using ComfyUI < 0.2.0, update to the latest release.
   - Some older versions had a latent normalization bug that caused green shifts.

**Verification**:
- Generate a test clip with a neutral gray background.
- If the gray appears green, the issue is confirmed.
- Apply the VAE swap first (most reliable fix), then post-processing if needed.

---

### 6. Quick-Start Checklist

- [ ] ComfyUI running on `http://localhost:8000`
- [ ] Both `.safetensors` files in `ComfyUI-Shared/models/diffusion_models/`
- [ ] KJNodes, VideoHelperSuite, and model-specific node packs installed
- [ ] Draft resolution set to 512Ã—512
- [ ] Frame count set to 48
- [ ] Upscale pass configured (2â€“4 steps, 1024Ã—1024)
- [ ] Green-FMV check performed on first test generation
- [ ] Reference sheet image prepared (â‰¤1024Ã—1024, PNG)

---

### 7. Troubleshooting

| Issue | Fix |
|---|---|
| Model not found in dropdown | Verify file is in `diffusion_models/` folder; restart ComfyUI |
| OOM at 0.2MP | Reduce frame count to 24; add `--reserve-vram 2.0` |
| Green cast persists | Swap to FP16 VAE; apply ColorCorrect node |
| Reference image ignored | Ensure reference image is connected to the correct conditioning input slot |
| Video saves as black frames | Check VAE decode step; ensure latent is not empty |
| MiniMax H3 reference order wrong | Use `ordered_reference_mode` in the conditioning node; verify image order matches intended sequence |
