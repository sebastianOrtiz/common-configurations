"""
Hub Endpoints

HTTP endpoints for the central Tenant Hub.

Public read-only directory:
    - get_groups
    - get_group_with_portals

SSO (Single Sign-On between the hub and destination CRMs):
    - generate_sso_nonce  (auth required, hub session)
    - verify_sso_nonce    (cross-site call from destination, HMAC-authenticated)
"""

from typing import Any, Dict, List

import frappe
from frappe import _

from ..shared import check_rate_limit, require_user_contact
from . import sso
from .service import HubService


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_groups() -> List[Dict[str, Any]]:
    """Return all active Tenant Portal Groups."""
    check_rate_limit("hub_get_groups", limit=60, seconds=60)
    return HubService.list_groups()


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_group_with_portals(slug: str) -> Dict[str, Any]:
    """
    Return one active group and its active portals (with composed URLs).

    Args:
        slug: The group slug (URL fragment).

    Raises:
        frappe.DoesNotExistError: If no active group matches `slug`.
    """
    check_rate_limit("hub_get_group_with_portals", limit=60, seconds=60)

    if not slug or not isinstance(slug, str):
        frappe.throw(_("Group slug is required"))

    group = HubService.get_group_with_portals(slug.strip())
    if not group:
        frappe.throw(_("Group not found"), frappe.DoesNotExistError)

    return group


@frappe.whitelist(allow_guest=True, methods=["POST"])
@require_user_contact()
def generate_sso_nonce(tenant_portal: str) -> Dict[str, Any]:
    """
    Mint a single-use SSO nonce for the authenticated hub user → portal.

    Caller must be authenticated as a hub User Contact
    (X-User-Contact-Token header). The response includes the composed
    target URL so the frontend can redirect with `?identity_nonce=...`.
    """
    check_rate_limit("hub_generate_sso_nonce", limit=30, seconds=60)
    if not tenant_portal or not isinstance(tenant_portal, str):
        frappe.throw(_("Tenant Portal is required"))
    user_contact = frappe.local.user_contact
    return sso.generate_nonce(user_contact, tenant_portal.strip())


@frappe.whitelist(allow_guest=True, methods=["POST"])
def verify_sso_nonce(nonce: str, timestamp: int, hmac: str) -> Dict[str, Any]:
    """
    Cross-site endpoint called by destination CRMs to redeem a nonce.

    The destination signs `"{nonce}|{timestamp}"` with the shared secret
    issued to its Destination CRM record. This endpoint validates the
    signature, BURNS the nonce and returns the hub user's identity payload
    so the destination can upsert a local User Contact and grant a session.
    """
    check_rate_limit("hub_verify_sso_nonce", limit=60, seconds=60)
    return sso.verify_nonce(nonce, timestamp, hmac)
