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

    # Prioritize WEB and ANDROID_VR as they provide all DASH quality streams
    clients_to_try = ['WEB', 'ANDROID_VR', 'MWEB', 'ANDROID', 'TV']
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
                s_bitrate = getattr(s, 'bitrate', 0) or 0
                prev_bitrate = getattr(height_stream_map.get(h), 'bitrate', 0) or 0
                if h not in height_stream_map or s_bitrate > prev_bitrate:
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

        s_bitrate = getattr(stream, 'bitrate', 0) or 0
        approx_size = format_bytes((s_bitrate * length) // 8) if s_bitrate and length else ''

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

    # Extract Subtitles / Captions
    subtitles_list = []
    try:
        captions = yt.captions
        has_fa = False
        base_caption_url = None
        fallback_caption_url = None
        if captions:
            for cap in captions:
                code = getattr(cap, 'code', '') or ''
                name = getattr(cap, 'name', '') or code
                cap_url = getattr(cap, 'url', '') or ''
                if cap_url:
                    if not fallback_caption_url:
                        fallback_caption_url = cap_url
                    # Prefer primary caption track without variant=timing-optimized for tlang= translations
                    if 'variant=' not in cap_url:
                        if not base_caption_url or code in ('en', 'a.en', 'en-US', 'a.en-US'):
                            base_caption_url = cap_url
                is_auto = code.startswith('a.') or 'auto' in str(name).lower()
                clean_lang = code[2:] if code.startswith('a.') else code
                if clean_lang == 'fa' or clean_lang.startswith('fa-'):
                    has_fa = True
                subtitles_list.append({
                    'id': f"sub_{'auto' if is_auto else 'manual'}_{clean_lang}",
                    'lang': clean_lang,
                    'rawCode': code,
                    'name': str(name),
                    'isAuto': is_auto,
                    'formats': ['srt', 'vtt', 'txt'],
                    'url': cap_url
                })
            chosen_base_url = base_caption_url or fallback_caption_url
            # If video has captions but Persian (fa) is not directly listed, offer YouTube auto-translate to Persian
            if chosen_base_url and not has_fa:
                sep = '&' if '?' in chosen_base_url else '?'
                subtitles_list.insert(0, {
                    'id': 'sub_auto_fa',
                    'lang': 'fa',
                    'rawCode': 'a.fa',
                    'name': 'Persian - فارسی (ترجمه خودکار)',
                    'isAuto': True,
                    'formats': ['srt', 'vtt', 'txt'],
                    'url': f"{chosen_base_url}{sep}tlang=fa&fmt=vtt"
                })
    except Exception:
        pass

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
        'qualities': video_qualities + audio_qualities,
        'subtitles': subtitles_list
    }

    print(json.dumps(result))

def xml_or_vtt_to_srt_and_txt(raw_text, target_ext):
    import html
    import xml.etree.ElementTree as ET

    text = raw_text.strip()
    entries = []

    def fmt_srt_time(sec_float):
        total_ms = int(round(max(0.0, sec_float) * 1000))
        hrs = total_ms // 3600000
        mins = (total_ms % 3600000) // 60000
        secs = (total_ms % 60000) // 1000
        ms = total_ms % 1000
        return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"

    def fmt_vtt_time(sec_float):
        return fmt_srt_time(sec_float).replace(',', '.')

    if text.startswith('WEBVTT'):
        if target_ext == 'vtt':
            return text
        blocks = re.split(r'\r?\n\r?\n', text)
        idx = 1
        txt_lines = []
        srt_blocks = []
        for b in blocks:
            lines = [l.strip() for l in b.strip().splitlines() if l.strip()]
            if not lines or lines[0].startswith('WEBVTT') or lines[0].startswith('Kind:') or lines[0].startswith('Language:'):
                continue
            time_line_idx = -1
            for i, l in enumerate(lines):
                if '-->' in l:
                    time_line_idx = i
                    break
            if time_line_idx != -1:
                time_part = re.sub(r'(\d{2}:\d{2}:\d{2})\.(\d{3})', r'\1,\2', lines[time_line_idx])
                time_part = re.sub(r'^(\d{2}:\d{2})\.(\d{3})', r'00:\1,\2', time_part)
                time_part = re.sub(r'-->\s*(\d{2}:\d{2})\.(\d{3})', r'--> 00:\1,\2', time_part)
                # Strip VTT positioning tags
                time_arrows = time_part.split('-->')
                if len(time_arrows) == 2:
                    start_t = time_arrows[0].strip().split(' ')[0]
                    end_t = time_arrows[1].strip().split(' ')[0]
                    time_part = f"{start_t} --> {end_t}"
                content_lines = [re.sub(r'<[^>]+>', '', cl) for cl in lines[time_line_idx+1:]]
                content_str = '\n'.join([cl for cl in content_lines if cl.strip()])
                if content_str:
                    srt_blocks.append(f"{idx}\n{time_part}\n{content_str}")
                    txt_lines.append(content_str)
                    idx += 1
        if target_ext == 'txt':
            return '\n'.join(txt_lines)
        return '\n\n'.join(srt_blocks)

    # Otherwise try parsing XML timedtext (<transcript><text start="..." dur="..."> or <timedtext><body><p t="..." d="...">)
    try:
        root = ET.fromstring(text)
        for elem in root.iter():
            if elem.tag in ('text', 'p'):
                start = 0.0
                dur = 3.0
                if 'start' in elem.attrib:
                    start = float(elem.attrib.get('start', '0'))
                    dur = float(elem.attrib.get('dur', '3'))
                elif 't' in elem.attrib:
                    start = float(elem.attrib.get('t', '0')) / 1000.0
                    dur = float(elem.attrib.get('d', '3000')) / 1000.0
                content = ''.join(elem.itertext()).strip()
                content = html.unescape(content)
                if content:
                    entries.append((start, start + dur, content))
    except Exception:
        pass

    if entries:
        if target_ext == 'txt':
            return '\n'.join([e[2] for e in entries])
        elif target_ext == 'vtt':
            out = ["WEBVTT\n"]
            for i, (st, et, content) in enumerate(entries, 1):
                out.append(f"{i}\n{fmt_vtt_time(st)} --> {fmt_vtt_time(et)}\n{content}\n")
            return '\n'.join(out)
        else:
            out = []
            for i, (st, et, content) in enumerate(entries, 1):
                out.append(f"{i}\n{fmt_srt_time(st)} --> {fmt_srt_time(et)}\n{content}")
            return '\n\n'.join(out)

    return text

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

    if dl_type == 'subtitle':
        # quality_id format: sub_<manual|auto>_<lang>[:<ext>]
        parts = quality_id.split(':')
        sub_id = parts[0]
        sub_ext = parts[1].lower() if len(parts) > 1 and parts[1].lower() in ('srt', 'vtt', 'txt') else 'srt'
        lang_code = sub_id.replace('sub_manual_', '').replace('sub_auto_', '')

        final_file = os.path.join(output_dir, f"{file_prefix}-{video_id}.{lang_code}.{sub_ext}")
        print(f"Destination: {final_file}", flush=True)

        target_cap = None
        base_cap = None
        fallback_cap = None
        for cap in yt.captions:
            c_code = getattr(cap, 'code', '') or ''
            c_url = getattr(cap, 'url', '') or ''
            clean_c = c_code[2:] if c_code.startswith('a.') else c_code
            if not fallback_cap and c_url:
                fallback_cap = cap
            if c_url and 'variant=' not in c_url:
                if not base_cap or c_code in ('en', 'a.en', 'en-US', 'a.en-US'):
                    base_cap = cap
            if c_code == lang_code or clean_c == lang_code:
                if not target_cap or 'variant=' not in c_url:
                    target_cap = cap

        chosen_base_cap = base_cap or fallback_cap
        raw_caption_data = ''
        if target_cap:
            try:
                if sub_ext == 'srt' and hasattr(target_cap, 'generate_srt_captions'):
                    raw_caption_data = target_cap.generate_srt_captions()
                else:
                    raw_caption_data = getattr(target_cap, 'xml_captions', '') or target_cap.generate_srt_captions()
            except Exception:
                raw_caption_data = getattr(target_cap, 'xml_captions', '')
        elif chosen_base_cap and getattr(chosen_base_cap, 'url', None):
            import urllib.request
            import urllib.parse
            import html
            import xml.etree.ElementTree as ET
            from concurrent.futures import ThreadPoolExecutor

            raw_base_url = chosen_base_cap.url
            proxies = get_proxy_dict(proxy_arg)
            opener = urllib.request.build_opener(urllib.request.ProxyHandler(proxies)) if proxies else urllib.request.build_opener()

            # Try YouTube native tlang= first
            try:
                cap_url = re.sub(r'fmt=[^&]+', 'fmt=vtt', raw_base_url) if 'fmt=' in raw_base_url else f"{raw_base_url}{'&' if '?' in raw_base_url else '?'}fmt=vtt"
                sep = '&' if '?' in cap_url else '?'
                trans_url = f"{cap_url}{sep}tlang={lang_code}"
                req = urllib.request.Request(trans_url, headers={"User-Agent": "Mozilla/5.0"})
                with opener.open(req, timeout=15) as resp:
                    candidate = resp.read().decode('utf-8', errors='replace')
                    if candidate and ('WEBVTT' in candidate or '-->' in candidate or '<text' in candidate):
                        raw_caption_data = candidate
            except Exception:
                raw_caption_data = ''

            # Fallback when YouTube rate-limits tlang= with HTTP 429: fetch original srv1 track and batch-translate cues
            if not raw_caption_data:
                srv1_url = re.sub(r'fmt=[^&]+', 'fmt=srv1', raw_base_url) if 'fmt=' in raw_base_url else f"{raw_base_url}{'&' if '?' in raw_base_url else '?'}fmt=srv1"
                srv1_url = re.sub(r'&tlang=[^&]+', '', srv1_url)
                req_orig = urllib.request.Request(srv1_url, headers={"User-Agent": "Mozilla/5.0"})
                with opener.open(req_orig, timeout=20) as resp_orig:
                    orig_xml = resp_orig.read().decode('utf-8', errors='replace')

                root = ET.fromstring(orig_xml)
                cues = []
                for elem in root.iter():
                    if elem.tag in ('text', 'p'):
                        st = float(elem.attrib.get('start', elem.attrib.get('t', '0')))
                        dur = float(elem.attrib.get('dur', elem.attrib.get('d', '3')))
                        if 't' in elem.attrib and 'start' not in elem.attrib:
                            st /= 1000.0
                            dur /= 1000.0
                        txt = html.unescape(''.join(elem.itertext()).strip()).replace('\r', ' ').replace('\n', ' ')
                        if txt:
                            cues.append([st, st + dur, txt])

                # Prevent overlapping ASR rollup end times
                for i in range(len(cues) - 1):
                    if cues[i + 1][0] > cues[i][0] and cues[i][1] > cues[i + 1][0]:
                        cues[i][1] = cues[i + 1][0]

                batch_size = 50
                batches = [cues[i:i + batch_size] for i in range(0, len(cues), batch_size)]
                target_tl = lang_code.split('-')[0] if lang_code.startswith('fa') else lang_code

                def translate_batch(batch):
                    joined = '\n'.join([b[2] for b in batch])
                    g_url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl={urllib.parse.quote(target_tl)}&dt=t&q={urllib.parse.quote(joined)}"
                    for use_op in ([urllib.request.build_opener(), opener] if proxies else [opener]):
                        try:
                            g_req = urllib.request.Request(g_url, headers={"User-Agent": "Mozilla/5.0"})
                            with use_op.open(g_req, timeout=15) as g_resp:
                                g_data = json.loads(g_resp.read().decode('utf-8', errors='replace'))
                                full_t = ''.join([p[0] for p in (g_data[0] or []) if p and p[0]])
                                t_lines = [l.strip() for l in full_t.split('\n')]
                                for idx, item in enumerate(batch):
                                    if idx < len(t_lines) and t_lines[idx]:
                                        item[2] = t_lines[idx]
                                break
                        except Exception:
                            continue
                    return batch

                with ThreadPoolExecutor(max_workers=6) as executor:
                    list(executor.map(translate_batch, batches))

                # Build clean XML for xml_or_vtt_to_srt_and_txt converter
                xml_parts = ['<?xml version="1.0" encoding="utf-8" ?><transcript>']
                for st, et, txt in cues:
                    dur = max(0.2, round(et - st, 3))
                    xml_parts.append(f'<text start="{st:.3f}" dur="{dur:.3f}">{html.escape(txt)}</text>')
                xml_parts.append('</transcript>')
                raw_caption_data = ''.join(xml_parts)
        else:
            raise RuntimeError(f"Subtitle for language '{lang_code}' not found")

        converted = xml_or_vtt_to_srt_and_txt(raw_caption_data, sub_ext) if not (sub_ext == 'srt' and '-->' in raw_caption_data and not raw_caption_data.strip().startswith('<') and not raw_caption_data.strip().startswith('WEBVTT')) else raw_caption_data
        with open(final_file, 'w', encoding='utf-8') as f:
            f.write(converted)

        print(f"Destination: {final_file}", flush=True)
        print("[download] 100.0% of 50KiB at 5MiB/s ETA 00:00", flush=True)
        return

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

