"""
Config Import/Export — whitelisted HTTP endpoints.

All endpoints here are System Manager only (never allow_guest — this
imports/exports site configuration, including doctypes that may hold
sensitive-adjacent data). Call via:

    frappe.call("common_configurations.api.config.import_site_config", ...)
    frappe.call("common_configurations.api.config.export_site_config", ...)
    frappe.call("common_configurations.api.config.describe_config_schema")
"""

from __future__ import annotations

from typing import Any

import frappe

from . import engine


@frappe.whitelist(methods=["POST"])
def import_site_config(manifest, dry_run: int = 0) -> dict[str, Any]:
    """Import a site configuration manifest.

    Args:
        manifest: dict or JSON string — top-level keys are provider keys
            (e.g. "common_configurations"), each mapping to that provider's
            section. Unknown/missing keys are treated as empty sections.
        dry_run: When truthy, runs every provider (so validation errors and
            the plan are real) but rolls back all writes at the end.

    Returns:
        dict: {"created": [...], "updated": [...], "skipped": [...],
               "warnings": [...], "dry_run": bool}
    """
    frappe.only_for("System Manager")

    manifest = frappe.parse_json(manifest) if isinstance(manifest, str) else manifest
    if not isinstance(manifest, dict):
        frappe.throw("manifest must be a JSON object")

    return engine.run_import(manifest, dry_run=bool(frappe.utils.cint(dry_run)))


@frappe.whitelist(methods=["GET"])
def export_site_config(portal_name: str | None = None) -> dict[str, Any]:
    """Export the current site configuration as a manifest.

    Args:
        portal_name: Optional — when given, providers that support it scope
            their export to that Service Portal (e.g. CommonConfigProvider
            exports only that portal instead of every portal on the site).

    Returns:
        dict: {"meta": {"schema_version": 1}, "<provider_key>": {...}, ...}
        Feeding this straight back into `import_site_config` must be a no-op
        (idempotent round-trip).
    """
    frappe.only_for("System Manager")

    return engine.run_export(portal_name=portal_name or None)


@frappe.whitelist(methods=["GET"])
def describe_config_schema() -> dict[str, Any]:
    """Return self-documentation for every registered provider's manifest
    section — field names, types, and upsert match keys."""
    frappe.only_for("System Manager")

    return engine.describe_schema()
