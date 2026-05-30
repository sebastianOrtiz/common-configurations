"""
Common Configurations Settings - Public API

Exposes only the public feature flags and configuration the frontend needs.
Sensitive data (API keys, tokens) is NEVER exposed here.
"""

import frappe
from frappe import _
from typing import Dict, Any

from common_configurations.api.shared import check_rate_limit


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_public_settings() -> Dict[str, Any]:
	"""
	Get public feature flags and configuration used by the Service Portal frontend.

	Public endpoint (allow_guest) — the citizen may not be logged in yet.
	Returns ONLY public flags; never exposes API keys or sensitive data.

	Returns:
		{
			"voice_assistant": {
				"enabled": bool,
				"ai_enabled": bool,
				"name": str,
				"language": str
			}
		}
	"""
	check_rate_limit("settings_get_public", limit=120, seconds=60)

	settings = frappe.get_cached_doc("Common Configurations Settings")

	# AI mode is only "really" enabled if both flags are set AND the AI Configuration is valid.
	ai_enabled = False
	if settings.enable_voice_assistant and settings.enable_voice_assistant_ai:
		from common_configurations.common_configurations.doctype.common_configurations_settings.common_configurations_settings import (
			validate_ai_configuration,
		)
		if settings.voice_assistant_ai_configuration:
			issues = validate_ai_configuration(settings.voice_assistant_ai_configuration)
			ai_enabled = not issues

	return {
		"voice_assistant": {
			"enabled": bool(settings.enable_voice_assistant),
			"ai_enabled": ai_enabled,
			"name": settings.voice_assistant_name or "Asistente",
			"language": settings.voice_assistant_language or "es-ES",
			"gender": settings.voice_assistant_gender or "female",
		}
	}


@frappe.whitelist(methods=["GET"])
def diagnose_voice_assistant_ai() -> Dict[str, Any]:
	"""
	Diagnostic endpoint for admins to verify their AI Configuration is valid
	BEFORE saving the Settings. Reports each issue separately.

	Requires authenticated Frappe user (not public).

	Returns:
		{"valid": bool, "issues": [str, ...]}
	"""
	if "System Manager" not in frappe.get_roles() and "Common Config Manager" not in frappe.get_roles():
		frappe.throw(_("Not authorized"), frappe.PermissionError)

	settings = frappe.get_doc("Common Configurations Settings")

	if not settings.enable_voice_assistant_ai:
		return {
			"valid": False,
			"issues": [_("El Modo IA está desactivado en la configuración")],
		}

	if not settings.voice_assistant_ai_configuration:
		return {
			"valid": False,
			"issues": [_("No hay Configuración de IA seleccionada")],
		}

	from common_configurations.common_configurations.doctype.common_configurations_settings.common_configurations_settings import (
		validate_ai_configuration,
	)

	issues = validate_ai_configuration(settings.voice_assistant_ai_configuration)
	return {
		"valid": not issues,
		"issues": issues,
	}
