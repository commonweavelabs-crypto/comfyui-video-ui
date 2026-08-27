import streamlit as st
from datetime import datetime

st.set_page_config(
    page_title="ComfyUI Video Queue Dashboard",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.title("🎥 ComfyUI Video Queue Dashboard")
st.caption("Horizontal fixed-size cards • Scrollbar under the row • ComfyUI video jobs")

# Initialize jobs in session state
if "jobs" not in st.session_state:
    st.session_state.jobs = [
        {
            "id": 1,
            "prompt": "A serene mountain landscape at sunrise with flowing river",
            "duration": 10,
            "resolution": "720p",
            "status": "pending",
            "image_url": None,
            "video_url": None,
            "created": datetime.now().isoformat(),
            "comfyui_args": {"steps": 20, "cfg": 7.5}
        },
        {
            "id": 2,
            "prompt": "Cyberpunk city street at night, neon lights, flying cars",
            "duration": 15,
            "resolution": "1080p",
            "status": "completed",
            "image_url": "https://picsum.photos/id/1015/300/200",
            "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny_320x180.mp4",
            "created": datetime.now().isoformat(),
            "comfyui_args": {"steps": 25, "cfg": 8.0}
        },
        {
            "id": 3,
            "prompt": "Abstract particle animation, colorful orbs floating in space",
            "duration": 5,
            "resolution": "480p",
            "status": "running",
            "image_url": "https://picsum.photos/id/1005/300/200",
            "video_url": None,
            "created": datetime.now().isoformat(),
            "comfyui_args": {"steps": 15, "cfg": 6.5}
        }
    ]

# Sidebar - Add new job
with st.sidebar:
    st.header("➕ Add New Job")
    new_prompt = st.text_area("Video Prompt", "Describe the scene for the video...", height=100)
    new_duration = st.selectbox("Duration (seconds)", [5, 10, 15], index=1)
    new_resolution = st.selectbox("Resolution", ["480p", "720p", "1080p"], index=1)
    
    if st.button("Add to Queue", type="primary"):
        if new_prompt.strip():
            new_job = {
                "id": max([j["id"] for j in st.session_state.jobs] + [0]) + 1,
                "prompt": new_prompt.strip(),
                "duration": new_duration,
                "resolution": new_resolution,
                "status": "pending",
                "image_url": None,
                "video_url": None,
                "created": datetime.now().isoformat(),
                "comfyui_args": {"steps": 20, "cfg": 7.5}
            }
            st.session_state.jobs.append(new_job)
            st.success(f"Job #{new_job['id']} added to queue!")
            st.rerun()
        else:
            st.error("Prompt cannot be empty")

    st.divider()
    st.header("⚙️ ComfyUI Settings")
    comfy_url = st.text_input("ComfyUI URL", "http://localhost:8188")
    st.caption("Update this to point to your ComfyUI instance")

# Main area - Horizontal cards
st.subheader("📋 Active Queue (Horizontal Scroll)")

jobs = st.session_state.jobs

if not jobs:
    st.info("No jobs in queue. Add one from the sidebar.")
else:
    # Use st.columns for true horizontal layout (per skill)
    cols = st.columns(len(jobs))
    
    for idx, job in enumerate(jobs):
        with cols[idx]:
            with st.container(border=True):
                # Header
                st.markdown(f"### Job #{job['id']}")
                
                # Status
                status_emoji = {
                    "pending": "⏳",
                    "running": "🔄",
                    "completed": "✅",
                    "failed": "❌"
                }.get(job["status"], "⚪")
                st.markdown(f"**Status:** {status_emoji} {job['status'].upper()}")
                
                # Prompt (truncated)
                prompt_display = job["prompt"][:80] + "..." if len(job["prompt"]) > 80 else job["prompt"]
                st.write(f"**Prompt:** {prompt_display}")
                
                # Specs
                st.write(f"**Duration:** {job['duration']}s  |  **Resolution:** {job['resolution']}")
                
                # Image section
                if job["image_url"]:
                    st.image(job["image_url"], width=220, caption="Reference Image")
                else:
                    st.write("🖼️ No reference image")
                    if st.button("Add Image", key=f"addimg_{job['id']}"):
                        job["image_url"] = "https://picsum.photos/id/1016/300/200"
                        st.rerun()
                
                # Actions row
                a1, a2 = st.columns(2)
                with a1:
                    if job["status"] == "pending":
                        if st.button("Submit to ComfyUI", key=f"submit_{job['id']}", type="primary"):
                            job["status"] = "running"
                            st.rerun()
                    elif job["status"] == "running":
                        if st.button("Mark Complete", key=f"complete_{job['id']}"):
                            job["status"] = "completed"
                            job["video_url"] = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny_320x180.mp4"
                            st.rerun()
                
                with a2:
                    if st.button("Remove", key=f"remove_{job['id']}"):
                        st.session_state.jobs = [j for j in st.session_state.jobs if j["id"] != job["id"]]
                        st.rerun()
                
                # Video player if completed
                if job["status"] == "completed" and job["video_url"]:
                    st.video(job["video_url"])
                elif job["status"] == "running":
                    st.progress(0.65, text="Rendering on ComfyUI...")
                    st.caption("Processing... (mock)")

# Footer
st.divider()
st.caption("✅ Horizontal fixed-size cards with scrollbar underneath | Streamlit | Accessible on LAN via 0.0.0.0")