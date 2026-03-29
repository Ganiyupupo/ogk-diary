import os
import uuid
import subprocess
from pathlib import Path
from typing import List, Optional

import requests
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

API_KEY = os.getenv("RENDER_SERVICE_API_KEY", "")
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/tmp/ogkdiary_outputs"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="OGK Diary Renderer")

class StyleConfig(BaseModel):
    font: str = "Arial"
    handle_watermark: str = "@ogkdiary"
    handle_position: str = "bottom_right"
    handle_opacity: float = 0.75

class RenderRequest(BaseModel):
    project_name: str = "ogkdiary"
    day_number: int
    run_date: str
    title: str
    cover_text: str
    caption: str
    script_lines: List[str]
    scene_urls: List[str] = Field(min_length=1)
    style: StyleConfig = StyleConfig()

def check_auth(auth: Optional[str]) -> None:
    expected = f"Bearer {API_KEY}"
    if not API_KEY:
        raise HTTPException(status_code=500, detail="Server API key not configured.")
    if auth != expected:
        raise HTTPException(status_code=401, detail="Unauthorized.")

def download_file(url: str, dest: Path) -> None:
    if url.startswith("file://"):
        src = Path(url.replace("file://", ""))
        dest.write_bytes(src.read_bytes())
        return
    resp = requests.get(url, timeout=180)
    resp.raise_for_status()
    dest.write_bytes(resp.content)

def ffprobe_duration(path: Path) -> float:
    cmd = ["ffprobe","-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",str(path)]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(result.stdout.strip())

def create_subtitles(script_lines, total_duration, dest):
    lines = [line.strip() for line in script_lines if line and line.strip()] or [" "]
    n = len(lines)
    per_line = total_duration / max(n, 1)
    current = 0.0
    chunks = []
    for idx, line in enumerate(lines, start=1):
        start = current
        end = total_duration if idx == n else min(total_duration, current + per_line)
        current = end
        def fmt(t):
            h = int(t // 3600); m = int((t % 3600) // 60); s = int(t % 60); ms = int((t - int(t)) * 1000)
            return f"{h:02}:{m:02}:{s:02},{ms:03}"
        chunks.append(f"{idx}\n{fmt(start)} --> {fmt(end)}\n{line}\n")
    dest.write_text("\n".join(chunks), encoding="utf-8")

def build_concat(scene_paths, dest):
    dest.write_text("\n".join([f"file '{p.as_posix()}'" for p in scene_paths]), encoding="utf-8")

def watermark_filter(style):
    text = style.handle_watermark.replace(":", r"\:").replace("'", r"\'")
    alpha = max(0.1, min(1.0, style.handle_opacity))
    x, y = ("w-tw-40", "h-th-48") if style.handle_position == "bottom_right" else ("40", "h-th-48")
    return f"drawtext=text='{text}':fontcolor=white@{alpha}:fontsize=28:x={x}:y={y}:box=1:boxcolor=black@0.20:boxborderw=10"

def render_video(scene_paths, srt_path, out_path, style):
    concat_list = out_path.parent / "concat.txt"
    build_concat(scene_paths, concat_list)
    temp = out_path.parent / "concat.mp4"
    subprocess.run(["ffmpeg","-y","-f","concat","-safe","0","-i",str(concat_list),"-c","copy",str(temp)], check=True)
    subtitles = f"subtitles={srt_path.as_posix()}:force_style='FontName={style.font},FontSize=18,PrimaryColour=&H00F2F2F2,OutlineColour=&H00303030,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=180'"
    vf = f"{subtitles},{watermark_filter(style)}"
    subprocess.run(["ffmpeg","-y","-i",str(temp),"-vf",vf,"-c:v","libx264","-preset","medium","-crf","22","-c:a","aac","-movflags","+faststart",str(out_path)], check=True)

def thumbnail(video_path, out_path):
    subprocess.run(["ffmpeg","-y","-i",str(video_path),"-ss","00:00:02.000","-vframes","1",str(out_path)], check=True)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/render")
def render(req: RenderRequest, authorization: Optional[str] = Header(default=None)):
    check_auth(authorization)
    job = OUTPUT_DIR / f"{req.project_name}_{req.day_number}_{uuid.uuid4().hex[:8]}"
    job.mkdir(parents=True, exist_ok=True)
    try:
        scene_paths = []
        for i, url in enumerate(req.scene_urls, start=1):
            dest = job / f"scene_{i}.mp4"
            download_file(url, dest)
            scene_paths.append(dest)
        total = sum(ffprobe_duration(p) for p in scene_paths)
        srt = job / "subtitles.srt"
        create_subtitles(req.script_lines, total, srt)
        out_video = job / f"{req.project_name}_day_{req.day_number}_{req.run_date}.mp4"
        out_thumb = job / f"{req.project_name}_day_{req.day_number}_{req.run_date}.jpg"
        render_video(scene_paths, srt, out_video, req.style)
        thumbnail(out_video, out_thumb)
        return JSONResponse({"status":"success","final_video_url":f"file://{out_video}","thumbnail_url":f"file://{out_thumb}","watermark":req.style.handle_watermark})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Render failed: {e}")
