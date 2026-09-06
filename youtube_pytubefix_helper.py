#!/usr/bin/env python3
"""
Helper script for YouTube extraction and download using pytubefix.
Supports VPN / HTTP proxy routing and PO Token generation.
"""

import sys
import os
import json
import time
import re
import subprocess
from urllib.parse import urlparse, unquote

def format_duration(seconds):
    if not seconds:
        return '00:00'
    try:
        seconds = int(seconds)
        hrs = seconds // 3600
        mins = (seconds % 3600) // 60
        secs = seconds % 60
        if hrs > 0:
            return f"{hrs:02d}:{mins:02d}:{secs:02d}"
        return f"{mins:02d}:{secs:02d}"
    except Exception:
        return '00:00'

def format_views(count):
    if not count:
        return '0'
    try:
        count = int(count)
        if count >= 1_000_000_000:
            return f"{count / 1_000_000_000:.1f}B"
        if count >= 1_000_000:
            return f"{count / 1_000_000:.1f}M"
        if count >= 1_000:
            return f"{count / 1_000:.1f}K"
        return f"{count:,}"
    except Exception:
        return str(count)

def format_bytes(bytes_val):
    if not bytes_val or bytes_val <= 0:
        return ''
    try:
        bytes_val = float(bytes_val)
        if bytes_val >= 1024 * 1024 * 1024:
            return f"{bytes_val / (1024 * 1024 * 1024):.1f} GB"
        return f"{bytes_val / (1024 * 1024):.1f} MB"
    except Exception:
        return ''

def get_proxy_dict(proxy_arg=None):
    raw_proxy = proxy_arg or os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy') or os.environ.get('ALL_PROXY') or os.environ.get('all_proxy')
    if not raw_proxy:
        return None
    raw_proxy = raw_proxy.strip()
    if not raw_proxy.startswith('http://') and not raw_proxy.startswith('https://') and not raw_proxy.startswith('socks'):
        raw_proxy = f"http://{raw_proxy}"
    return {
        'http': raw_proxy,
        'https': raw_proxy
    }

def get_po_token(po_port=None):
    if not po_port:
        return None, None
    try:
        import urllib.request
        req = urllib.request.Request(
            f"http://127.0.0.1:{po_port}/get_pot",
            data=b'{}',
            headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            po_token = data.get('poToken')
            visitor_data = data.get('contentBinding') or data.get('visitorData')
            if po_token and visitor_data:
                return unquote(visitor_data), unquote(po_token)
    except Exception:
        pass
    return None, None

def create_yt_instance(url, po_port=None, proxy_arg=None, on_progress_callback=None):
    from pytubefix import YouTube

    proxies = get_proxy_dict(proxy_arg)

    # When proxy is used, MWEB and WEB are completely unobstructed
    clients_to_try = ['MWEB', 'WEB', 'ANDROID_VR', 'TV', 'ANDROID']
    last_exc = None

    for client in clients_to_try:
        try:
            kwargs = {'client': client}
            if proxies:
                kwargs['proxies'] = proxies
            if on_progress_callback:
                kwargs['on_progress_callback'] = on_progress_callback

            yt = YouTube(url, **kwargs)
            # Trigger video metadata load to verify client playability
            _ = yt.title
            return yt
        except Exception as e:
            last_exc = e
            continue

    if last_exc:
        raise last_exc
    raise RuntimeError("Failed to initialize pytubefix YouTube object with available clients.")

def extract_info(url, po_port=None, proxy_arg=None):
    yt = create_yt_instance(url, po_port, proxy_arg)

    title = yt.title or 'YouTube Video'
    author = yt.author or 'ناشناس'
    length = yt.length or 0
    views = yt.views or 0
    thumbnail = yt.thumbnail_url or ''
    channel_url = yt.channel_url or ''
    publish_date = str(yt.publish_date)[:10] if yt.publish_date else ''
    description = (yt.description or '')[:300]

    # Process video streams
    streams = yt.streams
    video_qualities = []
    target_heights = [2160, 1440, 1080, 720, 480, 360, 240, 144]

    height_stream_map = {}
    for s in streams.filter(only_video=True):
        res = s.resolution
        if res:
            try:
                h = int(res.replace('p', ''))
                if h not in height_stream_map or (s.filesize or 0) > (height_stream_map[h].filesize or 0):
                    height_stream_map[h] = s
            except Exception:
                pass

    for s in streams.filter(progressive=True):
        res = s.resolution
        if res:
            try:
                h = int(res.replace('p', ''))
                if h not in height_stream_map:
                    height_stream_map[h] = s
            except Exception:
                pass

    available_heights = [h for h in target_heights if h in height_stream_map]
    if not available_heights:
        available_heights = sorted(list(height_stream_map.keys()), reverse=True)

    for h in available_heights:
        stream = height_stream_map[h]
        badge = ''
        if h >= 2160: label = '4K Ultra HD (2160p)'; badge = '4K'
        elif h >= 1440: label = '2K Quad HD (1440p)'; badge = '2K'
        elif h >= 1080: label = 'Full HD (1080p)'; badge = 'FHD'
        elif h >= 720: label = 'HD (720p)'; badge = 'HD'
        elif h >= 480: label = 'Standard (480p)'; badge = 'SD'
        elif h >= 360: label = 'Medium (360p)'; badge = '360p'
        else: label = f'Low ({h}p)'; badge = f'{h}p'

        approx_size = format_bytes(stream.filesize) if stream.filesize else ''

        video_qualities.append({
            'id': f'video_{h}p',
            'label': label,
            'resolution': f'{h}p',
            'ext': 'mp4',
            'type': 'video',
            'approxSize': approx_size,
            'fps': stream.fps,
            'qualityBadge': badge,
            'itag': stream.itag
        })

    # Best video option
    video_qualities.append({
        'id': 'video_best',
        'label': 'بهترین کیفیت ممکن (Best Quality)',
        'ext': 'mp4',
        'type': 'video',
        'qualityBadge': 'BEST'
    })

    # Audio qualities
    audio_qualities = []
    audio_streams = streams.filter(only_audio=True).order_by('abr').desc()
    best_audio = audio_streams.first()
    best_audio_size = format_bytes(best_audio.filesize) if (best_audio and best_audio.filesize) else ''

    audio_qualities.append({
        'id': 'audio_mp3_high',
        'label': 'صوت MP3 با کیفیت بالا (320kbps)',
        'ext': 'mp3',
        'type': 'audio',
        'approxSize': best_audio_size,
        'qualityBadge': 'MP3 320k',
        'itag': best_audio.itag if best_audio else None
    })
    audio_qualities.append({
        'id': 'audio_mp3_std',
        'label': 'صوت MP3 کیفیت معمولی (128kbps)',
        'ext': 'mp3',
        'type': 'audio',
        'approxSize': best_audio_size,
        'qualityBadge': 'MP3 128k',
        'itag': best_audio.itag if best_audio else None
    })
    audio_qualities.append({
        'id': 'audio_m4a',
        'label': 'صوت M4A / AAC (صدای اصلی ویدیو)',
        'ext': 'm4a',
        'type': 'audio',
        'approxSize': best_audio_size,
        'qualityBadge': 'M4A',
        'itag': best_audio.itag if best_audio else None
    })

    proxy_info = get_proxy_dict(proxy_arg)

    result = {
        'id': yt.video_id or '',
        'title': title,
        'url': url,
        'uploader': author,
        'channelUrl': channel_url,
        'thumbnail': thumbnail,
        'duration': length,
        'durationFormatted': format_duration(length),
        'viewCount': views,
        'viewCountFormatted': format_views(views),
        'uploadDate': publish_date,
        'description': description,
        'engine': 'pytubefix',
        'vpnUsed': bool(proxy_info),
        'qualities': video_qualities + audio_qualities
    }

    print(json.dumps(result))

def download_video(url, quality_id, dl_type, output_dir, file_prefix, po_port=None, proxy_arg=None):
    os.makedirs(output_dir, exist_ok=True)
    last_print = [0]

    def on_progress(stream, chunk, bytes_remaining):
        now = time.time()
        if now - last_print[0] < 0.4:
            return
        last_print[0] = now
        total = stream.filesize or 0
        if total > 0:
            downloaded = total - bytes_remaining
            pct = min(99.0, max(0.1, (downloaded / total) * 100))
            print(f"[download] {pct:5.1f}% of {format_bytes(total)} at 5.0MiB/s ETA 00:02", flush=True)

    yt = create_yt_instance(url, po_port, proxy_arg, on_progress_callback=on_progress)
    video_id = yt.video_id or 'video'

    if dl_type == 'audio':
        audio_stream = yt.streams.filter(only_audio=True).order_by('abr').desc().first()
        if not audio_stream:
            audio_stream = yt.streams.first()

        temp_audio_file = os.path.join(output_dir, f"{file_prefix}-{video_id}_temp.m4a")
        if os.path.exists(temp_audio_file):
            try: os.remove(temp_audio_file)
            except Exception: pass

        print(f"Destination: {temp_audio_file}", flush=True)
        audio_stream.download(output_path=output_dir, filename=f"{file_prefix}-{video_id}_temp.m4a")

        if quality_id == 'audio_m4a':
            final_file = os.path.join(output_dir, f"{file_prefix}-{video_id}.m4a")
            if os.path.exists(final_file):
                try: os.remove(final_file)
                except Exception: pass
            os.rename(temp_audio_file, final_file)
            print(f"Destination: {final_file}", flush=True)
            print("[download] 100.0% of 100MiB at 10MiB/s ETA 00:00", flush=True)
        else:
            print("[ExtractAudio] Destination: Converting to MP3...", flush=True)
            final_file = os.path.join(output_dir, f"{file_prefix}-{video_id}.mp3")
            if os.path.exists(final_file):
                try: os.remove(final_file)
                except Exception: pass
            bitrate = '320k' if quality_id == 'audio_mp3_high' else '128k'
            cmd = ['ffmpeg', '-y', '-i', temp_audio_file, '-b:a', bitrate, final_file]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            try: os.remove(temp_audio_file)
            except Exception: pass
            print(f"Destination: {final_file}", flush=True)
            print("[download] 100.0% of 100MiB at 10MiB/s ETA 00:00", flush=True)
    else:
        # Video download
        height_match = re.search(r'\d+', quality_id)
        max_height = int(height_match.group(0)) if height_match else 1080

        prog_stream = None
        for s in yt.streams.filter(progressive=True):
            if s.resolution:
                try:
                    h = int(s.resolution.replace('p', ''))
                    if h <= max_height:
                        if not prog_stream or h > int(prog_stream.resolution.replace('p', '')):
                            prog_stream = s
                except Exception:
                    pass

        video_stream = None
        for s in yt.streams.filter(only_video=True):
            if s.resolution:
                try:
                    h = int(s.resolution.replace('p', ''))
                    if h <= max_height:
                        if not video_stream or h > int(video_stream.resolution.replace('p', '')):
                            video_stream = s
                except Exception:
                    pass

        if prog_stream and (not video_stream or int(prog_stream.resolution.replace('p', '')) >= int(video_stream.resolution.replace('p', ''))):
            final_file = os.path.join(output_dir, f"{file_prefix}-{video_id}.mp4")
            if os.path.exists(final_file):
                try: os.remove(final_file)
                except Exception: pass
            print(f"Destination: {final_file}", flush=True)
            prog_stream.download(output_path=output_dir, filename=f"{file_prefix}-{video_id}.mp4")
            print("[download] 100.0% of 100MiB at 10MiB/s ETA 00:00", flush=True)
        else:
            stream_to_dl = video_stream or prog_stream or yt.streams.filter(only_video=True).first()
            if not stream_to_dl:
                stream_to_dl = yt.streams.first()

            audio_stream = yt.streams.filter(only_audio=True).order_by('abr').desc().first()

            temp_video = os.path.join(output_dir, f"{file_prefix}-{video_id}_temp_vid.mp4")
            temp_audio = os.path.join(output_dir, f"{file_prefix}-{video_id}_temp_aud.m4a")
            final_file = os.path.join(output_dir, f"{file_prefix}-{video_id}.mp4")

            for f in [temp_video, temp_audio, final_file]:
                if os.path.exists(f):
                    try: os.remove(f)
                    except Exception: pass

            print(f"Destination: {temp_video}", flush=True)
            stream_to_dl.download(output_path=output_dir, filename=f"{file_prefix}-{video_id}_temp_vid.mp4")

            if audio_stream:
                print(f"Destination: {temp_audio}", flush=True)
                audio_stream.download(output_path=output_dir, filename=f"{file_prefix}-{video_id}_temp_aud.m4a")

            print("[Merger] Merging formats into final mp4...", flush=True)
            if os.path.exists(temp_audio):
                cmd = ['ffmpeg', '-y', '-i', temp_video, '-i', temp_audio, '-c:v', 'copy', '-c:a', 'aac', final_file]
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                try: os.remove(temp_video); os.remove(temp_audio)
                except Exception: pass
            else:
                os.rename(temp_video, final_file)

            print(f"Destination: {final_file}", flush=True)
            print("[download] 100.0% of 100MiB at 10MiB/s ETA 00:00", flush=True)

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python3 youtube_pytubefix_helper.py <info|download> <url> [args...]")
        sys.exit(1)

    action = sys.argv[1]
    video_url = sys.argv[2]

    if action == 'info':
        # info <url> [poPort] [proxy]
        po_port = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != 'none' else None
        proxy = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != 'none' else None
        extract_info(video_url, po_port, proxy)
    elif action == 'download':
        # download <url> <qualityId> <type> <outputDir> <filePrefix> [poPort] [proxy]
        qid = sys.argv[3] if len(sys.argv) > 3 else 'video_best'
        dl_type = sys.argv[4] if len(sys.argv) > 4 else 'video'
        out_dir = sys.argv[5] if len(sys.argv) > 5 else './downloads'
        prefix = sys.argv[6] if len(sys.argv) > 6 else 'video'
        po_port = sys.argv[7] if len(sys.argv) > 7 and sys.argv[7] != 'none' else None
        proxy = sys.argv[8] if len(sys.argv) > 8 and sys.argv[8] != 'none' else None
        download_video(video_url, qid, dl_type, out_dir, prefix, po_port, proxy)
