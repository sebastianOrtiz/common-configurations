"""
OTP Domain API

Endpoints for OTP verification via SMS/WhatsApp.
"""

from .endpoints import (
	get_otp_settings,
	request_otp,
	verify_otp,
	is_otp_enabled,
	request_registration_otp,
	verify_registration_otp,
	resend_registration_otp,
	cancel_registration,
)
from .service import OTPService
from .twilio_client import TwilioClient

__all__ = [
	# Existing user OTP
	"get_otp_settings",
	"request_otp",
	"verify_otp",
	"is_otp_enabled",
	# Registration OTP
	"request_registration_otp",
	"verify_registration_otp",
	"resend_registration_otp",
	"cancel_registration",
	# Classes
	"OTPService",
	"TwilioClient",
]
