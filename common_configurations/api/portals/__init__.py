"""
Portals API Domain

Handles Service Portal configuration retrieval.
"""

from .endpoints import get_portals, get_portal

__all__ = [
    "get_portals",
    "get_portal",
]
