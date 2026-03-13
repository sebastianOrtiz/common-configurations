"""
OpenAI Client

Handles chat/completions via the official OpenAI Python SDK.
Also supports Azure OpenAI via the api_url field.
"""

from typing import Optional

import frappe
from frappe import _

from .client_factory import AIClient, register_ai_provider


@register_ai_provider("OpenAI")
class OpenAIClient(AIClient):
	"""OpenAI chat/completions client."""

	def __init__(self, config_doc) -> None:
		super().__init__(config_doc)
		self._client = None

	@property
	def client(self):
		"""Lazy initialization of OpenAI client."""
		if self._client is None:
			from openai import OpenAI

			kwargs = {"api_key": self.api_key}
			if self.api_url:
				kwargs["base_url"] = self.api_url

			self._client = OpenAI(**kwargs)
		return self._client

	def chat(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
		"""Send a chat completion request to OpenAI."""
		system = system_prompt or self.default_system_prompt
		messages = []
		if system:
			messages.append({"role": "system", "content": system})
		messages.append({"role": "user", "content": prompt})

		try:
			response = self.client.chat.completions.create(
				model=self.model,
				messages=messages,
				temperature=kwargs.get("temperature", self.temperature),
				max_tokens=kwargs.get("max_tokens", self.max_tokens),
			)
			return response.choices[0].message.content or ""
		except Exception as e:
			frappe.log_error(
				title="OpenAI API Error",
				message=f"Config: {self.config_name}, Error: {e}",
			)
			frappe.throw(_("Error calling OpenAI API: {0}").format(str(e)))
