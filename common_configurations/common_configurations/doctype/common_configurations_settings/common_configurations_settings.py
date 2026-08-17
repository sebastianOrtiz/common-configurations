# Copyright (c) 2026, Nexora Online SAS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from typing import List


class CommonConfigurationsSettings(Document):
	def validate(self):
		self._validate_voice_assistant_ai()

	def _validate_voice_assistant_ai(self):
		"""
		If AI mode is enabled, the linked AI Configuration must be fully usable:
		- General Voice Assistant flag must also be enabled
		- AI Configuration must exist, be active and have provider, model and API key
		- AI Provider must be active
		"""
		if not self.enable_voice_assistant_ai:
			return

		if not self.enable_voice_assistant:
			frappe.throw(
				_("Habilita primero el Asistente de Voz antes de activar el Modo IA")
			)

		if not self.voice_assistant_ai_configuration:
			frappe.throw(
				_("Debes seleccionar una Configuración de IA para activar el Modo IA")
			)

		issues = validate_ai_configuration(self.voice_assistant_ai_configuration)
		if issues:
			frappe.throw(
				_("La Configuración de IA seleccionada no es válida:") + "<br>• " + "<br>• ".join(issues)
			)


def validate_ai_configuration(config_name: str) -> List[str]:
	"""
	Returns a list of issues (empty if valid) for a given AI Configuration name.
	Used both in validate() and the public diagnostic endpoint.
	"""
	issues: List[str] = []

	if not frappe.db.exists("AI Configuration", config_name):
		issues.append(_("La Configuración de IA '{0}' no existe").format(config_name))
		return issues

	ai = frappe.get_doc("AI Configuration", config_name)

	if not ai.is_active:
		issues.append(_("La Configuración de IA '{0}' no está activa").format(ai.config_name))

	if not ai.provider:
		issues.append(
			_("La Configuración de IA '{0}' no tiene Proveedor configurado").format(ai.config_name)
		)
	else:
		# AI Provider has no "is_active" flag (only a name, description and models);
		# just ensure it exists. The active/inactive concept lives on the AI
		# Configuration itself (its `is_active`, already checked above).
		if not frappe.db.exists("AI Provider", ai.provider):
			issues.append(_("El Proveedor '{0}' no existe").format(ai.provider))

	if not ai.model:
		issues.append(
			_("La Configuración de IA '{0}' no tiene Modelo configurado").format(ai.config_name)
		)

	try:
		api_key = ai.get_password("api_key", raise_exception=False)
	except Exception:
		api_key = None

	if not api_key:
		issues.append(
			_("La Configuración de IA '{0}' no tiene API Key configurada").format(ai.config_name)
		)

	return issues
