"""
Infobip Client for OTP SMS

Handles sending OTP messages via Infobip SMS API.
Registered as provider "Infobip" via @register_provider decorator.
"""

import frappe
from frappe import _
from infobip_api_client.api_client import ApiClient, Configuration
from infobip_api_client.api.sms_api import SmsApi
from infobip_api_client.models import (
	SmsRequest,
	SmsMessage,
	SmsMessageContent,
	SmsTextContent,
	SmsDestination,
)
from infobip_api_client.exceptions import ApiException

from .client_factory import register_provider


@register_provider("Infobip")
class InfobipClient:
	"""Infobip SMS client for sending OTP messages."""

	def __init__(self, provider_doc: "Document") -> None:
		"""
		Initialize Infobip client from an SMS Provider document.

		Args:
			provider_doc: Document instance of SMS Provider DocType
		"""
		from common_configurations.common_configurations.doctype.otp_settings.otp_settings import OTPSettings

		settings = OTPSettings.get_settings()

		if not settings.enable_otp_verification:
			frappe.throw(_("OTP verification is not enabled"))

		# Credentials come from SMS Provider document
		self.base_url = provider_doc.api_url
		self.api_key = provider_doc.get_password("api_key")
		self.sender = provider_doc.sender_id or "InfoSMS"

		# Behavior settings come from OTP Settings
		self.sms_template = settings.sms_message_template or "Tu código de verificación es: {otp}"
		self.expiry_minutes = settings.otp_expiry_minutes or 5

		if not self.base_url or not self.api_key:
			frappe.throw(
				_("Las credenciales del proveedor '{0}' no están completas. "
				  "Verifique API URL y API Key.").format(provider_doc.provider_name)
			)

		self._client = None

	@property
	def client(self) -> SmsApi:
		"""Lazy initialization of Infobip SmsApi client."""
		if self._client is None:
			config = Configuration(
				host=self.base_url,
				api_key={"APIKeyHeader": self.api_key},
				api_key_prefix={"APIKeyHeader": "App"},
			)
			self._client = SmsApi(ApiClient(config))
		return self._client

	def send_sms(self, phone_number: str, otp_code: str) -> dict:
		"""
		Send OTP via SMS.

		Args:
			phone_number: Recipient phone number (E.164 format, e.g. +573001234567)
			otp_code: The OTP code to send

		Returns:
			dict with success and message_id
		"""
		message_body = self.sms_template.format(otp=otp_code, minutes=self.expiry_minutes)

		sms_request = SmsRequest(
			messages=[
				SmsMessage(
					destinations=[SmsDestination(to=phone_number)],
					sender=self.sender,
					content=SmsMessageContent(
						actual_instance=SmsTextContent(text=message_body)
					),
				)
			]
		)

		try:
			response = self.client.send_sms_messages(sms_request=sms_request)
			message_id = None
			if response.messages:
				message_id = response.messages[0].message_id
			return {
				"success": True,
				"message_id": message_id,
				"bulk_id": response.bulk_id,
			}
		except ApiException as e:
			frappe.log_error(
				title="Infobip SMS Error",
				message=f"Failed to send SMS to {phone_number}: {e}",
			)
			frappe.throw(_("Failed to send SMS. Please try again later."))
