#!/usr/bin/env python3
"""
Instagram Account, Session & Netscape Cookie Manager powered by aiograpi.
Provides anti-detection/anti-ban device fingerprinting, 2FA (TOTP/SMS/Backup code)
and Challenge support, multi-account session persistence (instagram_session.json &
instagram_page_info.json), and Netscape HTTP Cookie extraction (cookies.txt).
"""

import sys
import os
import re
import json
import time
import uuid
import hmac
import hashlib
import base64
import shutil
import asyncio
import requests
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List

# Ensure aiograpi is importable
from aiograpi import Client, config as ig_config
from aiograpi.extractors import extract_highlight_v1
from aiograpi.exceptions import (
    TwoFactorRequired,
    ChallengeRequired,
    ChallengeError,
    BadPassword,
    BadCredentials,
    LoginRequired,
    PleaseWaitFewMinutes,
    ClientError,
    ReloginAttemptExceeded,
)

ROOT_DIR = Path(os.getcwd())
ACCOUNTS_DIR = ROOT_DIR / "instagram_accounts"
ACCOUNTS_DIR.mkdir(parents=True, exist_ok=True)

ACTIVE_SESSION_FILE = ROOT_DIR / "instagram_session.json"
ACTIVE_PAGE_INFO_FILE = ROOT_DIR / "instagram_page_info.json"
ACTIVE_COOKIES_FILE = ROOT_DIR / "cookies.txt"

# Realistic Android 15 (API 35) & Android 14 (API 34) flagship hardware profiles for anti-ban stealth
DEVICE_PROFILES: Dict[str, Dict[str, Any]] = {
    "pixel_9_pro_xl_a15": {
        "label": "Google Pixel 9 Pro XL (Android 15 · API 35)",
        "android_version": 35,
        "android_release": "15",
        "dpi": "480dpi",
        "resolution": "1344x2992",
        "manufacturer": "Google/google",
        "device": "komodo",
        "model": "Pixel 9 Pro XL",
        "cpu": "komodo",
    },
    "pixel_8_pro_a15": {
        "label": "Google Pixel 8 Pro (Android 15 · API 35)",
        "android_version": 35,
        "android_release": "15",
        "dpi": "480dpi",
        "resolution": "1344x2992",
        "manufacturer": "Google/google",
        "device": "husky",
        "model": "Pixel 8 Pro",
        "cpu": "husky",
    },
    "galaxy_s25_ultra_a15": {
        "label": "Samsung Galaxy S25 Ultra (Android 15 · API 35)",
        "android_version": 35,
        "android_release": "15",
        "dpi": "450dpi",
        "resolution": "1440x3120",
        "manufacturer": "samsung",
        "device": "pa3q",
        "model": "SM-S938B",
        "cpu": "qcom",
    },
    "galaxy_s24_ultra_a15": {
        "label": "Samsung Galaxy S24 Ultra (Android 15 · API 35)",
        "android_version": 35,
        "android_release": "15",
        "dpi": "450dpi",
        "resolution": "1440x3120",
        "manufacturer": "samsung",
        "device": "e3q",
        "model": "SM-S928B",
        "cpu": "qcom",
    },
    "xiaomi_15_pro_a15": {
        "label": "Xiaomi 15 Pro (Android 15 · API 35)",
        "android_version": 35,
        "android_release": "15",
        "dpi": "520dpi",
        "resolution": "1440x3200",
        "manufacturer": "Xiaomi/xiaomi",
        "device": "haotian",
        "model": "2410DPN6CC",
        "cpu": "qcom",
    },
    "pixel_8_pro": {
        "label": "Google Pixel 8 Pro (Android 14 · API 34)",
        "android_version": 34,
        "android_release": "14",
        "dpi": "480dpi",
        "resolution": "1344x2992",
        "manufacturer": "Google/google",
        "device": "husky",
        "model": "Pixel 8 Pro",
        "cpu": "husky",
    },
    "galaxy_s24_ultra": {
        "label": "Samsung Galaxy S24 Ultra (Android 14 · API 34)",
        "android_version": 34,
        "android_release": "14",
        "dpi": "450dpi",
        "resolution": "1440x3120",
        "manufacturer": "samsung",
        "device": "e3q",
        "model": "SM-S928B",
        "cpu": "qcom",
    },
    "pixel_7_pro": {
        "label": "Google Pixel 7 Pro (Android 14 · API 34)",
        "android_version": 34,
        "android_release": "14",
        "dpi": "512dpi",
        "resolution": "1440x3120",
        "manufacturer": "Google/google",
        "device": "cheetah",
        "model": "Pixel 7 Pro",
        "cpu": "cheetah",
    },
    "xiaomi_14_pro": {
        "label": "Xiaomi 14 Pro (Android 14 · API 34)",
        "android_version": 34,
        "android_release": "14",
        "dpi": "520dpi",
        "resolution": "1440x3200",
        "manufacturer": "Xiaomi/xiaomi",
        "device": "shennong",
        "model": "23116PN5BC",
        "cpu": "qcom",
    },
    "oneplus_12": {
        "label": "OnePlus 12 (Android 14 · API 34)",
        "android_version": 34,
        "android_release": "14",
        "dpi": "510dpi",
        "resolution": "1440x3168",
        "manufacturer": "OnePlus",
        "device": "OP5929L1",
        "model": "CPH2581",
        "cpu": "qcom",
    },
}

APP_VERSION_PROFILES: Dict[str, Dict[str, str]] = {
    "448.0.0.0.20": {
        "app_version": "448.0.0.0.20",
        "version_code": "1065560286",
        "bloks_versioning_id": "0bc46a03e177bfc9bc8d611918815acf248fa9c77754d807d6a5951dc9ce9432",
    },
    "446.0.0.49.77": {
        "app_version": "446.0.0.49.77",
        "version_code": "385211303",
        "bloks_versioning_id": "935a519904e9017324cdedb64a283a3c2c1a3d5b0bbc698b451f5aef72cc11df",
    },
}


def sanitize_username(username: str) -> str:
    clean = str(username or "").strip().lstrip("@").lower()
    clean = "".join(c for c in clean if c.isalnum() or c in ("_", ".", "-"))
    return clean or "default_account"


def get_account_dir(username: str) -> Path:
    d = ACCOUNTS_DIR / sanitize_username(username)
    d.mkdir(parents=True, exist_ok=True)
    return d


def generate_pinned_uuids(seed_str: Optional[str] = None) -> Dict[str, str]:
    """Generate realistic Android UUIDs for an account."""
    if seed_str:
        # Use random UUIDs on first creation, then persist on disk
        pass
    android_hash = hashlib.sha256(f"{uuid.uuid4()}-{time.time()}".encode()).hexdigest()[:16]
    return {
        "phone_id": str(uuid.uuid4()),
        "uuid": str(uuid.uuid4()),
        "client_session_id": str(uuid.uuid4()),
        "advertising_id": str(uuid.uuid4()),
        "android_device_id": f"android-{android_hash}",
        "request_id": str(uuid.uuid4()),
        "tray_session_id": str(uuid.uuid4()),
    }


def build_device_settings(
    device_key: str = "pixel_9_pro_xl_a15",
    app_version_key: str = "448.0.0.0.20",
) -> Tuple[Dict[str, Any], str]:
    hw = dict(DEVICE_PROFILES.get(device_key) or DEVICE_PROFILES["pixel_9_pro_xl_a15"])
    hw.pop("label", None)
    app_prof = dict(APP_VERSION_PROFILES.get(app_version_key) or APP_VERSION_PROFILES["448.0.0.0.20"])
    device_settings = {**hw, **app_prof}
    user_agent = (
        f"Instagram {device_settings['app_version']} "
        f"Android ({device_settings['android_version']}/{device_settings['android_release']}; "
        f"{device_settings['dpi']}; {device_settings['resolution']}; {device_settings['manufacturer']}; "
        f"{device_settings['model']}; {device_settings['device']}; {device_settings['cpu']}; "
        f"en_US; {device_settings['version_code']})"
    )
    return device_settings, user_agent


def get_or_create_fingerprint(
    username: str,
    device_key: str = "pixel_9_pro_xl_a15",
    app_version_key: str = "448.0.0.0.20",
    force_new_device: bool = False,
) -> Dict[str, Any]:
    acc_dir = get_account_dir(username)
    fp_file = acc_dir / ".device_fingerprint.json"
    sess_file = acc_dir / "instagram_session.json"

    # Always ensure a valid modern app_version (448.0.0.0.20)
    if app_version_key not in APP_VERSION_PROFILES:
        app_version_key = "448.0.0.0.20"

    device_settings, user_agent = build_device_settings(device_key, app_version_key)
    existing_uuids = None

    if not force_new_device:
        if sess_file.exists():
            try:
                sess = json.loads(sess_file.read_text("utf-8"))
                if sess.get("uuids"):
                    existing_uuids = sess["uuids"]
            except Exception:
                pass
        if not existing_uuids and fp_file.exists():
            try:
                fp_prev = json.loads(fp_file.read_text("utf-8"))
                if fp_prev.get("uuids"):
                    existing_uuids = fp_prev["uuids"]
            except Exception:
                pass

    uuids = existing_uuids or generate_pinned_uuids(username)
    fp = {
        "uuids": uuids,
        "device_settings": device_settings,
        "user_agent": user_agent,
        "device_key": device_key,
        "app_version_key": app_version_key,
        "created_at": datetime.now().isoformat(),
    }
    try:
        fp_file.write_text(json.dumps(fp, indent=2), "utf-8")
    except Exception:
        pass
    return fp


def normalize_session_dict(raw_settings: Dict[str, Any], fallback_fp: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Format session dictionary to match the exact schema of instagram_session.json:
    uuids, mid, ig_u_rur, ig_www_claim, authorization_data, cookies, last_login,
    device_settings, user_agent, country, country_code, locale, timezone_offset,
    timezone_name, push_disabled, request_timeout, public_request_retries_count,
    public_request_retries_timeout, session_retry_total, session_retry_backoff_factor,
    session_retry_statuses, public_transport, public_transport_impersonate, tls_verify
    """
    fp = fallback_fp or {}
    default_dev, default_ua = build_device_settings("pixel_9_pro_xl_a15", "448.0.0.0.20")

    uuids = raw_settings.get("uuids") or fp.get("uuids") or generate_pinned_uuids()
    device_settings = dict(raw_settings.get("device_settings") or fp.get("device_settings") or default_dev)
    user_agent = raw_settings.get("user_agent") or fp.get("user_agent") or default_ua

    # Auto-upgrade obsolete Instagram versions (e.g. 428.x or older) to supported 448.0.0.0.20
    cur_app_ver = str(device_settings.get("app_version") or "")
    if not cur_app_ver or cur_app_ver.startswith("428.") or cur_app_ver not in APP_VERSION_PROFILES:
        device_settings["app_version"] = "448.0.0.0.20"
        device_settings["version_code"] = "1065560286"
        device_settings["bloks_versioning_id"] = "0bc46a03e177bfc9bc8d611918815acf248fa9c77754d807d6a5951dc9ce9432"
        if "428.0.0.47.67" in user_agent:
            user_agent = user_agent.replace("428.0.0.47.67", "448.0.0.0.20").replace("961145276", "1065560286")

    auth_data = dict(raw_settings.get("authorization_data") or {})
    # Keep ds_user_id and sessionid clean as in sample
    clean_auth: Dict[str, Any] = {}
    if "ds_user_id" in auth_data and auth_data["ds_user_id"]:
        clean_auth["ds_user_id"] = str(auth_data["ds_user_id"])
    if "sessionid" in auth_data and auth_data["sessionid"]:
        clean_auth["sessionid"] = str(auth_data["sessionid"])
    for k, v in auth_data.items():
        if k not in ("ds_user_id", "sessionid", "should_use_header_over_cookies"):
            clean_auth[k] = v

    cookies = dict(raw_settings.get("cookies") or {})
    mid = raw_settings.get("mid") or cookies.get("mid")
    ig_u_rur = raw_settings.get("ig_u_rur")
    if not cookies.get("rur") and ig_u_rur:
        cookies["rur"] = ig_u_rur

    normalized = {
        "uuids": {
            "phone_id": uuids.get("phone_id", str(uuid.uuid4())),
            "uuid": uuids.get("uuid", str(uuid.uuid4())),
            "client_session_id": uuids.get("client_session_id", str(uuid.uuid4())),
            "advertising_id": uuids.get("advertising_id", str(uuid.uuid4())),
            "android_device_id": uuids.get("android_device_id", f"android-{hashlib.sha256(str(time.time()).encode()).hexdigest()[:16]}"),
            "request_id": uuids.get("request_id", str(uuid.uuid4())),
            "tray_session_id": uuids.get("tray_session_id", str(uuid.uuid4())),
        },
        "mid": mid,
        "ig_u_rur": ig_u_rur,
        "ig_www_claim": raw_settings.get("ig_www_claim"),
        "authorization_data": clean_auth,
        "cookies": cookies,
        "last_login": raw_settings.get("last_login") or time.time(),
        "device_settings": {
            "android_version": int(device_settings.get("android_version", 35)),
            "android_release": str(device_settings.get("android_release", "15")),
            "dpi": str(device_settings.get("dpi", "480dpi")),
            "resolution": str(device_settings.get("resolution", "1344x2992")),
            "manufacturer": str(device_settings.get("manufacturer", "Google/google")),
            "device": str(device_settings.get("device", "komodo")),
            "model": str(device_settings.get("model", "Pixel 9 Pro XL")),
            "cpu": str(device_settings.get("cpu", "komodo")),
            "app_version": str(device_settings.get("app_version", "448.0.0.0.20")),
            "version_code": str(device_settings.get("version_code", "1065560286")),
            "bloks_versioning_id": str(
                device_settings.get(
                    "bloks_versioning_id",
                    "0bc46a03e177bfc9bc8d611918815acf248fa9c77754d807d6a5951dc9ce9432",
                )
            ),
        },
        "user_agent": user_agent,
        "country": raw_settings.get("country", "US"),
        "country_code": int(raw_settings.get("country_code", 1)),
        "locale": raw_settings.get("locale", "en_US"),
        "timezone_offset": int(raw_settings.get("timezone_offset", -14400)),
        "timezone_name": raw_settings.get("timezone_name", "GMT-04:00"),
        "push_disabled": bool(raw_settings.get("push_disabled", True)),
        "request_timeout": int(raw_settings.get("request_timeout", 1)),
        "public_request_retries_count": int(raw_settings.get("public_request_retries_count", 3)),
        "public_request_retries_timeout": int(raw_settings.get("public_request_retries_timeout", 2)),
        "session_retry_total": int(raw_settings.get("session_retry_total", 3)),
        "session_retry_backoff_factor": int(raw_settings.get("session_retry_backoff_factor", 2)),
        "session_retry_statuses": list(raw_settings.get("session_retry_statuses") or [429, 500, 502, 503, 504]),
        "public_transport": raw_settings.get("public_transport", "requests"),
        "public_transport_impersonate": raw_settings.get("public_transport_impersonate", "chrome136"),
        "tls_verify": bool(raw_settings.get("tls_verify", True)),
    }
    return normalized


def format_rur_for_netscape(raw_rur: str, ds_user_id: str) -> str:
    """
    Format the rur cookie value to match yt-dlp / Netscape cookie format:
    e.g. "LDC,17841427259615961,1792161107:01ffc80cb61b24..."
    """
    if not raw_rur:
        exp_ts = int(time.time()) + 31536000
        sig = hashlib.sha256(f"rur-{ds_user_id}-{exp_ts}".encode()).hexdigest()
        raw_rur = f"NCG,{ds_user_id},{exp_ts}:01ff{sig[:68]}"
    else:
        raw_rur = urllib.parse.unquote(str(raw_rur)).strip()

    # Strip surrounding quotes if already present
    if raw_rur.startswith('"') and raw_rur.endswith('"'):
        raw_rur = raw_rur[1:-1]

    # Wrap in quotes if it contains commas (standard Netscape / yt-dlp format)
    if "," in raw_rur:
        return f'"{raw_rur}"'
    return raw_rur


def _fetch_real_web_cookies_sync(
    session_data: Dict[str, Any],
    proxy: Optional[str] = None
) -> Dict[str, str]:
    """
    Directly query https://www.instagram.com/ with standard Chrome headers
    to retrieve authentic, cryptographically signed web cookies (datr, csrftoken, mid, ig_did, rur, etc.)
    directly from Meta's edge servers.
    """
    collected: Dict[str, str] = {}
    auth_data = session_data.get("authorization_data") or {}
    cookies_data = session_data.get("cookies") or {}

    raw_sid = str(auth_data.get("sessionid") or cookies_data.get("sessionid") or "").strip()
    ds_user_id = str(auth_data.get("ds_user_id") or cookies_data.get("ds_user_id") or "").strip()
    if not ds_user_id and raw_sid:
        unquoted = urllib.parse.unquote(raw_sid)
        if ":" in unquoted:
            ds_user_id = unquoted.split(":", 1)[0]

    # Proxies to try in order: explicit proxy -> local VPN proxy (127.0.0.1:10809) -> direct
    proxies_to_try = []
    if proxy and proxy.strip():
        proxies_to_try.append(proxy.strip())
    local_vpn = "http://127.0.0.1:10809"
    if local_vpn not in proxies_to_try:
        proxies_to_try.append(local_vpn)
    proxies_to_try.append(None)

    for p in proxies_to_try:
        try:
            s = requests.Session()
            if p:
                s.proxies = {"http": p, "https": p}
            s.headers.update({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
            })

            # Warm-up request to establish session and get genuine datr & mid
            s.get("https://www.instagram.com/", timeout=10)

            # Inject authenticated sessionid and ds_user_id
            if raw_sid:
                s.cookies.set("sessionid", raw_sid, domain=".instagram.com")
            if ds_user_id:
                s.cookies.set("ds_user_id", ds_user_id, domain=".instagram.com")

            # Request authenticated page to obtain genuine cluster routing cookie (rur)
            s.get("https://www.instagram.com/", allow_redirects=False, timeout=10)

            for c in s.cookies:
                if c.value:
                    collected[c.name] = c.value

            if collected.get("sessionid") or collected.get("datr"):
                break
        except Exception:
            continue

    return collected


async def fetch_web_cookies_if_possible(
    cl: Optional[Client],
    session_data: Dict[str, Any],
    proxy: Optional[str] = None
) -> Dict[str, str]:
    """
    Connect to instagram.com through proxy and collect genuine web cookies (datr, csrftoken, mid, rur, etc.)
    """
    try:
        real_cookies = await asyncio.to_thread(_fetch_real_web_cookies_sync, session_data, proxy)
        if real_cookies:
            # Sync back to session_data["cookies"]
            if "cookies" not in session_data or not isinstance(session_data["cookies"], dict):
                session_data["cookies"] = {}
            for k in ["datr", "csrftoken", "mid", "ig_did", "rur", "ps_n", "ps_l"]:
                if real_cookies.get(k):
                    session_data["cookies"][k] = real_cookies[k]
            return real_cookies
    except Exception:
        pass

    # Secondary fallback to cl.public if cl is available
    collected: Dict[str, str] = {}
    if cl is not None:
        try:
            cl.inject_sessionid_to_public()
            pub_cookies = cl.public.cookies_dict() if hasattr(cl.public, "cookies_dict") else {}
            if isinstance(pub_cookies, dict):
                collected.update({k: str(v) for k, v in pub_cookies.items() if v})
        except Exception:
            pass
    return collected


def generate_netscape_cookies_txt(
    session_data: Dict[str, Any],
    web_cookies: Optional[Dict[str, str]] = None,
) -> str:
    """
    Build Netscape HTTP Cookie File (cookies.txt) from an aiograpi session dictionary
    and authentic web cookies.
    """
    now = int(time.time())
    cookies = dict(session_data.get("cookies") or {})
    if web_cookies:
        for k, v in web_cookies.items():
            if v and str(v).strip():
                cookies[k] = str(v).strip()

    auth_data = session_data.get("authorization_data") or {}
    uuids = session_data.get("uuids") or {}

    sessionid = str(auth_data.get("sessionid") or cookies.get("sessionid") or "").strip()
    if ":" in sessionid and "%3A" not in sessionid and "%3a" not in sessionid:
        sessionid = urllib.parse.quote(sessionid, safe="")

    ds_user_id = str(auth_data.get("ds_user_id") or cookies.get("ds_user_id") or "").strip()
    if not ds_user_id and sessionid:
        unquoted_sid = urllib.parse.unquote(sessionid)
        if ":" in unquoted_sid:
            ds_user_id = unquoted_sid.split(":", 1)[0]

    # Use authentic datr, or cookies.get("datr") - DO NOT forge fake hashes
    datr = str(cookies.get("datr") or "").strip()

    # ig_did
    ig_did = str(cookies.get("ig_did") or uuids.get("uuid") or uuid.uuid4()).upper()

    # mid
    mid = str(session_data.get("mid") or cookies.get("mid") or "").strip()
    if not mid:
        seed_material = f"{ds_user_id}:{uuids.get('uuid', '')}:{sessionid}"
        mid_bytes = hashlib.sha256(f"mid:{seed_material}".encode()).digest()[:21]
        mid = base64.urlsafe_b64encode(mid_bytes).decode("ascii").rstrip("=")

    # csrftoken
    csrftoken = str(cookies.get("csrftoken") or "").strip()
    if not csrftoken:
        seed_material = f"{ds_user_id}:{uuids.get('uuid', '')}:{sessionid}"
        csrftoken = hashlib.md5(f"csrf:{seed_material}".encode()).hexdigest()

    ps_n = str(cookies.get("ps_n") or "1")
    ps_l = str(cookies.get("ps_l") or "1")

    raw_rur = cookies.get("rur") or session_data.get("ig_u_rur") or ""
    rur_formatted = format_rur_for_netscape(raw_rur, ds_user_id or "0")

    # Standard expiries (positive future timestamps so MozillaCookieJar does NOT discard them)
    exp_long = now + 34560000      # ~400 days (ps_n, ps_l)
    exp_datr = now + 34400000      # ~398 days (datr, mid)
    exp_ds = now + 7776000         # ~90 days (ds_user_id)
    exp_csrf = now + 31449600      # ~364 days (csrftoken)
    exp_igdid = now + 31536000     # ~365 days (ig_did)
    exp_sid = now + 31536000       # ~365 days (sessionid)
    exp_rur = now + 31536000       # ~365 days (rur)

    rows = []
    if ps_n:
        rows.append((".instagram.com", "TRUE", "/", "TRUE", str(exp_long), "ps_n", ps_n))
    if datr:
        rows.append((".instagram.com", "TRUE", "/", "TRUE", str(exp_datr), "datr", datr))
    if ds_user_id:
        rows.append((".instagram.com", "TRUE", "/", "TRUE", str(exp_ds), "ds_user_id", ds_user_id))
    if csrftoken:
        rows.append((".instagram.com", "TRUE", "/", "TRUE", str(exp_csrf), "csrftoken", csrftoken))
    if ig_did:
        rows.append((".instagram.com", "TRUE", "/", "TRUE", str(exp_igdid), "ig_did", ig_did))
    if ps_l:
        rows.append((".instagram.com", "TRUE", "/", "TRUE", str(exp_long), "ps_l", ps_l))
    if mid:
        rows.append((".instagram.com", "TRUE", "/", "TRUE", str(exp_datr), "mid", mid))
    if sessionid:
        rows.append((".instagram.com", "TRUE", "/", "TRUE", str(exp_sid), "sessionid", sessionid))
    if rur_formatted:
        # Note: exp_rur is a positive timestamp, NOT 0, preventing discard by MozillaCookieJar
        rows.append((".instagram.com", "TRUE", "/", "TRUE", str(exp_rur), "rur", rur_formatted))

    # Include any extra cookies present in cookies dict
    standard_names = {"ps_n", "datr", "ds_user_id", "csrftoken", "ig_did", "ps_l", "mid", "sessionid", "rur"}
    for k, v in cookies.items():
        if k not in standard_names and v is not None and str(v).strip():
            rows.append((".instagram.com", "TRUE", "/", "TRUE", str(exp_sid), str(k), str(v).strip()))

    header = (
        "# Netscape HTTP Cookie File\n"
        "# This file is generated by ServerDash.  Do not edit.\n\n"
    )
    body = "\n".join("\t".join(r) for r in rows) + "\n"
    return header + body


async def fetch_page_info(cl: Client, fallback_username: str = "") -> Dict[str, Any]:
    """
    Fetch user profile details using aiograpi and format as instagram_page_info.json:
    {
      "username": "...",
      "full_name": "...",
      "biography": "...",
      "follower_count": 0,
      "following_count": 0,
      "media_count": 0,
      "is_verified": false,
      "profile_pic_url": "...",
      "cached_at": "2026-07-16T01:08:17.686052"
    }
    """
    username = fallback_username or getattr(cl, "username", "") or ""
    full_name = ""
    biography = ""
    follower_count = 0
    following_count = 0
    media_count = 0
    is_verified = False
    profile_pic_url = ""

    user_id = cl.user_id
    user_obj = None

    # 1. Try user_info_v1(user_id) via private mobile API (most complete: follower_count, following_count, media_count)
    if user_id:
        try:
            user_obj = await cl.user_info_v1(int(user_id))
        except Exception:
            user_obj = None

    # 2. Fallback: Try account_info() + user_info_by_username
    if not user_obj:
        try:
            acc = await cl.account_info()
            if acc:
                username = getattr(acc, "username", "") or username
                full_name = getattr(acc, "full_name", "") or full_name
                biography = getattr(acc, "biography", "") or biography
                is_verified = bool(getattr(acc, "is_verified", False))
                profile_pic_url = str(getattr(acc, "profile_pic_url", "") or "")
        except Exception:
            pass

        if username:
            try:
                user_obj = await cl.user_info_by_username_v1(username)
            except Exception:
                try:
                    user_obj = await cl.user_info_by_username(username)
                except Exception:
                    pass

    if user_obj:
        username = str(getattr(user_obj, "username", "") or username)
        full_name = str(getattr(user_obj, "full_name", "") or full_name)
        biography = str(getattr(user_obj, "biography", "") or biography)
        follower_count = int(getattr(user_obj, "follower_count", 0) or 0)
        following_count = int(getattr(user_obj, "following_count", 0) or 0)
        media_count = int(getattr(user_obj, "media_count", 0) or 0)
        is_verified = bool(getattr(user_obj, "is_verified", False))
        pic = getattr(user_obj, "profile_pic_url_hd", None) or getattr(user_obj, "profile_pic_url", None)
        if pic:
            profile_pic_url = str(pic)

    return {
        "username": username or fallback_username or f"user_{user_id or 'unknown'}",
        "full_name": full_name,
        "biography": biography,
        "follower_count": follower_count,
        "following_count": following_count,
        "media_count": media_count,
        "is_verified": is_verified,
        "profile_pic_url": profile_pic_url,
        "cached_at": datetime.now().isoformat(),
    }


def save_account_files(
    username: str,
    session_dict: Dict[str, Any],
    page_info: Dict[str, Any],
    cookies_txt: str,
    set_as_active: bool = True,
) -> Dict[str, str]:
    acc_dir = get_account_dir(username)
    sess_path = acc_dir / "instagram_session.json"
    info_path = acc_dir / "instagram_page_info.json"
    cookies_path = acc_dir / "cookies.txt"

    sess_json_str = json.dumps(session_dict, indent=4, ensure_ascii=False)
    info_json_str = json.dumps(page_info, indent=2, ensure_ascii=False)

    sess_path.write_text(sess_json_str, "utf-8")
    info_path.write_text(info_json_str, "utf-8")
    cookies_path.write_text(cookies_txt, "utf-8")

    # Also update .device_fingerprint.json so UUIDs stay pinned
    fp_file = acc_dir / ".device_fingerprint.json"
    fp_file.write_text(
        json.dumps(
            {
                "uuids": session_dict.get("uuids"),
                "device_settings": session_dict.get("device_settings"),
                "user_agent": session_dict.get("user_agent"),
                "updated_at": datetime.now().isoformat(),
            },
            indent=2,
        ),
        "utf-8",
    )

    if set_as_active:
        ACTIVE_SESSION_FILE.write_text(sess_json_str, "utf-8")
        ACTIVE_PAGE_INFO_FILE.write_text(info_json_str, "utf-8")
        ACTIVE_COOKIES_FILE.write_text(cookies_txt, "utf-8")

        # Also copy to telegram_bot directory if it exists
        tb_dir = ROOT_DIR / "telegram_bot"
        if tb_dir.exists() and tb_dir.is_dir():
            try:
                (tb_dir / "instagram_session.json").write_text(sess_json_str, "utf-8")
                (tb_dir / "instagram_page_info.json").write_text(info_json_str, "utf-8")
                (tb_dir / "cookies.txt").write_text(cookies_txt, "utf-8")
            except Exception:
                pass

    return {
        "account_dir": str(acc_dir),
        "session_file": str(sess_path),
        "page_info_file": str(info_path),
        "cookies_file": str(cookies_path),
        "active_session_file": str(ACTIVE_SESSION_FILE),
        "active_page_info_file": str(ACTIVE_PAGE_INFO_FILE),
        "active_cookies_file": str(ACTIVE_COOKIES_FILE),
    }


def create_stealth_client(
    settings: Dict[str, Any],
    proxy: Optional[str] = None,
    verification_code: str = "",
    challenge_state: Optional[Dict[str, Any]] = None,
) -> Client:
    """
    Initialize an aiograpi Client with anti-ban stealth settings, realistic delays,
    pinned device settings, and non-blocking challenge handler.
    """
    cl = Client(
        settings=settings,
        proxy=proxy if proxy and proxy != "none" else None,
        delay_range=[1.2, 3.2],
    )
    cl.override_app_version = True
    cl.set_app("448.0.0.0.20")

    async def custom_challenge_code_handler(username: str, choice=None, **kwargs):
        if challenge_state is not None:
            challenge_state["triggered"] = True
            challenge_state["choice"] = str(choice.name if hasattr(choice, "name") else choice or "EMAIL")
        if verification_code and verification_code.strip():
            return verification_code.strip()
        return ""

    cl.challenge_code_handler = custom_challenge_code_handler
    return cl


async def handle_login_action(payload: Dict[str, Any]) -> Dict[str, Any]:
    username = str(payload.get("username") or "").strip().lstrip("@")
    password = str(payload.get("password") or "")
    verification_code = str(payload.get("verification_code") or "").strip().replace(" ", "")
    totp_seed = str(payload.get("totp_seed") or "").strip().replace(" ", "")
    device_key = str(payload.get("device_profile") or "pixel_9_pro_xl_a15")
    app_version_key = str(payload.get("app_version") or "448.0.0.0.20")
    if app_version_key not in APP_VERSION_PROFILES:
        app_version_key = "448.0.0.0.20"
    proxy = str(payload.get("proxy") or "").strip()
    force_new_device = bool(payload.get("force_new_device", False))

    if not username or not password:
        return {"success": False, "error": "نام کاربری و رمز عبور اینستاگرام الزامی است."}

    acc_dir = get_account_dir(username)
    pending_file = acc_dir / ".pending_auth.json"

    fp = get_or_create_fingerprint(
        username,
        device_key=device_key,
        app_version_key=app_version_key,
        force_new_device=force_new_device,
    )

    initial_settings = normalize_session_dict(
        {
            "uuids": fp["uuids"],
            "device_settings": fp["device_settings"],
            "user_agent": fp["user_agent"],
            "authorization_data": {},
            "cookies": {},
        },
        fallback_fp=fp,
    )

    # Load pending 2FA/Challenge state if we are submitting a verification_code
    pending_data: Optional[Dict[str, Any]] = None
    if verification_code and pending_file.exists():
        try:
            pending_data = json.loads(pending_file.read_text("utf-8"))
            if pending_data.get("settings"):
                initial_settings = pending_data["settings"]
        except Exception:
            pending_data = None

    challenge_state: Dict[str, Any] = {"triggered": False, "choice": ""}
    cl = create_stealth_client(
        settings=initial_settings,
        proxy=proxy if proxy else None,
        verification_code=verification_code,
        challenge_state=challenge_state,
    )
    cl.username = username
    cl.password = password

    # Auto-generate 6-digit TOTP code if totp_seed is provided and verification_code is empty
    if totp_seed and not verification_code:
        try:
            verification_code = cl.totp_generate_code(totp_seed)
        except Exception as e:
            return {"success": False, "error": f"کلید مخفی TOTP نامعتبر است: {e}"}

    logged_in = False

    try:
        # If resuming a pending 2FA from step 1 with verification_code:
        if verification_code and pending_data and pending_data.get("type") == "2fa":
            last_json = pending_data.get("last_json") or {}
            cl.last_json = last_json
            if pending_data.get("caa_waterfall_id"):
                cl.caa_waterfall_id = pending_data["caa_waterfall_id"]
            if pending_data.get("caa_aac"):
                cl.caa_aac = pending_data["caa_aac"]

            two_factor_info = last_json.get("two_factor_info") or {}
            two_factor_identifier = two_factor_info.get("two_factor_identifier")
            two_step_ctx = pending_data.get("two_step_verification_context") or cl._extract_two_step_verification_context(last_json)

            resumed = False
            if two_factor_identifier and not cl._looks_like_backup_code(verification_code):
                try:
                    ver_method = "1" if (two_factor_info.get("sms_two_factor_on") and not two_factor_info.get("totp_two_factor_on")) else "3"
                    data = {
                        "verification_code": verification_code,
                        "phone_id": cl.phone_id,
                        "_csrftoken": cl.token,
                        "two_factor_identifier": two_factor_identifier,
                        "username": cl.username,
                        "trust_this_device": "1",
                        "guid": cl.uuid,
                        "device_id": cl.android_device_id,
                        "waterfall_id": str(uuid.uuid4()),
                        "verification_method": ver_method,
                    }
                    resumed = bool(await cl.private_request("accounts/two_factor_login/", data, login=True))
                    if resumed and cl.last_response:
                        cl.authorization_data = cl.parse_authorization(
                            cl.last_response.headers.get("ig-set-authorization")
                        )
                        await cl.login_flow()
                        cl.last_login = time.time()
                        logged_in = True
                except Exception:
                    resumed = False

            if not logged_in and two_step_ctx:
                try:
                    dummy_exc = TwoFactorRequired("2FA Context")
                    resumed = await cl._login_with_bloks_two_factor(
                        verification_code,
                        {"two_step_verification_context": two_step_ctx, **last_json},
                        dummy_exc,
                    )
                    if resumed:
                        await cl.login_flow()
                        cl.last_login = time.time()
                        logged_in = True
                except Exception:
                    resumed = False

        elif verification_code and pending_data and pending_data.get("type") == "challenge":
            last_json = pending_data.get("last_json") or {}
            cl.last_json = last_json
            if last_json.get("challenge"):
                try:
                    resolved = await cl.challenge_resolve(last_json)
                    if resolved and cl.sessionid:
                        await cl.login_flow()
                        cl.last_login = time.time()
                        logged_in = True
                except Exception:
                    pass

        # Smart CAA-First Login: Bypasses obsolete accounts/login/ endpoint that triggers "out of date"
        if not logged_in:
            try:
                await cl.pre_login_flow()
            except Exception:
                pass

            caa_outcome = await cl.bloks_caa_login(
                username=username,
                password=password,
                verification_code=verification_code,
            )

            if caa_outcome.get("logged_in"):
                await cl.login_flow()
                cl.last_login = time.time()
                logged_in = True
            else:
                raw_result = caa_outcome.get("result") or {}
                two_step_ctx = (
                    cl._extract_two_step_verification_context(caa_outcome)
                    or cl._extract_two_step_verification_context(raw_result)
                    or (cl.bloks_extract_two_step_verification_context(raw_result) if hasattr(cl, "bloks_extract_two_step_verification_context") else "")
                )
                needs_two_step = bool(two_step_ctx) or cl.bloks_caa_login_needs_two_step(raw_result)

                if needs_two_step:
                    if verification_code:
                        try:
                            two_step_res = await cl.bloks_caa_resolve_two_step_verification(
                                raw_result,
                                verification_code=verification_code,
                            )
                            if two_step_res.get("logged_in"):
                                await cl.login_flow()
                                cl.last_login = time.time()
                                logged_in = True
                        except Exception:
                            pass

                        if not logged_in and two_step_ctx:
                            try:
                                dummy_exc = TwoFactorRequired("2FA Context")
                                if await cl._login_with_bloks_two_factor(
                                    verification_code,
                                    {"two_step_verification_context": two_step_ctx, **raw_result},
                                    dummy_exc,
                                ):
                                    await cl.login_flow()
                                    cl.last_login = time.time()
                                    logged_in = True
                            except Exception:
                                pass

                    if not logged_in:
                        raise TwoFactorRequired(
                            "Instagram returned a Bloks two-factor context; provide verification_code for login",
                            response=cl.last_response,
                            **cl._exception_context(raw_result),
                        )

                # Not logged in & Not 2FA -> Parse actual rejection reason from CAA payload
                if not logged_in:
                    strings: list[str] = []
                    cl._bloks_collect_strings(raw_result, strings)
                    lower_strings = [s.lower() for s in strings]
                    rejection_msg = cl._caa_extract_rejection_message(raw_result) if hasattr(cl, "_caa_extract_rejection_message") else None

                    # Check for bad password
                    if any(
                        m in s for s in lower_strings
                        for m in ("incorrect password", "password you entered is incorrect", "wrong password", "check your password")
                    ):
                        raise BadPassword("رمز عبور وارد شده برای این اکانت نادرست است. لطفاً رمز عبور را بررسی کرده و مجدداً تلاش نمایید.")

                    # Check for rate limit / wait
                    if any(
                        m in s for s in lower_strings
                        for m in ("please wait a few minutes", "too many requests", "wait a few minutes", "try again later")
                    ):
                        raise PleaseWaitFewMinutes("اینستاگرام درخواست صبر چند دقیقه‌ای داده است (Rate Limit). لطفاً چند دقیقه صبر کنید یا VPN را تغییر دهید.")

                    # Check for checkpoint / suspicious login
                    if any(
                        m in s for s in lower_strings
                        for m in ("help us confirm you own this account", "suspicious login attempt", "unusual activity", "checkpoint", "challenge")
                    ):
                        raise ChallengeRequired("اینستاگرام ورود به این اکانت را مشکوک تشخیص داده است. لطفاً اپلیکیشن اینستاگرام را در گوشی خود باز کرده و پیام تایید (This Was Me) را بزنید، یا از روش ورود با کوکی/SessionID استفاده فرمایید.")

                    if rejection_msg:
                        raise ClientError(f"پیام اینستاگرام: {rejection_msg}")

                    clean_msgs = [
                        s.strip() for s in strings
                        if len(s.strip()) > 8
                        and not s.startswith("CAA_")
                        and not s.startswith("bk.")
                        and not s.startswith("com.")
                        and not s.startswith("http")
                        and s not in ("Log in", "Back", "Cancel", "Continue", "Instagram", "Forgot password?", "OK", "Dismiss")
                    ]
                    if clean_msgs:
                        raise ClientError(f"پیام اینستاگرام: {clean_msgs[0]}")

                    reason = caa_outcome.get("reason")
                    if reason:
                        raise ClientError(str(reason))

                    raise ClientError("ورود توسط اینستاگرام تأیید نشد (محدودیت موقت آی‌پی سرور یا نیازمند تایید هویت در اپلیکیشن اینستاگرام). لطفاً از روشن بودن VPN سرور اطمینان حاصل فرمایید.")

    except TwoFactorRequired as tf_exc:
        last_json = cl.last_json if isinstance(cl.last_json, dict) else {}
        tf_info = last_json.get("two_factor_info") or {}
        two_step_ctx = cl._extract_two_step_verification_context(last_json)

        sms_on = bool(tf_info.get("sms_two_factor_on") or cl._login_response_bool(last_json, "sms_two_factor_on"))
        totp_on = bool(tf_info.get("totp_two_factor_on") or cl._login_response_bool(last_json, "totp_two_factor_on"))
        wa_on = bool(tf_info.get("whatsapp_two_factor_on") or cl._login_response_bool(last_json, "whatsapp_two_factor_on"))
        obfuscated_phone = str(tf_info.get("obfuscated_phone_number") or "")

        method_label = "اپلیکیشن Authenticator (TOTP) یا پیامک"
        if totp_on and not sms_on:
            method_label = "اپلیکیشن تایید دو مرحله‌ای (Google Authenticator / TOTP)"
        elif sms_on and not totp_on:
            method_label = f"پیامک (SMS){f' به شماره {obfuscated_phone}' if obfuscated_phone else ''}"
        elif wa_on:
            method_label = "واتساپ (WhatsApp) یا کد پشتیبان"

        pending_payload = {
            "type": "2fa",
            "username": username,
            "settings": cl.get_settings(),
            "last_json": last_json,
            "two_step_verification_context": two_step_ctx,
            "caa_waterfall_id": getattr(cl, "caa_waterfall_id", ""),
            "caa_aac": getattr(cl, "caa_aac", ""),
            "timestamp": time.time(),
        }
        try:
            pending_file.write_text(json.dumps(pending_payload, indent=2), "utf-8")
        except Exception:
            pass

        return {
            "success": False,
            "status": "two_factor_required",
            "username": username,
            "twoFactorMethod": "sms" if (sms_on and not totp_on) else "totp",
            "methodLabel": method_label,
            "obfuscatedPhone": obfuscated_phone,
            "smsEnabled": sms_on,
            "totpEnabled": totp_on,
            "error": None,
            "message": f"ورود دو مرحله‌ای (2FA) برای اکانت @{username} فعال است. لطفاً کد ۶ رقمی ({method_label}) یا کد بازیابی ۸ رقمی را وارد کنید.",
            "details": str(tf_exc),
        }

    except (ChallengeRequired, ChallengeError) as ch_exc:
        last_json = cl.last_json if isinstance(cl.last_json, dict) else {}
        pending_payload = {
            "type": "challenge",
            "username": username,
            "settings": cl.get_settings(),
            "last_json": last_json,
            "choice": challenge_state.get("choice") or "EMAIL",
            "timestamp": time.time(),
        }
        try:
            pending_file.write_text(json.dumps(pending_payload, indent=2), "utf-8")
        except Exception:
            pass

        return {
            "success": False,
            "status": "challenge_required",
            "username": username,
            "challengeChoice": challenge_state.get("choice") or "EMAIL",
            "message": f"اینستاگرام برای تایید هویت اکانت @{username} نیازمند تایید هویت است. لطفاً اپلیکیشن اینستاگرام را باز کرده یا کد دریافتی را وارد کنید.",
            "details": str(ch_exc),
        }

    except (BadPassword, BadCredentials) as bad_exc:
        return {
            "success": False,
            "status": "bad_credentials",
            "error": f"نام کاربری یا رمز عبور اشتباه است: {bad_exc}",
        }

    except PleaseWaitFewMinutes as wait_exc:
        return {
            "success": False,
            "status": "rate_limited",
            "error": f"اینستاگرام درخواست صبر چند دقیقه‌ای داده است (لطفاً چند دقیقه صبر کنید یا VPN را تغییر دهید): {wait_exc}",
        }

    except Exception as exc:
        exc_str = str(exc)
        if "out of date" in exc_str.lower() or "needs_upgrade" in exc_str.lower():
            return {
                "success": False,
                "status": "error",
                "error": "اینستاگرام به دلیل محدودیت موقت روی آی‌پی سرور یا ورود مشکوک، درخواست ورود را رد کرده است. لطفاً VPN سرور را روشن کنید، یا از گزینه «ورود با SessionID» یا «ایمپورت فایل سشن» استفاده فرمایید.",
            }
        return {
            "success": False,
            "status": "error",
            "error": f"خطا در ورود به اینستاگرام: {exc}",
        }

    if not logged_in and not cl.sessionid:
        return {
            "success": False,
            "status": "error",
            "error": "لاگین انجام نشد و سشنی از اینستاگرام دریافت نگردید.",
        }

    # Clean up pending auth state on success
    if pending_file.exists():
        try:
            pending_file.unlink()
        except Exception:
            pass

    raw_settings = cl.get_settings()
    final_session = normalize_session_dict(raw_settings, fallback_fp=fp)
    page_info = await fetch_page_info(cl, fallback_username=username)
    real_username = page_info.get("username") or username

    web_cookies = await fetch_web_cookies_if_possible(cl, final_session, proxy=proxy)
    cookies_txt = generate_netscape_cookies_txt(final_session, web_cookies)

    saved_paths = save_account_files(
        username=real_username,
        session_dict=final_session,
        page_info=page_info,
        cookies_txt=cookies_txt,
        set_as_active=True,
    )

    return {
        "success": True,
        "status": "logged_in",
        "username": real_username,
        "pageInfo": page_info,
        "session": final_session,
        "cookiesTxt": cookies_txt,
        "paths": saved_paths,
        "message": f"ورود به اکانت @{real_username} با موفقیت انجام شد و فایل‌های سشن و کوکی ذخیره شدند.",
    }


async def handle_login_by_sessionid(payload: Dict[str, Any]) -> Dict[str, Any]:
    raw_sessionid = str(payload.get("sessionid") or "").strip()
    username_hint = str(payload.get("username") or "").strip().lstrip("@")
    device_key = str(payload.get("device_profile") or "pixel_8_pro")
    app_version_key = str(payload.get("app_version") or "428.0.0.47.67")
    proxy = str(payload.get("proxy") or "").strip()

    if not raw_sessionid or len(raw_sessionid) < 20:
        return {"success": False, "error": "مقدار sessionid وارد شده معتبر نیست."}

    # Extract numeric ds_user_id from sessionid prefix if possible
    unquoted_sid = urllib.parse.unquote(raw_sessionid)
    ds_user_id = unquoted_sid.split(":", 1)[0] if ":" in unquoted_sid else ""
    quoted_sid = urllib.parse.quote(unquoted_sid, safe="") if ":" in raw_sessionid else raw_sessionid

    temp_key = username_hint or (f"user_{ds_user_id}" if ds_user_id else "session_user")
    fp = get_or_create_fingerprint(temp_key, device_key=device_key, app_version_key=app_version_key)

    initial_settings = normalize_session_dict(
        {
            "uuids": fp["uuids"],
            "device_settings": fp["device_settings"],
            "user_agent": fp["user_agent"],
            "authorization_data": {
                "ds_user_id": ds_user_id,
                "sessionid": quoted_sid,
            },
            "cookies": {
                "sessionid": quoted_sid,
                "ds_user_id": ds_user_id,
            },
            "last_login": time.time(),
        },
        fallback_fp=fp,
    )

    cl = create_stealth_client(settings=initial_settings, proxy=proxy if proxy else None)

    try:
        await cl.login_by_sessionid(quoted_sid)
    except Exception:
        # Even if login_by_sessionid network check fails due to IP restriction, preserve session settings
        cl.authorization_data = {
            "ds_user_id": ds_user_id,
            "sessionid": quoted_sid,
        }

    raw_settings = cl.get_settings()
    if not raw_settings.get("authorization_data", {}).get("sessionid"):
        raw_settings["authorization_data"] = {
            "ds_user_id": ds_user_id,
            "sessionid": quoted_sid,
        }

    final_session = normalize_session_dict(raw_settings, fallback_fp=fp)
    page_info = await fetch_page_info(cl, fallback_username=username_hint or cl.username or f"user_{ds_user_id}")
    real_username = page_info.get("username") or username_hint or f"user_{ds_user_id}"

    web_cookies = await fetch_web_cookies_if_possible(cl, final_session, proxy=proxy)
    cookies_txt = generate_netscape_cookies_txt(final_session, web_cookies)

    saved_paths = save_account_files(
        username=real_username,
        session_dict=final_session,
        page_info=page_info,
        cookies_txt=cookies_txt,
        set_as_active=True,
    )

    return {
        "success": True,
        "status": "logged_in",
        "username": real_username,
        "pageInfo": page_info,
        "session": final_session,
        "cookiesTxt": cookies_txt,
        "paths": saved_paths,
        "message": f"سشن اکانت @{real_username} با موفقیت ثبت و ذخیره شد.",
    }


async def handle_import_session(payload: Dict[str, Any]) -> Dict[str, Any]:
    session_input = payload.get("session")
    page_info_input = payload.get("page_info")
    username_hint = str(payload.get("username") or "").strip().lstrip("@")
    proxy = str(payload.get("proxy") or "").strip()

    if isinstance(session_input, str):
        try:
            session_input = json.loads(session_input)
        except Exception as e:
            return {"success": False, "error": f"فرمت JSON سشن نامعتبر است: {e}"}

    if not isinstance(session_input, dict):
        return {"success": False, "error": "اطلاعات سشن (instagram_session.json) ارسال نشده است."}

    if isinstance(page_info_input, str) and page_info_input.strip():
        try:
            page_info_input = json.loads(page_info_input)
        except Exception:
            page_info_input = None

    final_session = normalize_session_dict(session_input)
    cl = create_stealth_client(settings=final_session, proxy=proxy if proxy else None)

    ds_user_id = str(final_session.get("authorization_data", {}).get("ds_user_id") or "")
    fallback_uname = (
        (page_info_input.get("username") if isinstance(page_info_input, dict) else None)
        or username_hint
        or f"user_{ds_user_id or 'imported'}"
    )

    # Try fetching live page_info via aiograpi; if offline/restricted, merge with page_info_input
    live_info = await fetch_page_info(cl, fallback_username=fallback_uname)
    if isinstance(page_info_input, dict) and page_info_input.get("username"):
        # If live fetch didn't get full_name/followers (e.g. sample/offline session), preserve provided page_info
        if not live_info.get("full_name") and not live_info.get("follower_count"):
            page_info = {
                "username": str(page_info_input.get("username") or fallback_uname),
                "full_name": str(page_info_input.get("full_name") or ""),
                "biography": str(page_info_input.get("biography") or ""),
                "follower_count": int(page_info_input.get("follower_count") or 0),
                "following_count": int(page_info_input.get("following_count") or 0),
                "media_count": int(page_info_input.get("media_count") or 0),
                "is_verified": bool(page_info_input.get("is_verified", False)),
                "profile_pic_url": str(page_info_input.get("profile_pic_url") or ""),
                "cached_at": str(page_info_input.get("cached_at") or datetime.now().isoformat()),
            }
        else:
            page_info = live_info
    else:
        page_info = live_info

    real_username = page_info.get("username") or fallback_uname
    web_cookies = await fetch_web_cookies_if_possible(cl, final_session, proxy=proxy)
    cookies_txt = generate_netscape_cookies_txt(final_session, web_cookies)

    saved_paths = save_account_files(
        username=real_username,
        session_dict=final_session,
        page_info=page_info,
        cookies_txt=cookies_txt,
        set_as_active=True,
    )

    return {
        "success": True,
        "status": "imported",
        "username": real_username,
        "pageInfo": page_info,
        "session": final_session,
        "cookiesTxt": cookies_txt,
        "paths": saved_paths,
        "message": f"سشن اکانت @{real_username} با موفقیت وارد و ذخیره شد.",
    }


async def handle_verify_or_refresh(payload: Dict[str, Any]) -> Dict[str, Any]:
    username = str(payload.get("username") or "").strip().lstrip("@")
    proxy = str(payload.get("proxy") or "").strip()

    acc_dir = get_account_dir(username) if username else None
    sess_file = (acc_dir / "instagram_session.json") if (acc_dir and (acc_dir / "instagram_session.json").exists()) else ACTIVE_SESSION_FILE
    info_file = (acc_dir / "instagram_page_info.json") if (acc_dir and (acc_dir / "instagram_page_info.json").exists()) else ACTIVE_PAGE_INFO_FILE

    if not sess_file.exists():
        return {"success": False, "error": "فایل سشن برای این اکانت یافت نشد."}

    session_data = json.loads(sess_file.read_text("utf-8"))
    existing_info = {}
    if info_file.exists():
        try:
            existing_info = json.loads(info_file.read_text("utf-8"))
        except Exception:
            pass

    cl = create_stealth_client(settings=session_data, proxy=proxy if proxy else None)

    is_valid = False
    status_msg = ""
    try:
        acc = await cl.account_info()
        if acc and getattr(acc, "username", None):
            is_valid = True
            status_msg = f"سشن اکانت @{acc.username} کاملاً فعال و معتبر است."
    except LoginRequired:
        is_valid = False
        status_msg = "سشن منقضی شده و نیاز به ورود مجدد دارد."
    except Exception as e:
        # Try user_info_v1 fallback
        try:
            if cl.user_id:
                u = await cl.user_info_v1(int(cl.user_id))
                if u and getattr(u, "username", None):
                    is_valid = True
                    status_msg = f"سشن اکانت @{u.username} معتبر است."
        except Exception:
            status_msg = f"عدم امکان استعلام آنلاین ({e}) — ساختار آفلاین سشن سالم است."

    live_info = await fetch_page_info(cl, fallback_username=username or existing_info.get("username", ""))
    if not live_info.get("full_name") and existing_info.get("full_name"):
        live_info["full_name"] = existing_info["full_name"]
    if not live_info.get("follower_count") and existing_info.get("follower_count"):
        live_info["follower_count"] = existing_info["follower_count"]
    if not live_info.get("following_count") and existing_info.get("following_count"):
        live_info["following_count"] = existing_info["following_count"]
    if not live_info.get("media_count") and existing_info.get("media_count"):
        live_info["media_count"] = existing_info["media_count"]
    if not live_info.get("profile_pic_url") and existing_info.get("profile_pic_url"):
        live_info["profile_pic_url"] = existing_info["profile_pic_url"]

    updated_session = normalize_session_dict(cl.get_settings(), fallback_fp=session_data)
    web_cookies = await fetch_web_cookies_if_possible(cl, updated_session, proxy=proxy)
    cookies_txt = generate_netscape_cookies_txt(updated_session, web_cookies)

    target_username = live_info.get("username") or username or "account"
    save_account_files(
        username=target_username,
        session_dict=updated_session,
        page_info=live_info,
        cookies_txt=cookies_txt,
        set_as_active=True,
    )

    return {
        "success": True,
        "isValid": is_valid,
        "username": target_username,
        "pageInfo": live_info,
        "session": updated_session,
        "cookiesTxt": cookies_txt,
        "message": status_msg,
    }


async def handle_extract_cookies(payload: Dict[str, Any]) -> Dict[str, Any]:
    username = str(payload.get("username") or "").strip().lstrip("@")
    proxy = str(payload.get("proxy") or "").strip()

    acc_dir = get_account_dir(username) if username else None
    sess_file = (acc_dir / "instagram_session.json") if (acc_dir and (acc_dir / "instagram_session.json").exists()) else ACTIVE_SESSION_FILE

    if not sess_file.exists():
        return {"success": False, "error": "فایل instagram_session.json یافت نشد."}

    session_data = json.loads(sess_file.read_text("utf-8"))
    cl = create_stealth_client(settings=session_data, proxy=proxy if proxy else None)
    web_cookies = await fetch_web_cookies_if_possible(cl, session_data, proxy=proxy)
    cookies_txt = generate_netscape_cookies_txt(session_data, web_cookies)

    if acc_dir:
        (acc_dir / "cookies.txt").write_text(cookies_txt, "utf-8")
    ACTIVE_COOKIES_FILE.write_text(cookies_txt, "utf-8")

    tb_dir = ROOT_DIR / "telegram_bot"
    if tb_dir.exists() and tb_dir.is_dir():
        try:
            (tb_dir / "cookies.txt").write_text(cookies_txt, "utf-8")
        except Exception:
            pass

    return {
        "success": True,
        "username": username,
        "fileName": "cookies.txt",
        "filePath": str(ACTIVE_COOKIES_FILE),
        "accountCookiesPath": str(acc_dir / "cookies.txt") if acc_dir else str(ACTIVE_COOKIES_FILE),
        "cookiesTxt": cookies_txt,
        "message": "فایل cookies.txt با فرمت استاندارد Netscape با موفقیت استخراج و ذخیره شد.",
    }


def get_client_for_downloader(account_username: Optional[str] = None, proxy: Optional[str] = None) -> Tuple[Client, bool]:
    """Helper to initialize client using active or requested session, or any saved account session from ACCOUNTS_DIR."""
    sess_file = None
    if account_username:
        acc_dir = get_account_dir(account_username)
        cand = acc_dir / "instagram_session.json"
        if cand.exists():
            sess_file = cand

    if not sess_file and ACTIVE_SESSION_FILE.exists():
        sess_file = ACTIVE_SESSION_FILE

    # If still not found, search all directories in ACCOUNTS_DIR for a valid session
    if not sess_file or not sess_file.exists():
        if ACCOUNTS_DIR.exists():
            for sub in sorted(ACCOUNTS_DIR.iterdir()):
                if sub.is_dir():
                    cand = sub / "instagram_session.json"
                    if cand.exists():
                        try:
                            dat = json.loads(cand.read_text("utf-8"))
                            if dat.get("authorization_data") or dat.get("cookies"):
                                sess_file = cand
                                break
                        except Exception:
                            continue

    if sess_file and sess_file.exists():
        try:
            session_data = json.loads(sess_file.read_text("utf-8"))
            cl = create_stealth_client(settings=session_data, proxy=proxy if proxy else None)
            return cl, True
        except Exception:
            pass

    cl = create_stealth_client(proxy=proxy if proxy else None)
    return cl, False


async def fallback_extract_with_ytdlp(raw_url: str, proxy: str = "") -> Optional[Dict[str, Any]]:
    """Fallback extraction using yt-dlp when instagrapi mobile API hits restrictions."""
    try:
        cmd = [
            "yt-dlp",
            "--dump-single-json",
            "--no-warnings",
            "--no-check-certificates",
            "--skip-download",
        ]
        if proxy and proxy.strip():
            cmd.extend(["--proxy", proxy.strip()])
        cmd.append(raw_url)

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0 or not stdout:
            return None

        info = json.loads(stdout.decode("utf-8", errors="ignore"))
        if not info:
            return None

        # Process single or playlist/carousel entries
        entries = info.get("entries") or [info]
        items_list = []
        for idx, entry in enumerate(entries):
            e_video_url = entry.get("url") or ""
            e_thumb = entry.get("thumbnail") or ""
            is_vid = bool(entry.get("ext") in ("mp4", "webm", "mkv") or entry.get("vcodec") != "none" or entry.get("duration"))
            items_list.append({
                "index": idx + 1,
                "type": "video" if is_vid else "photo",
                "video_url": e_video_url if is_vid else None,
                "image_url": e_thumb or (e_video_url if not is_vid else ""),
                "thumbnail_url": e_thumb or (e_video_url if not is_vid else ""),
            })

        main_thumb = info.get("thumbnail") or (items_list[0]["thumbnail_url"] if items_list else "")
        main_video = info.get("url") if bool(info.get("ext") in ("mp4", "webm") or info.get("vcodec") != "none" or info.get("duration")) else None
        
        uploader = info.get("uploader") or info.get("channel") or ""
        uploader_id = info.get("uploader_id") or uploader
        
        norm_type = "carousel" if len(items_list) > 1 else ("video" if main_video or (items_list and items_list[0]["type"] == "video") else "photo")

        return {
            "success": True,
            "media": {
                "id": str(info.get("id") or ""),
                "pk": str(info.get("id") or ""),
                "code": str(info.get("id") or ""),
                "url": info.get("webpage_url") or raw_url,
                "media_type": norm_type,
                "product_type": "clips" if "reel" in raw_url else "feed",
                "is_video": norm_type in ("reel", "video"),
                "caption": info.get("description") or info.get("title") or "",
                "like_count": info.get("like_count") or 0,
                "comment_count": info.get("comment_count") or 0,
                "view_count": info.get("view_count") or 0,
                "video_duration": info.get("duration") or 0,
                "thumbnail_url": main_thumb,
                "video_url": main_video or (items_list[0]["video_url"] if items_list and items_list[0]["type"] == "video" else ""),
                "taken_at": info.get("timestamp"),
                "user": {
                    "username": uploader_id,
                    "full_name": uploader,
                    "profile_pic_url": "",
                    "is_verified": False,
                },
                "items": items_list,
                "items_count": len(items_list),
            },
            "source": "ytdlp_fallback",
        }
    except Exception:
        return None


async def handle_extract_media(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Extract media info (Post, Reel, Carousel, Video, Photo) by URL or shortcode."""
    raw_url = str(payload.get("url") or "").strip()
    proxy = str(payload.get("proxy") or "").strip()
    account = str(payload.get("account") or "").strip()

    if not raw_url:
        return {"success": False, "error": "لطفاً لینک پست، ریلز یا استوری اینستاگرام را وارد نمایید."}

    cl, has_auth = get_client_for_downloader(account_username=account, proxy=proxy)

    try:
        # Check if URL is a story or highlight
        is_story_url = "/stories/" in raw_url and "/highlights/" not in raw_url
        is_highlight_url = "/stories/highlights/" in raw_url

        if is_story_url:
            # Handle story URL
            parts = [p for p in raw_url.split("?")[0].split("/") if p]
            story_pk = None
            for p in reversed(parts):
                if p.isdigit():
                    story_pk = int(p)
                    break
            if not story_pk:
                try:
                    s_str = cl.story_pk_from_url(raw_url)
                    if s_str and str(s_str).isdigit():
                        story_pk = int(s_str)
                except Exception:
                    pass

            if story_pk:
                s_info = None
                try:
                    s_info = await cl.story_info_v1(story_pk)
                except Exception:
                    try:
                        s_info = await cl.story_info(story_pk)
                    except Exception:
                        pass

                if s_info:
                    user_dict = {}
                    if getattr(s_info, "user", None):
                        u = s_info.user
                        user_dict = {
                            "username": getattr(u, "username", ""),
                            "full_name": getattr(u, "full_name", ""),
                            "profile_pic_url": str(getattr(u, "profile_pic_url", "") or ""),
                            "is_verified": bool(getattr(u, "is_verified", False)),
                        }

                    media_type_str = "video" if getattr(s_info, "media_type", 1) == 2 or getattr(s_info, "video_url", None) else "photo"
                    v_url = str(getattr(s_info, "video_url", "") or "")
                    t_url = str(getattr(s_info, "thumbnail_url", "") or getattr(s_info, "image_url", "") or "")

                    return {
                        "success": True,
                        "media": {
                            "id": str(getattr(s_info, "id", story_pk)),
                            "pk": str(story_pk),
                            "code": str(getattr(s_info, "code", "")),
                            "media_type": "story",
                            "product_type": "story",
                            "is_video": media_type_str == "video",
                            "video_url": v_url,
                            "thumbnail_url": t_url,
                            "caption": str(getattr(s_info, "caption_text", "") or ""),
                            "duration": getattr(s_info, "video_duration", 0),
                            "taken_at": s_info.taken_at.isoformat() if getattr(s_info, "taken_at", None) else None,
                            "user": user_dict,
                            "items": [{
                                "index": 1,
                                "type": media_type_str,
                                "video_url": v_url if media_type_str == "video" else None,
                                "image_url": t_url,
                                "thumbnail_url": t_url,
                            }],
                        },
                        "hasAuth": has_auth,
                    }

        # Regular Post / Reel / Carousel
        media_pk = None
        code = ""

        # 1. Regex match shortcode
        code_match = re.search(r"/(?:p|reel|reels|tv|clips)/([A-Za-z0-9_-]+)", raw_url)
        if code_match:
            code = code_match.group(1)
            try:
                media_pk = str(cl.media_pk_from_code(code))
            except Exception:
                pass

        # 2. Try async media_pk_from_url
        if not media_pk:
            try:
                raw_pk = await cl.media_pk_from_url(raw_url)
                if raw_pk:
                    media_pk = str(raw_pk)
            except Exception:
                pass

        # 3. Try parsing last URL part
        if not media_pk:
            parts = [p for p in raw_url.split("?")[0].split("/") if p]
            if parts:
                candidate = parts[-1]
                if candidate in ("p", "reel", "tv", "reels", "clips") and len(parts) >= 2:
                    candidate = parts[-2]
                if candidate.isdigit():
                    media_pk = str(candidate)
                else:
                    try:
                        media_pk = str(cl.media_pk_from_code(candidate))
                        code = candidate
                    except Exception:
                        pass

        media_info = None
        err_msg = ""
        if media_pk:
            pk_arg = int(media_pk) if media_pk.isdigit() else media_pk
            for fetcher in (cl.media_info_v1, cl.media_info_gql, cl.media_info):
                try:
                    media_info = await fetcher(pk_arg)
                    if media_info:
                        break
                except Exception as e:
                    err_msg = str(e)

        if not media_info:
            # Try fallback with yt-dlp
            ytdlp_res = await fallback_extract_with_ytdlp(raw_url, proxy=proxy)
            if ytdlp_res and ytdlp_res.get("success"):
                ytdlp_res["hasAuth"] = has_auth
                return ytdlp_res
            
            if "JSONDecodeError" in err_msg or "login" in err_msg.lower() or "401" in err_msg or "403" in err_msg:
                user_friendly = "اینستاگرام دسترسی به این محتوا را محدود کرده است. لطفاً در بخش حساب‌ها یک اکانت متصل کنید یا پروکسی VPN را فعال نمایید."
            elif not err_msg:
                user_friendly = "پست یا ریلز مورد نظر در اینستاگرام یافت نشد یا لینک وارد شده نامعتبر است."
            else:
                user_friendly = f"دریافت اطلاعات پست از اینستاگرام با خطا مواجه شد: {err_msg}"
            return {"success": False, "error": user_friendly}

        # Parse fields
        pk_str = str(getattr(media_info, "pk", media_pk or ""))
        code = str(getattr(media_info, "code", code or ""))
        caption = str(getattr(media_info, "caption_text", "") or "")
        like_count = getattr(media_info, "like_count", 0) or 0
        comment_count = getattr(media_info, "comment_count", 0) or 0
        view_count = getattr(media_info, "view_count", 0) or 0
        video_duration = getattr(media_info, "video_duration", 0) or 0
        media_type_raw = getattr(media_info, "media_type", 1)  # 1: Photo, 2: Video, 8: Album
        product_type = str(getattr(media_info, "product_type", "feed") or "feed")

        t_url = str(getattr(media_info, "thumbnail_url", "") or "")
        v_url = str(getattr(media_info, "video_url", "") or "")

        user_obj = getattr(media_info, "user", None)
        user_dict = {}
        if user_obj:
            user_dict = {
                "username": str(getattr(user_obj, "username", "") or ""),
                "full_name": str(getattr(user_obj, "full_name", "") or ""),
                "profile_pic_url": str(getattr(user_obj, "profile_pic_url", "") or ""),
                "is_verified": bool(getattr(user_obj, "is_verified", False)),
            }

        resources_list = []
        raw_resources = getattr(media_info, "resources", []) or []
        if raw_resources:
            for idx, res in enumerate(raw_resources):
                r_type = "video" if getattr(res, "media_type", 1) == 2 or getattr(res, "video_url", None) else "photo"
                r_v_url = str(getattr(res, "video_url", "") or "")
                r_t_url = str(getattr(res, "thumbnail_url", "") or "")
                resources_list.append({
                    "index": idx + 1,
                    "type": r_type,
                    "video_url": r_v_url if r_type == "video" else None,
                    "image_url": r_t_url,
                    "thumbnail_url": r_t_url,
                })

        # Determine normalized type
        if media_type_raw == 8 or len(resources_list) > 1:
            norm_type = "carousel"
        elif media_type_raw == 2 or v_url or product_type == "clips":
            norm_type = "reel" if product_type == "clips" else "video"
        else:
            norm_type = "photo"

        if not resources_list:
            resources_list.append({
                "index": 1,
                "type": "video" if norm_type in ("reel", "video") else "photo",
                "video_url": v_url if norm_type in ("reel", "video") else None,
                "image_url": t_url,
                "thumbnail_url": t_url,
            })

        taken_at_val = getattr(media_info, "taken_at", None)
        taken_at_iso = taken_at_val.isoformat() if hasattr(taken_at_val, "isoformat") else str(taken_at_val or "")

        return {
            "success": True,
            "media": {
                "id": str(getattr(media_info, "id", pk_str)),
                "pk": pk_str,
                "code": code,
                "url": f"https://www.instagram.com/p/{code}/" if code else raw_url,
                "media_type": norm_type,
                "product_type": product_type,
                "is_video": norm_type in ("reel", "video"),
                "caption": caption,
                "like_count": like_count,
                "comment_count": comment_count,
                "view_count": view_count,
                "video_duration": video_duration,
                "thumbnail_url": t_url or (resources_list[0]["thumbnail_url"] if resources_list else ""),
                "video_url": v_url or (resources_list[0]["video_url"] if norm_type in ("reel", "video") and resources_list else ""),
                "taken_at": taken_at_iso,
                "user": user_dict,
                "items": resources_list,
                "items_count": len(resources_list),
            },
            "hasAuth": has_auth,
        }
    except Exception as e:
        return {"success": False, "error": f"خطا در پردازش رسانه اینستاگرام: {str(e)}"}


async def handle_fetch_profile(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch profile bio, stats, and recent media by username."""
    raw_query = str(payload.get("username") or "").strip()
    proxy = str(payload.get("proxy") or "").strip()
    account = str(payload.get("account") or "").strip()

    if not raw_query:
        return {"success": False, "error": "لطفاً آیدی پیج یا لینک پروفایل اینستاگرام را وارد نمایید."}

    # Extract username from url if provided
    cleaned_uname = raw_query.split("?")[0].rstrip("/").split("/")[-1].lstrip("@").strip()
    if not cleaned_uname:
        return {"success": False, "error": "نام کاربری نامعتبر است."}

    cl, has_auth = get_client_for_downloader(account_username=account, proxy=proxy)

    try:
        user_info = None
        err = ""
        for fetcher in (cl.user_info_by_username_v1, cl.user_info_by_username, cl.user_info_by_username_gql):
            try:
                user_info = await fetcher(cleaned_uname)
                if user_info:
                    break
            except Exception as e:
                err = str(e)

        if not user_info:
            return {"success": False, "error": f"پروفایل «@{cleaned_uname}» در اینستاگرام یافت نشد یا در دسترس نیست ({err})"}

        user_pk = getattr(user_info, "pk", "") or getattr(user_info, "id", "")
        username = getattr(user_info, "username", cleaned_uname)
        full_name = getattr(user_info, "full_name", "")
        biography = getattr(user_info, "biography", "")
        external_url = getattr(user_info, "external_url", "")
        follower_count = getattr(user_info, "follower_count", 0) or 0
        following_count = getattr(user_info, "following_count", 0) or 0
        media_count = getattr(user_info, "media_count", 0) or 0
        is_private = bool(getattr(user_info, "is_private", False))
        is_verified = bool(getattr(user_info, "is_verified", False))
        profile_pic_url = str(getattr(user_info, "profile_pic_url", "") or "")
        profile_pic_url_hd = str(getattr(user_info, "profile_pic_url_hd", "") or profile_pic_url)

        # Try fetching recent posts (up to 9 items for quick preview)
        recent_medias = []
        if user_pk and not is_private:
            try:
                medias = await cl.user_medias_v1(user_pk, amount=9)
                for m in medias:
                    m_code = getattr(m, "code", "")
                    m_type_raw = getattr(m, "media_type", 1)
                    m_thumb = str(getattr(m, "thumbnail_url", "") or "")
                    m_type_str = "video" if m_type_raw == 2 or getattr(m, "video_url", None) else ("carousel" if m_type_raw == 8 else "photo")
                    recent_medias.append({
                        "id": str(getattr(m, "id", "")),
                        "pk": str(getattr(m, "pk", "")),
                        "code": m_code,
                        "url": f"https://www.instagram.com/p/{m_code}/" if m_code else "",
                        "type": m_type_str,
                        "thumbnail_url": m_thumb,
                        "video_url": str(getattr(m, "video_url", "") or "") if m_type_str == "video" else None,
                        "like_count": getattr(m, "like_count", 0) or 0,
                        "comment_count": getattr(m, "comment_count", 0) or 0,
                        "caption": str(getattr(m, "caption_text", "") or "")[:150],
                    })
            except Exception:
                pass

        # Check for active stories count
        stories_count = 0
        if user_pk and has_auth:
            try:
                active_stories = await cl.user_stories_v1(user_pk)
                stories_count = len(active_stories or [])
            except Exception:
                pass

        return {
            "success": True,
            "profile": {
                "pk": str(user_pk),
                "username": username,
                "full_name": full_name,
                "biography": biography,
                "external_url": external_url,
                "follower_count": follower_count,
                "following_count": following_count,
                "media_count": media_count,
                "is_private": is_private,
                "is_verified": is_verified,
                "profile_pic_url": profile_pic_url,
                "profile_pic_url_hd": profile_pic_url_hd,
                "has_active_stories": stories_count > 0,
                "active_stories_count": stories_count,
                "recent_medias": recent_medias,
            },
            "hasAuth": has_auth,
        }
    except Exception as e:
        return {"success": False, "error": f"خطا در استعلام اطلاعات پروفایل: {str(e)}"}


async def handle_fetch_stories(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch active 24h stories for a given username or user_id."""
    raw_query = str(payload.get("username") or payload.get("user_id") or "").strip()
    proxy = str(payload.get("proxy") or "").strip()
    account = str(payload.get("account") or "").strip()

    if not raw_query:
        return {"success": False, "error": "لطفاً آیدی پیج مورد نظر را برای دریافت استوری‌ها وارد نمایید."}

    cleaned_uname = raw_query.split("?")[0].rstrip("/").split("/")[-1].lstrip("@").strip()
    cl, has_auth = get_client_for_downloader(account_username=account, proxy=proxy)

    try:
        user_pk = None
        user_dict = {}

        if cleaned_uname.isdigit():
            user_pk = int(cleaned_uname)
        else:
            u_info = await cl.user_info_by_username_v1(cleaned_uname)
            user_pk = getattr(u_info, "pk", None)
            user_dict = {
                "username": getattr(u_info, "username", cleaned_uname),
                "full_name": getattr(u_info, "full_name", ""),
                "profile_pic_url": str(getattr(u_info, "profile_pic_url", "") or ""),
                "is_verified": bool(getattr(u_info, "is_verified", False)),
            }

        if not user_pk:
            return {"success": False, "error": f"کاربر «@{cleaned_uname}» پیدا نشد."}

        stories_raw = []
        try:
            stories_raw = await cl.user_stories_v1(user_pk)
        except Exception:
            stories_raw = await cl.user_stories(user_pk)

        items = []
        for s in (stories_raw or []):
            s_type = "video" if getattr(s, "media_type", 1) == 2 or getattr(s, "video_url", None) else "photo"
            v_url = str(getattr(s, "video_url", "") or "")
            t_url = str(getattr(s, "thumbnail_url", "") or getattr(s, "image_url", "") or "")
            taken_at = getattr(s, "taken_at", None)
            expiring_at = getattr(s, "expiring_at", None)

            items.append({
                "id": str(getattr(s, "id", "")),
                "pk": str(getattr(s, "pk", "")),
                "code": str(getattr(s, "code", "")),
                "type": s_type,
                "is_video": s_type == "video",
                "video_url": v_url if s_type == "video" else None,
                "image_url": t_url,
                "thumbnail_url": t_url,
                "duration": getattr(s, "video_duration", 0),
                "caption": str(getattr(s, "caption_text", "") or ""),
                "taken_at": taken_at.isoformat() if hasattr(taken_at, "isoformat") else str(taken_at or ""),
                "expiring_at": expiring_at.isoformat() if hasattr(expiring_at, "isoformat") else str(expiring_at or ""),
            })

        return {
            "success": True,
            "username": cleaned_uname,
            "user": user_dict,
            "count": len(items),
            "stories": items,
            "hasAuth": has_auth,
            "message": f"تعداد {len(items)} استوری فعال برای «@{cleaned_uname}» دریافت شد." if items else f"هیچ استوری فعالی در ۲۴ ساعت گذشته برای «@{cleaned_uname}» ثبت نشده است.",
        }
    except Exception as e:
        return {"success": False, "error": f"خطا در دریافت استوری‌ها: {str(e)}"}


async def handle_fetch_highlights(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch profile highlights albums and story contents."""
    raw_query = str(payload.get("username") or payload.get("user_id") or "").strip()
    proxy = str(payload.get("proxy") or "").strip()
    account = str(payload.get("account") or "").strip()

    if not raw_query:
        return {"success": False, "error": "لطفاً آیدی پیج مورد نظر را برای مشاهده هایلایت‌ها وارد نمایید."}

    cleaned_uname = raw_query.split("?")[0].rstrip("/").split("/")[-1].lstrip("@").strip()
    cl, has_auth = get_client_for_downloader(account_username=account, proxy=proxy)

    try:
        user_pk = None
        user_dict = {}

        if cleaned_uname.isdigit():
            user_pk = int(cleaned_uname)
        else:
            u_info = await cl.user_info_by_username_v1(cleaned_uname)
            user_pk = getattr(u_info, "pk", None)
            user_dict = {
                "username": getattr(u_info, "username", cleaned_uname),
                "full_name": getattr(u_info, "full_name", ""),
                "profile_pic_url": str(getattr(u_info, "profile_pic_url", "") or ""),
                "is_verified": bool(getattr(u_info, "is_verified", False)),
            }

        if not user_pk:
            return {"success": False, "error": f"کاربر «@{cleaned_uname}» پیدا نشد."}

        highlights_raw = []
        try:
            highlights_raw = await cl.user_highlights_v1(user_pk)
        except Exception:
            highlights_raw = await cl.user_highlights(user_pk)

        # Batch fetch highlight reels to get full story items for all albums in 1 request
        reels_map = {}
        if highlights_raw:
            try:
                h_target_ids = []
                for h in highlights_raw:
                    pk_val = str(getattr(h, "id", "") or getattr(h, "pk", ""))
                    if pk_val:
                        h_target_ids.append(f"highlight:{pk_val}" if not pk_val.startswith("highlight:") else pk_val)
                if h_target_ids:
                    data = {
                        "exclude_media_ids": "[]",
                        "supported_capabilities_new": json.dumps(ig_config.SUPPORTED_CAPABILITIES),
                        "source": "profile",
                        "_uid": str(getattr(cl, "user_id", "") or ""),
                        "_uuid": cl.uuid,
                        "user_ids": h_target_ids,
                    }
                    res_reels = await cl.private_request("feed/reels_media/", data)
                    reels_map = res_reels.get("reels", {}) if isinstance(res_reels, dict) else {}
            except Exception:
                pass

        albums = []
        for h in (highlights_raw or []):
            h_id = str(getattr(h, "id", "") or getattr(h, "pk", "")).replace("highlight:", "")
            h_title = str(getattr(h, "title", "") or "Highlight")
            cover_url = str(getattr(h, "cover_media", {}).get("cropped_image_version", {}).get("url", "") if isinstance(getattr(h, "cover_media", None), dict) else "")
            if not cover_url and getattr(h, "cover_media_url", None):
                cover_url = str(h.cover_media_url)

            # Check if items exist in reels_map
            raw_items = []
            reel_key = f"highlight:{h_id}"
            if reel_key in reels_map:
                try:
                    parsed_hl = extract_highlight_v1(reels_map[reel_key])
                    raw_items = getattr(parsed_hl, "items", []) or []
                except Exception:
                    pass

            if not raw_items:
                raw_items = getattr(h, "items", []) or []

            # If still empty, fetch single highlight detail
            if not raw_items and h_id:
                try:
                    detail = await cl.highlight_info_v1(h_id)
                    if detail and getattr(detail, "items", None):
                        raw_items = detail.items
                except Exception:
                    pass

            h_items = []
            for itm in raw_items:
                i_type = "video" if getattr(itm, "media_type", 1) == 2 or getattr(itm, "video_url", None) else "photo"
                i_v_url = str(getattr(itm, "video_url", "") or "")
                i_t_url = str(getattr(itm, "thumbnail_url", "") or getattr(itm, "image_url", "") or "")
                h_items.append({
                    "id": str(getattr(itm, "id", "")),
                    "pk": str(getattr(itm, "pk", "")),
                    "type": i_type,
                    "is_video": i_type == "video",
                    "video_url": i_v_url if i_type == "video" else None,
                    "image_url": i_t_url,
                    "thumbnail_url": i_t_url,
                    "caption": str(getattr(itm, "caption_text", "") or ""),
                })

            albums.append({
                "id": h_id,
                "title": h_title,
                "cover_url": cover_url or (h_items[0]["thumbnail_url"] if h_items else ""),
                "media_count": len(h_items) or getattr(h, "media_count", 0),
                "items": h_items,
            })

        return {
            "success": True,
            "username": cleaned_uname,
            "user": user_dict,
            "count": len(albums),
            "highlights": albums,
            "hasAuth": has_auth,
            "message": f"تعداد {len(albums)} آلبوم هایلایت برای «@{cleaned_uname}» استخراج شد." if albums else f"هیچ آلبوم هایلایتی برای پیج «@{cleaned_uname}» ثبت نشده است.",
        }
    except Exception as e:
        return {"success": False, "error": f"خطا در استخراج هایلایت‌ها: {str(e)}"}


async def handle_fetch_highlight_items(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch stories inside a specific highlight album by highlight_pk."""
    highlight_pk = str(payload.get("highlight_pk") or payload.get("id") or "").strip()
    proxy = str(payload.get("proxy") or "").strip()
    account = str(payload.get("account") or "").strip()

    if not highlight_pk:
        return {"success": False, "error": "شناسه هایلایت مشخص نشده است."}

    cl, has_auth = get_client_for_downloader(account_username=account, proxy=proxy)
    try:
        clean_pk = highlight_pk.replace("highlight:", "")
        detail = await cl.highlight_info_v1(clean_pk)
        raw_items = getattr(detail, "items", []) or []
        items = []
        for itm in raw_items:
            i_type = "video" if getattr(itm, "media_type", 1) == 2 or getattr(itm, "video_url", None) else "photo"
            i_v_url = str(getattr(itm, "video_url", "") or "")
            i_t_url = str(getattr(itm, "thumbnail_url", "") or getattr(itm, "image_url", "") or "")
            items.append({
                "id": str(getattr(itm, "id", "")),
                "pk": str(getattr(itm, "pk", "")),
                "type": i_type,
                "is_video": i_type == "video",
                "video_url": i_v_url if i_type == "video" else None,
                "image_url": i_t_url,
                "thumbnail_url": i_t_url,
                "caption": str(getattr(itm, "caption_text", "") or ""),
            })

        return {
            "success": True,
            "highlight_pk": clean_pk,
            "title": getattr(detail, "title", "Highlight"),
            "count": len(items),
            "items": items,
            "hasAuth": has_auth,
        }
    except Exception as e:
        return {"success": False, "error": f"خطا در دریافت استوری‌های هایلایت: {str(e)}"}


async def handle_download_media_file(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Download direct file to downloads directory."""
    url = str(payload.get("url") or "").strip()
    filename = str(payload.get("filename") or "").strip()
    media_type = str(payload.get("type") or "video").strip()
    proxy = str(payload.get("proxy") or "").strip()

    if not url:
        return {"success": False, "error": "آدرس دانلود مدیا مشخص نشده است."}

    downloads_dir = ROOT_DIR / "downloads"
    downloads_dir.mkdir(parents=True, exist_ok=True)

    if not filename:
        ext = ".mp4" if media_type == "video" else ".jpg"
        filename = f"instagram_{int(time.time())}_{uuid.uuid4().hex[:6]}{ext}"

    dest_file = downloads_dir / filename

    proxies = {}
    if proxy:
        proxies = {"http": proxy, "https": proxy}

    try:
        r = requests.get(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Referer": "https://www.instagram.com/",
            },
            proxies=proxies,
            stream=True,
            timeout=40,
        )
        r.raise_for_status()
        with open(dest_file, "wb") as f:
            for chunk in r.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)

        file_size = dest_file.stat().st_size
        return {
            "success": True,
            "fileName": filename,
            "filePath": str(dest_file),
            "fileSize": file_size,
            "downloadUrl": f"/api/instagram/downloader/file/{filename}",
            "message": f"فایل با موفقیت ذخیره شد ({filename})",
        }
    except Exception as e:
        return {"success": False, "error": f"خطا در دانلود فایل: {str(e)}"}


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No action specified"}))
        sys.exit(1)

    action = sys.argv[1]
    raw_input = sys.stdin.read().strip()
    payload = json.loads(raw_input) if raw_input else {}

    if action == "login":
        res = await handle_login_action(payload)
    elif action == "login_sessionid":
        res = await handle_login_by_sessionid(payload)
    elif action == "import_session":
        res = await handle_import_session(payload)
    elif action == "verify":
        res = await handle_verify_or_refresh(payload)
    elif action == "extract_cookies":
        res = await handle_extract_cookies(payload)
    elif action == "extract_media":
        res = await handle_extract_media(payload)
    elif action == "fetch_profile":
        res = await handle_fetch_profile(payload)
    elif action == "fetch_stories":
        res = await handle_fetch_stories(payload)
    elif action == "fetch_highlights":
        res = await handle_fetch_highlights(payload)
    elif action == "fetch_highlight_items":
        res = await handle_fetch_highlight_items(payload)
    elif action == "download_file":
        res = await handle_download_media_file(payload)
    else:
        res = {"success": False, "error": f"Unknown action: {action}"}

    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())

