"""
Navigation API Domain

Voice/intent navigation for the Service Portal: resolves a citizen's
spoken or typed request ("quiero consultar mi eps") to the matching
Logbook Procedure(s), without the citizen needing to know which
secretaría/tool it lives under.
"""

from .endpoints import (
    build_navigation_catalog,
    get_navigation_catalog,
    navigation_build_status,
    resolve_navigation,
)

__all__ = [
    "build_navigation_catalog",
    "get_navigation_catalog",
    "navigation_build_status",
    "resolve_navigation",
]
