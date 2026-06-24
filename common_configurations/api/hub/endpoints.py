"""
Hub Endpoints

Public read-only HTTP endpoints for the central Tenant Hub. No auth
required — the directory and its portal listing are intentionally
public; per-portal auth is delegated to the destination site.
"""

from typing import Any, Dict, List

import frappe
from frappe import _

from ..shared import check_rate_limit
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
