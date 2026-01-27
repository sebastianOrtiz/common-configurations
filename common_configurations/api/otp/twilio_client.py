"""
Twilio Client for OTP SMS/WhatsApp

Handles sending OTP messages via Twilio API.
"""

import frappe
from frappe import _
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException


class TwilioClient:
	"""Twilio client for sending OTP messages."""

	def __init__(self) -> None:
		"""Initialize Twilio client with settings from OTP Settings DocType."""
		from common_configurations.common_configurations.doctype.otp_settings.otp_settings import OTPSettings

		settings = OTPSettings.get_settings()

		if not settings.enable_otp_verification:
			frappe.throw(_("OTP verification is not enabled"))

		self.account_sid = settings.twilio_account_sid
		self.auth_token = settings.get_password("twilio_auth_token")
		self.sms_number = settings.twilio_phone_number
		self.whatsapp_number = settings.twilio_whatsapp_number
		self.sms_template = settings.sms_message_template or "Tu código de verificación es: {otp}"
		self.whatsapp_template = settings.whatsapp_message_template or "Tu código de verificación es: {otp}"
		self.expiry_minutes = settings.otp_expiry_minutes or 5

		if not self.account_sid or not self.auth_token:
			frappe.throw(_("Twilio credentials are not configured"))

		self._client = None

	@property
	def client(self) -> Client:
		"""Lazy initialization of Twilio client."""
		if self._client is None:
			self._client = Client(self.account_sid, self.auth_token)
		return self._client

	def send_sms(self, phone_number: str, otp_code: str) -> dict:
		"""
		Send OTP via SMS.

		Args:
			phone_number: Recipient phone number (E.164 format)
			otp_code: The OTP code to send

		Returns:
			dict with status and message_sid
		"""
		if not self.sms_number:
			frappe.throw(_("SMS phone number is not configured in OTP Settings"))

		message_body = self.sms_template.format(otp=otp_code, minutes=self.expiry_minutes)

		try:
			message = self.client.messages.create(
				body=message_body,
				from_=self.sms_number,
				to=phone_number,
			)
			return {
				"success": True,
				"message_sid": message.sid,
				"status": message.status,
			}
		except TwilioRestException as e:
			frappe.log_error(
				title="Twilio SMS Error",
				message=f"Failed to send SMS to {phone_number}: {e.msg}",
			)
			frappe.throw(_("Failed to send SMS. Please try again later."))

	def send_whatsapp(self, phone_number: str, otp_code: str) -> dict:
		"""
		Send OTP via WhatsApp.

		Args:
			phone_number: Recipient phone number (E.164 format)
			otp_code: The OTP code to send

		Returns:
			dict with status and message_sid
		"""
		if not self.whatsapp_number:
			frappe.throw(_("WhatsApp number is not configured in OTP Settings"))

		message_body = self.whatsapp_template.format(otp=otp_code, minutes=self.expiry_minutes)

		# WhatsApp requires "whatsapp:" prefix
		whatsapp_from = f"whatsapp:{self.whatsapp_number}"
		whatsapp_to = f"whatsapp:{phone_number}"

		try:
			message = self.client.messages.create(
				body=message_body,
				from_=whatsapp_from,
				to=whatsapp_to,
			)
			return {
				"success": True,
				"message_sid": message.sid,
				"status": message.status,
			}
		except TwilioRestException as e:
			frappe.log_error(
				title="Twilio WhatsApp Error",
				message=f"Failed to send WhatsApp to {phone_number}: {e.msg}",
			)
			frappe.throw(_("Failed to send WhatsApp message. Please try again later."))

	def send_otp(self, phone_number: str, otp_code: str, channel: str = "sms") -> dict:
		"""
		Send OTP via specified channel.

		Args:
			phone_number: Recipient phone number (E.164 format)
			otp_code: The OTP code to send
			channel: "sms" or "whatsapp"

		Returns:
			dict with status and message_sid
		"""
		if channel == "whatsapp":
			return self.send_whatsapp(phone_number, otp_code)
		return self.send_sms(phone_number, otp_code)
