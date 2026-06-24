"""
Hub API

Public endpoints powering the central Tenant Hub: a directory that indexes
Service Portals living on multiple Destination CRMs (Frappe sites).

Endpoints exposed:
    - get_groups            → list of active Tenant Portal Groups
    - get_group_with_portals → group metadata + active portals (with composed target URLs)
"""

from .endpoints import (
    generate_sso_nonce,
    get_group_with_portals,
    get_groups,
    verify_sso_nonce,
)

__all__ = [
    "get_groups",
    "get_group_with_portals",
    "generate_sso_nonce",
    "verify_sso_nonce",
]
