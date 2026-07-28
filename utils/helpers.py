import re

def slugify(text: str) -> str:
    """Return a filesystem-safe slug for `text`."""
    text = re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_")
    return text or "participant"
