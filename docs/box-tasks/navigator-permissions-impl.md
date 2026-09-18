# Implementation Spec: Navigator Permission Layer (M-F Role 2)

## 1. Backend: Permission Middleware & Gate Design

### 1.1 Architecture Overview
The permission layer is implemented as a **FastAPI Dependency** injected into the `execute` endpoint. It does not use a global middleware to avoid blocking read-only requests. Instead, it acts as a gatekeeper within the action execution flow.

**File Structure:**
- `backend/permissions/registry.py`: Maps action names to tiers.
- `backend/permissions/store.py`: In-memory store for pending confirmations.
- `backend/routes/navigator.py`: The `execute` endpoint logic.

### 1.2 Permission Registry
A static mapping of the 18 actions to their respective tiers.

```python
# backend/permissions/registry.py
from enum import IntEnum

class PermissionTier(IntEnum):
    AUTO = 1
    CONFIRM = 2
    DOUBLE_CONFIRM = 3

ACTION_TIER_MAP = {
    # Tier 1: Auto-Execute (Read-Only / Low Risk)
    "open_project": PermissionTier.AUTO,
    "list_actions": PermissionTier.AUTO,
    "get_action_schema": PermissionTier.AUTO,
    
    # Tier 2: Confirm-First (Cheap Mutations)
    "set_render_settings": PermissionTier.CONFIRM,
    "update_scene_prompt": PermissionTier.CONFIRM,
    "reorder_scenes": PermissionTier.CONFIRM,
    "insert_scene": PermissionTier.CONFIRM,
    "connect_llm": PermissionTier.CONFIRM,
    "assign_frame": PermissionTier.CONFIRM,
    "assign_voice": PermissionTier.CONFIRM,
    "upload_frame": PermissionTier.CONFIRM,
    
    # Tier 3: Double-Confirm (Destructive / Expensive)
    "delete_project": PermissionTier.DOUBLE_CONFIRM,
    "clean_outputs": PermissionTier.DOUBLE_CONFIRM,
    "cancel_render": PermissionTier.DOUBLE_CONFIRM,
    "submit_render": PermissionTier.DOUBLE_CONFIRM,
    "export_video": PermissionTier.DOUBLE_CONFIRM,
    "generate_voice": PermissionTier.DOUBLE_CONFIRM,
    
    # Note: create_project is Tier 2 (creates state, but reversible via delete)
    "create_project": PermissionTier.CONFIRM,
    
    # Note: auto_cast is Tier 2 (bulk mutation, but low cost)
    "auto_cast": PermissionTier.CONFIRM,
}
```

### 1.3 Pending Confirmation Store
A thread-safe in-memory dictionary with TTL (Time-To-Live) cleanup.

```python
# backend/permissions/store.py
import time
import uuid
import threading
from typing import Dict, Optional, Any

class PendingConfirmationStore:
    def __init__(self, ttl_seconds: int = 300):
        self._store: Dict[str, Dict[str, Any]] = {}
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        # Background cleanup thread
        self._cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleanup_thread.start()

    def create(self, action_name: str, parameters: Dict, summary: str, reason_required: bool) -> str:
        token = f"conf_{uuid.uuid4().hex[:12]}"
        entry = {
            "action_name": action_name,
            "parameters": parameters,
            "summary": summary,
            "reason_required": reason_required,
            "created_at": time.time(),
            "status": "pending"
        }
        with self._lock:
            self._store[token] = entry
        return token

    def validate(self, token: str, reason: Optional[str] = None) -> Optional[Dict]:
        with self._lock:
            entry = self._store.get(token)
            if not entry:
                return None
            if time.time() - entry["created_at"] > self._ttl:
                del self._store[token]
                return None
            if entry["status"] != "pending":
                return None
            
            # If reason required, validate it
            if entry["reason_required"] and not reason:
                return None
            
            # Mark as consumed to prevent replay
            entry["status"] = "consumed"
            return entry

    def _cleanup_loop(self):
        while True:
            time.sleep(60)
            now = time.time()
            with self._lock:
                expired = [k for k, v in self._store.items() if now - v["created_at"] > self._ttl]]
                for k in expired:
                    del self._store[k]

# Singleton instance
confirmation_store = PendingConfirmationStore()
```

### 1.4 The `execute` Endpoint Logic
The endpoint checks the tier, generates a token if needed, or executes if the token is valid.

```python
# backend/routes/navigator.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from backend.permissions.registry import ACTION_TIER_MAP, PermissionTier
from backend.permissions.store import confirmation_store

router = APIRouter(prefix="/api/navigator", tags=["navigator"])

class ExecuteRequest(BaseModel):
    action_name: str
    parameters: Dict[str, Any]
    confirmation_token: Optional[str] = None
    reason: Optional[str] = None

@router.post("/execute")
async def execute_action(req: ExecuteRequest):
    # 1. Check if action exists
    if req.action_name not in ACTION_TIER_MAP:
        raise HTTPException(status_code=404, detail={"code": "UNKNOWN_ACTION", "message": f"Action '{req.action_name}' does not exist."})
    
    tier = ACTION_TIER_MAP[req.action_name]
    
    # 2. Tier 1: Execute Immediately
    if tier == PermissionTier.AUTO:
        return await _run_action(req.action_name, req.parameters)

    # 3. Tier 2 & 3: Check Confirmation
    if not req.confirmation_token:
        # Generate new confirmation request
        summary = _generate_summary(req.action_name, req.parameters)
        reason_required = (tier == PermissionTier.DOUBLE_CONFIRM)
        token = confirmation_store.create(
            action_name=req.action_name,
            parameters=req.parameters,
            summary=summary,
            reason_required=reason_required
        )
        
        # Broadcast WebSocket event for UI
        await broadcast_confirmation_request(token, req.action_name, req.parameters, summary, tier, reason_required)
        
        return {
            "status": "pending_confirmation",
            "permission_response": {
                "action_name": req.action_name,
                "parameters": req.parameters,
                "tier": tier.value,
                "confirmation_token": token,
                "summary": summary,
                "reason_required": reason_required,
                "reason_prompt": "Please confirm you want to proceed." if reason_required else None
            }
        }

    # 4. Validate Token
    valid_entry = confirmation_store.validate(req.confirmation_token, reason=req.reason)
    if not valid_entry:
        raise HTTPException(status_code=403, detail={"code": "INVALID_TOKEN", "message": "Confirmation token is invalid, expired, or missing required reason."})
    
    # 5. Execute Action
    return await _run_action(req.action_name, req.parameters)

async def _run_action(action_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    # Dispatch to specific API handlers based on action_name
    # Example:
    # if action_name == "open_project":
    #     return await scripts_service.open_project(parameters)
    # ...
    pass

def _generate_summary(action_name: str, parameters: Dict[str, Any]) -> str:
    # Simple heuristic summary generation
    if action_name == "set_render_settings":
        fps = parameters.get("fps", "unchanged")
        return f"Change frame rate to {fps} fps."
    if action_name == "delete_project":
        pid = parameters.get("project_id", "unknown")
        return f"Permanently delete project '{pid}'."
    return f"Execute {action_name}."
```

## 2. Frontend: Confirmation Card Component Spec

### 2.1 Component: `PermissionCard.tsx`
**Location:** `frontend/src/components/navigator/PermissionCard.tsx`

**Props:**
```typescript
interface PermissionCardProps {
  permissionResponse: {
    action_name: string;
    parameters: Record<string, any>;
    tier: number;
    confirmation_token: string;
    summary: string;
    reason_required: boolean;
    reason_prompt?: string;
  };
  onConfirm: (token: string, reason?: string) => void;
  onDeny: (token: string) => void;
}
```

**Rendering Logic:**
1.  **Tier 2 (Confirm-First):**
    *   **Header:** "Confirm Action" (Blue accent).
    *   **Body:** `permissionResponse.summary`.
    *   **Actions:**
        *   `[Cancel]` Button: Calls `onDeny(token)`.
        *   `[Confirm]` Button: Calls `onConfirm(token)`.

2.  **Tier 3 (Double-Confirm):**
    *   **Header:** "âš ï¸ High-Risk Action" (Red accent, bold).
    *   **Body:** `permissionResponse.summary`.
    *   **Input:** If `reason_required`, render a `<textarea>` or `<input>` for the user to type a reason (e.g., "I am sure").
    *   **Actions:**
        *   `[Cancel]` Button: Calls `onDeny(token)`.
        *   `[I Understand, Proceed]` Button: Disabled until reason is non-empty (if required). Calls `onConfirm(token, reason)`.

**Mounting in Chat Panel:**
The `PermissionCard` is rendered inside the `ChatPanel` component. When the WebSocket receives a `confirmation_request` event, the chat panel appends a special message type `type: "permission_request"` to the message list. The `MessageRenderer` checks for this type and renders the `PermissionCard` instead of a standard text bubble.

```tsx
// In ChatPanel.tsx
{messages.map(msg => {
  if (msg.type === 'permission_request') {
    return <PermissionCard 
      key={msg.id} 
      permissionResponse={msg.data} 
      onConfirm={handlePermissionConfirm} 
      onDeny={handlePermissionDeny} 
    />;
  }
  return <MessageBubble key={msg.id} message={msg} />;
})}
```

## 3. Wiring into the 18-Action Schema

The mapping is enforced in `backend/permissions/registry.py` (see Section 1.2). The frontend does not need to know the tiers; it simply renders the card based on the `tier` field in the `permission_response`.

| Action Name | Tier | Reason |
| :--- | :---: | :--- |
| `open_project` | 1 | Read-only. |
| `list_actions` | 1 | Read-only. |
| `get_action_schema` | 1 | Read-only. |
| `create_project` | 2 | Creates state, but easily deleted. |
| `set_render_settings` | 2 | Low-cost mutation. |
| `submit_pipeline` | 2 | *Correction:* In the design doc, `submit_pipeline` is not explicitly listed in Tier 2/3 lists but is a mutation. Based on "cheap mutations," it fits Tier 2. *Note: If it triggers long-running jobs, it might be Tier 3. Per spec, it is not in the Tier 3 list, so Tier 2.* |
| `assign_frame` | 2 | Low-cost mutation. |
| `upload_frame` | 2 | Low-cost mutation. |
| `generate_voice` | 3 | Expensive (TTS tokens). |
| `assign_voice` | 2 | Low-cost mutation. |
| `auto_cast` | 2 | Bulk mutation, but low cost. |
| `submit_render` | 3 | Expensive (GPU time), long-running. |
| `cancel_render` | 3 | Destructive to active job state. |
| `update_scene_prompt` | 2 | Low-cost mutation. |
| `reorder_scenes` | 2 | Low-cost mutation. |
| `insert_scene` | 2 | Low-cost mutation. |
| `export_video` | 3 | Expensive (CPU/GPU), long-running. |
| `connect_llm` | 2 | Configuration change. |
| `clean_outputs` | 3 | Destructive (deletes files). |
| `delete_project` | 3 | Destructive (deletes project). |

## 4. WebSocket Events

Mirroring the existing `scene_update` pattern, we introduce two new event types.

### 4.1 Event: `confirmation_request`
**Direction:** Server â†’ Client
**Trigger:** When `execute` returns `status: "pending_confirmation"`.

```json
{
  "type": "confirmation_request",
  "data": {
    "action_name": "set_render_settings",
    "parameters": { "fps": 24 },
    "tier": 2,
    "confirmation_token": "conf_abc123xyz",
    "summary": "Change frame rate to 24 fps for project 'test2'.",
    "reason_required": false
  }
}
```

### 4.2 Event: `confirmation_response`
**Direction:** Client â†’ Server
**Trigger:** When user clicks Confirm or Deny on the `PermissionCard`.

```json
{
  "type": "confirmation_response",
  "data": {
    "confirmation_token": "conf_abc123xyz",
    "approved": true,
    "reason": null
  }
}
```

**Server Handling:**
Upon receiving `confirmation_response`, the server does **not** automatically execute the action. Instead, the **Agent** (LLM) is notified via the WebSocket that the user has approved/denied. The Agent then re-calls the `execute` endpoint with the `confirmation_token` (and `reason` if applicable). This keeps the execution logic in the Agent's loop, ensuring the LLM can provide the final confirmation message to the user.

*Alternative (Simpler):* If the UI is designed to bypass the LLM for the final step, the server could execute directly. However, per the "Navigator" role, the LLM should be aware of the outcome. Thus, the Agent re-calls `execute`.

## 5. Edge Cases

### 5.1 Token Expiry
**Scenario:** User receives a Tier 3 confirmation card. They step away for 10 minutes. The TTL (5 min) expires. They click "Proceed."
**Handling:**
1.  Frontend sends `confirmation_response` with `approved: true`.
2.  Agent re-calls `execute` with the old token.
3.  Backend `confirmation_store.validate()` returns `None` (expired).
4.  Backend returns `403 INVALID_TOKEN`.
5.  Agent receives error, informs user: "The confirmation has expired. Please try again."
6.  Agent re-calls `execute` without token to generate a fresh confirmation request.

### 5.2 Concurrent Actions
**Scenario:** User asks to "Delete Project A" and "Delete Project B" in the same turn.
**Handling:**
1.  Agent calls `execute` for `delete_project` (A).
2.  Backend returns `pending_confirmation` with Token A.
3.  Agent calls `execute` for `delete_project` (B).

