"""
Config Import/Export Framework
===============================

Declarative, multi-module configuration import/export engine for the portal
system. Any installed app can contribute a "provider" that knows how to
import/export its own slice of a JSON manifest, without this app needing to
know anything about that module's doctypes.

Public contract (stable — other apps' providers import from here):

    from common_configurations.api.config import ConfigProvider, ImportContext, upsert_doc

Structure:
    api/config/
    ├── __init__.py     # This file - re-exports the public contract
    ├── provider.py     # ConfigProvider base class
    ├── context.py      # ImportContext (cross-refs + report)
    ├── upsert.py       # upsert_doc() helper
    ├── engine.py        # provider discovery/ordering + run_import/run_export/describe_schema
    └── endpoints.py     # whitelisted HTTP endpoints

Usage from other apps:
    # hooks.py
    portal_config_providers = [
        "my_app.my_app.config_providers.my_provider.MyProvider",
    ]

    # my_provider.py
    from common_configurations.api.config import ConfigProvider, ImportContext, upsert_doc

    class MyProvider(ConfigProvider):
        key = "my_app"
        depends_on = []

        def import_section(self, data, ctx, dry_run):
            ...

        def export_section(self, ctx):
            ...

        def describe_schema(self):
            ...
"""

from .provider import ConfigProvider
from .context import ImportContext
from .upsert import upsert_doc
from . import engine
from . import endpoints

__all__ = [
    "ConfigProvider",
    "ImportContext",
    "upsert_doc",
    "engine",
    "endpoints",
    "import_site_config",
    "export_site_config",
    "describe_config_schema",
]

# Re-export whitelisted endpoints at package level so they can be called as
# `common_configurations.api.config.import_site_config`.
from .endpoints import (  # noqa: E402
    import_site_config,
    export_site_config,
    describe_config_schema,
)
