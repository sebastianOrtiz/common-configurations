# Copyright (c) 2026, Sebastian Ortiz Valencia and contributors
# For license information, please see license.txt

"""
Shared Email Helper

Provides a safe wrapper around frappe.sendmail with outgoing email
validation and error handling. Use this instead of calling
frappe.sendmail directly to avoid repeating boilerplate checks.
"""

import frappe
from frappe import _
from typing import List, Optional, Union


def has_outgoing_email() -> bool:
	"""Return True if at least one outgoing Email Account is configured in Frappe."""
	return bool(frappe.db.count("Email Account", {"enable_outgoing": 1}))


def send_email(
	recipients: Union[str, List[str]],
	subject: str,
	template: Optional[str] = None,
	args: Optional[dict] = None,
	message: Optional[str] = None,
	reference_doctype: Optional[str] = None,
	reference_name: Optional[str] = None,
	log_title: str = "Email Send Failed",
) -> bool:
	"""
	Send an email with automatic outgoing validation and error handling.

	Args:
		recipients: Email address(es) to send to
		subject: Email subject line
		template: Frappe email template name (without .html)
		args: Template variables dict
		message: Raw HTML message (alternative to template)
		reference_doctype: DocType for email linking
		reference_name: Document name for email linking
		log_title: Title for error log entries if sending fails

	Returns:
		True if email was sent successfully, False otherwise
	"""
	if not has_outgoing_email():
		frappe.logger().warning(
			f"Email skipped ({log_title}): no outgoing Email Account configured."
		)
		return False

	# Normalize recipients
	if isinstance(recipients, str):
		recipients = [recipients]

	recipients = [r for r in recipients if r]

	if not recipients:
		frappe.logger().info(f"Email skipped ({log_title}): no recipients.")
		return False

	if not template and not message:
		frappe.logger().warning(f"Email skipped ({log_title}): no template or message provided.")
		return False

	try:
		kwargs = {
			"recipients": recipients,
			"subject": subject,
		}

		if template:
			kwargs["template"] = template
			kwargs["args"] = args or {}
		else:
			kwargs["message"] = message

		if reference_doctype:
			kwargs["reference_doctype"] = reference_doctype
		if reference_name:
			kwargs["reference_name"] = reference_name

		frappe.sendmail(**kwargs)

		frappe.logger().info(
			f"Email sent ({log_title}): {subject} -> {recipients}"
		)
		return True

	except Exception as e:
		frappe.log_error(
			message=f"Failed to send email: {str(e)}\nRecipients: {recipients}\nSubject: {subject}",
			title=log_title,
		)
		return False
