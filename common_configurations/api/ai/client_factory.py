"""
AI Client Factory

Returns the appropriate AI client based on an AI Configuration document.
Adding a new provider only requires:
  1. Creating a new client file (e.g. mistral_client.py)
  2. Decorating the class with @register_ai_provider("Mistral")
  3. Creating an AI Provider record with the provider name
"""

from abc import ABC, abstractmethod
from typing import Optional

import frappe
from frappe import _


_AI_PROVIDERS: dict = {}


def register_ai_provider(name: str):
	"""Decorator to register an AI client class under a provider name."""

	def decorator(cls):
		_AI_PROVIDERS[name] = cls
		return cls

	return decorator


class AIClient(ABC):
	"""Base class for all AI provider clients."""

	def __init__(self, config_doc) -> None:
		self.config_name = config_doc.config_name
		self.model = config_doc.model
		self.api_key = config_doc.get_password("api_key")
		self.api_url = config_doc.api_url or None
		self.temperature = config_doc.temperature if config_doc.temperature is not None else 0.7
		self.max_tokens = config_doc.max_tokens or 4096
		self.default_system_prompt = config_doc.default_system_prompt or None

	@abstractmethod
	def chat(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
		"""
		Send a chat/completion request and return the response text.

		Args:
			prompt: The user message/prompt.
			system_prompt: Optional system prompt. If None, uses the default
				from the configuration.
			**kwargs: Additional parameters (temperature, max_tokens overrides).

		Returns:
			The AI-generated response as a string.
		"""
		...


def get_ai_client(config_name: str) -> AIClient:
	"""
	Return an instance of the AI client for the given configuration.

	Args:
		config_name: The name of the AI Configuration document.

	Returns:
		An AIClient instance with a .chat() method.

	Raises:
		frappe.ValidationError: If config not found, not active, or provider not supported.

	Usage:
		from common_configurations.api.ai import get_ai_client

		client = get_ai_client("My OpenAI Config")
		result = client.chat("Translate: Hola mundo")
	"""
	# Import providers so their decorators run
	from . import openai_client  # noqa: F401
	from . import anthropic_client  # noqa: F401
	from . import google_client  # noqa: F401

	if not frappe.db.exists("AI Configuration", config_name):
		frappe.throw(_("AI Configuration '{0}' not found").format(config_name))

	config_doc = frappe.get_doc("AI Configuration", config_name)

	if not config_doc.is_active:
		frappe.throw(_("AI Configuration '{0}' is not active").format(config_name))

	provider = config_doc.provider
	client_class = _AI_PROVIDERS.get(provider)

	if not client_class:
		frappe.throw(
			_("AI provider '{0}' has no registered implementation. Available: {1}").format(
				provider, ", ".join(_AI_PROVIDERS.keys())
			)
		)

	return client_class(config_doc)
