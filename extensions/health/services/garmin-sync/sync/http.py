"""Plain HTTPS calls for the API sources (Strava, Withings): JSON in, JSON out, a timeout, no retries.

Garmin needs curl_cffi to get past its bot wall; the public APIs here do not, so the standard library is
enough. Errors carry the status and a short, secret-free reason, never the request body or a token.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

TIMEOUT_S = 30


class HttpError(Exception):
    def __init__(self, status: int, reason: str) -> None:
        super().__init__(f"HTTP {status}: {reason}")
        self.status = status
        self.reason = reason


def request(
    method: str,
    url: str,
    *,
    query: dict[str, Any] | None = None,
    form: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    token: str | None = None,
) -> Any:
    """One call; returns the parsed JSON body (or None for an empty one)."""
    if query:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
    headers = {"accept": "application/json", "user-agent": "assistant-health/1"}
    data = None
    if form is not None:
        data = urllib.parse.urlencode({k: v for k, v in form.items() if v is not None}).encode()
        headers["content-type"] = "application/x-www-form-urlencoded"
    elif json_body is not None:
        data = json.dumps(json_body).encode()
        headers["content-type"] = "application/json"
    if token:
        headers["authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            body = resp.read()
    except urllib.error.HTTPError as e:
        raise HttpError(e.code, _reason(e)) from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise HttpError(0, type(e).__name__) from None
    if not body:
        return None
    try:
        return json.loads(body)
    except ValueError:
        raise HttpError(200, "not JSON") from None


def _reason(e: urllib.error.HTTPError) -> str:
    """The provider's own short message when it sends one (Strava: message), else the HTTP reason."""
    try:
        body = json.loads(e.read() or b"null")
        if isinstance(body, dict) and isinstance(body.get("message"), str):
            return body["message"][:120]
    except Exception:  # noqa: BLE001 - only for the message
        pass
    return str(e.reason)[:120]
