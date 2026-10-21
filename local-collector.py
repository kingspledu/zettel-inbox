"""Loopback-only inbox collector. Uses local gh authentication; never copies tokens."""
import base64, hashlib, json, re, subprocess, threading, uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import instaloader
from yt_dlp import YoutubeDL
from PIL import Image
from io import BytesIO
ORIGIN = "https://kingspledu.github.io"
REPO = "kingspledu/zettel-inbox-attachments"
ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".local-collector"
CACHE.mkdir(exist_ok=True)
LOCK = threading.Lock()

def post_url(value):
    u = urlsplit(value)
    if u.scheme != "https" or u.hostname not in ("www.instagram.com", "instagram.com", "m.instagram.com") or u.username or u.password or u.port not in (None,443) or not re.fullmatch(r"/(p|reel|reels)/[A-Za-z0-9_-]{5,64}/?", u.path):
        raise ValueError("게시물 링크를 확인해주세요.")
    return "https://www.instagram.com" + u.path.rstrip("/") + "/"

def image_bytes(url):
    u = urlsplit(url)
    if u.scheme != "https" or u.username or u.password or u.port not in (None,443) or not any((u.hostname or "").endswith(h) for h in (".cdninstagram.com", ".fbcdn.net")):
        raise ValueError("이미지 주소가 올바르지 않습니다.")
    # requests used by the reference app; disable redirects before reading bytes.
    import requests
    with requests.get(url, timeout=25, stream=True, allow_redirects=False) as response:
        response.raise_for_status()
        if response.status_code != 200: raise ValueError("이미지 접근 제한")
        chunks, size = [], 0
        for chunk in response.iter_content(65536):
            size += len(chunk)
            if size > 10000000: raise ValueError("이미지는 10MB까지 지원합니다.")
            chunks.append(chunk)
    data = b"".join(chunks)
    with Image.open(BytesIO(data)) as image:
        kind = image.format
        if kind not in ("JPEG", "PNG", "WEBP"): raise ValueError("지원하지 않는 이미지 형식")
        image.verify()
    return data, {"JPEG":"image/jpeg","PNG":"image/png","WEBP":"image/webp"}[kind]

def extract(url):
    url = post_url(url)
    result = dict(source_url=url, collected_at=datetime.now(timezone.utc).isoformat(), caption=None, comments=[], images=[], cover_image=None,
                  status=dict(caption="unavailable", comments="unavailable", images="unavailable", cover="unavailable"),
                  limitations=["접근하지 못한 댓글과 답글은 미수집으로 남습니다."], collector="local-instaloader-yt-dlp")
    try:
        loader = instaloader.Instaloader(quiet=True, request_timeout=20, max_connection_attempts=1, fatal_status_codes=[401,403,429])
        post = instaloader.Post.from_shortcode(loader.context, url.strip("/").split("/")[-1])
        result["caption"] = post.caption
        result["status"]["caption"] = "collected"
        if "/reel" in url:
            result["cover_image"] = post.url
            result["status"]["cover"] = "collected" if post.url else "unavailable"
        elif post.typename == "GraphSidecar":
            nodes = list(post.get_sidecar_nodes())
            result["images"] = [n.display_url for n in nodes if not n.is_video]
        elif not post.is_video:
            result["images"] = [post.url]
        if result["images"]: result["status"]["images"] = "collected"
    except Exception:
        if "/reel" not in url: raise
        with YoutubeDL(dict(quiet=True, no_warnings=True, skip_download=True, socket_timeout=25, retries=2, noplaylist=True)) as ydl:
            info = ydl.extract_info(url, download=False)
        result["caption"] = info.get("description")
        result["cover_image"] = info.get("thumbnail")
        result["status"].update(caption="collected" if result["caption"] is not None else "unavailable", cover="collected" if result["cover_image"] else "unavailable")
    return result

def gh(args, payload=None, binary=False):
    run = subprocess.run(["gh", *args], input=payload, capture_output=True, timeout=90)
    if run.returncode: raise ValueError("GitHub 저장 연결을 확인해주세요. PC에서 gh auth login이 필요할 수 있습니다.")
    return run.stdout if binary else json.loads(run.stdout)

def archive(url):
    meta = CACHE / (hashlib.sha256(url.encode()).hexdigest()+".json")
    if meta.exists():
        cached=json.loads(meta.read_text(encoding="utf-8"))
        if cached.get("source_url")==url and cached.get("github",{}).get("repository")==REPO: return cached
    data, mime = image_bytes(url)
    # Keep a local recovery copy even if the GitHub upload fails.
    path = f"attachments/{uuid.uuid4()}/{uuid.uuid4()}"
    (CACHE / path.split("/")[-1]).write_bytes(data)
    if not gh(["api", f"repos/{REPO}"])["private"]: raise ValueError("첨부 저장소가 비공개가 아닙니다.")
    payload = json.dumps(dict(message="Archive Instagram image", content=base64.b64encode(data).decode())).encode()
    uploaded = gh(["api", f"repos/{REPO}/contents/{path}", "--method", "PUT", "--input", "-"], payload)
    result = dict(name="instagram-"+path.split("/")[-1]+(".jpg" if mime=="image/jpeg" else "."+mime.split("/")[1]), mime_type=mime, size=len(data), source_url=url,
                github=dict(repository=REPO, path=path, sha=uploaded["commit"]["sha"]))
    meta.write_text(json.dumps(result,ensure_ascii=False),encoding="utf-8")
    return result

def attachment(ref):
    if ref.get("repository") != REPO or not re.fullmatch(r"attachments/[a-f0-9-]{36}/[a-f0-9-]{36}",ref.get("path", "")) or not re.fullmatch(r"[a-f0-9]{40}",ref.get("sha", "")):
        raise ValueError("첨부 경로가 올바르지 않습니다.")
    metadata=gh(["api",f"repos/{REPO}/contents/{ref['path']}?ref={ref['sha']}"])
    if metadata.get("encoding") != "base64":
        metadata=gh(["api",f"repos/{REPO}/git/blobs/{metadata['sha']}"])
    if metadata.get("encoding") != "base64": raise ValueError("첨부 인코딩 오류")
    return base64.b64decode(metadata["content"])

def authenticated(value):
    if not value.startswith("Bearer "): return False
    token = value[7:]
    # Firestore verifies the signature and the existing owner rules, rather than trusting decoded JWT claims.
    url = "https://firestore.googleapis.com/v1/projects/moeum-inbox-kingspledu-2026/databases/(default)/documents/users/moeum-owner/items?pageSize=1"
    try:
        with urlopen(Request(url,headers={"Authorization":"Bearer "+token}),timeout=15) as response:
            return response.status == 200
    except Exception:
        return False

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def headers_out(self, status, mime="application/json;charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type",mime)
        self.send_header("Access-Control-Allow-Origin",ORIGIN)
        self.send_header("Access-Control-Allow-Headers","Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods","GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network","true")
        self.send_header("Cache-Control","no-store")
        self.end_headers()
    def reply(self, data, status=200):
        self.headers_out(status)
        self.wfile.write(json.dumps(data,ensure_ascii=False).encode())
    def allowed(self):
        return self.headers.get("Host") == "127.0.0.1:4191" and self.headers.get("Origin") == ORIGIN
    def do_OPTIONS(self):
        self.headers_out(204 if self.allowed() else 403)
    def do_GET(self):
        if self.allowed() and self.path == "/health": return self.reply(dict(app="moeum-local-collector",version=1))
        self.reply(dict(error="허용되지 않은 요청"),403)
    def do_POST(self):
        if not self.allowed() or not authenticated(self.headers.get("Authorization","")):
            return self.reply(dict(error="보관함 잠금을 해제해주세요."),403)
        try:
            size = int(self.headers.get("Content-Length","0"))
            if not 0 < size <= 5000: raise ValueError("요청 크기 오류")
            data = json.loads(self.rfile.read(size))
            with LOCK:
                if self.path == "/extract": return self.reply(extract(data["url"]))
                if self.path == "/archive": return self.reply(archive(data["url"]))
                if self.path == "/attachment":
                    content = attachment(data)
                    self.headers_out(200,"application/octet-stream")
                    return self.wfile.write(content)
            self.reply(dict(error="경로 오류"),404)
        except Exception as error:
            self.reply(dict(error="수집 실패: "+str(error)[:240]),422)

if __name__ == "__main__":
    print("Moeum PC collector: http://127.0.0.1:4191",flush=True)
    ThreadingHTTPServer(("127.0.0.1",4191),Handler).serve_forever()
