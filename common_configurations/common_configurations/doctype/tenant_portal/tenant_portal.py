"""
Tenant Portal

A single Service Portal indexed by the central Hub. Points to a remote
Destination CRM (Frappe site) and a specific portal path inside it.

The hub composes the full target URL as:
    destination_crm.base_url + portal_path
"""

import frappe
from frappe.model.document import Document


class TenantPortal(Document):
    def validate(self):
        if self.portal_path:
            self.portal_path = self.portal_path.strip()
            if not self.portal_path.startswith("/"):
                self.portal_path = "/" + self.portal_path
            if self.portal_path.endswith("/") and len(self.portal_path) > 1:
                self.portal_path = self.portal_path.rstrip("/")

        if self.destination_crm:
            crm_active = frappe.db.get_value("Destination CRM", self.destination_crm, "is_active")
            if not crm_active and self.is_active:
                frappe.throw(
                    f"Cannot activate this portal because its Destination CRM "
                    f"'{self.destination_crm}' is inactive."
                )

    @property
    def target_url(self) -> str:
        """Compose the full URL the citizen will be redirected to."""
        if not self.destination_crm or not self.portal_path:
            return ""
        base = frappe.db.get_value("Destination CRM", self.destination_crm, "base_url") or ""
        return f"{base}{self.portal_path}"
