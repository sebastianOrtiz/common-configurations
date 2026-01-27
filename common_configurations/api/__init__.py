"""
Common Configurations API

This module provides a modular, layered API structure following SOLID principles.

Structure:
    api/
    ├── __init__.py          # This file - re-exports for backwards compatibility
    ├── contacts/            # User Contact domain
    │   ├── endpoints.py     # HTTP endpoints
    │   ├── service.py       # Business logic
    │   └── validators.py    # Input validation
    ├── portals/             # Service Portal domain
    │   ├── endpoints.py
    │   └── service.py
    ├── auth/                # Authentication domain
    │   ├── endpoints.py
    │   └── service.py
    └── shared/              # Shared utilities
        ├── security.py      # Auth, tokens, honeypot
        ├── rate_limit.py    # Rate limiting
        ├── validators.py    # Generic validators
        └── exceptions.py    # Custom exceptions

Usage:
    # New style (recommended)
    frappe.call("common_configurations.api.contacts.get_user_contact_by_document", ...)
    frappe.call("common_configurations.api.portals.get_portal", ...)

    # Legacy style (still supported via portal_api.py)
    frappe.call("common_configurations.api.portal_api.get_portal", ...)
"""

# Re-export domains for convenient access
from . import contacts
from . import portals
from . import auth
from . import shared

# Re-export shared utilities at package level
from .shared import (
    # Rate limiting
    check_rate_limit,
    get_client_ip,
    # Security
    check_honeypot,
    create_user_contact_token,
    get_current_user_contact,
    require_user_contact,
    validate_user_contact_ownership,
    AUTH_HEADER,
    # Validators
    sanitize_string,
    validate_document_number,
    validate_email,
    validate_phone,
    validate_name,
)

__all__ = [
    # Domains
    "contacts",
    "portals",
    "auth",
    "shared",
    # Shared utilities
    "check_rate_limit",
    "get_client_ip",
    "check_honeypot",
    "create_user_contact_token",
    "get_current_user_contact",
    "require_user_contact",
    "validate_user_contact_ownership",
    "AUTH_HEADER",
    "sanitize_string",
    "validate_document_number",
    "validate_email",
    "validate_phone",
    "validate_name",
]
