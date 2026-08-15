"""
ConfigProvider — base contract every module implements to plug into the
declarative config import/export engine.

Each provider owns exactly one top-level key of the site configuration
manifest (e.g. "common_configurations", "logbook", "pqr_management").
The engine discovers providers via the `portal_config_providers` hook,
orders them topologically by `depends_on`, and drives them through the
three methods below.
"""

from __future__ import annotations

from typing import Any


class ConfigProvider:
    """Base class for a module's configuration import/export provider.

    Subclasses MUST set `key` to the manifest section they own and MAY set
    `depends_on` to the keys of other providers that must run before them
    (e.g. because they need to resolve `ctx.get_ref(...)` values published
    by those providers).

    Dependencies pointing at a provider key that is not registered (because
    that app is not installed on this site) are silently ignored by the
    engine — a provider must be able to run standalone and simply omit/warn
    on anything it cannot resolve.
    """

    #: Manifest section this provider owns. Must be unique across all
    #: registered providers.
    key: str = ""

    #: Keys of other providers that must run before this one. Missing keys
    #: (provider not registered) are ignored — do not assume they ran.
    depends_on: list[str] = []

    def import_section(self, data: dict[str, Any], ctx, dry_run: bool) -> None:
        """Import this provider's section of the manifest.

        Args:
            data: `manifest.get(self.key, {})` — this provider's section,
                already narrowed down by the engine. Never None.
            ctx: The shared `ImportContext` for this run. Use it to
                publish/resolve cross-provider refs and to record actions.
            dry_run: When True, the provider must still do all its normal
                work (create/update docs, set refs) so downstream providers
                and the report reflect the real plan — the engine rolls
                back the whole transaction at the end. Providers should NOT
                special-case dry_run themselves beyond what `upsert_doc`
                already does; it is threaded through purely so a provider
                can skip genuinely irreversible side effects (e.g. calling
                an external API), which is rare.

        Returns:
            None. Report the outcome via `ctx.record(...)` / `ctx.warn(...)`.
        """
        raise NotImplementedError

    def export_section(self, ctx) -> dict[str, Any]:
        """Return this provider's section of the manifest for export.

        Args:
            ctx: The shared `ImportContext` for this run (export mode —
                `ctx.dry_run` is irrelevant here, no writes should happen).

        Returns:
            A JSON-serializable dict matching the same shape `import_section`
            expects back as `data`, so `export_site_config` output can be fed
            straight into `import_site_config` (round-trip).
        """
        raise NotImplementedError

    def describe_schema(self) -> dict[str, Any]:
        """Describe the shape of this provider's manifest section.

        Self-documentation for `describe_config_schema()` — used by other
        engineers/agents building manifests against this provider without
        reading its source. Free-form dict; convention used by
        CommonConfigProvider is:

            {
                "<section_key>": {
                    "type": "list" | "dict" | "single",
                    "description": "...",
                    "match_on": ["field", ...],   # upsert match keys, if any
                    "fields": {"field_name": "type/description", ...},
                }
            }

        Returns:
            A JSON-serializable dict.
        """
        raise NotImplementedError
