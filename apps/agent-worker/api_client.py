import asyncio
import os
from collections.abc import Mapping
from types import TracebackType

import httpx


JsonObject = dict[str, object]


class AwaazAPIClient:
    def __init__(
        self,
        base_url: str | None = None,
        worker_secret: str | None = None,
        timeout_seconds: float = 10.0,
        max_attempts: int = 3,
        backoff_seconds: tuple[float, ...] = (1.0, 2.0, 4.0),
    ) -> None:
        resolved_base_url = base_url or os.getenv("AWAAZ_API_URL")
        resolved_worker_secret = worker_secret or os.getenv("WORKER_SECRET")
        if not resolved_base_url:
            raise ValueError("AWAAZ_API_URL is required")
        if not resolved_worker_secret:
            raise ValueError("WORKER_SECRET is required")
        if max_attempts < 1:
            raise ValueError("max_attempts must be at least 1")

        self._base_url = resolved_base_url.rstrip("/")
        self._worker_secret = resolved_worker_secret
        self._max_attempts = max_attempts
        self._backoff_seconds = backoff_seconds
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=timeout_seconds,
            headers={"x-worker-secret": self._worker_secret},
        )

    async def __aenter__(self) -> "AwaazAPIClient":
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get_agent_config(self, agent_id: str) -> JsonObject:
        return await self._request_json("GET", f"/internal/agents/{agent_id}/config")

    async def start_call(self, payload: Mapping[str, object]) -> JsonObject:
        return await self._request_json(
            "POST",
            "/internal/calls/start",
            json=dict(payload),
        )

    async def end_call(self, call_id: str, payload: Mapping[str, object]) -> None:
        await self._request_no_content(
            "POST",
            f"/internal/calls/{call_id}/end",
            json=dict(payload),
        )

    async def emit_event(self, call_id: str, payload: Mapping[str, object]) -> None:
        await self._request_no_content(
            "POST",
            f"/internal/calls/{call_id}/events",
            json=dict(payload),
        )

    async def heartbeat(self) -> None:
        await self._request_no_content("GET", "/internal/worker/heartbeat")

    async def _request_json(
        self,
        method: str,
        path: str,
        json: JsonObject | None = None,
    ) -> JsonObject:
        response = await self._request(method, path, json=json)
        data = response.json()
        if not isinstance(data, dict):
            raise TypeError(f"Expected JSON object from {path}")
        return data

    async def _request_no_content(
        self,
        method: str,
        path: str,
        json: JsonObject | None = None,
    ) -> None:
        await self._request(method, path, json=json)

    async def _request(
        self,
        method: str,
        path: str,
        json: JsonObject | None = None,
    ) -> httpx.Response:
        last_request_error: httpx.RequestError | None = None
        for attempt in range(self._max_attempts):
            try:
                response = await self._client.request(method, path, json=json)
                if response.status_code < 500:
                    response.raise_for_status()
                    return response
                response.raise_for_status()
            except httpx.RequestError as error:
                last_request_error = error
            except httpx.HTTPStatusError as error:
                if error.response.status_code < 500:
                    raise
                if attempt == self._max_attempts - 1:
                    raise

            if attempt < self._max_attempts - 1:
                delay = self._backoff_seconds[
                    min(attempt, len(self._backoff_seconds) - 1)
                ]
                await asyncio.sleep(delay)

        if last_request_error is not None:
            raise last_request_error
        raise RuntimeError(f"Request failed after {self._max_attempts} attempts")
