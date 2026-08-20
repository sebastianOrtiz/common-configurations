"""
Navigation API Endpoints

Voice/intent navigation for the Service Portal: lets a citizen find a
procedure ("trámite") without knowing which secretaría/tool it lives
under. HTTP concerns only (auth, rate limiting, honeypot, validation) —
all matching logic lives in `service.py`.
"""

import json
from typing import Any, Dict, Optional

import frappe
from frappe import _
from frappe.utils import now_datetime

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


@frappe.whitelist(allow_guest=True, methods=["POST"])
def interpret_command(
    transcript: str,
    portal_name: str,
    actions: str,
    honeypot: Optional[str] = None,
) -> Dict[str, Any]:
    """
    AI fallback of the assistant's hybrid voice-command router: map a spoken
    command to ONE of the actions the client currently offers.

    The client tries fast local rule-matching first and only calls this when
    that isn't confident. Any AI failure returns a low-confidence null action
    so the client degrades gracefully.

    Requires a valid X-User-Contact-Token.
    Rate limited: 30 requests per minute per IP.

    Args:
        transcript: The citizen's spoken command.
        portal_name: The portal_name identifier of a Service Portal.
        actions: JSON-encoded list of available actions, each shaped
            `{"id": str, "description": str, "sample_phrases": [str, ...]}`.
        honeypot: Anti-bot field (must be empty).

    Returns:
        dict: {action_id, args, confidence, spoken_reply}
    """
    check_rate_limit("interpret_command", limit=30, seconds=60)
    check_honeypot(honeypot)

    user_contact = get_current_user_contact()
    if not user_contact:
        frappe.throw(_("Authentication required"), frappe.AuthenticationError)

    transcript = sanitize_string(transcript, 500)
    if not transcript:
        frappe.throw(_("Command is required"))

    portal_name = sanitize_string(portal_name, 140)
    if not portal_name:
        frappe.throw(_("Portal name is required"))

    try:
        parsed_actions = json.loads(actions) if actions else []
    except (ValueError, TypeError):
        parsed_actions = []
    if not isinstance(parsed_actions, list):
        parsed_actions = []

    try:
        return NavigationService.interpret_command(transcript, parsed_actions)
    except Exception as e:
        frappe.log_error(f"Error interpreting command for {portal_name}: {str(e)}")
        # Never hard-fail the assistant — degrade to "no match".
        return {"action_id": None, "args": {}, "confidence": "low", "spoken_reply": None}


@frappe.whitelist(methods=["POST"])
def build_navigation_catalog(portal_name: str, use_ai: int = 1, force: int = 0) -> Dict[str, Any]:
    """
    Build (or rebuild) the FULL navigation catalog of a Service Portal —
    every enabled tool, plus every sub-item its registered
    `portal_navigation_providers` contribute — optionally enrich it with
    AI-generated keywords/synonyms, and persist it into a `Portal
    Navigation Catalog` cache record that `resolve_navigation` then reads.

    Admin-only (System Manager). Called from the "Generar catálogo de
    navegación" button on the Service Portal form.

    Args:
        portal_name: The portal_name identifier of a Service Portal.
        use_ai: Truthy to enrich the catalog with AI-generated keywords
            (requires `enable_voice_assistant_ai` + a configured AI model
            in Common Configurations Settings — silently skipped otherwise).
        force: Truthy to ignore the per-element fingerprint cache and
            re-generate keywords for every item, overwriting the stored
            `Portal Navigation Keyword` records (otherwise only new or
            changed elements are enriched, reusing the rest).

    Returns:
        dict: {portal, item_count, tool_count, built_with_ai, enriched}
    """
    frappe.only_for("System Manager")

    portal_name = sanitize_string(portal_name, 140)
    if not portal_name:
        frappe.throw(_("Portal name is required"))

    if not frappe.db.exists("Service Portal", portal_name):
        frappe.throw(_("Service Portal not found"), frappe.DoesNotExistError)

    # Enrichment makes several AI calls and can take minutes; run it in a
    # background worker so the HTTP request returns immediately and never
    # times out. The 'default' queue is the one always served by the worker;
    # progress is written to cache and polled by the client (realtime is
    # published too, as a bonus, but the client relies on polling).
    frappe.cache().set_value(
        _status_key(portal_name),
        {"status": "queued", "current": 0, "total": 0},
        expires_in_sec=3600,
    )
    frappe.enqueue(
        "common_configurations.api.navigation.endpoints._build_and_persist_catalog",
        queue="default",
        timeout=1800,
        portal_name=portal_name,
        use_ai=int(use_ai or 0),
        force=int(force or 0),
        user=frappe.session.user,
    )
    return {"queued": True, "portal": portal_name}


def _status_key(portal_name: str) -> str:
    return f"nav_build_status:{portal_name}"


@frappe.whitelist()
def navigation_build_status(portal_name: str) -> Dict[str, Any]:
    """
    Poll the status of an in-flight (or just-finished) catalog build.
    Admin-only. Returns {"status": "queued"|"running"|"done"|"error"|"idle",
    ...} from the cache written by the background worker.
    """
    frappe.only_for("System Manager")
    portal_name = sanitize_string(portal_name, 140)
    status = frappe.cache().get_value(_status_key(portal_name))
    if not isinstance(status, dict):
        return {"status": "idle", "portal": portal_name}
    out = dict(status)
    out["portal"] = portal_name
    return out


def _build_and_persist_catalog(
    portal_name: str, use_ai: int, user: str, force: int = 0
) -> None:
    """
    Background worker: build + (optionally) AI-enrich + persist the Portal
    Navigation Catalog. Writes progress/done/error to cache (polled by the
    client) and also publishes realtime events. Never raises to the queue.
    """

    def _report(payload: Dict[str, Any], event: Optional[str] = None) -> None:
        payload = dict(payload)
        payload["portal"] = portal_name
        frappe.cache().set_value(_status_key(portal_name), payload, expires_in_sec=3600)
        if event:
            try:
                frappe.publish_realtime(event, payload, user=user)
            except Exception:
                pass

    try:
        _report({"status": "running", "current": 0, "total": 0})
        built = NavigationService.build_catalog(portal_name)
        items = built["items"]
        used_ai = False

        if int(use_ai or 0):
            def _progress(current: int, total: int) -> None:
                _report(
                    {"status": "running", "current": current, "total": total},
                    event="navigation_catalog_progress",
                )

            items, used_ai = NavigationService.enrich_catalog_with_ai(
                items, progress=_progress, force=bool(force)
            )

        existing_name = frappe.db.exists("Portal Navigation Catalog", {"portal": portal_name})
        if existing_name:
            catalog_doc = frappe.get_doc("Portal Navigation Catalog", existing_name)
        else:
            catalog_doc = frappe.new_doc("Portal Navigation Catalog")
            catalog_doc.portal = portal_name

        catalog_doc.catalog_json = json.dumps(items, ensure_ascii=False)
        catalog_doc.item_count = len(items)
        catalog_doc.tool_count = built["tool_count"]
        catalog_doc.built_with_ai = 1 if used_ai else 0
        catalog_doc.last_built = now_datetime()
        catalog_doc.save(ignore_permissions=True)
        frappe.db.commit()

        _report(
            {
                "status": "done",
                "item_count": catalog_doc.item_count,
                "tool_count": catalog_doc.tool_count,
                "built_with_ai": bool(catalog_doc.built_with_ai),
                "enriched": bool(used_ai),
            },
            event="navigation_catalog_done",
        )
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(
            title="Navigation catalog build failed",
            message=frappe.get_traceback(),
        )
        _report({"status": "error", "message": str(e)}, event="navigation_catalog_error")
