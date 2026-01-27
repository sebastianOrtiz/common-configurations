"""
Portal API Endpoints

HTTP endpoints for Service Portal configuration retrieval.
"""

import frappe
from frappe import _

from ..shared.rate_limit import check_rate_limit
from ..shared.validators import sanitize_string
from .service import PortalService


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_portals():
    """
    Get list of active Service Portals.

    Rate limited: 30 requests per minute per IP.

    Returns:
        list: List of active portals with basic info
    """
    check_rate_limit("get_portals", limit=30, seconds=60)

    try:
        return PortalService.get_all_active()

    except Exception as e:
        frappe.log_error(f"Error getting portals: {str(e)}")
        frappe.throw(_("Error loading portals"))


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_portal(portal_name: str):
    """
    Get a specific Service Portal with its tools.

    Rate limited: 30 requests per minute per IP.

    Args:
        portal_name: The portal_name identifier

    Returns:
        dict: Portal configuration with tools

    Raises:
        frappe.DoesNotExistError: If portal not found or inactive
    """
    check_rate_limit("get_portal", limit=30, seconds=60)

    if not portal_name:
        frappe.throw(_("Portal name is required"))

    portal_name = sanitize_string(portal_name, 140)

    try:
        result = PortalService.get_by_name(portal_name)

        if not result:
            frappe.throw(_("Portal not found"), frappe.DoesNotExistError)

        return result

    except frappe.DoesNotExistError:
        raise
    except Exception as e:
        frappe.log_error(f"Error getting portal {portal_name}: {str(e)}")
        frappe.throw(_("Error loading portal"))
