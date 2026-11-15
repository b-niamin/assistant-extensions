"""OAuth logins of the API sources (Strava, Withings), kept encrypted in health.secret_oauth.

One record per (profile, provider): the owner's own API app (client id and secret, typed in the terminal by
`python -m sync connect <provider>`) and its tokens. Fernet with TOKEN_ENCRYPTION_KEY, like the Garmin
tokens; the table is reachable only by the service role. Nothing here is ever logged.
"""
from __future__ import annotations

import json
import secrets
import time
import urllib.parse
from typing import Any, Callable

import psycopg
from cryptography.fernet import Fernet, InvalidToken

from . import http

# What each provider needs. Scopes: Strava must read private activities and write titles/descriptions;
# Withings reads body measures.
PROVIDERS: dict[str, dict[str, Any]] = {
    "strava": {
        "name": "Strava",
        "authorize": "https://www.strava.com/oauth/authorize",
        "token": "https://www.strava.com/oauth/token",
        "scope": "read,activity:read_all,activity:write",
        "apps": "https://www.strava.com/settings/api",
    },
    "withings": {
        "name": "Withings",
        "authorize": "https://account.withings.com/oauth2_user/authorize2",
        "token": "https://wbsapi.withings.net/v2/oauth2",
        "scope": "user.metrics",
        "apps": "https://developer.withings.com/dashboard/",
    },
}


def authorize_url(provider: str, client_id: str, redirect_uri: str, state: str) -> str:
    p = PROVIDERS[provider]
    q = {"client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code", "scope": p["scope"], "state": state}
    if provider == "strava":
        q["approval_prompt"] = "auto"
    return p["authorize"] + "?" + urllib.parse.urlencode(q)


def new_state() -> str:
    return secrets.token_urlsafe(24)


def _tokens(provider: str, body: Any, now: float) -> dict[str, Any]:
    """Both providers' token answers as {access_token, refresh_token, expires_at, account}."""
    if provider == "withings":
        if not isinstance(body, dict) or body.get("status") != 0:
            raise http.HttpError(400, f"Withings status {body.get('status') if isinstance(body, dict) else '?'}")
        body = body.get("body") or {}
        expires_at = now + float(body.get("expires_in") or 0)
        account = str(body.get("userid") or "")
    else:
        if not isinstance(body, dict):
            raise http.HttpError(400, "no token")
        expires_at = float(body.get("expires_at") or now + float(body.get("expires_in") or 0))
        athlete = body.get("athlete") or {}
        account = " ".join(str(athlete.get(k) or "") for k in ("firstname", "lastname")).strip() or str(athlete.get("id") or "")
    if not body.get("access_token") or not body.get("refresh_token"):
        raise http.HttpError(400, "no token in the answer")
    out = {"access_token": body["access_token"], "refresh_token": body["refresh_token"], "expires_at": expires_at}
    if account:
        out["account"] = account
    return out


def exchange(provider: str, client: dict[str, str], code: str, redirect_uri: str, call: Callable[..., Any] = http.request) -> dict[str, Any]:
    form = {"client_id": client["client_id"], "client_secret": client["client_secret"], "code": code, "grant_type": "authorization_code", "redirect_uri": redirect_uri}
    if provider == "withings":
        form["action"] = "requesttoken"
    return _tokens(provider, call("POST", PROVIDERS[provider]["token"], form=form), time.time())


def refresh(provider: str, client: dict[str, str], refresh_token: str, call: Callable[..., Any] = http.request) -> dict[str, Any]:
    form = {"client_id": client["client_id"], "client_secret": client["client_secret"], "refresh_token": refresh_token, "grant_type": "refresh_token"}
    if provider == "withings":
        form["action"] = "requesttoken"
    return _tokens(provider, call("POST", PROVIDERS[provider]["token"], form=form), time.time())


class OAuthStore:
    """health.secret_oauth: {client_id, client_secret, redirect_uri, access_token, refresh_token, expires_at, account}."""

    def __init__(self, dsn: str, key: str) -> None:
        self._dsn = dsn
        self._fernet = Fernet(key.encode())

    def _conn(self) -> psycopg.Connection:
        return psycopg.connect(self._dsn, autocommit=True)

    def load(self, profile: str, provider: str) -> dict[str, Any] | None:
        with self._conn() as c:
            row = c.execute("SELECT ciphertext FROM health.secret_oauth WHERE profile_id = %s AND provider = %s", (profile, provider)).fetchone()
        if not row:
            return None
        try:
            data = json.loads(self._fernet.decrypt(row[0].encode()))
        except (InvalidToken, ValueError):
            return None
        return data if isinstance(data, dict) else None

    def save(self, profile: str, provider: str, data: dict[str, Any]) -> None:
        ct = self._fernet.encrypt(json.dumps(data, separators=(",", ":")).encode()).decode()
        with self._conn() as c:
            c.execute(
                """INSERT INTO health.secret_oauth (profile_id, provider, ciphertext) VALUES (%s, %s, %s)
                   ON CONFLICT (profile_id, provider) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, updated_at = now()""",
                (profile, provider, ct),
            )

    def clear(self, profile: str, provider: str) -> None:
        with self._conn() as c:
            c.execute("DELETE FROM health.secret_oauth WHERE profile_id = %s AND provider = %s", (profile, provider))

    def profiles(self, provider: str) -> list[str]:
        with self._conn() as c:
            return [r[0] for r in c.execute("SELECT profile_id FROM health.secret_oauth WHERE provider = %s ORDER BY profile_id", (provider,))]


class Session:
    """A provider's access token for one profile, refreshed (and saved) shortly before it runs out."""

    def __init__(self, store: Any, profile: str, provider: str, call: Callable[..., Any] = http.request) -> None:
        self.store, self.profile, self.provider, self.call = store, profile, provider, call

    def token(self) -> str:
        data = self.store.load(self.profile, self.provider)
        if not data or not data.get("refresh_token"):
            raise NotConnected(self.provider)
        if float(data.get("expires_at") or 0) - 120 < time.time():
            client = {"client_id": data["client_id"], "client_secret": data["client_secret"]}
            try:
                fresh = refresh(self.provider, client, data["refresh_token"], self.call)
            except http.HttpError as e:
                if e.status in (400, 401, 403):
                    raise NotConnected(self.provider, reconnect=True) from None
                raise
            data.update(fresh)
            self.store.save(self.profile, self.provider, data)
        return str(data["access_token"])


class NotConnected(Exception):
    def __init__(self, provider: str, reconnect: bool = False) -> None:
        super().__init__(f"{provider} is not connected" + (" (sign in again)" if reconnect else ""))
        self.provider = provider
        self.reconnect = reconnect
