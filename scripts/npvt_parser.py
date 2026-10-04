import base64
import json
import os
import re
import urllib.parse
from typing import List, Dict, Any, Optional

TABLES_FILE = os.path.join(os.path.dirname(__file__), 'npvt_tables.json')

with open(TABLES_FILE, 'r') as f:
    _tables = json.load(f)

tyBoxes = _tables['tyBoxes']
mbl = _tables['mbl']
tboxesLast = _tables['tboxesLast']
xorTable = _tables['xorTable']

SHIFT_ORDER = [0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11]

def shift_rows(b: List[int]) -> List[int]:
    return [b[SHIFT_ORDER[i]] for i in range(16)]

def core_transform(block: List[int]) -> List[int]:
    buf = shift_rows(block[:])
    for i11 in range(4):
        i13 = i11 * 4
        i14, i15, i16 = i13 + 1, i13 + 2, i13 + 3
        iC = tyBoxes[i13][buf[i13]]
        iC2 = tyBoxes[i14][buf[i14]]
        iC3 = tyBoxes[i15][buf[i15]]
        iC4 = tyBoxes[i16][buf[i16]]
        for i17 in range(4):
            i18 = i11 * 24 + i17 * 6
            i19 = i17 * 8
            i20, i22 = 28 - i19, 24 - i19
            n1 = (iC >> i20) & 15
            n2 = (iC2 >> i20) & 15
            n3 = (iC3 >> i20) & 15
            n4 = (iC4 >> i20) & 15
            b10 = xorTable[i18][n1][n2]
            b11 = xorTable[i18 + 1][n3][n4]
            m1 = (iC >> i22) & 15
            m2 = (iC2 >> i22) & 15
            m3 = (iC3 >> i22) & 15
            m4 = (iC4 >> i22) & 15
            lo = xorTable[i18 + 5][xorTable[i18 + 2][m1][m2]][xorTable[i18 + 3][m3][m4]]
            hi = xorTable[i18 + 4][b10][b11]
            buf[i13 + i17] = lo | (hi << 4)
        iC5 = mbl[i13][buf[i13]]
        iC6 = mbl[i14][buf[i14]]
        iC7 = mbl[i15][buf[i15]]
        iC8 = mbl[i16][buf[i16]]
        for i27 in range(4):
            i28 = i11 * 24 + i27 * 6
            i29 = i27 * 8
            i30, i31 = 28 - i29, 24 - i29
            n1 = (iC5 >> i30) & 15
            n2 = (iC6 >> i30) & 15
            n3 = (iC7 >> i30) & 15
            n4 = (iC8 >> i30) & 15
            a1 = xorTable[i28][n1][n2]
            a2 = xorTable[i28 + 1][n3][n4]
            hi = xorTable[i28 + 4][a1][a2]
            m1 = (iC5 >> i31) & 15
            m2 = (iC6 >> i31) & 15
            m3 = (iC7 >> i31) & 15
            m4 = (iC8 >> i31) & 15
            b1 = xorTable[i28 + 2][m1][m2]
            b2 = xorTable[i28 + 3][m3][m4]
            lo = xorTable[i28 + 5][b1][b2]
            buf[i13 + i27] = (hi << 4) | lo
    buf = shift_rows(buf)
    return [tboxesLast[i][buf[i]] for i in range(16)]

def ctr_crypt(nonce: bytes, data: bytes) -> bytes:
    counter = list(nonce)
    out = bytearray(len(data))
    off = 0
    while off < len(data):
        ks = core_transform(counter)
        for i in range(15, -1, -1):
            counter[i] = (counter[i] + 1) & 0xFF
            if counter[i] != 0:
                break
        block = data[off:off + 16]
        for i, b in enumerate(block):
            out[off + i] = b ^ ks[i]
        off += 16
    return bytes(out)

def decrypt_blob(blob: bytes) -> Optional[bytes]:
    if len(blob) < 16:
        return None
    return ctr_crypt(blob[:16], blob[16:])

def decode_token(t: str) -> Optional[bytes]:
    t = t.replace('NPVT1', '').strip()
    t = re.sub(r'\s+', '', t)
    if not t:
        return None
    # Try hex
    if len(t) % 2 == 0 and re.fullmatch(r'[0-9a-fA-F]+', t):
        try:
            return bytes.fromhex(t)
        except Exception:
            pass
    # Try standard base64 or urlsafe
    pad = (-len(t)) % 4
    padded = t + ('=' * pad)
    try:
        return base64.b64decode(padded)
    except Exception:
        pass
    try:
        return base64.urlsafe_b64decode(padded)
    except Exception:
        pass
    return None

def build_vless_from_profile(v: dict, name: str) -> str:
    q = {
        "encryption": v.get("method") or "none",
        "type": v.get("network") or "tcp"
    }
    sec = v.get("security") or "none"
    if sec != "none":
        q["security"] = sec
    if sec == "reality":
        for k, src in [("sni", "sni"), ("fp", "fingerPrint"), ("pbk", "publicKey"), ("sid", "shortId"), ("flow", "flow"), ("spx", "spiderX")]:
            if v.get(src):
                q[k] = v[src]
    elif sec == "tls":
        for k, src in [("sni", "sni"), ("fp", "fingerPrint")]:
            if v.get(src):
                q[k] = v[src]
        if v.get("alpn"):
            q["alpn"] = v["alpn"] if isinstance(v["alpn"], str) else ",".join(v["alpn"])
    if v.get("network") == "ws":
        if v.get("host"):
            q["host"] = v["host"]
        if v.get("path"):
            q["path"] = v["path"]
    elif v.get("network") == "grpc":
        if v.get("serviceName"):
            q["serviceName"] = v["serviceName"]
    if v.get("flow"):
        q["flow"] = v["flow"]
    qs = urllib.parse.urlencode(q, quote_via=urllib.parse.quote)
    return f"vless://{v.get('password','')}@{v.get('server','')}:{v.get('serverPort', 443)}?{qs}#{urllib.parse.quote(name)}"

def build_trojan_from_profile(v: dict, name: str) -> str:
    q = {
        "type": v.get("network") or "tcp",
        "security": v.get("security") or "tls"
    }
    if v.get("sni"):
        q["sni"] = v["sni"]
    if v.get("fingerPrint"):
        q["fp"] = v["fingerPrint"]
    if v.get("alpn"):
        q["alpn"] = v["alpn"] if isinstance(v["alpn"], str) else ",".join(v["alpn"])
    if v.get("network") == "ws":
        if v.get("host"):
            q["host"] = v["host"]
        if v.get("path"):
            q["path"] = v["path"]
    elif v.get("network") == "grpc":
        if v.get("serviceName"):
            q["serviceName"] = v["serviceName"]
    qs = urllib.parse.urlencode(q, quote_via=urllib.parse.quote)
    return f"trojan://{urllib.parse.quote(str(v.get('password','')))}@{v.get('server','')}:{v.get('serverPort', 443)}?{qs}#{urllib.parse.quote(name)}"

def build_ss_from_profile(v: dict, name: str) -> str:
    method = v.get("method") or "chacha20-ietf-poly1305"
    password = str(v.get("password") or "")
    userinfo = base64.urlsafe_b64encode(f"{method}:{password}".encode()).decode().rstrip("=")
    return f"ss://{userinfo}@{v.get('server','')}:{v.get('serverPort', 8388)}#{urllib.parse.quote(name)}"

def build_vmess_from_profile(v: dict, name: str) -> str:
    obj = {
        "v": "2",
        "ps": name,
        "add": v.get("server", ""),
        "port": str(v.get("serverPort", 443)),
        "id": v.get("password", ""),
        "aid": str(v.get("alterId", 0)),
        "scy": v.get("method") or "auto",
        "net": v.get("network") or "tcp",
        "type": "none",
        "host": v.get("host") or "",
        "path": v.get("path") or "",
        "tls": "tls" if v.get("security") in ("tls", "reality") else "",
        "sni": v.get("sni") or "",
        "fp": v.get("fingerPrint") or "",
        "alpn": v["alpn"] if isinstance(v.get("alpn"), str) else (",".join(v["alpn"]) if v.get("alpn") else "")
    }
    encoded = base64.b64encode(json.dumps(obj, ensure_ascii=False).encode()).decode()
    return f"vmess://{encoded}"

def parse_profile_item(item: dict) -> List[str]:
    uris = []
    name = item.get("name") or item.get("remarks") or "NPVT-Config"
    
    # Check v2rayProfile dictionary
    vp = item.get("v2rayProfile")
    if isinstance(vp, dict):
        ctype = vp.get("configType")
        if ctype == 5 or vp.get("protocol") == "vless":
            uris.append(build_vless_from_profile(vp, name))
        elif ctype == 6 or vp.get("protocol") == "trojan":
            uris.append(build_trojan_from_profile(vp, name))
        elif ctype == 3 or vp.get("protocol") == "shadowsocks":
            uris.append(build_ss_from_profile(vp, name))
        elif ctype == 1 or vp.get("protocol") == "vmess":
            uris.append(build_vmess_from_profile(vp, name))
        else:
            # Fallback check
            if vp.get("server") and vp.get("password"):
                uris.append(build_vless_from_profile(vp, name))

    # Check v2rayJson (string or dict)
    vj = item.get("v2rayJson")
    if vj:
        if isinstance(vj, str):
            try:
                vj_obj = json.loads(vj)
                uris.extend(parse_v2ray_config_dict(vj_obj, name))
            except Exception:
                pass
        elif isinstance(vj, dict):
            uris.extend(parse_v2ray_config_dict(vj, name))

    # Check outbounds inside item
    if "outbounds" in item and isinstance(item["outbounds"], list):
        uris.extend(parse_v2ray_config_dict(item, name))

    return uris

def parse_v2ray_config_dict(cfg: dict, default_remarks: str = "") -> List[str]:
    uris = []
    remarks = cfg.get("remarks") or default_remarks or "NPVT"
    outbounds = cfg.get("outbounds") or []
    for ob in outbounds:
        if not isinstance(ob, dict):
            continue
        proto = ob.get("protocol", "").lower()
        if proto in ("freedom", "blackhole", "dns", ""):
            continue
        tag = ob.get("tag") or remarks
        stream = ob.get("streamSettings") or {}
        settings = ob.get("settings") or {}
        net = stream.get("network") or "tcp"
        sec = stream.get("security") or "none"

        if proto == "vless":
            vnext = settings.get("vnext", [])
            if vnext:
                srv = vnext[0]
                user = (srv.get("users") or [{}])[0]
                q = {"type": net, "security": sec, "encryption": user.get("encryption") or "none"}
                if user.get("flow"): q["flow"] = user["flow"]
                if sec == "reality":
                    real = stream.get("realitySettings") or {}
                    if real.get("serverName"): q["sni"] = real["serverName"]
                    if real.get("fingerprint"): q["fp"] = real["fingerprint"]
                    if real.get("publicKey"): q["pbk"] = real["publicKey"]
                    if real.get("shortId"): q["sid"] = real["shortId"]
                elif sec == "tls":
                    tls = stream.get("tlsSettings") or {}
                    if tls.get("serverName"): q["sni"] = tls["serverName"]
                    if tls.get("fingerprint"): q["fp"] = tls["fingerprint"]
                if net == "ws":
                    ws = stream.get("wsSettings") or {}
                    if ws.get("path"): q["path"] = ws["path"]
                    h = ws.get("host") or (ws.get("headers") or {}).get("Host")
                    if h: q["host"] = h
                qs = urllib.parse.urlencode(q, quote_via=urllib.parse.quote)
                uris.append(f"vless://{user.get('id','')}@{srv.get('address','')}:{srv.get('port', 443)}?{qs}#{urllib.parse.quote(tag)}")

        elif proto == "trojan":
            servers = settings.get("servers", [])
            if servers:
                s = servers[0]
                q = {"type": net, "security": sec or "tls"}
                tls = stream.get("tlsSettings") or {}
                if tls.get("serverName"): q["sni"] = tls["serverName"]
                if tls.get("fingerprint"): q["fp"] = tls["fingerprint"]
                if net == "ws":
                    ws = stream.get("wsSettings") or {}
                    if ws.get("path"): q["path"] = ws["path"]
                    h = ws.get("host") or (ws.get("headers") or {}).get("Host")
                    if h: q["host"] = h
                qs = urllib.parse.urlencode(q, quote_via=urllib.parse.quote)
                uris.append(f"trojan://{urllib.parse.quote(str(s.get('password','')))}@{s.get('address','')}:{s.get('port', 443)}?{qs}#{urllib.parse.quote(tag)}")

        elif proto == "vmess":
            vnext = settings.get("vnext", [])
            if vnext:
                srv = vnext[0]
                user = (srv.get("users") or [{}])[0]
                host, path = "", ""
                if net == "ws":
                    ws = stream.get("wsSettings") or {}
                    path = ws.get("path", "")
                    host = ws.get("host") or (ws.get("headers") or {}).get("Host", "")
                tls = stream.get("tlsSettings") or {}
                obj = {
                    "v": "2",
                    "ps": tag,
                    "add": srv.get("address", ""),
                    "port": str(srv.get("port", 443)),
                    "id": user.get("id", ""),
                    "aid": str(user.get("alterId", 0)),
                    "scy": user.get("security", "auto"),
                    "net": net,
                    "type": "none",
                    "host": host,
                    "path": path,
                    "tls": "tls" if sec in ("tls", "reality") else "",
                    "sni": tls.get("serverName", ""),
                    "fp": tls.get("fingerprint", "")
                }
                uris.append("vmess://" + base64.b64encode(json.dumps(obj).encode()).decode())

        elif proto == "shadowsocks":
            servers = settings.get("servers", [])
            if servers:
                s = servers[0]
                userinfo = base64.urlsafe_b64encode(f"{s.get('method','')}:{s.get('password','')}".encode()).decode().rstrip("=")
                uris.append(f"ss://{userinfo}@{s.get('address','')}:{s.get('port', 8388)}#{urllib.parse.quote(tag)}")

    return uris

def parse_npvt_data(raw_content: str) -> List[str]:
    # 1. Clean header
    text = raw_content.replace("NPVT1", "").strip()
    tokens = [t.strip() for t in text.split(",") if t.strip()]
    
    extracted_uris: List[str] = []
    
    for token in tokens:
        blob = decode_token(token)
        if not blob or len(blob) < 16:
            continue
        decrypted = decrypt_blob(blob)
        if not decrypted:
            continue
        
        # Try decoding as UTF-8 JSON
        try:
            pt_str = decrypted.decode("utf-8", errors="ignore").strip()
            if not pt_str:
                continue
            parsed_json = json.loads(pt_str)
            if isinstance(parsed_json, list):
                for item in parsed_json:
                    if isinstance(item, dict):
                        extracted_uris.extend(parse_profile_item(item))
            elif isinstance(parsed_json, dict):
                extracted_uris.extend(parse_profile_item(parsed_json))
        except Exception:
            pass

    # Deduplicate while preserving order
    seen = set()
    unique_uris = []
    for u in extracted_uris:
        if u and u not in seen:
            seen.add(u)
            unique_uris.append(u)
            
    return unique_uris

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r', errors='ignore') as f:
            data = f.read()
        links = parse_npvt_data(data)
        print(json.dumps(links, indent=2, ensure_ascii=False))
