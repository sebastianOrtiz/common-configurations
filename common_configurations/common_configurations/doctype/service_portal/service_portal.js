// Copyright (c) 2026, Sebastian Ortiz Valencia and contributors
// For license information, please see license.txt

frappe.ui.form.on('Service Portal', {
	setup: function(frm) {
		// Filter target_portal to exclude the current portal (avoid self-referencing cycles)
		frm.set_query('target_portal', 'tools', function(doc) {
			return {
				filters: {
					name: ['!=', doc.name]
				}
			};
		});
	},
	refresh: function(frm) {
		// Show "Open Portal" button when the portal is saved and active
		if (!frm.is_new() && frm.doc.is_active) {
			frm.add_custom_button(__('Open Portal'), function() {
				const url = `/service-portal#/portal/${frm.doc.portal_name}`;
				window.open(url, '_blank');
			}, null, 'primary');
		}

		// Show "Generar catálogo de navegación" button for saved portals,
		// System Manager only. Builds/refreshes the Portal Navigation Catalog
		// cache used by the voice navigation resolver (resolve_navigation).
		if (!frm.is_new() && frappe.user.has_role('System Manager')) {
			frm.add_custom_button(__('🧭 Generar catálogo de navegación'), function() {
				build_navigation_catalog(frm);
			});

			// Show "Ver catálogo de navegación" only when one has been generated.
			// Portal Navigation Catalog autonames by portal, so its name === frm.doc.name.
			frappe.db.exists('Portal Navigation Catalog', frm.doc.name).then((exists) => {
				if (exists) {
					frm.add_custom_button(__('📖 Ver catálogo de navegación'), function() {
						frappe.set_route('Form', 'Portal Navigation Catalog', frm.doc.name);
					});
				}
			});
		}
	},
	require_auth: function(frm) {
		// When authentication is disabled, turn off MFA OTP too
		if (!frm.doc.require_auth) {
			frm.set_value('enable_mfa_otp', 0);
		}
	}
});

// Child table handler for Service Portal Tool
frappe.ui.form.on('Service Portal Tool', {
	tool_type: function(frm, cdt, cdn) {
		console.log('=== Service Portal Tool - tool_type changed ===');
		console.log('cdt:', cdt);
		console.log('cdn:', cdn);

		// When tool_type changes, fetch and populate fields if they're empty
		const row = locals[cdt][cdn];
		console.log('Row data:', row);
		console.log('Selected tool_type:', row.tool_type);

		if (row.tool_type) {
			console.log('Fetching Tool Type data for:', row.tool_type);

			frappe.db.get_value('Tool Type', row.tool_type, ['tool_label', 'description', 'icon'], (r) => {
				console.log('Tool Type response:', r);

				if (r) {
					console.log('Current row values before update:', {
						label: row.label,
						tool_description: row.tool_description,
						icon: row.icon
					});

					// Only set label if it's empty
					if (!row.label) {
						console.log('Setting label to:', r.tool_label);
						frappe.model.set_value(cdt, cdn, 'label', r.tool_label);
					} else {
						console.log('Label already has value, skipping');
					}

					// Only set description if it's empty
					if (!row.tool_description) {
						console.log('Setting tool_description to:', r.description);
						frappe.model.set_value(cdt, cdn, 'tool_description', r.description);
					} else {
						console.log('Description already has value, skipping');
					}

					// Only set icon if it's empty
					if (!row.icon) {
						console.log('Setting icon to:', r.icon);
						frappe.model.set_value(cdt, cdn, 'icon', r.icon);
					} else {
						console.log('Icon already has value, skipping');
					}

					// Refresh the grid row to show the updated values
					console.log('Refreshing tools field');
					frm.refresh_field('tools');
					console.log('=== Update complete ===');
				} else {
					console.log('ERROR: No data returned from Tool Type');
				}
			});
		} else {
			console.log('No tool_type selected');
		}
	}
});

// Builds/refreshes the Portal Navigation Catalog cache of a Service Portal
// (common_configurations.api.navigation.build_navigation_catalog). Covers
// every enabled tool of the portal, optionally enriched with AI-generated
// keywords/synonyms, and is what resolve_navigation reads afterwards.
function build_navigation_catalog(frm) {
	const dialog = new frappe.ui.Dialog({
		title: __('Generar catálogo de navegación'),
		fields: [
			{
				fieldname: 'use_ai',
				fieldtype: 'Check',
				label: __('Enriquecer con IA (keywords y sinónimos)'),
				default: 1,
				description: __(
					'Requiere tener habilitado el Modo IA del asistente de voz en Common Configurations Settings, con una Configuración de IA válida. Si no está configurado, el catálogo se genera igual, solo que sin enriquecer.'
				)
			}
		],
		primary_action_label: __('Generar'),
		primary_action: function(values) {
			dialog.hide();
			start_catalog_build(frm, values.use_ai ? 1 : 0);
		}
	});

	dialog.show();
}

// Kicks off the (background) catalog build and shows a live, NON-blocking
// progress bar. Progress is polled from the server (does not depend on
// realtime/socketio), so it works reliably in any setup.
function start_catalog_build(frm, use_ai) {
	const portal = frm.doc.name;
	let finished = false;
	let poll_timer = null;

	const stop = function() {
		if (poll_timer) { clearInterval(poll_timer); poll_timer = null; }
	};
	const show_done = function(data) {
		finished = true; stop(); frappe.hide_progress();
		const ai_line = data.enriched
			? __('Sí, se usó IA para enriquecer keywords/sinónimos.')
			: __('No (deshabilitado, sin configurar, o no solicitado).');
		frappe.msgprint({
			title: __('Catálogo de navegación generado'),
			indicator: 'green',
			message: `
				<p>${__('Portal')}: <strong>${frappe.utils.escape_html(portal)}</strong></p>
				<p>${__('Herramientas cubiertas')}: <strong>${data.tool_count}</strong></p>
				<p>${__('Ítems navegables')}: <strong>${data.item_count}</strong></p>
				<p>${__('Enriquecido con IA')}: ${ai_line}</p>
			`,
			primary_action: {
				label: __('Ver catálogo'),
				action: function() {
					frappe.set_route('Form', 'Portal Navigation Catalog', portal);
				}
			}
		});
		frm.refresh();
	};
	const show_error = function(msg) {
		finished = true; stop(); frappe.hide_progress();
		frappe.msgprint({
			title: __('Error generando el catálogo'),
			indicator: 'red',
			message: frappe.utils.escape_html(msg || __('Error desconocido'))
		});
	};

	frappe.show_progress(__('Generando catálogo de navegación'), 5, __('Encolando la tarea…'));

	frappe.call({
		method: 'common_configurations.api.navigation.build_navigation_catalog',
		args: { portal_name: portal, use_ai: use_ai },
		error: function() { if (!finished) { stop(); frappe.hide_progress(); } }
	});

	const poll = function() {
		if (finished) return;
		frappe.call({
			method: 'common_configurations.api.navigation.navigation_build_status',
			args: { portal_name: portal },
			callback: function(r) {
				if (finished || !r || !r.message) return;
				const s = r.message;
				if (s.status === 'done') { show_done(s); }
				else if (s.status === 'error') { show_error(s.message); }
				else {
					const pct = s.total ? Math.round((s.current / s.total) * 100) : 15;
					frappe.show_progress(
						__('Generando catálogo de navegación'),
						Math.max(pct, 10),
						s.total
							? __('Enriqueciendo con IA — lote {0} de {1}…', [s.current, s.total])
							: __('Procesando en segundo plano… puedes seguir trabajando.')
					);
				}
			}
		});
	};
	poll_timer = setInterval(poll, 3000);

	// Safety net: stop polling after 30 min if nothing resolved.
	setTimeout(function() { if (!finished) { stop(); frappe.hide_progress(); } }, 30 * 60 * 1000);
}
