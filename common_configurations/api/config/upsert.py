"""
upsert_doc — the one write primitive every provider should use to create or
update a document from manifest data. Keeping this in one place is what
makes providers idempotent and consistent (same match/report semantics
everywhere) without each one reinventing find-or-create.

Not intended for Single doctypes (e.g. site-wide settings) — those have no
natural `match` and should be loaded via `frappe.get_single(...)` directly
in the provider; see CommonConfigProvider._import_settings for the pattern.
"""

from __future__ import annotations

from typing import Any

import frappe


def upsert_doc(
    doctype: str,
    match: dict[str, Any],
    values: dict[str, Any],
    child_tables: dict[str, list[dict[str, Any]]] | None = None,
    ctx=None,
    key: str | None = None,
) -> tuple[Any, str]:
    """Find-or-create a document and set its fields/child tables.

    Args:
        doctype: Target doctype, e.g. "External Link".
        match: Filters identifying the document's natural key, e.g.
            `{"title": "Salud"}` or `{"portal_name": "salud"}`. An existing
            doc is looked up with `frappe.db.get_value(doctype, match, "name")`.
            Pass `{}` only if the doctype genuinely has no natural key to
            match on (a fresh doc is created every call in that case).
        values: Fields to set on the document (merged over `match`, so the
            natural key fields don't need to be repeated in both — but it's
            safe to do so).
        child_tables: Optional `{fieldname: [row_dict, ...]}`. Each table is
            fully cleared and rebuilt from the given rows every call — this
            is what makes child-table imports idempotent (no orphan rows,
            no duplicate rows on re-import).
        ctx: Optional `ImportContext` — when given together with `key`, the
            outcome is recorded via `ctx.record(action, doctype, key, name)`.
        key: The manifest-facing key to report against (e.g. the value used
            in `match`, or a composite label). Required if `ctx` is given.

    Returns:
        (doc, action) where action is "created" or "updated". Note this
        helper never returns "skipped" — that action is for providers that
        decide NOT to call upsert_doc at all (e.g. an unresolved config_ref);
        those providers call `ctx.record("skipped", ...)` themselves.

    Note on dry_run: this function always performs the insert/save — it has
    no dry_run branch of its own. The engine wraps the whole import in a
    transaction and rolls back at the end when `dry_run=True`, so calling
    this unconditionally is what makes dry-run plans accurate (they reflect
    real would-be validation errors, defaults, and side effects).
    """
    if ctx is not None and key is None:
        raise ValueError("upsert_doc: 'key' is required when 'ctx' is given")

    existing_name = frappe.db.get_value(doctype, match, "name") if match else None

    if existing_name:
        doc = frappe.get_doc(doctype, existing_name)
        action = "updated"
    else:
        doc = frappe.new_doc(doctype)
        action = "created"

    doc.update({**match, **(values or {})})

    if child_tables:
        for fieldname, rows in child_tables.items():
            doc.set(fieldname, [])
            for row in rows:
                doc.append(fieldname, row)

    if action == "created":
        doc.insert(ignore_permissions=True)
    else:
        doc.save(ignore_permissions=True)

    if ctx is not None:
        ctx.record(action, doctype, key, doc.name)

    return doc, action
