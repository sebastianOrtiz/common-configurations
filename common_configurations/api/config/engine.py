"""
Config import/export engine.

Discovers providers registered via the `portal_config_providers` hook
(a plain list of dotted class paths — every app appends its own provider(s),
never overrides the hook), orders them topologically by `depends_on`, and
drives the shared import/export/describe flows.
"""

from __future__ import annotations

from typing import Any

import frappe

from .context import ImportContext
from .provider import ConfigProvider

HOOK_NAME = "portal_config_providers"


class ConfigImportError(frappe.ValidationError):
    """Raised when a provider fails during `run_import`, with the failing
    provider's key attached to the message so the caller knows where to look.
    The transaction has already been rolled back by the time this is raised.
    """


# ----------------------------------------------------------------------
# Provider discovery + ordering
# ----------------------------------------------------------------------


def get_providers() -> list[ConfigProvider]:
    """Resolve, instantiate, and topologically order all registered providers.

    Dependencies (`depends_on`) pointing at a key that no registered
    provider owns are silently ignored — this is what lets the system work
    correctly regardless of which optional apps are installed on a given
    site. Cycles between registered providers raise `frappe.ValidationError`.
    """
    dotted_paths = frappe.get_hooks(HOOK_NAME) or []

    providers: list[ConfigProvider] = []
    seen_keys: set[str] = set()

    for dotted_path in dotted_paths:
        provider_class = frappe.get_attr(dotted_path)
        instance: ConfigProvider = provider_class()

        if not instance.key:
            frappe.throw(
                f"Config provider '{dotted_path}' must define a non-empty 'key'"
            )
        if instance.key in seen_keys:
            frappe.throw(
                f"Duplicate config provider key '{instance.key}' registered "
                f"by '{dotted_path}' — provider keys must be unique across "
                f"all apps' '{HOOK_NAME}' hook entries"
            )

        seen_keys.add(instance.key)
        providers.append(instance)

    return _topological_sort(providers)


def _topological_sort(providers: list[ConfigProvider]) -> list[ConfigProvider]:
    by_key = {p.key: p for p in providers}
    state: dict[str, int] = {}  # key -> 0 unvisited (implicit), 1 in-progress, 2 done
    ordered: list[ConfigProvider] = []

    def visit(provider: ConfigProvider, chain: list[str]) -> None:
        current_state = state.get(provider.key, 0)
        if current_state == 2:
            return
        if current_state == 1:
            cycle = " -> ".join(chain + [provider.key])
            frappe.throw(
                f"Cycle detected among portal_config_providers 'depends_on': {cycle}"
            )

        state[provider.key] = 1
        for dep_key in provider.depends_on or []:
            dep_provider = by_key.get(dep_key)
            if dep_provider is None:
                # Dependency not registered on this site — ignore, by design.
                continue
            visit(dep_provider, chain + [provider.key])
        state[provider.key] = 2
        ordered.append(provider)

    for provider in providers:
        visit(provider, [])

    return ordered


# ----------------------------------------------------------------------
# Import / Export / Describe
# ----------------------------------------------------------------------


def run_import(manifest: dict[str, Any], dry_run: bool) -> dict[str, Any]:
    """Run every registered provider's `import_section` against `manifest`,
    in dependency order, inside a single transaction.

    On any exception, the transaction is rolled back and a `ConfigImportError`
    is raised, chained from the original exception, naming the provider that
    failed. When `dry_run=True` and every provider succeeds, the transaction
    is still rolled back at the end (so nothing persists) but the returned
    report reflects exactly what would have happened.
    """
    providers = get_providers()
    ctx = ImportContext(dry_run=dry_run)
    manifest = manifest or {}

    current_provider: ConfigProvider | None = None
    try:
        for provider in providers:
            current_provider = provider
            section = manifest.get(provider.key) or {}
            provider.import_section(section, ctx, dry_run)
    except Exception as exc:
        frappe.db.rollback()
        failed_key = current_provider.key if current_provider else "<discovery>"
        frappe.log_error(
            title="Config import failed",
            message=frappe.get_traceback(),
        )
        raise ConfigImportError(
            f"Config import failed in provider '{failed_key}': {exc}"
        ) from exc

    if dry_run:
        frappe.db.rollback()
    else:
        frappe.db.commit()

    return ctx.to_dict()


def run_export(portal_name: str | None = None) -> dict[str, Any]:
    """Assemble a full (or portal-scoped) site configuration manifest by
    calling every registered provider's `export_section`, in dependency order
    (so `set_ref` publishers run before any provider that might use refs
    during export)."""
    providers = get_providers()
    ctx = ImportContext(dry_run=False, portal_name=portal_name)

    manifest: dict[str, Any] = {"meta": {"schema_version": 1}}
    for provider in providers:
        manifest[provider.key] = provider.export_section(ctx)

    return manifest


def describe_schema() -> dict[str, Any]:
    """Return self-documentation for every registered provider's manifest
    section, keyed the same way an actual manifest would be."""
    providers = get_providers()

    schema: dict[str, Any] = {
        "meta": {
            "schema_version": 1,
            "providers": [
                {"key": p.key, "depends_on": list(p.depends_on or [])}
                for p in providers
            ],
        }
    }
    for provider in providers:
        schema[provider.key] = provider.describe_schema()

    return schema
