"""Smoke tests for the admin provisioning endpoints.

Run from `backend/`:

    .\\.venv\\Scripts\\python.exe tests/test_admin_smoke.py

No network access is used: `httpx.MockTransport` stands in for Supabase and the
JWT dependency is overridden, so the tests exercise validation, the Admin API
contract, rollback and the activation guards deterministically.
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import CurrentUser, get_current_user
from app.main import create_app
from app.api.deps import get_admin_client
from app.core.config import Settings
from app.models.domain import UserRole
from app.services.supabase_admin import SupabaseAdminService

NOW = datetime(2026, 11, 16, tzinfo=timezone.utc).isoformat()

ACTOR_ID = str(uuid4())
HOME_ID = str(uuid4())
PHARMACY_ID = str(uuid4())
NEW_USER_ID = str(uuid4())


def settings() -> Settings:
    return Settings(
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-key",
        supabase_service_role_key="service-role-key",
        frontend_base_url="http://localhost:3000",
    )


def profile_row(
    user_id: str,
    *,
    email: str,
    role: str = "welfare_admin",
    welfare_home_id: str | None = HOME_ID,
    pharmacy_id: str | None = None,
    is_active: bool = True,
    phone: str | None = None,
    full_name: str = "Test Admin",
) -> dict[str, Any]:
    return {
        "id": user_id,
        "email": email,
        "full_name": full_name,
        "phone": phone,
        "role": role,
        "welfare_home_id": welfare_home_id,
        "pharmacy_id": pharmacy_id,
        "is_active": is_active,
        "last_seen_at": None,
        "created_at": NOW,
        "updated_at": NOW,
    }


class StubSupabase:
    """Configurable fake for the GoTrue admin API and PostgREST."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.tenant_active: bool | None = True
        self.create_response: tuple[int, dict[str, Any]] | None = None
        self.invite_response: tuple[int, dict[str, Any]] | None = None
        self.profile: dict[str, Any] | None = None
        self.profile_patch_response: list[dict[str, Any]] | None = None
        self.auth_put_status = 200
        self.profiles_for_admin: list[dict[str, Any]] = []

    # -- helpers ---------------------------------------------------------
    def calls(self, method: str, path: str) -> list[httpx.Request]:
        return [
            request
            for request in self.requests
            if request.method == method and request.url.path == path
        ]

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        method = request.method

        if path in ("/rest/v1/welfare_homes", "/rest/v1/pharmacies") and method == "GET":
            rows = (
                [{"id": HOME_ID if "welfare" in path else PHARMACY_ID, "is_active": self.tenant_active}]
                if self.tenant_active is not None
                else []
            )
            return httpx.Response(200, json=rows)

        if path == "/auth/v1/admin/users" and method == "POST":
            if self.create_response is not None:
                status, body = self.create_response
                return httpx.Response(status, json=body)
            return httpx.Response(
                200,
                json={
                    "id": NEW_USER_ID,
                    "email": json.loads(request.content)["email"],
                },
            )

        if path == "/auth/v1/invite" and method == "POST":
            if self.invite_response is not None:
                status, body = self.invite_response
                return httpx.Response(status, json=body)
            return httpx.Response(
                200,
                json={"id": NEW_USER_ID, "email": json.loads(request.content)["email"]},
            )

        if path.startswith("/auth/v1/admin/users/") and method == "PUT":
            return httpx.Response(self.auth_put_status, json={"id": path.rsplit("/", 1)[-1]})

        if path.startswith("/auth/v1/admin/users/") and method == "DELETE":
            return httpx.Response(200, json={})

        if path == "/rest/v1/profiles" and method == "GET":
            tenant_filter = request.url.params.get("welfare_home_id") or ""
            if request.url.params.get("role") == "eq.system_admin":
                return httpx.Response(200, json=self.profiles_for_admin)
            del tenant_filter
            return httpx.Response(200, json=[self.profile] if self.profile else [])

        if path == "/rest/v1/profiles" and method == "PATCH":
            if self.profile_patch_response is not None:
                return httpx.Response(200, json=self.profile_patch_response)
            patch = json.loads(request.content)
            row = {**(self.profile or {}), **patch}
            return httpx.Response(200, json=[row])

        return httpx.Response(404, json={"msg": f"unmocked {method} {path}"})


def make_app(stub: StubSupabase, actor: CurrentUser | None) -> Any:
    app = create_app(settings())

    def admin_client() -> SupabaseAdminService:
        return SupabaseAdminService(settings(), transport=httpx.MockTransport(stub.handler))

    app.dependency_overrides[get_admin_client] = admin_client
    if actor is not None:
        app.dependency_overrides[get_current_user] = lambda: actor
    return app


def system_admin() -> CurrentUser:
    return CurrentUser(
        id=ACTOR_ID,
        email="owner@platform.test",
        full_name="Platform Owner",
        role=UserRole.SYSTEM_ADMIN,
        is_active=True,
    )


async def request(
    app: Any,
    method: str,
    url: str,
    *,
    json_body: dict[str, Any] | None = None,
) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, url, json=json_body)


def provision_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "email": "new.admin@example.org",
        "full_name": "New Admin",
        "phone": "+27 82 000 0000",
        "role": "welfare_admin",
        "welfare_home_id": HOME_ID,
        "pharmacy_id": None,
        "password": "correct-horse-battery",
    }
    payload.update(overrides)
    return payload


def test_unauthenticated() -> None:
    stub = StubSupabase()
    app = make_app(stub, actor=None)
    response = asyncio.run(
        request(app, "POST", "/api/v1/admin/users", json_body=provision_payload())
    )
    assert response.status_code == 401, response.text
    assert not stub.requests


def test_role_isolation() -> None:
    stub = StubSupabase()
    welfare = CurrentUser(
        id=str(uuid4()),
        email="welfare@example.org",
        full_name="Welfare",
        role=UserRole.WELFARE_ADMIN,
        welfare_home_id=HOME_ID,
        is_active=True,
    )
    app = make_app(stub, actor=welfare)
    response = asyncio.run(
        request(app, "POST", "/api/v1/admin/users", json_body=provision_payload())
    )
    assert response.status_code == 403, response.text
    assert not stub.requests


def test_validation_rejects_tenancy_mismatch() -> None:
    stub = StubSupabase()
    app = make_app(stub, actor=system_admin())
    response = asyncio.run(
        request(
            app,
            "POST",
            "/api/v1/admin/users",
            json_body=provision_payload(welfare_home_id=None, pharmacy_id=PHARMACY_ID),
        )
    )
    assert response.status_code == 422, response.text
    assert not stub.requests


def test_validation_rejects_system_admin_role() -> None:
    stub = StubSupabase()
    app = make_app(stub, actor=system_admin())
    response = asyncio.run(
        request(
            app,
            "POST",
            "/api/v1/admin/users",
            json_body=provision_payload(role="system_admin"),
        )
    )
    assert response.status_code == 422, response.text
    assert not stub.requests


def test_missing_tenant() -> None:
    stub = StubSupabase()
    stub.tenant_active = None
    app = make_app(stub, actor=system_admin())
    response = asyncio.run(
        request(app, "POST", "/api/v1/admin/users", json_body=provision_payload())
    )
    assert response.status_code == 404, response.text
    assert not stub.calls("POST", "/auth/v1/admin/users")


def test_password_provisioning() -> None:
    stub = StubSupabase()
    stub.profile = profile_row(
        NEW_USER_ID,
        email="new.admin@example.org",
        phone="+27 82 000 0000",
    )
    app = make_app(stub, actor=system_admin())
    response = asyncio.run(
        request(app, "POST", "/api/v1/admin/users", json_body=provision_payload())
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["id"] == NEW_USER_ID
    assert body["role"] == "welfare_admin"
    assert body["mode"] == "password"

    create = stub.calls("POST", "/auth/v1/admin/users")[0]
    sent = json.loads(create.content)
    assert sent["email"] == "new.admin@example.org"
    assert sent["email_confirm"] is True
    assert sent["password"] == "correct-horse-battery"
    assert sent["user_metadata"] == {
        "role": "welfare_admin",
        "full_name": "New Admin",
        "welfare_home_id": HOME_ID,
    }

    patch = stub.calls("PATCH", "/rest/v1/profiles")[0]
    assert json.loads(patch.content) == {"phone": "+27 82 000 0000"}
    assert patch.headers["prefer"] == "return=representation"


def test_invite_provisioning_for_pharmacy() -> None:
    stub = StubSupabase()
    stub.profile = profile_row(
        NEW_USER_ID,
        email="pharmacy.admin@example.org",
        role="pharmacy_admin",
        welfare_home_id=None,
        pharmacy_id=PHARMACY_ID,
        full_name="Pharmacy Admin",
    )
    app = make_app(stub, actor=system_admin())
    payload = provision_payload(
        email="pharmacy.admin@example.org",
        full_name="Pharmacy Admin",
        phone=None,
        role="pharmacy_admin",
        welfare_home_id=None,
        pharmacy_id=PHARMACY_ID,
        password=None,
    )
    response = asyncio.run(
        request(app, "POST", "/api/v1/admin/users", json_body=payload)
    )
    assert response.status_code == 201, response.text
    assert response.json()["mode"] == "invite"

    invite = stub.calls("POST", "/auth/v1/invite")[0]
    sent = json.loads(invite.content)
    assert sent["data"] == {
        "role": "pharmacy_admin",
        "full_name": "Pharmacy Admin",
        "pharmacy_id": PHARMACY_ID,
    }
    assert sent["redirect_to"] == "http://localhost:3000/invite"
    assert not stub.calls("POST", "/auth/v1/admin/users")


def test_duplicate_email() -> None:
    stub = StubSupabase()
    stub.create_response = (422, {"msg": "User already registered"})
    app = make_app(stub, actor=system_admin())
    response = asyncio.run(
        request(app, "POST", "/api/v1/admin/users", json_body=provision_payload())
    )
    assert response.status_code == 409, response.text
    assert "already exists" in response.json()["detail"]


def test_failed_profile_rolls_back_auth_user() -> None:
    stub = StubSupabase()
    stub.profile_patch_response = []
    app = make_app(stub, actor=system_admin())
    response = asyncio.run(
        request(app, "POST", "/api/v1/admin/users", json_body=provision_payload())
    )
    assert response.status_code == 502, response.text
    assert stub.calls("DELETE", f"/auth/v1/admin/users/{NEW_USER_ID}")


def test_deactivate_ban() -> None:
    target = str(uuid4())
    stub = StubSupabase()
    stub.profile = profile_row(
        target, email="tenant@example.org", is_active=True
    )
    app = make_app(stub, actor=system_admin())
    response = asyncio.run(
        request(
            app,
            "PATCH",
            f"/api/v1/admin/users/{target}/status",
            json_body={"is_active": False},
        )
    )
    assert response.status_code == 200, response.text
    assert response.json()["is_active"] is False

    put = stub.calls("PUT", f"/auth/v1/admin/users/{target}")[0]
    assert json.loads(put.content) == {"ban_duration": "876000h"}
    patch = stub.calls("PATCH", "/rest/v1/profiles")[0]
    assert json.loads(patch.content) == {"is_active": False}


def test_self_deactivation_refused() -> None:
    stub = StubSupabase()
    stub.profile = profile_row(
        ACTOR_ID,
        email="owner@platform.test",
        role="system_admin",
        welfare_home_id=None,
    )
    app = make_app(stub, actor=system_admin())
    response = asyncio.run(
        request(
            app,
            "PATCH",
            f"/api/v1/admin/users/{ACTOR_ID}/status",
            json_body={"is_active": False},
        )
    )
    assert response.status_code == 409, response.text
    assert not stub.calls("PUT", f"/auth/v1/admin/users/{ACTOR_ID}")


def test_last_system_admin_refused() -> None:
    target = str(uuid4())
    stub = StubSupabase()
    stub.profile = profile_row(
        target,
        email="other@platform.test",
        role="system_admin",
        welfare_home_id=None,
    )
    stub.profiles_for_admin = [{"id": target}]
    app = make_app(stub, actor=system_admin())
    response = asyncio.run(
        request(
            app,
            "PATCH",
            f"/api/v1/admin/users/{target}/status",
            json_body={"is_active": False},
        )
    )
    assert response.status_code == 409, response.text
    assert not stub.calls("PUT", f"/auth/v1/admin/users/{target}")


def test_unknown_profile() -> None:
    stub = StubSupabase()
    stub.profile = None
    app = make_app(stub, actor=system_admin())
    response = asyncio.run(
        request(
            app,
            "PATCH",
            f"/api/v1/admin/users/{uuid4()}/status",
            json_body={"is_active": False},
        )
    )
    assert response.status_code == 404, response.text


def main() -> None:
    tests = [
        test_unauthenticated,
        test_role_isolation,
        test_validation_rejects_tenancy_mismatch,
        test_validation_rejects_system_admin_role,
        test_missing_tenant,
        test_password_provisioning,
        test_invite_provisioning_for_pharmacy,
        test_duplicate_email,
        test_failed_profile_rolls_back_auth_user,
        test_deactivate_ban,
        test_self_deactivation_refused,
        test_last_system_admin_refused,
        test_unknown_profile,
    ]
    for test in tests:
        test()
        print(f"  ok  {test.__name__}")
    print(f"\n{len(tests)} admin smoke tests passed")


if __name__ == "__main__":
    main()
