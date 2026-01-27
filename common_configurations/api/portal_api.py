"""
Portal API - Legacy Compatibility Layer

This module maintains backwards compatibility with the original API structure.
All endpoints are now implemented in the modular structure and re-exported here.

New code should import directly from the domain modules:
    from common_configurations.api.contacts import get_user_contact_by_document
    from common_configurations.api.portals import get_portal

Or call via frappe.call:
    frappe.call("common_configurations.api.contacts.get_user_contact_by_document", ...)
"""

# ===================
# Portal Configuration (from portals domain)
# ===================
from common_configurations.api.portals.endpoints import (
    get_portals,
    get_portal,
)

# ===================
# User Contact (from contacts domain)
# ===================
from common_configurations.api.contacts.endpoints import (
    get_user_contact_by_document,
    create_user_contact,
    update_user_contact,
    get_user_contact_fields,
)

# ===================
# Authentication (from auth domain)
# ===================
from common_configurations.api.auth.endpoints import (
    get_csrf_token,
    get_authenticated_user_contact,
    logout_user_contact,
)

__all__ = [
    # Portals
    "get_portals",
    "get_portal",
    # Contacts
    "get_user_contact_by_document",
    "create_user_contact",
    "update_user_contact",
    "get_user_contact_fields",
    # Auth
    "get_csrf_token",
    "get_authenticated_user_contact",
    "logout_user_contact",
]
