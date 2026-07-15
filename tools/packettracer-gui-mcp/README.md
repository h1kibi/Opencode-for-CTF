# Packet Tracer GUI MCP

Python-based MCP wrapper for Cisco Packet Tracer desktop automation.

## Provided tools
- pt_list_windows
- pt_focus_window
- pt_get_window_rect
- pt_capture_window
- pt_click
- pt_drag
- pt_hotkey
- pt_type_text
- pt_get_ui_tree
- pt_read_visible_labels
- pt_drag_device_from_palette
- pt_connect_points

## Notes
- Requires an interactive Windows desktop session.
- Coordinates can be absolute or relative to the Packet Tracer window.
- PyAutoGUI failsafe is enabled: moving the mouse to the screen corner can abort runaway automation.
