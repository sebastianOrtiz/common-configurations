"""
ImportContext — shared state threaded through a single import/export run.

Two responsibilities:
  1. Cross-provider reference resolution (`set_ref` / `get_ref`), so a
     provider can create a doc and let another provider — running later,
     per `depends_on` ordering — link to it without either one knowing the
     other's doctypes.
  2. Reporting (`record` / `warn` / `to_dict`), a uniform shape every
     provider contributes to, returned as-is by `run_import`.
"""

from __future__ import annotations

from typing import Any


class ImportContext:
    """Shared context for one `run_import` / `run_export` pass.

    Ref namespaces are free-form strings agreed between the provider that
    publishes and the provider(s) that consume — by convention
    `"<app>.<concept>"`, e.g. `"logbook.procedures_config"`,
    `"common_configurations.external_link"`,
    `"common_configurations.quick_links"`. Document this in your provider's
    module docstring so other teams know what to depend on.
    """

    def __init__(self, dry_run: bool = False, portal_name: str | None = None) -> None:
        self.dry_run = dry_run
        #: Set by `engine.run_export` when exporting a single portal, so
        #: providers can scope their `export_section` output to it. None in
        #: import mode and in full-site export mode. Not part of the
        #: minimal contract (dry_run/set_ref/get_ref/record/warn/to_dict) —
        #: treat with `getattr(ctx, "portal_name", None)` if you want your
        #: provider to remain usable from older callers.
        self.portal_name = portal_name
        self._refs: dict[str, dict[str, str]] = {}
        self._created: list[dict[str, str]] = []
        self._updated: list[dict[str, str]] = []
        self._skipped: list[dict[str, str]] = []
        self._warnings: list[str] = []

    # ------------------------------------------------------------------
    # Cross-provider refs
    # ------------------------------------------------------------------

    def set_ref(self, namespace: str, key: str, docname: str) -> None:
        """Publish a resolvable reference for other providers.

        Args:
            namespace: Free-form namespace, e.g. "logbook.procedures_config".
            key: The manifest-facing key the ref is filed under (e.g. the
                natural key used in the manifest for that resource).
            docname: The actual document name (primary key) created/updated
                for that key.
        """
        self._refs.setdefault(namespace, {})[key] = docname

    def get_ref(self, namespace: str, key: str) -> str | None:
        """Resolve a reference published by (typically) an earlier provider.

        Returns None if the namespace/key was never published — callers
        MUST handle this gracefully (warn + omit), never raise, since the
        publishing provider may legitimately not be registered on this site.
        """
        return self._refs.get(namespace, {}).get(key)

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------

    def record(self, action: str, doctype: str, key: str, name: str) -> None:
        """Record an upsert outcome.

        Args:
            action: One of "created", "updated", "skipped".
            doctype: The doctype acted on.
            key: The natural/manifest key used to match the doc (e.g. the
                value of `match`, human-readable).
            name: The resulting document name.
        """
        entry = {"doctype": doctype, "key": key, "name": name}
        if action == "created":
            self._created.append(entry)
        elif action == "updated":
            self._updated.append(entry)
        elif action == "skipped":
            self._skipped.append(entry)
        else:
            raise ValueError(
                f"Unknown action '{action}' — expected created/updated/skipped"
            )

    def warn(self, msg: str) -> None:
        """Record a non-fatal warning (e.g. an unresolved cross-module ref)."""
        self._warnings.append(msg)

    def to_dict(self) -> dict[str, Any]:
        """Return the accumulated report, as returned by `import_site_config`."""
        return {
            "created": list(self._created),
            "updated": list(self._updated),
            "skipped": list(self._skipped),
            "warnings": list(self._warnings),
            "dry_run": self.dry_run,
        }
