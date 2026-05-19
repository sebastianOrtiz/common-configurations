"""
Portal Service

Business logic for Service Portal operations.
"""

import frappe
from frappe import _
from typing import Dict, Any, Optional, List


class PortalService:
    """
    Service class for Service Portal operations.

    All methods are classmethods for stateless operation.
    """

    @classmethod
    def get_all_active(cls) -> List[Dict[str, Any]]:
        """
        Get all active Service Portals.

        Returns:
            list: List of active portals with basic info
        """
        return frappe.get_all(
            "Service Portal",
            filters={"is_active": 1, "is_internal": 0},
            fields=[
                "name",
                "portal_name",
                "title",
                "description",
                "logo",
                "primary_color",
                "require_auth",
            ],
        )

    @classmethod
    def get_by_name(cls, portal_name: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific Service Portal with its tools.

        Args:
            portal_name: The portal_name identifier

        Returns:
            dict or None: Portal configuration with tools, or None if not found
        """
        # Check if portal exists and is active
        if not frappe.db.exists(
            "Service Portal", {"portal_name": portal_name, "is_active": 1}
        ):
            return None

        # Get portal document
        portal = frappe.get_doc("Service Portal", portal_name)

        # Build response
        result = {
            "name": portal.name,
            "portal_name": portal.portal_name,
            "title": portal.title,
            "description": portal.description,
            "is_active": portal.is_active,
            "registration_title": portal.registration_title,
            "registration_description": portal.registration_description,
            "primary_color": portal.primary_color,
            "secondary_color": portal.secondary_color,
            "logo": portal.logo,
            "background_image": portal.background_image,
            "custom_css": portal.custom_css,
            "require_auth": portal.require_auth,
            "enable_mfa_otp": portal.enable_mfa_otp,
            "announcement_rotation_seconds": getattr(
                portal, "announcement_rotation_seconds", 0
            ) or 0,
            "announcements_left": cls._get_announcement_set_data(
                getattr(portal, "announcement_set_left", None)
            ),
            "announcements_bottom": cls._get_announcement_set_data(
                getattr(portal, "announcement_set_bottom", None)
            ),
            "announcements_right": cls._get_announcement_set_data(
                getattr(portal, "announcement_set_right", None)
            ),
            "tools": [],
        }

        # Add tools
        for tool in portal.tools:
            # Skip portal_redirect tools whose target portal is inactive or not set
            if tool.tool_type == "portal_redirect":
                target = getattr(tool, "target_portal", None)
                if not target:
                    continue
                if not frappe.db.get_value("Service Portal", target, "is_active"):
                    continue

            tool_data = {
                "name": tool.name,
                "tool_type": tool.tool_type,
                "label": tool.label,
                "tool_description": tool.tool_description,
                "icon": tool.icon,
                "tool_image": tool.tool_image,
                "button_color": tool.button_color,
                "display_order": tool.display_order,
                "is_enabled": tool.is_enabled,
                "calendar_resource": getattr(tool, "calendar_resource", None),
                "show_calendar_view": getattr(tool, "show_calendar_view", None),
                "slot_duration_minutes": getattr(
                    tool, "slot_duration_minutes", None
                ),
                "target_portal": getattr(tool, "target_portal", None),
                "quick_links": getattr(tool, "quick_links", None),
                "quick_link_external": getattr(tool, "quick_link_external", None),
                "logbook_availability": getattr(tool, "logbook_availability", None),
                "logbook_procedures_config": getattr(tool, "logbook_procedures_config", None),
                "pqr_type_set": getattr(tool, "pqr_type_set", None),
                "pqr_allow_anonymous": getattr(tool, "pqr_allow_anonymous", None),
            }

            # Inline quick links data so the frontend doesn't need a second API call
            if tool.tool_type == "portal_quick_links" and tool_data["quick_links"]:
                tool_data["quick_links_data"] = cls._get_quick_links_data(
                    tool_data["quick_links"]
                )

            # Inline external link data for direct redirect tools
            if tool.tool_type == "quick_link" and tool_data["quick_link_external"]:
                tool_data["quick_link_external_data"] = cls._get_external_link_data(
                    tool_data["quick_link_external"]
                )

            result["tools"].append(tool_data)

        return result

    @classmethod
    def _get_quick_links_data(cls, quick_links_name: str) -> Optional[Dict[str, Any]]:
        """Get Portal Quick Links with its items, resolving each linked External Link."""
        if not frappe.db.exists(
            "Portal Quick Links", {"name": quick_links_name, "is_active": 1}
        ):
            return None

        doc = frappe.get_doc("Portal Quick Links", quick_links_name)
        links = []
        for item in doc.links:
            if not item.is_enabled or not item.external_link:
                continue
            link_data = cls._get_external_link_data(item.external_link)
            if not link_data:
                continue
            links.append({
                **link_data,
                "display_order": item.display_order,
                "is_enabled": item.is_enabled,
            })

        # Sort by display_order (lowest first)
        links.sort(key=lambda x: x.get("display_order", 0))

        return {
            "name": doc.name,
            "link_group_name": doc.link_group_name,
            "description": doc.description,
            "icon": doc.icon,
            "image": doc.image,
            "links": links,
        }

    @classmethod
    def _get_external_link_data(cls, link_name: str) -> Optional[Dict[str, Any]]:
        """Get a single External Link as a dict (only if active)."""
        row = frappe.db.get_value(
            "External Link",
            {"name": link_name, "is_active": 1},
            ["name", "title", "label", "url", "target", "icon", "image", "color", "description"],
            as_dict=True,
        )
        if not row:
            return None
        return {
            "name": row.name,
            "title": row.title,
            "label": row.label,
            "url": row.url,
            "target": row.target or "_blank",
            "icon": row.icon,
            "image": row.image,
            "color": row.color,
            "description": row.description,
        }

    @classmethod
    def _get_announcement_set_data(
        cls, set_name: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        """
        Resolve an Announcement Set into its active + in-date announcements.

        Visibility rule per announcement:
            Announcement.is_active
            AND Set Item.is_enabled
            AND Set.is_active
            AND (today within valid_from/valid_to if defined)
        """
        if not set_name:
            return None

        set_doc = frappe.db.get_value(
            "Announcement Set",
            {"name": set_name, "is_active": 1},
            ["name", "title"],
            as_dict=True,
        )
        if not set_doc:
            return None

        items = frappe.get_all(
            "Announcement Set Item",
            filters={"parent": set_name, "is_enabled": 1},
            fields=["announcement", "display_order"],
        )
        if not items:
            return None

        today = frappe.utils.nowdate()
        announcements = []

        for item in sorted(items, key=lambda x: x.display_order or 0):
            if not item.announcement:
                continue

            a = frappe.db.get_value(
                "Announcement",
                {"name": item.announcement, "is_active": 1},
                [
                    "name", "title", "content_type", "announcement_type",
                    "image", "heading", "body", "html_content",
                    "cta_url", "cta_target", "valid_from", "valid_to",
                ],
                as_dict=True,
            )
            if not a:
                continue

            # Date-range filter
            if a.valid_from and str(a.valid_from) > today:
                continue
            if a.valid_to and str(a.valid_to) < today:
                continue

            announcements.append({
                "name": a.name,
                "content_type": a.content_type,
                "announcement_type": a.announcement_type or "info",
                "image": a.image,
                "heading": a.heading,
                "body": a.body,
                "html_content": a.html_content,
                "cta_url": a.cta_url,
                "cta_target": a.cta_target or "_blank",
            })

        if not announcements:
            return None

        return {
            "name": set_doc.name,
            "title": set_doc.title,
            "announcements": announcements,
        }
