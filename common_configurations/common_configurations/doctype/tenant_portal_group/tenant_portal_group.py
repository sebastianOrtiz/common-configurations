"""
Tenant Portal Group

A category of tenant portals shown together on the hub
(e.g. "Alcaldías", "Cámaras de Comercio", "Despachos jurídicos").

The slug is the URL fragment used by the hub frontend:
    https://hub/.../hub/<slug>
"""

import re

import frappe
from frappe.model.document import Document


class TenantPortalGroup(Document):
    def validate(self):
        if self.slug:
            self.slug = self.slug.strip().lower()
            if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", self.slug):
                frappe.throw(
                    "Slug must contain only lowercase letters, numbers and hyphens "
                    "(no spaces, no leading/trailing hyphen)."
                )
