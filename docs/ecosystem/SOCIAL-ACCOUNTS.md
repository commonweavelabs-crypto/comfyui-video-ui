---
title: Social Accounts - CommonWeave Labs
tags:
  - ecosystem/commonweave
  - accounts
  - social-media
status: live
related: "[[ECOSYSTEM-DECISIONS]]"
---

# Social Accounts — CommonWeave Labs

> State audit 2026-09-09. Handles confirmed by direct visit; credentials mapped below.

## The accounts (confirmed live)

| Platform | Handle / URL | Status | Owner account |
|---|---|---|---|
| **X (Twitter)** | [@CommonweaveLab](https://x.com/CommonweaveLab) | ✅ exists — 1 post, 53 following, 1 follower, joined July 2026. NOT logged in anywhere on this machine. **HANDLE OUTLIER — rename to @CommonweaveLabs** (X Settings → Account → Username) to match the brand; handles are changeable, followers preserved. | Unknown to this machine (created via browser on the Chrome instance Gui mentioned) |
| **YouTube** | [@CommonweaveLabs](https://www.youtube.com/@CommonweaveLabs) | ✅ exists — empty channel ("This channel doesn't have any content") | Google account `commonweavelabs@gmail.com` (assumed — browser was logged in as the WRONG account when verified) |
| **GitHub** | [commonweavelabs-crypto](https://github.com/commonweavelabs-crypto) | ✅ active — comfyui-video-ui live, profile polished | PAT in remote URL + `.hermes/.env` |

## Credential reality check (2026-09-09)

- **No X/Twitter credentials exist on this machine** — searched `.hermes/.env`,
  all Hermes projects, session history. The memory of "posting to X for Gui"
  does not match this Windows machine (possibly a Mac-side capability).
- **The preview browser session is signed into YouTube as `botdavid2026@gmail.com`**
  (the "David" service account) — which has NO channel. The @CommonweaveLabs
  channel lives under a different Google login.
- **No Google (YouTube) password/token stored** for commonweavelabs@gmail.com.

## ⚠️ TWO X ACCOUNTS EXIST (discovered 2026-09-09 after Gui's rename)
- **@CommonweaveLab** — July 2026, 1 post, 53 following, 1 follower. The ORIGINAL.
- **@Commonweavelabs** — Sept 2026, 7 posts (real content: the AI-agent-team
  education thread), 8 followers. Gui created this fresh account with the new
  handle; this is the one logged into the Hermes preview browser now.
- DECISION NEEDED: keep @Commonweavelabs as primary (it has the correct handle
  + real content; the old account's only asset is its 53-account following
  list) and let the original sit dormant, OR log into the original and repost.
  Recommend: keep the new one, follow the same 53 accounts again over time.

## X profile updated (2026-09-09, bio via settings/profile — no password needed)
Bio now reads: "Cardano-powered OSS ecosystem. ComfyUI Video UI + Compute Fund
— maintenance paid in LLM compute. YT: youtube.com/@CommonweaveLabs" (160/160
chars). Display name: Commonweave Labs. Location: Building in public.
Website field: points at the evidence-hub GitHub page.
UPDATE (post-rename): ✅ RESOLVED 2026-09-09. Gui cleared the field; fresh bio
typed, verified 157/160 in-editor, saved, and confirmed LIVE on the public
profile: "Cardano-powered OSS ecosystem. ComfyUI Video UI + Compute Fund —
maintenance paid in LLM compute. YT: youtube.com/@CommonweaveLabs · X:
x.com/Commonweavelabs" (both auto-linked by X). LESSON: X's bio field is a
contenteditable whose select-all misbehaves under synthetic input — verify the
char counter (not just "typed ok") before saving, and have the human clear the
field when synthetic selection fights back.

## To reach full operational state

1. **X:** log in to @CommonweaveLab in the preview browser (Gui does the login —
   passwords are never handled by the agent); OR create a developer account at
   developer.x.com for API posting (needed for automated posts).
2. **YouTube:** log OUT of botdavid2026 in the preview browser, log IN as
   commonweavelabs@gmail.com — then the @CommonweaveLabs channel is
   manageable from here. YouTube API uploads would need an OAuth client in
   Google Cloud Console (a setup task for when video content exists).
3. **Policy (from D1):** botdavid2026@gmail.com is a SERVICE identity — it
   should hold no channels/accounts for the brand. Channel should sit under
   the brand email.

## GitHub cross-links (added 2026-09-09)

- Profile bio mentions the ecosystem; repo topics include `compute-fund`.
- NEXT: add social URLs to the GitHub profile (`blog`/`social accounts`
  section supports one URL — use the linktree-style page when compute-fund's
  `/links` page ships, per the compute-fund plan) — for now the GitHub profile
  blog field points at the GitHub profile itself; update to X/YouTube once
  the link hub exists.

## Posting capability matrix

| Platform | Manual (browser) | API (automated) |
|---|---|---|
| GitHub | ✅ PAT active | ✅ PAT active |
| X | needs login | needs developer.x.com app (API keys) — setup pending |
| YouTube | needs brand-email login | needs Google Cloud OAuth client — setup pending |