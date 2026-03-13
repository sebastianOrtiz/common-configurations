// Copyright (c) 2026, Sebastian Ortiz Valencia and contributors
// For license information, please see license.txt

frappe.ui.form.on("AI Configuration", {
	refresh(frm) {
		frm.trigger("show_api_key_guide");
		frm.trigger("setup_model_filter");

		if (!frm.is_new()) {
			frm.add_custom_button(__("Test Connection"), function () {
				frappe.call({
					method: "test_connection",
					doc: frm.doc,
					freeze: true,
					freeze_message: __("Testing connection..."),
					callback: function (r) {
						if (r.message && r.message.success) {
							frappe.msgprint({
								title: __("Success"),
								message: __("Connection successful. Response: ") + r.message.response,
								indicator: "green",
							});
						} else {
							frappe.msgprint({
								title: __("Error"),
								message:
									__("Connection failed: ") +
									((r.message && r.message.error) || "Unknown error"),
								indicator: "red",
							});
						}
					},
				});
			});
		}
	},

	provider(frm) {
		if (!frm.doc.provider) {
			frm.set_value("model", "");
			frm.set_value("api_url", "");
			frm.trigger("show_api_key_guide");
			return;
		}

		frappe.call({
			method: "frappe.client.get",
			args: {
				doctype: "AI Provider",
				name: frm.doc.provider,
			},
			callback: function (r) {
				if (!r.message) return;

				const provider_doc = r.message;

				// Auto-fill api_url from provider description (if needed)
				frm.trigger("show_api_key_guide");
				frm.trigger("setup_model_filter");

				// Find default model and set it
				const models = provider_doc.models || [];
				const default_model = models.find((m) => m.is_default) || models[0];

				if (default_model) {
					frm.set_value("model", default_model.model_name);
					frm.set_value("temperature", default_model.temperature || 0.7);
					frm.set_value("max_tokens", default_model.max_tokens || 4096);
				} else {
					frm.set_value("model", "");
				}
			},
		});
	},

	model(frm) {
		if (!frm.doc.provider || !frm.doc.model) return;

		// Fetch provider to get model parameters
		frappe.call({
			method: "frappe.client.get",
			args: {
				doctype: "AI Provider",
				name: frm.doc.provider,
			},
			callback: function (r) {
				if (!r.message) return;

				const models = r.message.models || [];
				const selected = models.find((m) => m.model_name === frm.doc.model);

				if (selected) {
					frm.set_value("temperature", selected.temperature || 0.7);
					frm.set_value("max_tokens", selected.max_tokens || 4096);
				}
			},
		});
	},

	setup_model_filter(frm) {
		if (!frm.doc.provider) return;

		frappe.call({
			method: "frappe.client.get",
			args: {
				doctype: "AI Provider",
				name: frm.doc.provider,
			},
			callback: function (r) {
				if (!r.message) return;

				const models = (r.message.models || []).map((m) => m.model_name);
				const description = models.length
					? __("Available models") + ": " + models.join(", ")
					: __("No models configured for this provider");

				frm.set_df_property("model", "description", description);
			},
		});
	},

	show_api_key_guide(frm) {
		const guides = {
			OpenAI: `
				<div class="alert alert-info" style="margin-bottom: 0;">
					<strong>` + __("How to get your OpenAI API Key") + `:</strong>
					<ol style="margin-bottom: 0; padding-left: 20px;">
						<li>` + __("Go to") + ` <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</a></li>
						<li>` + __("Click") + ` <strong>"Create new secret key"</strong></li>
						<li>` + __("Copy the key and paste it below") + `</li>
					</ol>
				</div>
			`,
			Anthropic: `
				<div class="alert alert-info" style="margin-bottom: 0;">
					<strong>` + __("How to get your Anthropic API Key") + `:</strong>
					<ol style="margin-bottom: 0; padding-left: 20px;">
						<li>` + __("Go to") + ` <a href="https://console.anthropic.com/settings/keys" target="_blank">console.anthropic.com/settings/keys</a></li>
						<li>` + __("Click") + ` <strong>"Create Key"</strong></li>
						<li>` + __("Copy the key and paste it below") + `</li>
					</ol>
				</div>
			`,
			Google: `
				<div class="alert alert-info" style="margin-bottom: 0;">
					<strong>` + __("How to get your Google AI API Key") + `:</strong>
					<ol style="margin-bottom: 0; padding-left: 20px;">
						<li>` + __("Go to") + ` <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a></li>
						<li>` + __("Click") + ` <strong>"Create API key"</strong></li>
						<li>` + __("Copy the key and paste it below") + `</li>
					</ol>
				</div>
			`,
		};

		const provider = frm.doc.provider;
		const guide_html = guides[provider] || `
			<div class="text-muted">` + __("Select a provider to see instructions for obtaining an API key") + `</div>
		`;

		frm.fields_dict.api_key_guide.$wrapper.html(guide_html);
	},
});
