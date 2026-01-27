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
            "tools": [],
        }

        # Add tools
        for tool in portal.tools:
            result["tools"].append(
                {
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
                }
            )

        return result
