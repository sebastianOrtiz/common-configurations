// Destination CRM — client-side form behavior.
// The hub_shared_secret is read-only and exposed via a "Regenerate" button.
// The server-side method shows the new value once via a modal.

frappe.ui.form.on('Destination CRM', {
  refresh(frm) {
    if (frm.is_new()) return;

    frm.add_custom_button(
      __('Regenerate Hub Secret'),
      () => {
        frappe.confirm(
          __(
            'Regenerate the hub shared secret? The current value will stop working. ' +
            'You must update the destination site with the new secret.'
          ),
          () => {
            frm.call('regenerate_hub_shared_secret')
              .then(() => frm.reload_doc())
              .catch((err) => {
                console.error(err);
                frappe.show_alert({
                  message: __('Could not regenerate the secret. Check the error log.'),
                  indicator: 'red',
                });
              });
          }
        );
      },
      __('Actions')
    );
  },
});
