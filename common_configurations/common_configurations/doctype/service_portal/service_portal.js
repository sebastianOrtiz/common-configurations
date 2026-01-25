// Copyright (c) 2026, Sebastian Ortiz Valencia and contributors
// For license information, please see license.txt

// List of available Lucide icons
const LUCIDE_ICONS = [
	'Calendar', 'CalendarCheck', 'CalendarClock', 'CalendarDays', 'Clock',
	'ClipboardList', 'ClipboardCheck', 'FileText', 'File', 'Folder',
	'Mail', 'MessageSquare', 'Phone', 'User', 'Users',
	'UserCheck', 'UserPlus', 'Briefcase', 'Clipboard', 'Settings',
	'Wrench', 'CheckSquare', 'ListTodo', 'MapPin',
	'BarChart', 'PieChart', 'TrendingUp', 'DollarSign', 'CreditCard',
	'ShoppingCart', 'Package', 'Truck', 'Home', 'Building',
	'Store', 'Heart', 'Star', 'Bell', 'BookOpen',
	'GraduationCap', 'Video', 'Mic', 'Camera', 'Image',
	'FileCheck', 'FilePlus', 'Download', 'Upload', 'Search',
	'Filter', 'Circle', 'ChevronRight', 'LogOut', 'AlertCircle', 'Inbox'
];

frappe.ui.form.on("Service Portal", {
	refresh(frm) {
		// Setup icon field autocomplete for child table
		setup_icon_autocomplete(frm);
	}
});

frappe.ui.form.on("Service Portal Tool", {
	icon(frm, cdt, cdn) {
		// Validate icon name in child table
		const row = locals[cdt][cdn];
		if (row.icon && !LUCIDE_ICONS.includes(row.icon)) {
			frappe.msgprint({
				title: __('Invalid Icon'),
				indicator: 'orange',
				message: __('Icon name must match exactly (case-sensitive). Available icons: ') + LUCIDE_ICONS.join(', ')
			});
		}
	}
});

function setup_icon_autocomplete(frm) {
	// Add autocomplete to icon field in child table
	if (frm.fields_dict.tools && frm.fields_dict.tools.grid) {
		frm.fields_dict.tools.grid.update_docfield_property(
			'icon',
			'options',
			LUCIDE_ICONS
		);
	}
}
