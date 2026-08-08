#!/usr/bin/env python3
import sys
import json
import asyncio
from pathlib import Path

# Insert current dir to sys.path
sys.path.insert(0, str(Path(__file__).parent))

from vpn_manager import VPNManager

async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command specified"}))
        return

    cmd = sys.argv[1]
    vpn = VPNManager()

    if cmd == "status":
        running = vpn.is_running()
        store = vpn._store
        ai = store.get("active_index")
        configs = store.get("configs", [])
        active_name = configs[ai]["name"] if (ai is not None and 0 <= ai < len(configs)) else None
        print(json.dumps({
            "running": running,
            "enabled": store.get("enabled", False),
            "activeIndex": ai,
            "activeName": active_name,
            "configsCount": len(configs),
            "socksProxy": "127.0.0.1:10808",
            "httpProxy": "127.0.0.1:10809"
        }))

    elif cmd == "list":
        store = vpn._store
        ai = store.get("active_index")
        configs = []
        for idx, item in enumerate(store.get("configs", [])):
            configs.append({
                "index": idx,
                "name": item.get("name", f"Config {idx+1}"),
                "config": item.get("config", ""),
                "isActive": idx == ai
            })
        print(json.dumps({"configs": configs, "activeIndex": ai}))

    elif cmd == "add":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Config link or content required"}))
            return
        content = sys.argv[2]
        name = sys.argv[3] if len(sys.argv) > 3 else ""
        ok_count, fail_count, msgs = vpn.add_configs_bulk(content)
        print(json.dumps({
            "success": ok_count > 0,
            "added": ok_count,
            "failed": fail_count,
            "messages": msgs
        }))

    elif cmd == "delete":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Index required"}))
            return
        try:
            raw_arg = sys.argv[2]
            if "," in raw_arg or "[" in raw_arg:
                # bulk delete
                clean_str = raw_arg.replace("[", "").replace("]", "")
                indices = [int(i.strip()) for i in clean_str.split(",") if i.strip().isdigit()]
                count, msg = vpn.delete_configs_bulk(indices)
                print(json.dumps({"success": count > 0, "deleted": count, "message": msg}))
            else:
                idx = int(raw_arg)
                ok, msg = vpn.delete_config(idx)
                print(json.dumps({"success": ok, "message": msg}))
        except Exception as e:
            print(json.dumps({"error": str(e)}))

    elif cmd == "select":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Index required"}))
            return
        try:
            idx = int(sys.argv[2])
            ok, msg = vpn.set_active(idx)
            print(json.dumps({"success": ok, "message": msg}))
        except Exception as e:
            print(json.dumps({"error": str(e)}))

    elif cmd == "start":
        ok, msg = await vpn.enable_vpn()
        print(json.dumps({"success": ok, "message": msg}))

    elif cmd == "stop":
        ok, msg = await vpn.disable_vpn()
        print(json.dumps({"success": ok, "message": msg}))

    elif cmd == "test":
        if len(sys.argv) > 2 and sys.argv[2] != "all":
            idx = int(sys.argv[2])
            mode = sys.argv[3] if len(sys.argv) > 3 else "full"
            if mode == "ping":
                ok, msg, ping_ms = await vpn.test_ping(idx)
                print(json.dumps({"result": [ok, msg], "ping": ping_ms}))
            elif mode == "speed":
                ping_arg = None
                if len(sys.argv) > 4 and sys.argv[4] not in ("null", "None", ""):
                    try:
                        ping_arg = float(sys.argv[4])
                    except ValueError:
                        pass
                res = await vpn.test_speed(idx, ping_arg)
                print(json.dumps({"result": res}))
            else:
                res = await vpn.test_config(idx)
                print(json.dumps({"result": res}))
        else:
            results = await vpn.test_all_configs()
            # results format: [(index, name, ok, msg), ...]
            formatted = []
            for r in results:
                formatted.append({
                    "index": r[0],
                    "name": r[1],
                    "success": r[2],
                    "output": r[3]
                })
            print(json.dumps({"results": formatted}))

    else:
        print(json.dumps({"error": f"Unknown command: {cmd}"}))

if __name__ == "__main__":
    asyncio.run(main())
