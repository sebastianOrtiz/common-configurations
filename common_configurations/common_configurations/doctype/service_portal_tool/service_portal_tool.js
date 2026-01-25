frappe.ui.form.on('Service Portal Tool', {
	tool_type: function(frm) {
		// When tool_type changes, fetch and populate fields if they're empty
		if (frm.doc.tool_type) {
			frappe.db.get_value('Tool Type', frm.doc.tool_type, ['tool_label', 'description', 'icon'], (r) => {
				if (r) {
					// Only set label if it's empty
					if (!frm.doc.label) {
						frm.set_value('label', r.tool_label);
					}

					// Only set description if it's empty
					if (!frm.doc.tool_description) {
						frm.set_value('tool_description', r.description);
					}

					// Only set icon if it's empty
					if (!frm.doc.icon) {
						frm.set_value('icon', r.icon);
					}
				}
			});
		}
	}
});
