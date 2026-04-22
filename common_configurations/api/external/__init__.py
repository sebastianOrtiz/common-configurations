"""
External API Endpoints

Public endpoints for external integrations authenticated via API Key.
"""

from .endpoints import lookup_contact, register_contact

__all__ = [
    "lookup_contact",
    "register_contact",
]
