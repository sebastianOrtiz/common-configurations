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
            filters={"is_active": 1},
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
            }

            # Inline quick links data so the frontend doesn't need a second API call
            if tool.tool_type == "portal_quick_links" and tool_data["quick_links"]:
                tool_data["quick_links_data"] = cls._get_quick_links_data(
                    tool_data["quick_links"]
                )

            result["tools"].append(tool_data)

        return result

    @classmethod
    def _get_quick_links_data(cls, quick_links_name: str) -> Optional[Dict[str, Any]]:
        """Get Portal Quick Links with its items."""
        if not frappe.db.exists(
            "Portal Quick Links", {"name": quick_links_name, "is_active": 1}
        ):
            return None

        doc = frappe.get_doc("Portal Quick Links", quick_links_name)
        return {
            "name": doc.name,
            "link_group_name": doc.link_group_name,
            "description": doc.description,
            "icon": doc.icon,
            "image": doc.image,
            "links": [
                {
                    "label": item.label,
                    "icon": item.icon,
                    "image": item.image,
                    "url": item.url,
                    "target": item.target,
                    "display_order": item.display_order,
                    "is_enabled": item.is_enabled,
                }
                for item in doc.links
                if item.is_enabled
            ],
        }
