"""
SSO Consumer

Server-side glue that lives on a *destination* site to redeem an SSO
nonce minted by the central Tenant Hub.

Flow on this side:
    1. Frontend hits POST .../auth/consume_sso_nonce {nonce}
    2. We read tenant_hub_url + hub_shared_secret from Common Configurations Settings.
    3. We sign HMAC(secret, "{nonce}|{timestamp}") and POST it to the hub.
    4. Hub returns the hub user's identity payload.
    5. We upsert a local User Contact (document is the natural key).
    6. We mint a fresh local auth token and return it to the frontend.
"""

import hashlib
import hmac
import time
from typing import Any, Dict

import frappe
import requests
from frappe import _

from ..shared.security import create_user_contact_token

VERIFY_PATH = "/api/method/common_configurations.api.hub.verify_sso_nonce"
HTTP_TIMEOUT_SECONDS = 10


def _load_hub_config() -> Dict[str, str]:
    settings = frappe.get_cached_doc("Common Configurations Settings")
    hub_url = (settings.get("tenant_hub_url") or "").rstrip("/")
    if not hub_url:
        frappe.throw(
            _("This site is not configured as an SSO destination (missing Tenant Hub URL)."),
            frappe.AuthenticationError,
        )
    secret = settings.get_password("hub_shared_secret", raise_exception=False)
    if not secret:
        frappe.throw(
            _("This site is not configured as an SSO destination (missing Hub Shared Secret)."),
            frappe.AuthenticationError,
        )
    return {"hub_url": hub_url, "secret": secret}


def _sign(nonce: str, ts: int, secret: str) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        f"{nonce}|{ts}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _verify_with_hub(hub_url: str, nonce: str, ts: int, mac: str) -> Dict[str, Any]:
    try:
        resp = requests.post(
            f"{hub_url}{VERIFY_PATH}",
            json={"nonce": nonce, "timestamp": ts, "hmac": mac},
            timeout=HTTP_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        frappe.log_error(message=str(exc), title="SSO: hub request failed")
        frappe.throw(_("Could not reach the Tenant Hub. Try again."), frappe.AuthenticationError)

    if resp.status_code != 200:
        # Hub already returns a generic error message; surface it as auth failure.
        frappe.log_error(
            message=f"hub status={resp.status_code} body={resp.text[:500]}",
            title="SSO: hub rejected verification",
        )
        frappe.throw(_("SSO verification failed."), frappe.AuthenticationError)

    try:
        body = resp.json()
    except ValueError:
        frappe.throw(_("Invalid response from the hub."), frappe.AuthenticationError)

    payload = body.get("message") or {}
    if not payload.get("user_contact"):
        frappe.throw(_("SSO verification failed."), frappe.AuthenticationError)
    return payload


def _upsert_user_contact(identity: Dict[str, Any]) -> Dict[str, Any]:
    """
    Match by document number (single natural key). Hub fields overwrite
    local fields — the hub is the source of truth for identity.
    """
    document = (identity.get("document") or "").strip()
    if not document:
        frappe.throw(_("SSO payload missing document."), frappe.AuthenticationError)

    existing_name = frappe.db.get_value("User contact", {"document": document}, "name")
    payload = {
        "full_name": identity.get("full_name"),
        "document_type": identity.get("document_type"),
        "document": document,
        "phone_number": identity.get("phone_number"),
        "email": identity.get("email"),
        "gender": identity.get("gender"),
    }
    if existing_name:
        doc = frappe.get_doc("User contact", existing_name)
        for k, v in payload.items():
            if v is not None:
                doc.set(k, v)
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.get_doc({"doctype": "User contact", **payload})
        doc.insert(ignore_permissions=True)

    return doc.as_dict()


def consume_nonce(nonce: str) -> Dict[str, Any]:
    """Public entry point invoked by the destination's frontend."""
    if not nonce or not isinstance(nonce, str):
        frappe.throw(_("SSO nonce is required"), frappe.AuthenticationError)

    cfg = _load_hub_config()
    ts = int(time.time())
    mac = _sign(nonce, ts, cfg["secret"])

    payload = _verify_with_hub(cfg["hub_url"], nonce, ts, mac)
    identity = payload["user_contact"]

    contact = _upsert_user_contact(identity)
    auth_token = create_user_contact_token(contact["name"])
    frappe.db.commit()

    # Mirror the shape used by other auth endpoints in this app
    return {
        "auth_token": auth_token,
        "user_contact": {
            "name": contact["name"],
            "full_name": contact.get("full_name"),
            "document": contact.get("document"),
            "document_type": contact.get("document_type"),
            "phone_number": contact.get("phone_number"),
            "email": contact.get("email"),
            "gender": contact.get("gender"),
        },
    }
