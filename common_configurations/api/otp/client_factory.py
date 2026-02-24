"""
SMS Client Factory

Returns the appropriate SMS client based on the SMS Provider linked in OTP Settings.
Adding a new provider only requires:
  1. Creating a new client class (e.g. twilio_client.py)
  2. Decorating it with @register_provider("Twilio")
  3. Adding "Twilio" as an option in SMS Provider DocType's provider_type field
"""

import frappe
from frappe import _


_PROVIDERS: dict = {}


def register_provider(name: str):
	"""Decorator to register an SMS client class under a provider name."""
	def decorator(cls):
		_PROVIDERS[name] = cls
		return cls
	return decorator


def get_sms_client():
	"""
	Return an instance of the SMS client for the currently configured provider.

	Reads the SMS Provider document linked in OTP Settings and passes it
	to the client constructor.

	Returns:
		An SMS client instance with a send_sms(phone_number, otp_code) method.

	Raises:
		frappe.ValidationError if the provider is not supported or not configured.
	"""
	from common_configurations.common_configurations.doctype.otp_settings.otp_settings import OTPSettings

	# Import providers so their @register_provider decorators run
	from . import infobip_client  # noqa: F401

	settings = OTPSettings.get_settings()

	if not settings.sms_provider_link:
		frappe.throw(_("No hay un SMS Provider configurado en OTP Settings"))

	provider_doc = frappe.get_doc("SMS Provider", settings.sms_provider_link)

	if not provider_doc.is_active:
		frappe.throw(
			_("El SMS Provider '{0}' no está activo").format(provider_doc.provider_name)
		)

	provider_type = provider_doc.provider_type
	client_class = _PROVIDERS.get(provider_type)

	if not client_class:
		frappe.throw(
			_("Proveedor SMS '{0}' no tiene una implementación registrada. "
			  "Disponibles: {1}").format(provider_type, ", ".join(_PROVIDERS.keys()))
		)

	return client_class(provider_doc)
