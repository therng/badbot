import re

with open('src/app/globals.css', 'r') as f:
    content = f.read()

# 1. Change the landscape media queries to include desktop
content = content.replace('@media (orientation: landscape) and (max-width: 1180px)', '@media (min-width: 821px), (orientation: landscape)')

# 2. We need to remove the old @media (min-width: 821px) blocks.
# Let's find their start and end.
# They are under the comments:
# /* ─────────────────────────────────────────────
#    COCKPIT LAYOUT — DESKTOP + MOBILE LANDSCAPE
# ───────────────────────────────────────────── */
# and
# /* ─────────────────────────────────────────────
#    SINGLE-FLOW DASHBOARD — removes cockpit desktop layout
# ───────────────────────────────────────────── */

cockpit_marker = "/* ─────────────────────────────────────────────\n   COCKPIT LAYOUT — DESKTOP + MOBILE LANDSCAPE\n───────────────────────────────────────────── */\n@media (min-width: 821px) {"
single_flow_marker = "/* ─────────────────────────────────────────────\n   SINGLE-FLOW DASHBOARD — removes cockpit desktop layout\n───────────────────────────────────────────── */\n@media (min-width: 821px) {"

def remove_block(text, marker):
    start_idx = text.find(marker)
    if start_idx == -1:
        return text
    
    # find the matching closing brace for this @media block
    brace_count = 0
    in_block = False
    
    for i in range(start_idx + len(marker), len(text)):
        if text[i] == '{':
            brace_count += 1
            in_block = True
        elif text[i] == '}':
            if not in_block:
                # this is the closing brace of the @media block itself
                end_idx = i + 1
                return text[:start_idx] + text[end_idx:]
            brace_count -= 1
            if brace_count == 0:
                in_block = False

    return text

content = remove_block(content, cockpit_marker)
content = remove_block(content, single_flow_marker)

with open('src/app/globals.css', 'w') as f:
    f.write(content)

