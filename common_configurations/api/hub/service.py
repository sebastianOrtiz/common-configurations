"""
Hub Service

Business logic for the central Tenant Hub. Stateless; encapsulates the
queries and the assembly of the response shape exposed to the public
hub frontend.
"""

from typing import Any, Dict, List, Optional

import frappe


class HubService:
    @classmethod
    def list_groups(cls) -> List[Dict[str, Any]]:
        """All active Tenant Portal Groups in display order."""
        return frappe.get_all(
            "Tenant Portal Group",
            filters={"is_active": 1},
            fields=[
                "name",
                "slug",
                "display_name",
                "description",
                "banner_image",
                "display_order",
            ],
            order_by="display_order asc, display_name asc",
        )

    @classmethod
    def get_group_with_portals(cls, slug: str) -> Optional[Dict[str, Any]]:
        """
        Active group identified by `slug` with its active portals.
        Each portal carries the composed `target_url` so the frontend
        does not need to know about Destination CRM.
        """
        group = frappe.db.get_value(
            "Tenant Portal Group",
            {"slug": slug, "is_active": 1},
            [
                "name",
                "slug",
                "display_name",
                "description",
                "banner_image",
                "display_order",
            ],
            as_dict=True,
        )
        if not group:
            return None

        portals = frappe.db.sql(
            """
            SELECT
                tp.name,
                tp.display_name,
                tp.description,
                tp.logo,
                tp.requires_auth,
                tp.display_order,
                tp.portal_path,
                tp.destination_crm,
                crm.display_name AS crm_display_name,
                crm.logo         AS crm_logo,
                crm.base_url     AS crm_base_url
            FROM `tabTenant Portal` tp
            INNER JOIN `tabDestination CRM` crm
                ON crm.name = tp.destination_crm
            WHERE tp.group = %(group)s
              AND tp.is_active = 1
              AND crm.is_active = 1
            ORDER BY tp.display_order ASC, tp.display_name ASC
            """,
            {"group": group["name"]},
            as_dict=True,
        )

        for p in portals:
            base = (p.get("crm_base_url") or "").rstrip("/")
            path = p.get("portal_path") or ""
            p["target_url"] = f"{base}{path}" if base and path else ""
            # Prefer portal-specific logo, fall back to CRM logo
            p["effective_logo"] = p.get("logo") or p.get("crm_logo")

        group["portals"] = portals
        return group
