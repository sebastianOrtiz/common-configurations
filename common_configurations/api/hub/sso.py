"""
Hub SSO Service

Single Sign-On primitives for the central Tenant Hub.

Flow:
    1. Authenticated hub user clicks a portal that requires_auth.
    2. Hub mints a single-use nonce (60s TTL) bound to (hub_user, tenant_portal).
    3. Hub redirects the browser to the destination site with ?identity_nonce=N.
    4. Destination site computes HMAC(hub_shared_secret, "{nonce}|{timestamp}")
       and calls back POST .../hub/verify_sso_nonce {nonce, timestamp, hmac}.
    5. Hub validates HMAC against the secret of the nonce's destination CRM,
       checks timestamp drift, BURNS the nonce, returns identity payload.
    6. Destination upserts a local User Contact and grants its own session.

Security properties:
    - Single use: cache key is deleted on first successful verification.
    - Short TTL: nonce expires after `NONCE_TTL_SECONDS`.
    - HMAC-SHA256 with per-CRM shared secret.
    - Replay window: timestamp must be within ±`MAX_CLOCK_SKEW_SECONDS`.
"""

import hashlib
import hmac
import secrets
from typing import Any, Dict

import frappe
from frappe import _
from frappe.utils import now_datetime

NONCE_KEY_PREFIX = "hub_sso_nonce:"
NONCE_TTL_SECONDS = 60
MAX_CLOCK_SKEW_SECONDS = 300  # ±5 min between destination and hub clocks


def _cache_key(nonce: str) -> str:
    return f"{NONCE_KEY_PREFIX}{nonce}"


def generate_nonce(user_contact: str, tenant_portal: str) -> Dict[str, Any]:
    """
    Mint a one-time nonce for the given hub user → tenant portal.

    Returns the nonce together with the composed target URL so the
    caller can redirect the browser without an extra lookup.
    """
    portal = frappe.db.get_value(
        "Tenant Portal",
        tenant_portal,
        ["name", "is_active", "destination_crm", "portal_path"],
        as_dict=True,
    )
    if not portal or not portal.get("is_active"):
        frappe.throw(_("Portal not found or inactive"), frappe.DoesNotExistError)

    crm = frappe.db.get_value(
        "Destination CRM",
        portal["destination_crm"],
        ["name", "is_active", "base_url"],
        as_dict=True,
    )
    if not crm or not crm.get("is_active"):
        frappe.throw(_("Destination CRM is inactive"))

    nonce = secrets.token_urlsafe(32)
    payload = {
        "user_contact": user_contact,
        "tenant_portal": portal["name"],
        "destination_crm": crm["name"],
    }
    # Frappe cache wraps Redis SET ... EX TTL when expires_in_sec is provided.
    frappe.cache.set_value(_cache_key(nonce), payload, expires_in_sec=NONCE_TTL_SECONDS)

    base = (crm.get("base_url") or "").rstrip("/")
    path = portal.get("portal_path") or ""
    target_url = f"{base}{path}" if base and path else ""

    return {
        "nonce": nonce,
        "target_url": target_url,
        "destination_crm": crm["name"],
        "expires_in": NONCE_TTL_SECONDS,
    }


def verify_nonce(nonce: str, timestamp: int, mac: str) -> Dict[str, Any]:
    """
    Validate HMAC + freshness + nonce existence, BURN it, return the
    identity payload of the hub user bound to this nonce.

    Raises if anything is off — never reveal *why* to the caller beyond
    a generic message, to avoid oracle attacks.
    """
    if not nonce or not isinstance(nonce, str):
        frappe.throw(_("Invalid SSO request"), frappe.AuthenticationError)
    if not mac or not isinstance(mac, str):
        frappe.throw(_("Invalid SSO request"), frappe.AuthenticationError)

    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        frappe.throw(_("Invalid SSO request"), frappe.AuthenticationError)

    # Clock skew check (epoch seconds)
    now = int(now_datetime().timestamp())
    if abs(now - ts) > MAX_CLOCK_SKEW_SECONDS:
        frappe.throw(_("SSO request expired"), frappe.AuthenticationError)

    payload = frappe.cache.get_value(_cache_key(nonce))
    if not payload:
        frappe.throw(_("Invalid or expired SSO nonce"), frappe.AuthenticationError)

    # Recover the per-CRM secret (encrypted at rest)
    crm_name = payload["destination_crm"]
    crm_doc = frappe.get_doc("Destination CRM", crm_name)
    secret = crm_doc.get_password("hub_shared_secret", raise_exception=False)
    if not secret:
        frappe.throw(_("SSO is not configured for this CRM"), frappe.AuthenticationError)

    # Constant-time HMAC compare
    expected = hmac.new(
        secret.encode("utf-8"),
        f"{nonce}|{ts}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, mac):
        frappe.throw(_("Invalid SSO signature"), frappe.AuthenticationError)

    # BURN the nonce — single-use guarantee
    frappe.cache.delete_value(_cache_key(nonce))

    # Load the hub User Contact and hand identity to the destination
    contact = frappe.db.get_value(
        "User contact",
        payload["user_contact"],
        [
            "name",
            "full_name",
            "document",
            "document_type",
            "email",
            "phone_number",
            "gender",
        ],
        as_dict=True,
    )
    if not contact:
        frappe.throw(_("Hub user not found"), frappe.AuthenticationError)

    return {
        "tenant_portal": payload["tenant_portal"],
        "destination_crm": crm_name,
        "user_contact": {
            "full_name": contact["full_name"],
            "document": contact["document"],
            "document_type": contact["document_type"],
            "email": contact["email"],
            "phone_number": contact["phone_number"],
            "gender": contact["gender"],
        },
    }
