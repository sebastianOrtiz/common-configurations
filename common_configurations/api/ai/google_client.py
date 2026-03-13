"""
Google Generative AI Client

Handles chat/completions via the official google-generativeai Python SDK.
"""

from typing import Optional

import frappe
from frappe import _

from .client_factory import AIClient, register_ai_provider


@register_ai_provider("Google")
class GoogleClient(AIClient):
	"""Google Generative AI chat client."""

	def __init__(self, config_doc) -> None:
		super().__init__(config_doc)
		self._client = None

	@property
	def client(self):
		"""Lazy initialization of Google Generative AI client."""
		if self._client is None:
			import google.generativeai as genai

			genai.configure(api_key=self.api_key)
			self._client = genai.GenerativeModel(
				model_name=self.model,
				system_instruction=self.default_system_prompt or None,
			)
		return self._client

	def chat(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
		"""Send a generate_content request to Google."""
		generation_config = {
			"temperature": kwargs.get("temperature", self.temperature),
			"max_output_tokens": kwargs.get("max_tokens", self.max_tokens),
		}

		try:
			if system_prompt and system_prompt != self.default_system_prompt:
				import google.generativeai as genai

				temp_model = genai.GenerativeModel(
					model_name=self.model,
					system_instruction=system_prompt,
				)
				response = temp_model.generate_content(prompt, generation_config=generation_config)
			else:
				response = self.client.generate_content(prompt, generation_config=generation_config)

			return response.text or ""
		except Exception as e:
			frappe.log_error(
				title="Google AI API Error",
				message=f"Config: {self.config_name}, Error: {e}",
			)
			frappe.throw(_("Error calling Google AI API: {0}").format(str(e)))
