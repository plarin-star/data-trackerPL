"""A small helper for GET requests that retries when a server is busy."""

import time

import requests

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)


def get_json(session, url, params=None, headers=None, tries=3, timeout=20):
    """Download a URL and return its JSON. Retries on 429 and 5xx errors."""
    all_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    all_headers.update(headers or {})
    last_error = None
    for attempt in range(tries):
        try:
            resp = session.get(url, params=params, headers=all_headers, timeout=timeout)
            if resp.status_code == 429 or resp.status_code >= 500:
                last_error = f"HTTP {resp.status_code}"
            elif resp.status_code != 200:
                # A 4xx error other than 429 will not fix itself; stop now.
                raise RuntimeError(f"HTTP {resp.status_code}")
            else:
                return resp.json()
        except (requests.RequestException, ValueError) as exc:
            last_error = type(exc).__name__
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(last_error or "request failed")
