"""
Contacts API Domain

Handles User Contact CRUD operations and authentication.
"""

from .endpoints import (
    get_user_contact_by_document,
    create_user_contact,
    update_user_contact,
    get_user_contact_fields,
)

__all__ = [
    "get_user_contact_by_document",
    "create_user_contact",
    "update_user_contact",
    "get_user_contact_fields",
]
