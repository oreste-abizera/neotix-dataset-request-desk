import re

_WS = re.compile(r"\s+")


def normalize_task_name(raw: str) -> str:
    """Canonical form used for episodes and requests: trimmed, single-spaced, lower-case."""
    return _WS.sub(" ", raw).strip().lower()
