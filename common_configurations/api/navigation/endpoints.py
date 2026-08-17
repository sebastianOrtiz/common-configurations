"""
Navigation API Endpoints

Voice/intent navigation for the Service Portal: lets a citizen find a
procedure ("trámite") without knowing which secretaría/tool it lives
under. HTTP concerns only (auth, rate limiting, honeypot, validation) —
all matching logic lives in `service.py`.
"""

from typing import Any, Dict, Optional

import frappe
from frappe import _

from ..shared import (
    check_honeypot,
    check_rate_limit,
    get_current_user_contact,
)
from ..shared.validators import sanitize_string
from .service import NavigationService


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_navigation_catalog(portal_name: str) -> list:
    """
    Flat list of navigable destinations (procedures) for a Service Portal,
    across every one of its `procedures` tools — used by the voice
    navigation resolver and, optionally, to warm a client-side index.

    Requires a valid X-User-Contact-Token.
    Rate limited: 30 requests per minute per IP.

    Args:
        portal_name: The portal_name identifier of a Service Portal.

    Returns:
        list[dict]: [{id, title, description, keywords, secretaria,
            tool_name, procedure_name, type, external_url?}, ...]
    """
    check_rate_limit("get_navigation_catalog", limit=30, seconds=60)

    user_contact = get_current_user_contact()
    if not user_contact:
        frappe.throw(_("Authentication required"), frappe.AuthenticationError)

    portal_name = sanitize_string(portal_name, 140)
    if not portal_name:
        frappe.throw(_("Portal name is required"))

    try:
        return NavigationService.get_catalog(portal_name)
    except frappe.DoesNotExistError:
        raise
    except Exception as e:
        frappe.log_error(f"Error building navigation catalog for {portal_name}: {str(e)}")
        frappe.throw(_("Error loading navigation catalog"))


@frappe.whitelist(allow_guest=True, methods=["POST"])
def resolve_navigation(
    query: str,
    portal_name: str,
    honeypot: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Resolve a spoken/typed query to navigable Logbook Procedure(s).

    Hybrid resolution: a dependency-free fuzzy match always runs first
    (works fully offline); a configured AI model is only consulted as a
    fallback when the fuzzy match isn't confident, and any AI failure
    silently falls back to the fuzzy result.

    Requires a valid X-User-Contact-Token.
    Rate limited: 20 requests per minute per IP.

    Args:
        query: The citizen's spoken/typed request (transcript).
        portal_name: The portal_name identifier of a Service Portal.
        honeypot: Anti-bot field (must be empty).

    Returns:
        dict: {
            "mode": "navigate" | "choose" | "none",
            "results": [{id, title, secretaria, tool_name, procedure_name,
                         type, external_url, score}, ...],
            "clarifying_question": str | None,
            "transcript": str,
            "used_ai": bool,
        }
    """
    check_rate_limit("resolve_navigation", limit=20, seconds=60)
    check_honeypot(honeypot)

    user_contact = get_current_user_contact()
    if not user_contact:
        frappe.throw(_("Authentication required"), frappe.AuthenticationError)

    query = sanitize_string(query, 500)
    if not query:
        frappe.throw(_("Query is required"))

    portal_name = sanitize_string(portal_name, 140)
    if not portal_name:
        frappe.throw(_("Portal name is required"))

    try:
        return NavigationService.resolve(query, portal_name)
    except frappe.DoesNotExistError:
        raise
    except Exception as e:
        frappe.log_error(f"Error resolving navigation query for {portal_name}: {str(e)}")
        frappe.throw(_("Error resolving navigation query"))
