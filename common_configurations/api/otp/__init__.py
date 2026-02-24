"""
OTP Domain API

Endpoints for OTP verification via SMS.
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
from .client_factory import get_sms_client

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
	# Classes / factories
	"OTPService",
	"get_sms_client",
]
