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

		def _stream_final(kw):
			# Stream and take the final message: the SDK refuses non-streaming
			# requests it estimates could exceed ~10 minutes (large max_tokens),
			# raising "Streaming is required...". Streaming avoids that guard and
			# the request timeout, per Anthropic's long-requests guidance.
			with self.client.messages.stream(**kw) as stream:
				return stream.get_final_message()

		import re

		try:
			response = None
			# Self-heal known recoverable 400s (bad temperature / oversized
			# max_tokens) by adjusting the payload and retrying, instead of
			# failing the whole call. Bounded to a few attempts.
			for _ in range(3):
				try:
					response = _stream_final(call_kwargs)
					break
				except Exception as inner:
					msg = str(inner).lower()
					# Newer models (Sonnet 5, Opus 5, ...) reject `temperature`.
					if "temperature" in call_kwargs and "temperature" in msg:
						call_kwargs.pop("temperature", None)
						continue
					# max_tokens above the model's output ceiling: clamp to the
					# limit the API reports ("... > 128000, which is the maximum").
					limit = re.search(r">\s*(\d+)", str(inner))
					if "max_tokens" in msg and limit:
						call_kwargs["max_tokens"] = int(limit.group(1))
						continue
					raise
			if response is None:
				raise Exception("Anthropic request failed after retries")
			# Return the first text block (skip thinking/tool blocks).
			for block in response.content:
				if getattr(block, "type", None) == "text":
					return block.text
			return ""
		except Exception as e:
			frappe.log_error(
				title="Anthropic API Error",
				message=f"Config: {self.config_name}, Error: {e}",
			)
			frappe.throw(_("Error calling Anthropic API: {0}").format(str(e)))
