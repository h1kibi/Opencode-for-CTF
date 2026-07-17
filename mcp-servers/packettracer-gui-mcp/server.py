from __future__ import annotations

import base64
import io
import json
import os
import re
import time
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP
from PIL import Image
from mss import mss
import pyautogui
import pygetwindow as gw
from pywinauto import Desktop

APP_TITLE_PATTERN = os.environ.get("PACKET_TRACER_WINDOW_REGEX", r"Packet Tracer")
# Defaults to a workspace-relative directory; override with PACKET_TRACER_WORKSPACE.
DEFAULT_WORKSPACE = os.environ.get("PACKET_TRACER_WORKSPACE", str(Path.cwd() / "packet-tracer-labs"))
CAPTURE_DIR = Path(os.environ.get("PACKET_TRACER_CAPTURE_DIR", str(Path(DEFAULT_WORKSPACE) / ".captures")))
CAPTURE_DIR.mkdir(parents=True, exist_ok=True)

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.08

mcp = FastMCP("packettracer-gui-mcp")


def _json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def _match_windows(pattern: str | None = None) -> list[dict[str, Any]]:
    regex = re.compile(pattern or APP_TITLE_PATTERN, re.IGNORECASE)
    windows = []
    for win in gw.getAllWindows():
        title = getattr(win, "title", "") or ""
        if not title:
            continue
        if regex.search(title):
            windows.append(
                {
                    "title": title,
                    "left": win.left,
                    "top": win.top,
                    "width": win.width,
                    "height": win.height,
                    "isActive": getattr(win, "isActive", False),
                    "isMinimized": getattr(win, "isMinimized", False),
                }
            )
    return windows


def _require_window(pattern: str | None = None):
    matches = _match_windows(pattern)
    if not matches:
        raise RuntimeError("No Packet Tracer window matched the requested title pattern")
    title = matches[0]["title"]
    wins = gw.getWindowsWithTitle(title)
    if not wins:
        raise RuntimeError(f"Window handle disappeared: {title}")
    return wins[0]


def _window_rect(win) -> dict[str, int]:
    return {
        "left": int(win.left),
        "top": int(win.top),
        "width": int(win.width),
        "height": int(win.height),
        "right": int(win.left + win.width),
        "bottom": int(win.top + win.height),
    }


def _focus_window(win, restore: bool = True) -> dict[str, Any]:
    if restore and getattr(win, "isMinimized", False):
        win.restore()
        time.sleep(0.2)
    win.activate()
    time.sleep(0.2)
    return {"title": win.title, **_window_rect(win)}


def _resolve_point(x: int | None, y: int | None, rel_x: float | None, rel_y: float | None, pattern: str | None = None) -> tuple[int, int, dict[str, Any]]:
    win = _require_window(pattern)
    rect = _window_rect(win)
    if x is not None and y is not None:
        return int(x), int(y), {"mode": "absolute", "window": rect}
    if rel_x is None or rel_y is None:
        raise RuntimeError("Provide either absolute x/y or relative rel_x/rel_y")
    abs_x = rect["left"] + int(rect["width"] * rel_x)
    abs_y = rect["top"] + int(rect["height"] * rel_y)
    return abs_x, abs_y, {"mode": "relative", "window": rect}


def _capture_region(rect: dict[str, int]) -> Path:
    ts = time.strftime("%Y%m%d-%H%M%S")
    out = CAPTURE_DIR / f"packettracer-{ts}.png"
    with mss() as sct:
        shot = sct.grab({
            "left": rect["left"],
            "top": rect["top"],
            "width": rect["width"],
            "height": rect["height"],
        })
        img = Image.frombytes("RGB", shot.size, shot.rgb)
        img.save(out)
    return out


def _capture_region_b64(rect: dict[str, int], max_width: int = 900) -> str:
    with mss() as sct:
        shot = sct.grab({
            "left": rect["left"],
            "top": rect["top"],
            "width": rect["width"],
            "height": rect["height"],
        })
        img = Image.frombytes("RGB", shot.size, shot.rgb)
        if img.width > max_width:
            ratio = max_width / img.width
            img = img.resize((max_width, int(img.height * ratio)))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("ascii")


@mcp.tool()
def pt_list_windows(pattern: str = APP_TITLE_PATTERN) -> str:
    """List windows matching the Packet Tracer title regex."""
    return _json({"pattern": pattern, "windows": _match_windows(pattern)})


@mcp.tool()
def pt_focus_window(pattern: str = APP_TITLE_PATTERN) -> str:
    """Focus the first matching Packet Tracer window."""
    win = _require_window(pattern)
    return _json(_focus_window(win))


@mcp.tool()
def pt_get_window_rect(pattern: str = APP_TITLE_PATTERN) -> str:
    """Return the rectangle for the first matching Packet Tracer window."""
    win = _require_window(pattern)
    return _json({"title": win.title, **_window_rect(win)})


@mcp.tool()
def pt_capture_window(pattern: str = APP_TITLE_PATTERN, inline_base64: bool = False) -> str:
    """Capture the first matching Packet Tracer window to a PNG file."""
    win = _require_window(pattern)
    _focus_window(win)
    rect = _window_rect(win)
    out = _capture_region(rect)
    result = {"title": win.title, "path": str(out), "rect": rect}
    if inline_base64:
        result["pngBase64"] = _capture_region_b64(rect)
    return _json(result)


@mcp.tool()
def pt_click(
    x: int | None = None,
    y: int | None = None,
    rel_x: float | None = None,
    rel_y: float | None = None,
    clicks: int = 1,
    button: str = "left",
    pattern: str = APP_TITLE_PATTERN,
) -> str:
    """Click at absolute or window-relative coordinates."""
    win = _require_window(pattern)
    _focus_window(win)
    abs_x, abs_y, meta = _resolve_point(x, y, rel_x, rel_y, pattern)
    pyautogui.click(abs_x, abs_y, clicks=max(1, clicks), button=button)
    return _json({"clicked": {"x": abs_x, "y": abs_y, "button": button, "clicks": clicks}, **meta})


@mcp.tool()
def pt_drag(
    start_x: int | None = None,
    start_y: int | None = None,
    start_rel_x: float | None = None,
    start_rel_y: float | None = None,
    end_x: int | None = None,
    end_y: int | None = None,
    end_rel_x: float | None = None,
    end_rel_y: float | None = None,
    duration: float = 0.5,
    button: str = "left",
    pattern: str = APP_TITLE_PATTERN,
) -> str:
    """Drag from one point to another using absolute or relative coordinates."""
    win = _require_window(pattern)
    _focus_window(win)
    from_x, from_y, from_meta = _resolve_point(start_x, start_y, start_rel_x, start_rel_y, pattern)
    to_x, to_y, to_meta = _resolve_point(end_x, end_y, end_rel_x, end_rel_y, pattern)
    pyautogui.moveTo(from_x, from_y)
    pyautogui.dragTo(to_x, to_y, duration=max(0.05, duration), button=button)
    return _json({
        "drag": {
            "from": {"x": from_x, "y": from_y},
            "to": {"x": to_x, "y": to_y},
            "duration": duration,
            "button": button,
        },
        "fromMeta": from_meta,
        "toMeta": to_meta,
    })


@mcp.tool()
def pt_hotkey(keys: list[str], pattern: str = APP_TITLE_PATTERN) -> str:
    """Send a hotkey chord to Packet Tracer."""
    if not keys:
        raise RuntimeError("keys cannot be empty")
    win = _require_window(pattern)
    _focus_window(win)
    pyautogui.hotkey(*keys)
    return _json({"hotkey": keys, "title": win.title})


@mcp.tool()
def pt_type_text(text: str, interval: float = 0.02, pattern: str = APP_TITLE_PATTERN) -> str:
    """Type text into the active Packet Tracer window."""
    win = _require_window(pattern)
    _focus_window(win)
    pyautogui.write(text, interval=max(0.0, interval))
    return _json({"typed": text, "interval": interval, "title": win.title})


@mcp.tool()
def pt_get_ui_tree(pattern: str = APP_TITLE_PATTERN, backend: str = "uia", max_depth: int = 3) -> str:
    """Read a shallow UIA control tree for the Packet Tracer window."""
    win = _require_window(pattern)
    _focus_window(win)
    desktop = Desktop(backend=backend)
    app_win = desktop.window(title_re=pattern)
    app_win.wait("exists ready", timeout=5)

    def walk(node, depth: int) -> dict[str, Any]:
        info = node.element_info
        result = {
            "name": getattr(info, "name", "") or "",
            "control_type": getattr(info, "control_type", "") or "",
            "class_name": getattr(info, "class_name", "") or "",
            "automation_id": getattr(info, "automation_id", "") or "",
            "rectangle": str(getattr(info, "rectangle", "")),
        }
        if depth < max_depth:
            children = []
            for child in node.children():
                try:
                    children.append(walk(child, depth + 1))
                except Exception as exc:
                    children.append({"error": str(exc)})
            result["children"] = children
        return result

    tree = walk(app_win.wrapper_object(), 0)
    return _json(tree)


@mcp.tool()
def pt_read_visible_labels(pattern: str = APP_TITLE_PATTERN, backend: str = "uia", limit: int = 120) -> str:
    """Extract visible control names from the Packet Tracer window."""
    win = _require_window(pattern)
    _focus_window(win)
    desktop = Desktop(backend=backend)
    app_win = desktop.window(title_re=pattern)
    app_win.wait("exists ready", timeout=5)
    labels: list[str] = []
    for node in app_win.descendants():
        try:
            name = (node.element_info.name or "").strip()
            if name and name not in labels:
                labels.append(name)
            if len(labels) >= limit:
                break
        except Exception:
            continue
    return _json({"count": len(labels), "labels": labels})


@mcp.tool()
def pt_drag_device_from_palette(
    palette_rel_x: float,
    palette_rel_y: float,
    canvas_rel_x: float,
    canvas_rel_y: float,
    duration: float = 0.7,
    pattern: str = APP_TITLE_PATTERN,
) -> str:
    """Drag a device from a palette position to a canvas position using window-relative coordinates."""
    return pt_drag(
        start_rel_x=palette_rel_x,
        start_rel_y=palette_rel_y,
        end_rel_x=canvas_rel_x,
        end_rel_y=canvas_rel_y,
        duration=duration,
        pattern=pattern,
    )


@mcp.tool()
def pt_connect_points(
    start_rel_x: float,
    start_rel_y: float,
    end_rel_x: float,
    end_rel_y: float,
    duration: float = 0.25,
    pattern: str = APP_TITLE_PATTERN,
) -> str:
    """Connect two on-canvas points after the correct connection tool is selected."""
    first = json.loads(pt_click(rel_x=start_rel_x, rel_y=start_rel_y, pattern=pattern))
    time.sleep(0.1)
    second = json.loads(pt_click(rel_x=end_rel_x, rel_y=end_rel_y, pattern=pattern))
    return _json({"first": first, "second": second, "durationHint": duration})


if __name__ == "__main__":
    mcp.run()
