"""
Anthropic Client

Handles chat/completions via the official Anthropic Python SDK.
"""

from typing import Optional

import frappe
from frappe import _

from .client_factory import AIClient, register_ai_provider


@register_ai_provider("Anthropic")
class AnthropicClient(AIClient):
	"""Anthropic chat/completions client."""

	def __init__(self, config_doc) -> None:
		super().__init__(config_doc)
		self._client = None

	@property
	def client(self):
		"""Lazy initialization of Anthropic client."""
		if self._client is None:
			from anthropic import Anthropic

			self._client = Anthropic(api_key=self.api_key)
		return self._client

	def chat(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
		"""Send a message to Anthropic."""
		system = system_prompt or self.default_system_prompt

		call_kwargs = {
			"model": self.model,
			"max_tokens": kwargs.get("max_tokens", self.max_tokens),
			"messages": [{"role": "user", "content": prompt}],
		}
		if system:
			call_kwargs["system"] = system

		temperature = kwargs.get("temperature", self.temperature)
		if temperature is not None:
			call_kwargs["temperature"] = temperature

		try:
			response = self.client.messages.create(**call_kwargs)
			return response.content[0].text if response.content else ""
		except Exception as e:
			frappe.log_error(
				title="Anthropic API Error",
				message=f"Config: {self.config_name}, Error: {e}",
			)
			frappe.throw(_("Error calling Anthropic API: {0}").format(str(e)))
