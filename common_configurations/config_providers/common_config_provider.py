"""
CommonConfigProvider — the config provider for common_configurations itself.

Owns manifest key "common_configurations", covering: external_links,
quick_links, announcements, announcement_sets, tool_types, settings, portals.

Naming keys (verified against each doctype's `autoname` before designing this
provider — see class docstring below): External Link, Portal Quick Links,
Announcement and Announcement Set all autoname `field:<natural key>` (NOT a
counter), so their `name` IS the natural key the manifest already uses
(title / link_group_name / tool_name). No `import_key` field was needed on
any of them — upsert matches directly on that natural field.

Cross-module tool config (`config_ref` mechanism)
---------------------------------------------------
A `Service Portal Tool` row may need a field whose value is owned by another
module's provider (e.g. logbook's "procedures" tool type needs a link to a
"Logbook Procedures Config" doc created by logbook's own provider, which this
app knows nothing about). For those fields, instead of a plain value, the
manifest puts a ref object:

    {"$ref": {"namespace": "logbook.procedures_config", "key": "salud"}}

which is resolved via `ctx.get_ref(namespace, key)`. If it doesn't resolve
(the owning provider isn't registered on this site, or that key wasn't
published in *this same* import call), the field is DROPPED from the row
(left unset) and `ctx.warn(...)` records why — the row is still created with
its other fields, just without that particular link.

Fields whose doctype already autonames by natural key (this provider's own:
target_portal → Service Portal, quick_links → Portal Quick Links,
quick_link_external → External Link) do NOT need `$ref` — the manifest value
IS the docname already, so it's passed through as-is. `$ref` exists
specifically so this provider never has to hardcode another app's doctype
names.

Because a portal's tools may need refs published by other providers, this
provider depends on all currently-known sibling modules; per the engine
contract, dependencies on providers that aren't registered are ignored, so
this provider works standalone.
"""

from __future__ import annotations

from typing import Any

import frappe

from common_configurations.api.config import ConfigProvider, upsert_doc

# ---------------------------------------------------------------------
# Doctype <-> manifest section wiring
# ---------------------------------------------------------------------

EXTERNAL_LINK_DOCTYPE = "External Link"
QUICK_LINKS_DOCTYPE = "Portal Quick Links"
ANNOUNCEMENT_DOCTYPE = "Announcement"
ANNOUNCEMENT_SET_DOCTYPE = "Announcement Set"
TOOL_TYPE_DOCTYPE = "Tool Type"
SETTINGS_DOCTYPE = "Common Configurations Settings"
SERVICE_PORTAL_DOCTYPE = "Service Portal"

# Ref namespaces this provider publishes (documented for other providers).
REF_NS_EXTERNAL_LINK = "common_configurations.external_link"
REF_NS_QUICK_LINKS = "common_configurations.quick_links"
REF_NS_ANNOUNCEMENT = "common_configurations.announcement"
REF_NS_ANNOUNCEMENT_SET = "common_configurations.announcement_set"
REF_NS_TOOL_TYPE = "common_configurations.tool_type"

# Fieldtypes never surfaced through import/export (structural or secret).
_SKIP_FIELDTYPES = {
    "Section Break",
    "Column Break",
    "Tab Break",
    "HTML",
    "Button",
    "Fold",
    "Table",
    "Table MultiSelect",
    "Password",  # never import/export secrets, ever.
}


def _exportable_fields(doctype: str, exclude: tuple[str, ...] = ()) -> list[str]:
    """Flat (non-table, non-structural, non-secret) fieldnames for a doctype,
    reflected from its meta so custom fields added later (by other apps, e.g.
    a `calendar_resource` field added to Service Portal Tool) are picked up
    automatically without this provider needing to know about them."""
    meta = frappe.get_meta(doctype)
    return [
        df.fieldname
        for df in meta.fields
        if df.fieldtype not in _SKIP_FIELDTYPES and df.fieldname not in exclude
    ]


def _pick(data: dict[str, Any], fields: list[str]) -> dict[str, Any]:
    """Only the keys of `data` that are in `fields` — so imports only ever
    touch fields the manifest explicitly mentions (no accidental clobbering
    of fields the manifest is silent about)."""
    return {f: data[f] for f in fields if f in data}


class CommonConfigProvider(ConfigProvider):
    key = "common_configurations"

    # Ignored if not registered — lets `portals[].tools[].$ref` resolve
    # cross-module config docs created by these providers, when present.
    depends_on = ["logbook", "meet_scheduling", "pqr_management", "lex_app"]

    # ------------------------------------------------------------------
    # import_section
    # ------------------------------------------------------------------

    def import_section(self, data: dict[str, Any], ctx, dry_run: bool) -> None:
        data = data or {}
        self._import_external_links(data.get("external_links") or [], ctx)
        self._import_quick_links(data.get("quick_links") or [], ctx)
        self._import_announcements(data.get("announcements") or [], ctx)
        self._import_announcement_sets(data.get("announcement_sets") or [], ctx)
        self._import_tool_types(data.get("tool_types") or [], ctx)
        self._import_settings(data.get("settings") or {}, ctx)
        self._import_portals(data.get("portals") or [], ctx)

    def _import_external_links(self, entries: list[dict], ctx) -> None:
        fields = _exportable_fields(EXTERNAL_LINK_DOCTYPE)
        for entry in entries:
            title = entry.get("title")
            if not title:
                ctx.warn("external_links: entry missing 'title', skipped")
                continue
            doc, _action = upsert_doc(
                EXTERNAL_LINK_DOCTYPE,
                match={"title": title},
                values=_pick(entry, fields),
                ctx=ctx,
                key=title,
            )
            ctx.set_ref(REF_NS_EXTERNAL_LINK, title, doc.name)

    def _import_quick_links(self, entries: list[dict], ctx) -> None:
        fields = _exportable_fields(QUICK_LINKS_DOCTYPE, exclude=("links",))
        for entry in entries:
            group_name = entry.get("link_group_name")
            if not group_name:
                ctx.warn("quick_links: entry missing 'link_group_name', skipped")
                continue

            item_rows = []
            for item in entry.get("links") or []:
                external_link_key = item.get("external_link")
                if not external_link_key:
                    ctx.warn(
                        f"quick_links.{group_name}.links: item missing "
                        f"'external_link', skipped"
                    )
                    continue
                item_rows.append(
                    {
                        "external_link": external_link_key,
                        "display_order": item.get("display_order", 0),
                        "is_enabled": item.get("is_enabled", 1),
                    }
                )

            doc, _action = upsert_doc(
                QUICK_LINKS_DOCTYPE,
                match={"link_group_name": group_name},
                values=_pick(entry, fields),
                child_tables={"links": item_rows},
                ctx=ctx,
                key=group_name,
            )
            ctx.set_ref(REF_NS_QUICK_LINKS, group_name, doc.name)

    def _import_announcements(self, entries: list[dict], ctx) -> None:
        fields = _exportable_fields(ANNOUNCEMENT_DOCTYPE)
        for entry in entries:
            title = entry.get("title")
            if not title:
                ctx.warn("announcements: entry missing 'title', skipped")
                continue
            doc, _action = upsert_doc(
                ANNOUNCEMENT_DOCTYPE,
                match={"title": title},
                values=_pick(entry, fields),
                ctx=ctx,
                key=title,
            )
            ctx.set_ref(REF_NS_ANNOUNCEMENT, title, doc.name)

    def _import_announcement_sets(self, entries: list[dict], ctx) -> None:
        fields = _exportable_fields(ANNOUNCEMENT_SET_DOCTYPE, exclude=("announcements",))
        for entry in entries:
            title = entry.get("title")
            if not title:
                ctx.warn("announcement_sets: entry missing 'title', skipped")
                continue

            item_rows = []
            for item in entry.get("announcements") or []:
                announcement_key = item.get("announcement")
                if not announcement_key:
                    ctx.warn(
                        f"announcement_sets.{title}.announcements: item "
                        f"missing 'announcement', skipped"
                    )
                    continue
                item_rows.append(
                    {
                        "announcement": announcement_key,
                        "display_order": item.get("display_order", 0),
                        "is_enabled": item.get("is_enabled", 1),
                    }
                )

            doc, _action = upsert_doc(
                ANNOUNCEMENT_SET_DOCTYPE,
                match={"title": title},
                values=_pick(entry, fields),
                child_tables={"announcements": item_rows},
                ctx=ctx,
                key=title,
            )
            ctx.set_ref(REF_NS_ANNOUNCEMENT_SET, title, doc.name)

    def _import_tool_types(self, entries: list[dict], ctx) -> None:
        fields = _exportable_fields(TOOL_TYPE_DOCTYPE)
        for entry in entries:
            tool_name = entry.get("tool_name")
            if not tool_name:
                ctx.warn("tool_types: entry missing 'tool_name', skipped")
                continue
            doc, _action = upsert_doc(
                TOOL_TYPE_DOCTYPE,
                match={"tool_name": tool_name},
                values=_pick(entry, fields),
                ctx=ctx,
                key=tool_name,
            )
            ctx.set_ref(REF_NS_TOOL_TYPE, tool_name, doc.name)

    def _import_settings(self, data: dict[str, Any], ctx) -> None:
        if not data:
            return
        fields = _exportable_fields(SETTINGS_DOCTYPE)
        values = _pick(data, fields)
        if not values:
            ctx.warn(
                "settings: no recognized/exportable fields in manifest "
                "(secrets like hub_shared_secret are never accepted here)"
            )
            return
        doc = frappe.get_single(SETTINGS_DOCTYPE)
        doc.update(values)
        doc.save(ignore_permissions=True)
        ctx.record("updated", SETTINGS_DOCTYPE, "settings", doc.name)

    def _import_portals(self, entries: list[dict], ctx) -> None:
        portal_fields = _exportable_fields(SERVICE_PORTAL_DOCTYPE, exclude=("tools",))
        tool_fields = _exportable_fields("Service Portal Tool")

        for entry in entries:
            portal_name = entry.get("portal_name")
            if not portal_name:
                ctx.warn("portals: entry missing 'portal_name', skipped")
                continue

            tool_rows = []
            for idx, tool_entry in enumerate(entry.get("tools") or []):
                if not tool_entry.get("tool_type"):
                    ctx.warn(
                        f"portals.{portal_name}.tools[{idx}]: missing "
                        f"'tool_type', skipped"
                    )
                    continue

                row: dict[str, Any] = {}
                for field in tool_fields:
                    if field not in tool_entry:
                        continue
                    resolved = self._resolve_tool_field(
                        field, tool_entry[field], ctx, portal_name, idx
                    )
                    if resolved is not None:
                        row[field] = resolved
                tool_rows.append(row)

            doc, _action = upsert_doc(
                SERVICE_PORTAL_DOCTYPE,
                match={"portal_name": portal_name},
                values=_pick(entry, portal_fields),
                child_tables={"tools": tool_rows},
                ctx=ctx,
                key=portal_name,
            )

    @staticmethod
    def _resolve_tool_field(
        field: str, raw_value: Any, ctx, portal_name: str, tool_index: int
    ) -> Any:
        """Resolve a single Service Portal Tool row field. Plain values pass
        through unchanged; `{"$ref": {"namespace": ..., "key": ...}}` values
        are resolved via `ctx.get_ref`, warning and returning None (meaning:
        omit this field) when unresolved."""
        if isinstance(raw_value, dict) and "$ref" in raw_value:
            ref = raw_value["$ref"] or {}
            namespace, ref_key = ref.get("namespace"), ref.get("key")
            resolved = ctx.get_ref(namespace, ref_key) if namespace and ref_key else None
            if resolved is None:
                ctx.warn(
                    f"portals.{portal_name}.tools[{tool_index}].{field}: "
                    f"could not resolve $ref {namespace}.{ref_key} "
                    f"(provider not registered, or key not published in this "
                    f"import) — field omitted"
                )
            return resolved
        return raw_value

    # ------------------------------------------------------------------
    # export_section
    # ------------------------------------------------------------------

    def export_section(self, ctx) -> dict[str, Any]:
        return {
            "external_links": self._export_external_links(),
            "quick_links": self._export_quick_links(),
            "announcements": self._export_announcements(),
            "announcement_sets": self._export_announcement_sets(),
            "tool_types": self._export_tool_types(),
            "settings": self._export_settings(),
            "portals": self._export_portals(getattr(ctx, "portal_name", None)),
        }

    def _export_external_links(self) -> list[dict]:
        fields = _exportable_fields(EXTERNAL_LINK_DOCTYPE)
        names = frappe.get_all(EXTERNAL_LINK_DOCTYPE, pluck="name", order_by="name asc")
        return [self._doc_as_dict(EXTERNAL_LINK_DOCTYPE, n, fields) for n in names]

    def _export_quick_links(self) -> list[dict]:
        fields = _exportable_fields(QUICK_LINKS_DOCTYPE, exclude=("links",))
        names = frappe.get_all(QUICK_LINKS_DOCTYPE, pluck="name", order_by="name asc")
        result = []
        for n in names:
            doc = frappe.get_doc(QUICK_LINKS_DOCTYPE, n)
            entry = self._doc_as_dict(QUICK_LINKS_DOCTYPE, n, fields, doc=doc)
            entry["links"] = [
                {
                    "external_link": row.external_link,
                    "display_order": row.display_order,
                    "is_enabled": row.is_enabled,
                }
                for row in doc.links
            ]
            result.append(entry)
        return result

    def _export_announcements(self) -> list[dict]:
        fields = _exportable_fields(ANNOUNCEMENT_DOCTYPE)
        names = frappe.get_all(ANNOUNCEMENT_DOCTYPE, pluck="name", order_by="name asc")
        return [self._doc_as_dict(ANNOUNCEMENT_DOCTYPE, n, fields) for n in names]

    def _export_announcement_sets(self) -> list[dict]:
        fields = _exportable_fields(ANNOUNCEMENT_SET_DOCTYPE, exclude=("announcements",))
        names = frappe.get_all(ANNOUNCEMENT_SET_DOCTYPE, pluck="name", order_by="name asc")
        result = []
        for n in names:
            doc = frappe.get_doc(ANNOUNCEMENT_SET_DOCTYPE, n)
            entry = self._doc_as_dict(ANNOUNCEMENT_SET_DOCTYPE, n, fields, doc=doc)
            entry["announcements"] = [
                {
                    "announcement": row.announcement,
                    "display_order": row.display_order,
                    "is_enabled": row.is_enabled,
                }
                for row in doc.announcements
            ]
            result.append(entry)
        return result

    def _export_tool_types(self) -> list[dict]:
        fields = _exportable_fields(TOOL_TYPE_DOCTYPE)
        names = frappe.get_all(TOOL_TYPE_DOCTYPE, pluck="name", order_by="name asc")
        return [self._doc_as_dict(TOOL_TYPE_DOCTYPE, n, fields) for n in names]

    def _export_settings(self) -> dict[str, Any]:
        fields = _exportable_fields(SETTINGS_DOCTYPE)
        doc = frappe.get_single(SETTINGS_DOCTYPE)
        return {f: doc.get(f) for f in fields}

    def _export_portals(self, portal_name: str | None) -> list[dict]:
        portal_fields = _exportable_fields(SERVICE_PORTAL_DOCTYPE, exclude=("tools",))
        tool_fields = _exportable_fields("Service Portal Tool")

        filters = {"portal_name": portal_name} if portal_name else {}
        names = frappe.get_all(SERVICE_PORTAL_DOCTYPE, filters=filters, pluck="name", order_by="name asc")

        result = []
        for n in names:
            doc = frappe.get_doc(SERVICE_PORTAL_DOCTYPE, n)
            entry = self._doc_as_dict(SERVICE_PORTAL_DOCTYPE, n, portal_fields, doc=doc)
            entry["tools"] = [
                {f: row.get(f) for f in tool_fields if row.get(f) not in (None, "")}
                for row in doc.tools
            ]
            result.append(entry)
        return result

    @staticmethod
    def _doc_as_dict(doctype: str, name: str, fields: list[str], doc=None) -> dict:
        doc = doc or frappe.get_doc(doctype, name)
        return {f: doc.get(f) for f in fields}

    # ------------------------------------------------------------------
    # describe_schema
    # ------------------------------------------------------------------

    def describe_schema(self) -> dict[str, Any]:
        return {
            "external_links": {
                "type": "list",
                "doctype": EXTERNAL_LINK_DOCTYPE,
                "match_on": ["title"],
                "description": "Quick-access external/internal links surfaced "
                "as portal tools or inside quick-link groups.",
                "fields": {
                    "title": "Data, required, unique — also the natural docname.",
                    "label": "Data, required — button/link text.",
                    "url": "Data (URL), required.",
                    "target": "Select ['_blank', '_self'], required.",
                    "icon": "Select — lucide icon name.",
                    "image": "Attach Image — overrides icon if set.",
                    "color": "Color.",
                    "description": "Small Text.",
                    "is_active": "Check.",
                },
                "publishes_ref": {"namespace": REF_NS_EXTERNAL_LINK, "key": "title"},
            },
            "quick_links": {
                "type": "list",
                "doctype": QUICK_LINKS_DOCTYPE,
                "match_on": ["link_group_name"],
                "description": "Groups of external links shown together "
                "(e.g. under a 'quick_link' or 'portal_quick_links' tool).",
                "fields": {
                    "link_group_name": "Data, required, unique — natural docname.",
                    "icon": "Select — lucide icon name.",
                    "image": "Attach Image.",
                    "description": "Small Text.",
                    "is_active": "Check.",
                    "links": "list[{external_link: <External Link title>, "
                    "display_order: int, is_enabled: 0|1}]",
                },
                "publishes_ref": {"namespace": REF_NS_QUICK_LINKS, "key": "link_group_name"},
            },
            "announcements": {
                "type": "list",
                "doctype": ANNOUNCEMENT_DOCTYPE,
                "match_on": ["title"],
                "description": "Single announcement (banner/card) content.",
                "fields": {
                    "title": "Data, required, unique — natural docname.",
                    "content_type": "Select ['image','text','html'], required.",
                    "is_active": "Check.",
                    "announcement_type": "Select ['info','promo','alert','event'].",
                    "valid_from": "Date.",
                    "valid_to": "Date.",
                    "image": "Attach Image (content_type='image').",
                    "heading": "Data (content_type='text').",
                    "body": "Small Text (content_type='text').",
                    "html_content": "HTML Editor (content_type='html').",
                    "cta_url": "Data (URL).",
                    "cta_target": "Select ['_blank', '_self'].",
                },
                "publishes_ref": {"namespace": REF_NS_ANNOUNCEMENT, "key": "title"},
            },
            "announcement_sets": {
                "type": "list",
                "doctype": ANNOUNCEMENT_SET_DOCTYPE,
                "match_on": ["title"],
                "description": "Ordered collection of announcements, "
                "assignable to a portal's left/bottom/right announcement slot.",
                "fields": {
                    "title": "Data, required, unique — natural docname.",
                    "is_active": "Check.",
                    "description": "Small Text.",
                    "announcements": "list[{announcement: <Announcement title>, "
                    "display_order: int, is_enabled: 0|1}]",
                },
                "publishes_ref": {"namespace": REF_NS_ANNOUNCEMENT_SET, "key": "title"},
            },
            "tool_types": {
                "type": "list",
                "doctype": TOOL_TYPE_DOCTYPE,
                "match_on": ["tool_name"],
                "description": "Catalog of tool types selectable on a portal's "
                "tools table. Usually seeded via each app's fixtures, not "
                "this section — only needed here for custom/ad-hoc tool types.",
                "fields": {
                    "tool_name": "Data, required, unique — natural docname, snake_case.",
                    "tool_label": "Data, required — admin-facing label.",
                    "app_name": "Data, required — owning Frappe app.",
                    "icon": "Select — lucide icon name.",
                    "description": "Small Text.",
                    "is_active": "Check.",
                },
                "publishes_ref": {"namespace": REF_NS_TOOL_TYPE, "key": "tool_name"},
            },
            "settings": {
                "type": "single",
                "doctype": SETTINGS_DOCTYPE,
                "description": "Non-sensitive site-wide voice/AI/hub flags. "
                "Password-type fields (e.g. hub_shared_secret) are NEVER "
                "read or written through this framework — filtered out "
                "automatically by fieldtype.",
                "fields": {
                    "enable_voice_assistant": "Check.",
                    "voice_assistant_name": "Data.",
                    "voice_assistant_gender": "Select ['female','male'].",
                    "voice_assistant_language": "Select ['es-ES','es-CO','es-MX','en-US'].",
                    "enable_voice_assistant_ai": "Check.",
                    "voice_assistant_ai_configuration": "Link -> AI Configuration "
                    "(reference only, not the API key itself).",
                    "tenant_hub_url": "Data (URL).",
                },
            },
            "portals": {
                "type": "list",
                "doctype": SERVICE_PORTAL_DOCTYPE,
                "match_on": ["portal_name"],
                "description": "A citizen-facing Service Portal and its tools.",
                "fields": {
                    "portal_name": "Data, required, unique — natural docname.",
                    "title": "Data, required.",
                    "description": "Small Text.",
                    "is_active": "Check.",
                    "is_internal": "Check.",
                    "require_auth": "Check.",
                    "enable_mfa_otp": "Check.",
                    "registration_title": "Data.",
                    "registration_description": "Small Text.",
                    "primary_color": "Color.",
                    "secondary_color": "Color.",
                    "logo": "Attach Image.",
                    "background_image": "Attach Image.",
                    "custom_css": "HTML Editor (raw CSS).",
                    "announcement_set_left": "Link -> Announcement Set.",
                    "announcement_set_bottom": "Link -> Announcement Set.",
                    "announcement_set_right": "Link -> Announcement Set.",
                    "announcement_rotation_seconds": "Int.",
                    "tools": "list[tool row] — see 'tool_row_schema' below.",
                },
                "tool_row_schema": {
                    "description": "Each row of portals[].tools[]. Rebuilt "
                    "from scratch on every import (idempotent — no orphan "
                    "rows). Known fields shown below; ANY other field that "
                    "exists on the 'Service Portal Tool' doctype (including "
                    "custom fields added by other apps, e.g. "
                    "'calendar_resource') is also accepted the same way.",
                    "tool_type": "Link -> Tool Type, required.",
                    "label": "Data, required.",
                    "tool_description": "Small Text.",
                    "icon": "Select — lucide icon name (overrides Tool Type's).",
                    "tool_image": "Attach Image.",
                    "button_color": "Color.",
                    "display_order": "Int.",
                    "is_enabled": "Check.",
                    "target_portal": "Link -> Service Portal "
                    "(tool_type='portal_redirect'). Plain value = portal_name.",
                    "quick_links": "Link -> Portal Quick Links "
                    "(tool_type='portal_quick_links'). Plain value = link_group_name.",
                    "quick_link_external": "Link -> External Link "
                    "(tool_type='quick_link'). Plain value = title.",
                    "<any other field>": "For config owned by ANOTHER module's "
                    "provider (e.g. logbook's 'procedures' tool type), use "
                    '`{"$ref": {"namespace": "<app>.<concept>", "key": "<key>"}}` '
                    "instead of a plain value — resolved via ctx.get_ref against "
                    "refs that provider published via ctx.set_ref in the SAME "
                    "import call. Unresolved refs are dropped with a warning, "
                    "not a hard failure.",
                },
            },
        }
