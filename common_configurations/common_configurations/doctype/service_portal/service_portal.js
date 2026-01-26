// Copyright (c) 2026, Sebastian Ortiz Valencia and contributors
// For license information, please see license.txt

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
