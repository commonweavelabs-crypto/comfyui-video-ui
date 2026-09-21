4.  Backend returns `pending_confirmation` with Token B.
5.  Frontend renders two distinct `PermissionCard` components, each with its own unique token.
6.  User confirms both.
7.  Agent re-calls `execute` for A (with Token A), then for B (with Token B).
8.  Both execute successfully.

*Note:* The `PendingConfirmationStore` is keyed by token, not action name, ensuring no cross-contamination between concurrent requests for the same action type.

### 5.3 User Denial
**Scenario:** User receives a Tier 2 confirmation card for `set_render_settings`. They click "Cancel."
**Handling:**
1.  Frontend sends `confirmation_response` with `approved: false`.
2.  Agent receives the denial event.
3.  Agent informs the user: "Action cancelled. No changes were made."
4.  **Backend State:** The token remains in the store as `pending` (or is explicitly marked `denied` if we add that status). However, since the token is never validated via `execute`, it will eventually expire via TTL. No cleanup action is strictly required on denial, as the token is inert.
5.  **UI State:** The `PermissionCard` should transition to a "Denied" state (greyed out, buttons disabled) to prevent double-clicks or confusion.

### 5.4 Double-Confirm Token Mismatch / Replay
**Scenario:** An attacker (or a buggy client) attempts to reuse a consumed token or provides a token that does not match the action/parameters in the `execute` call.
**Handling:**
1.  **Replay Attack:** User confirms Token A for `delete_project`. Later, the client sends `execute` again with Token A.
    *   `confirmation_store.validate()` checks `entry["status"]`. Since it was marked `consumed` during the first successful validation, it returns `None`.
    *   Backend returns `403 INVALID_TOKEN`.
2.  **Parameter Mismatch:** The `execute` endpoint receives `confirmation_token: "conf_abc"` but `parameters: { "project_id": "different_id" }` than what was stored in the confirmation entry.
    *   *Current Spec Gap:* The `validate` method in Section 1.3 does not currently compare the incoming `parameters` against the stored `parameters`.
    *   *Required Fix:* Modify `confirmation_store.validate()` to accept the incoming parameters and verify they match the stored entry.
    
    ```python
    # Updated validate signature in store.py
    def validate(self, token: str, parameters: Dict, reason: Optional[str] = None) -> Optional[Dict]:
        with self._lock:
            entry = self._store.get(token)
            if not entry:
                return None
            if time.time() - entry["created_at"] > self._ttl:
                del self._store[token]
                return None
            if entry["status"] != "pending":
                return None
            
            # CRITICAL: Ensure parameters match exactly to prevent tampering
            if entry["parameters"] != parameters:
                return None
            
            # If reason required, validate it
            if entry["reason_required"] and not reason:
                return None
            
            # Mark as consumed to prevent replay
            entry["status"] = "consumed"
            return entry
    ```
    
    *   If mismatch occurs, `validate` returns `None`.
    *   Backend returns `403 INVALID_TOKEN`.
    *   Agent informs user: "Confirmation mismatch. Please re-initiate the action."
