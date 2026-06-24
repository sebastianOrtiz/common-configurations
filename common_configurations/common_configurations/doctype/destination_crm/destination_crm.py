"""
Destination CRM

Represents a remote Frappe site that hosts one or more Tenant Portals
indexed by the central Hub. Holds the base URL, branding and the shared
secret used to sign SSO redirects so the destination can trust them.

The shared secret follows the "show once" pattern: it's auto-generated
on creation and on regeneration, surfaced to the admin via a Frappe
modal exactly once, then stored encrypted (Password field, read-only).
"""

import secrets

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import escape_html


class DestinationCRM(Document):
    def before_insert(self):
        if not self.get("hub_shared_secret"):
            self.hub_shared_secret = secrets.token_urlsafe(48)

    def after_insert(self):
        secret = self.get_password("hub_shared_secret", raise_exception=False)
        if secret:
            _show_secret_to_admin(secret, regenerated=False)

    def validate(self):
        if self.base_url:
            self.base_url = self.base_url.rstrip("/")
            if not (self.base_url.startswith("http://") or self.base_url.startswith("https://")):
                frappe.throw(_("Base URL must start with http:// or https://"))

    @frappe.whitelist()
    def regenerate_hub_shared_secret(self):
        """Rotate the shared secret. Returns nothing; the new value is
        revealed to the admin via a server-side msgprint modal."""
        new_secret = secrets.token_urlsafe(48)
        self.hub_shared_secret = new_secret
        self.save(ignore_permissions=True)
        _show_secret_to_admin(new_secret, regenerated=True)


def _show_secret_to_admin(secret: str, regenerated: bool = False) -> None:
    title = _("Hub Shared Secret — Regenerated") if regenerated else _("Hub Shared Secret — Created")
    note = _("Copy this value now. It will not be shown again.")
    target_hint = _("Paste it into the destination site → Common Configurations Settings → hub_shared_secret.")
    html = (
        f"<p>{note}</p>"
        f"<pre style='user-select: all; padding: .75rem; background: #f7fafc; "
        f"border: 1px solid #e2e8f0; border-radius: .5rem; word-break: break-all; "
        f"font-family: monospace; font-size: .85rem; margin: .75rem 0;'>"
        f"{escape_html(secret)}"
        f"</pre>"
        f"<p style='color:#64748b; font-size:.85rem;'>{target_hint}</p>"
    )
    frappe.msgprint(msg=html, title=title, indicator="orange", wide=True)
