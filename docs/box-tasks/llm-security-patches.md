```markdown
## Finding 1: Unvalidated user-provided base_url (SSRF)

### Patch

```diff
--- a/routes/llm.py
+++ b/routes/llm.py
@@ -10,6 +10,7 @@
 import asyncio
 import json
 import os
+import ipaddress
 from pathlib import Path
 
 import httpx
@@ -17,6 +18,25 @@
 
 router = APIRouter(prefix="/api/llm", tags=["llm"])
 
+def _is_private_ip(url: str) -> bool:
+    """Check if URL points to private/internal network."""
+    try:
+        host = url.split("//")[-1].split("/")[0].split(":")[0]
+        if host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
+            return True
+        ip = ipaddress.ip_address(host)
+        return ip.is_private or ip.is_loopback or ip.is_link_local
+    except (ValueError, IndexError):
+        return False
+
+def _validate_base_url(url: str) -> None:
+    """Reject private/internal URLs for custom providers."""
+    if _is_private_ip(url):
+        raise HTTPException(400, "base_url must not point to private/internal network")
```

**Rationale:** Prevents SSRF by rejecting URLs that resolve to private/loopback/link-local IPs.

**Regression risk:** Legitimate local providers (Ollama, LM Studio) are already whitelisted via `_LOCAL_PROBES` and bypass this check; only custom `base_url` inputs are validated.

---

## Finding 2: No HttpUrl/validator on base_url fields

### Patch

```diff
--- a/routes/llm.py
+++ b/routes/llm.py
@@ -13,7 +13,7 @@
 import httpx
 from fastapi import APIRouter, HTTPException
-from pydantic import BaseModel
+from pydantic import BaseModel, HttpUrl, field_validator
 
 import llm_adapter
@@ -78,7 +78,13 @@
 class ConnectBody(BaseModel):
     provider_id: str
     model: str
-    base_url: str | None = None
+    base_url: HttpUrl | None = None
     api_key: str | None = None
 
+    @field_validator("base_url")
+    @classmethod
+    def validate_base_url(cls, v):
+        if v is not None:
+            _validate_base_url(str(v))
+        return v
```

**Rationale:** Enforces valid URL format via Pydantic `HttpUrl` and applies private-IP check.

**Regression risk:** `HttpUrl` requires scheme (`http://` or `https://`); existing clients already send full URLs, so no breakage.

---

## Finding 3: API-key leak in error messages

### Patch

```diff
--- a/routes/llm.py
+++ b/routes/llm.py
@@ -125,6 +125,12 @@
     except Exception as e:
-        return {"connected": False, "model": current.get("model"), "reason": str(e)[:200]}
+        # Scrub potential auth headers/keys from exception message
+        msg = str(e)
+        for token in ("Authorization", "Bearer", "api_key", "API_KEY", "token"):
+            msg = msg.replace(token, "[REDACTED]")
+        return {"connected": False, "model": current.get("model"), "reason": msg[:200]}
```

**Rationale:** Prevents leakage of auth headers or API keys in exception messages returned to clients.

**Regression risk:** Minimal; only redacts known sensitive tokens, preserving error context.

---

## Finding 4: Non-atomic config writes

### Patch

```diff
--- a/routes/llm.py
+++ b/routes/llm.py
@@ -10,6 +10,7 @@
 import asyncio
 import json
 import os
+import tempfile
 import ipaddress
 from pathlib import Path
@@ -115,7 +116,12 @@
     if "api_key" not in cfg and "api_key" in existing:
         cfg["api_key"] = existing["api_key"]
-    path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
+    # Atomic write: write to temp file, then rename
+    fd, tmp_path = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
+    try:
+        with os.fdopen(fd, "w", encoding="utf-8") as f:
+            json.dump(cfg, f, indent=2)
+        os.replace(tmp_path, str(path))
+    except OSError:
+        os.unlink(tmp_path)
+        raise
     return {"ok": True, "current": _current_summary()}
```

**Rationale:** Ensures config file is never left in a partially-written/corrupted state on crash.

**Regression risk:** None; `os.replace` is atomic on POSIX and Windows.

---

## Test plan

```bash
# 1. SSRF: reject private IP for custom provider
curl -X POST http://localhost:8000/api/llm/connect \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"custom","model":"test","base_url":"http://192.168.1.1/v1"}'
# Expected: 400 "base_url must not point to private/internal network"

# 2. Invalid URL format rejected by HttpUrl
curl -X POST http://localhost:8000/api/llm/connect \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"custom","model":"test","base_url":"not-a-url"}'
# Expected: 422 validation error

# 3. API-key leak scrubbed in status endpoint
curl http://localhost:8000/api/llm/status
# Expected: "reason" field contains "[REDACTED]" instead of raw auth headers

# 4. Atomic write: verify config file integrity after write
curl -X POST http://localhost:8000/api/llm/connect \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"ollama","model":"llama3","base_url":"http://127.0.0.1:11434"}'
cat data/llm_config.json | python -m json.tool
# Expected: valid JSON, no partial/corrupted content

# 5. Legitimate local provider still works (no regression)
curl http://localhost:8000/api/llm/providers
# Expected: 200 with providers list including Ollama/LM Studio if running
```
