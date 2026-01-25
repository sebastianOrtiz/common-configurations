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

frappe.ui.form.on("Tool Type", {
	refresh(frm) {
		// Add autocomplete to icon field
		if (frm.fields_dict.icon) {
			frm.fields_dict.icon.get_query = function() {
				return {
					filters: []
				};
			};

			// Set autocomplete options
			frm.set_df_property('icon', 'options', LUCIDE_ICONS);
		}
	},

	icon(frm) {
		// Validate icon name (case-sensitive)
		if (frm.doc.icon && !LUCIDE_ICONS.includes(frm.doc.icon)) {
			frappe.msgprint({
				title: __('Invalid Icon'),
				indicator: 'orange',
				message: __('Icon name must match exactly (case-sensitive). Available icons: ') + LUCIDE_ICONS.join(', ')
			});
		}
	}
});
