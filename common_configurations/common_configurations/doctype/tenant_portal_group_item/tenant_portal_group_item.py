"""
Tenant Portal Group Item

Child table row that links a Tenant Portal Group with one Tenant Portal.
Allows the same portal to belong to multiple groups (many-to-many) and
to be deactivated per-group without changing the portal's global status.
"""

from frappe.model.document import Document


class TenantPortalGroupItem(Document):
    pass
