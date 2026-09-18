# Implementation Spec: M-H H-2 Dialogue Verification with faster-whisper

## 1. Backend: Module Design & Job Queue

### 1.1 Module Structure
Create a new module `backend/verification/` mirroring the existing `backend/render/` patterns.

**Files:**
- `backend/verification/__init__.py`
- `backend/verification/whisper_worker.py`
- `backend/verification/fuzzy_matcher.py`
- `backend/verification/audio_extractor.py`
- `backend/verification/models.py` (Pydantic schemas)

### 1.2 Job Queue Integration
Mirror the existing `RenderJob` pattern in `backend/jobs/queue.py`.

**New Job Type:**
```python
# backend/jobs/types.py
class VerificationJob(BaseJob):
    job_id: str
    scene_id: str
    render_path: str  # Path to rendered MP4
    script_lines: List[ScriptLine]  # Original script for this scene
    status: JobStatus  # PENDING, RUNNING, COMPLETED, FAILED
    created_at: datetime
    completed_at: Optional[datetime]
    error: Optional[str]
```

**Queue Registration:**
In `backend/jobs/queue.py`, add a new worker pool for verification:
```python
# Add to JobQueue class
def __init__(self, ...):
    ...
    self.verification_pool = ThreadPoolExecutor(max_workers=1)  # CPU-bound, single worker
```

**Worker Registration:**
In `backend/main.py` or `backend/workers.py`:
```python
job_queue.register_worker(
    job_type=VerificationJob,
    handler=whisper_worker.process_verification_job,
    pool=self.verification_pool
)
```

### 1.3 Audio Extraction (`audio_extractor.py`)
Use `ffmpeg` via `subprocess` to extract audio from rendered MP4.

```python
import subprocess
import tempfile
from pathlib import Path

def extract_audio(video_path: str, output_wav_path: str) -> bool:
    """
    Extract audio track from MP4 to 16kHz mono WAV.
    Returns True on success, False if no audio track.
    """
    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-vn",  # No video
        "-acodec", "pcm_s16le",
        "-ar", "16000",  # 16kHz
        "-ac", "1",  # Mono
        "-y",  # Overwrite
        output_wav_path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            # Check if "No audio" or similar error
            if "No audio" in result.stderr or "Stream #0:0" not in result.stderr:
                return False
            raise RuntimeError(f"ffmpeg failed: {result.stderr}")
        return True
    except subprocess.TimeoutExpired:
        raise RuntimeError("Audio extraction timed out")
```

**Edge Case Handling:**
- If `ffmpeg` returns non-zero and stderr contains "No audio" or "Stream #0:0" is absent, return `False` (no audio track).
- If extraction fails, mark job as `FAILED` with error message.

### 1.4 Whisper Model Loading (`whisper_worker.py`)
Lazy-load `faster-whisper` model on first use. Cache globally.

```python
# backend/verification/whisper_worker.py
from faster_whisper import WhisperModel
import threading
import time
from typing import List, Dict, Optional
from pathlib import Path
import json

_whisper_model: Optional[WhisperModel] = None
_model_lock = threading.Lock()

def get_whisper_model(model_size: str = "tiny") -> WhisperModel:
    """
    Load faster-whisper model (CPU, tiny/base).
    Thread-safe singleton.
    """
    global _whisper_model
    if _whisper_model is None:
        with _model_lock:
            if _whisper_model is None:
                print(f"[Verification] Loading faster-whisper model: {model_size}")
                start = time.time()
                _whisper_model = WhisperModel(
                    model_size,
                    device="cpu",
                    compute_type="int8"  # CPU-optimized
                )
                print(f"[Verification] Model loaded in {time.time() - start:.2f}s")
    return _whisper_model
```

**Model Selection:**
- Default: `tiny` (fastest, ~10MB, acceptable accuracy for verification).
- Optional config: `WHISPER_MODEL_SIZE` env var or UI setting to switch to `base`.

### 1.5 Transcription & Word-Level Timestamps
```python
def transcribe_audio(wav_path: str) -> List[Dict]:
    """
    Transcribe WAV file, return word-level timestamps.
    Returns: [{"word": str, "start": float, "end": float}, ...]
    """
    model = get_whisper_model()
    segments, info = model.transcribe(
        wav_path,
        word_timestamps=True,
        vad_filter=True,  # Remove silence
        vad_parameters=dict(min_silence_duration_ms=500)
    )
    
    words = []
    for segment in segments:
        for word in segment.words:
            words.append({
                "word": word.word.strip(),
                "start": round(word.start, 3),
                "end": round(word.end, 3)
            })
    return words
```

### 1.6 Job Handler (`process_verification_job`)
```python
def process_verification_job(job: VerificationJob, ws_manager: WebSocketManager) -> None:
    """
    Main handler for verification job.
    Mirrors render job pattern: update status, emit WS events, save results.
    """
    scene_id = job.scene_id
    render_path = job.render_path
    
    # 1. Extract audio
    ws_manager.send_event(scene_id, "verification_started", {"stage": "extracting_audio"})
    tmp_wav = Path(tempfile.mktemp(suffix=".wav"))
    try:
        has_audio = extract_audio(render_path, str(tmp_wav))
        if not has_audio:
            _complete_job(job, scene_id, verdict="no_audio", words=[], ws_manager)
            return
    except Exception as e:
        _fail_job(job, scene_id, str(e), ws_manager)
        return
    
    # 2. Transcribe
    ws_manager.send_event(scene_id, "verification_progress", {"stage": "transcribing", "progress": 0.5})
    try:
        words = transcribe_audio(str(tmp_wav))
    except Exception as e:
        _fail_job(job, scene_id, f"Transcription failed: {e}", ws_manager)
        return
    finally:
        tmp_wav.unlink(missing_ok=True)
    
    # 3. Fuzzy match
    ws_manager.send_event(scene_id, "verification_progress", {"stage": "matching", "progress": 0.8})
    match_result = fuzzy_match_lines(job.script_lines, words)
    
    # 4. Save to scene JSON
    _save_verification_result(scene_id, match_result, words)
    
    # 5. Complete
    _complete_job(job, scene_id, verdict=match_result["verdict"], words=words, ws_manager)
```

### 1.7 Scene JSON Storage
Extend existing scene JSON structure (`scenes/{scene_id}.json`):

```json
{
  "scene_id": "scene_001",
  "render_path": "/renders/scene_001.mp4",
  "script_lines": [
    {"id": 1, "text": "Hello there", "start": 0.0, "end": 1.2},
    {"id": 2, "text": "How are you", "start": 1.5, "end": 2.8}
  ],
  "verification": {
    "status": "completed",
    "verdict": "all_lines_spoken",
    "transcribed_words": [
      {"word": "hello", "start": 0.1, "end": 0.4},
      {"word": "there", "start": 0.5, "end": 0.8}
    ],
    "line_matches": [
      {
        "line_id": 1,
        "original_text": "Hello there",
        "matched_words": ["hello", "there"],
        "similarity": 0.95,
        "status": "matched",
        "offset_ms": 100
      },
      {
        "line_id": 2,
        "original_text": "How are you",
        "matched_words": [],
        "similarity": 0.0,
        "status": "missing",
        "offset_ms": null
      }
    ],
    "completed_at": "2024-01-15T10:30:00Z"
  }
}
```

**API Endpoint:**
- `GET /api/scenes/{scene_id}/verification` â†’ returns `verification` block.
- `POST /api/scenes/{scene_id}/verify` â†’ triggers new `VerificationJob`.

---

## 2. Fuzzy-Matching Algorithm (`fuzzy_matcher.py`)

### 2.1 Token Normalization
```python
import re
import unicodedata

def normalize_token(token: str) -> str:
    """
    Normalize a word for comparison.
    - Lowercase
    - Strip punctuation
    - Remove diacritics
    - Collapse whitespace
    """
    token = token.lower().strip()
    token = re.sub(r'[^\w\s]', '', token)  # Remove punctuation
    token = unicodedata.normalize('NFKD', token)
    token = re.sub(r'[\u0300-\u036f]', '', token)  # Remove diacritics
    token = re.sub(r'\s+', ' ', token).strip()
    return token

def normalize_line(line: str) -> List[str]:
    """Split line into normalized tokens."""
    return [normalize_token(t) for t in line.split() if normalize_token(t)]
```

### 2.2 Similarity Metric
Use **token-level Levenshtein distance** normalized by max length.

```python
def levenshtein_distance(a: str, b: str) -> int:
    """Standard Levenshtein distance."""
    if len(a) < len(b):
        a, b = b, a
    prev_row = range(len(b) + 1)
    for i, c1 in enumerate(a):
        curr_row = [i + 1]
        for j, c2 in enumerate(b):
            insertions = prev_row[j + 1] + 1
            deletions = curr_row[j] + 1
            substitutions = prev_row[j] + (c1 != c2)
            curr_row.append(min(insertions, deletions, substitutions))
        prev_row = curr_row
    return prev_row[-1]

def token_similarity(a: str, b: str) -> float:
    """
    Similarity between two normalized tokens.
    Returns 0.0 to 1.0.
    """
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    dist = levenshtein_distance(a, b)
    max_len = max(len(a), len(b))
    return 1.0 - (dist / max_len)
```

### 2.3 Line Matching Algorithm
For each script line, find the best-matching contiguous sequence of transcribed words.

```python
from typing import List, Dict, Tuple

def fuzzy_match_lines(
    script_lines: List[Dict],
    transcribed_words: List[Dict],
    threshold: float = 0.75
) -> Dict:
    """
    Match each script line to transcribed words.
    
    Args:
        script_lines: [{"id": int, "text": str, "start": float, "end": float}, ...]
        transcribed_words: [{"word": str, "start": float, "end": float}, ...]
        threshold: Minimum similarity for a match (0.0-1.0)
    
    Returns:
        {
            "verdict": "all_lines_spoken" | "missing_lines" | "timing_offsets",
            "line_matches": [...],
            "total_lines": int,
            "matched_lines": int
        }
    """
    if not transcribed_words:
        return {
            "verdict": "missing_lines",
            "line_matches": [
                {
                    "line_id": line["id"],
                    "original_text": line["text"],
                    "matched_words": [],
                    "similarity": 0.0,
                    "status": "missing",
                    "offset_ms": None
                }
                for line in script_lines
            ],
            "total_lines": len(script_lines),
            "matched_lines": 0
        }
    
    # Pre-compute normalized transcribed words
    norm_words = [normalize_token(w["word"]) for w in transcribed_words]
    
    line_matches = []
    matched_count = 0
    
    for line in script_lines:
        line_tokens = normalize_line(line["text"])
        if not line_tokens:
            line_matches.append({
                "line_id": line["id"],
                "original_text": line["text"],
                "matched_words": [],
                "similarity": 1.0,
                "status": "matched",  # Empty line is trivially matched
                "offset_ms": 0
            })
            matched_count += 1
            continue
        
        # Sliding window over transcribed words
        best_score = 0.0
        best_start_idx = -1
        best_end_idx = -1
        best_matched_words = []
        
        # Try all possible start positions
        for start_idx in range(len(norm_words)):
            # Try all possible lengths (up to len(line_tokens) + 2 for tolerance)
            max_len = len(line_tokens) + 2
            for end_idx in range(start_idx, min(start_idx + max_len, len(norm_words))):
                window = norm_words[start_idx:end_idx + 1]
                score = _sequence_similarity(line_tokens, window)
                if score > best_score:
                    best_score = score
                    best_start_idx = start_idx
                    best_end_idx = end_idx
                    best_matched_words = [transcribed_words[i]["word"] for i in range(start_idx, end_idx + 1)]
        
        # Determine status
        if best_score >= threshold:
            status = "matched"
            matched_count += 1
            # Calculate timing offset
            expected_start = line["start"]
            actual_start = transcribed_words[best_start_idx]["start"] if best_start_idx >= 0 else 0.0
            offset_ms = int((actual_start - expected_start) * 1000)
        else:
            status = "missing"
            offset_ms = None
        
        line_matches.append({
            "line_id": line["id"],
            "original_text": line["text"],
            "matched_words": best_matched_words,
            "similarity": round(best_score, 3),
            "status": status,
            "offset_ms": offset_ms
        })
    
    # Determine overall verdict
    if matched_count == len(script_lines):
        # Check for significant timing offsets
        max_offset = max(
            abs(m["offset_ms"]) for m in line_matches if m["offset_ms"] is not None
        ) if any(m["offset_ms"] is not None for m in line_matches) else 0
        if max_offset > 500:  # 500ms threshold
            verdict = "timing_offsets"
        else:
            verdict = "all_lines_spoken"
    else:
        verdict = "missing_lines"
    
    return {
        "verdict": verdict,
        "line_matches": line_matches,
        "total_lines": len(script_lines),
        "matched_lines": matched_count
    }

def _sequence_similarity(expected_tokens: List[str], actual_tokens: List[str]) -> float:
    """
    Compare expected token sequence to actual token sequence.
    Uses average of pairwise token similarities, penalizing length mismatch.
    """
    if not expected_tokens or not actual_tokens:
        return 0.0
    
    # Align by position (simple approach)
    min_len = min(len(expected_tokens), len(actual_tokens))
    total_sim = 0.0
    for i in range(min_len):
        total_sim += token_similarity(expected_tokens[i], actual_tokens[i])
    
    # Penalize length mismatch
    length_penalty = min_len / max(len(expected_tokens), len(actual_tokens))
    
    return (total_sim / min_len) * length_penalty
```

### 2.4 Threshold Tuning
- **Default threshold:** `0.75`
- **Rationale:** 
  - `0.75` allows for minor ASR errors (e.g., "there" vs "their", "the" vs "a").
  - Below `0.70` produces too many false positives.
  - Above `0.85` produces too many false negatives.
- **Configurable:** Expose `VERIFICATION_THRESHOLD` env var or UI setting.
- **Per-line override:** Allow scene-level threshold override in scene JSON.

---

## 3. Frontend: Verdict Display & Word-Click Seek

### 3.1 Scene Card Verdict Display
In `frontend/components/SceneCard.vue` (or equivalent React component):

**Verdict Badge:**
```vue
<template>
  <div class="scene-card">
    <!-- Existing content -->
    
    <div v-if="scene.verification" class="verification-badge">
      <span v-if="scene.verification.verdict === 'all_lines_spoken'" class="badge badge-success">
        âœ“ All lines spoken
      </span>
      <span v-else-if="scene.verification.verdict === 'missing_lines'" class="badge badge-warning">
        âš  Missing lines
      </span>
      <span v-else-if="scene.verification.verdict === 'timing_offsets'" class="badge badge-info">
        â± Timing offsets
      </span>
      <span v-else class="badge badge-neutral">
        No verification
      </span>
    </div>
    
    <!-- Line-by-line detail (expandable) -->
    <details v-if="scene.verification && scene.verification.line_matches.length > 0">
      <summary>Line details</summary>
      <ul class="line-matches">
        <li v-for="match in scene.verification.line_matches" :key="match.line_id">
          <span :class="match.status === 'matched' ? 'text-success' : 'text-warning'">
            {{ match.original_text }}
          </span>
          <span v-if="match.status === 'matched'" class="text-muted">
            ({{ match.similarity.toFixed(2) }})
          </span>
          <span v-if="match.offset_ms !== null && Math.abs(match.offset_ms) > 200" class="text-info">
            ({{ match.offset_ms > 0 ? '+' : '' }}{{ match.offset_ms }}ms)
          </span>
        </li>
      </ul>
    </details>
  </div>
</template>
```

**Styling:**
- `badge-success`: Green background, white text.
- `badge-warning`: Yellow background, black text.
- `badge-info`: Blue background, white text.
- `text-success`: Green text.
- `text-warning`: Yellow text.
- `text-info`: Blue text.

### 3.2 Word-Click â†’ Video Seek Mechanism
In the script editor or transcript view, make each word clickable.

**Component: `TranscriptView.vue`**
```vue
<template>
  <div class="transcript-view">
    <p v-for="line in scene.script_lines" :key="line.id" class="script-line">
      <span
        v-for="(word, idx) in getWordsForLine(line)"
        :key="idx"
        class="clickable-word"
        :class="{ 'word-matched': isWordMatched(line, word), 'word-missing': !isWordMatched(line, word) }"
        @click="seekToWord(line, word)"
      >
        {{ word.text }}
      </span>
    </p>
  </div>
</template>

<script>
export default {
  props: {
    scene: Object,
    videoPlayer: Object  // Reference to video player component
  },
  methods: {
    getWordsForLine(line) {
      // Split line text into words, attach timestamps if available
      const words = line.text.split(' ');
      return words.map(text => ({
        text,
        timestamp: this.getWordTimestamp(line, text)
      }));
    },
    
    getWordTimestamp(line, wordText) {
      // Find matching word in verification data
      if (!this.scene.verification) return null;
      const match = this.scene.verification.line_matches.find(m => m.line_id === line.id);
      if (!match || match.status !== 'matched') return null;
      
      // Find word in matched_words
      const idx = match.matched_words.findIndex(w => w.toLowerCase() === wordText.toLowerCase());
      if (idx === -1) return null;
      
      // Get timestamp from transcribed_words
      const wordData = this.scene.verification.transcribed_words.find(
        w => w.word.toLowerCase() === wordText.toLowerCase()
      );
      return wordData ? wordData.start : null;
    },
    
    isWordMatched(line, word) {
      return this.getWordTimestamp(line, word) !== null;
    },
    
    seekToWord(line, word) {
      const timestamp = this.getWordTimestamp(line, word);
      if (timestamp !== null && this.videoPlayer) {
        this.videoPlayer.seekTo(timestamp);
      }
    }
  }
};
</script>
```

**Video Player Integration:**
In `VideoPlayer.vue`:
```vue
<template>
  <video ref="videoRef" :src="scene.render_path" controls />
</template>

<script>
export default {
  methods: {
    seekTo(timestamp: number) {
      const video = this.$refs.videoRef;
      if (video) {
        video.currentTime = timestamp;
        video.play();  // Optional: auto-play on seek
      }
    }
  }
};
</script>
```

**Word Styling:**
- `.clickable-word`: Cursor pointer, hover underline.
- `.word-matched`: Normal text color.
- `.word-missing`: Strikethrough or red text.

---

## 4. WebSocket Events for Verification Progress

### 4.1 Event Schema
Mirror existing render job WS events.

**Event Types:**
1. `verification_started`
2. `verification_progress`
3. `verification_completed`
4. `verification_failed`

**Payload Structure:**
```json
{
  "event": "verification_progress",
  "scene_id": "scene_001",
  "data": {
    "stage": "transcribing",
    "progress": 0.5,
    "message": "Transcribing audio..."
  }
}
```

### 4.2 Backend Emission
In `whisper_worker.py`:
```python
def _emit_progress(ws_manager: WebSocketManager, scene_id: str, stage: str, progress: float, message: str = ""):
    ws_manager.send_event(scene_id, "verification_progress", {
        "stage": stage,
        "progress": progress,
        "message": message
    })

def _complete_job(job: VerificationJob, scene_id: str, verdict: str, words: List[Dict], ws_manager: WebSocketManager):
    job.status = JobStatus.COMPLETED
    job.completed_at = datetime.utcnow()
    ws_manager.send_event(scene_id, "verification_completed", {
        "verdict": verdict,
        "word_count": len(words)
    })

def _fail_job(job: VerificationJob, scene_id: str, error: str, ws_manager: WebSocketManager):
    job.status = JobStatus.FAILED
    job.error = error
    job.completed_at = datetime.utcnow()
    ws_manager.send_event(scene_id, "verification_failed", {
        "error": error
    })
```

### 4.3 Frontend Handling
In `frontend/stores/verification.js` (or equivalent):
```javascript
export default {
  state: {
    verificationStatus: {}  // { scene_id: { stage, progress, message } }
  },
  
  actions: {
    handleVerificationEvent(payload) {
      const { scene_id, event, data } = payload;
      
      if (event === 'verification_started') {
        this.state.verificationStatus[scene_id] = {
          stage: 'started',
          progress: 0,
          message: 'Verification started'
        };
      } else if (event === 'verification_progress') {
        this.state.verificationStatus[scene_id] = {
          stage: data.stage,
          progress: data.progress,
          message: data.message
        };
      } else if (event === 'verification_completed') {
        delete this.state.verificationStatus[scene_id];
        // Refresh scene data from API
        this.$store.dispatch('fetchScene', scene_id);
      } else if (event === 'verification_failed') {
        delete this.state.verificationStatus[scene_id];
        this.$store.commit('setSceneError', { scene_id, error: data.error });
      }
    }
  }
};
```

**UI Progress Indicator:**
In `SceneCard.vue`:
```vue
<div v-if="verificationStatus[scene.id]" class="verification-progress">
  <div class="progress-bar">
    <div class="progress-fill" :style="{ width: (verificationStatus[scene.id].progress * 100) + '%' }"></div>
  </div>
  <span class="progress-text">{{ verificationStatus[scene.id].message }}</span>
</div>
```

---

## 5. Edge Cases

### 5.1 No Audio Track
- **Detection:** `ffmpeg` returns non-zero exit code with stderr containing "No audio" or "Stream #0:0" absent.
- **Handling:** 
  - Mark job as `COMPLETED` with `verdict: "no_audio"`.
  - Frontend displays badge: "No audio track" (gray badge).
  - No word-click functionality available.
- **API Response:**
  ```json
  {
    "verification": {
      "status": "completed",
      "verdict": "no_audio",
      "transcribed_words": [],
      "line_matches": [],
      "completed_at": "..."
    }
  }
  ```

### 5.2 Silence (Audio Track Exists but No Speech)
- **Detection:** `faster-whisper` returns empty `segments` list.
- **Handling:**
  - Mark job as `COMPLETED` with `verdict: "missing_lines"`.
  - All script lines marked as `missing`.
  - Frontend displays badge: "âš  Missing lines".
  - User can inspect line details to see all lines are missing.
- **Note:** `vad_filter=True` in transcription ensures silence is ignored.

### 5.3 Music-Only (No Speech)
- **Detection:** `faster-whisper` may produce hallucinated words or empty segments.
- **Handling:**
  - If `transcribed_words` is empty â†’ treat as silence (see 5.2).
  - If `transcribed_words` is non-empty but similarity scores are all below threshold â†’ `verdict: "missing_lines"`.
  - **Optional Enhancement:** Add a "music-only" heuristic:
    - If average word similarity < 0.3 and word count < 5, mark `verdict: "music_only"` (custom verdict).
    - Frontend displays badge: "ðŸŽµ Music only" (purple badge).
- **Implementation:**
  ```python
  # In fuzzy_match_lines, after computing line_matches:
  if matched_count == 0 and len(transcribed_words) < 5:
      avg_sim = sum(m["similarity"] for m in line_matches) / len(line_matches) if line_matches else 0
      if avg_sim < 0.3:
          verdict = "music_only"
  ```

### 5.4 Very Short Audio (< 1 second)
- **Detection:** `ffmpeg` succeeds, but `faster-whisper` returns empty or single segment.
- **Handling:**
  - If no words transcribed â†’ `verdict: "missing_lines"`.
  - If words transcribed â†’ proceed with normal matching.
  - **Note:** `tiny` model may struggle with very short clips. Consider using `base` model for scenes < 2 seconds (configurable).

### 5.5 Concurrent Verification Jobs
- **Handling:**
  - Queue ensures single worker (`max_workers=1`).
  - Jobs are processed sequentially.
  - Frontend shows progress for each scene independently.
  - No race conditions on scene JSON writes (single writer per scene).

### 5.6 Model Loading Failure
- **Detection:** `WhisperModel()` constructor raises exception.
- **Handling:**
  - Mark job as `FAILED` with error message.
  - Frontend displays error badge: "âŒ Verification failed".
  - User can retry by clicking "Verify" again.
  - **Logging:** Log full traceback to server logs.

### 5.7 Corrupted Audio File
- **Detection:** `ffmpeg` fails with non-zero exit code (not "No audio").
- **Handling:**
  - Mark job as `FAILED` with error message from `ffmpeg` stderr.
  - Frontend displays error badge.
  - **Note:** This may indicate a corrupted render. User should re-render.

### 5.8 Script Line with Special Characters
- **Detection:** Normalization handles punctuation, diacritics, etc.
- **Handling:**
  - `normalize_token` strips all non-alphanumeric characters.
  - Matching is case-insensitive and diacritic-insensitive.
  - **Example:** "CafÃ©" matches "cafe", "naÃ¯ve" matches "naive".

### 5.9 Empty Script Line
- **Detection:** `line.text` is empty or whitespace-only.
- **Handling:**
  - Mark line as `matched` with `similarity: 1.0`.
  - No offset calculation.
  - **Rationale:** Empty lines are trivially satisfied.

### 5.10 Very Long Script Line (> 50 words)
- **Detection:** `len(line_tokens) > 50`.
- **Handling:**
  - Sliding window algorithm may be slow.
  - **Optimization:** Limit window size to `len(line_tokens) + 5`.
  - **Alternative:** Split long lines into sub-lines for matching (future enhancement).
  - **Current:** Acceptable performance for typical script lines (< 20 words).

---

## 6. Configuration & Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WHISPER_MODEL_SIZE` | `tiny` | Model size: `tiny`, `base`, `small` |
| `VERIFICATION_THRESHOLD` | `0.75` | Minimum similarity for match |
| `VERIFICATION_MAX_WORKERS` | `1` | Max concurrent verification jobs |
| `FFMPEG_PATH` | `ffmpeg` | Path to ffmpeg binary |

**Example `.env`:**
```env
WHISPER_MODEL_SIZE=tiny
VERIFICATION_THRESHOLD=0.75
VERIFICATION_MAX_WORKERS=1
FFMPEG_PATH=/usr/bin/ffmpeg
```

---

## 7. Testing Checklist

- [ ] Verify job queue integration (job created, processed, completed).
- [ ] Test audio extraction with MP4 with/without audio track.
- [ ] Test transcription with clean speech, noisy speech, silence, music.
- [ ] Test fuzzy matching with exact matches, minor ASR errors, missing words.
- [ ] Test verdict logic: all_lines_spoken, missing_lines, timing_offsets, no_audio, music_only.
- [ ] Test WebSocket events: started, progress, completed, failed.
- [ ] Test frontend: verdict badge display, word-click seek, progress bar.
- [ ] Test edge cases: no audio, silence, music-only, corrupted file, model load failure.
- [ ] Test concurrent jobs (queue serialization).
- [ ] Test scene JSON persistence and API retrieval.
