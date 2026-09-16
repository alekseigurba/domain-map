// The dialogs that only hold text: Getting around, how to move about the map,
// and About, what the map is for. The text is written into index.html; this
// only opens and shuts them.

/** Every dialog wired up so far. */
const dialogs = [];

/**
 * Wires the dialog `<id>-dialog` to the header button `<id>` that opens it and
 * the `<id>-close` button that shuts it.
 */
export function initTextDialog(id) {
  const dialog = document.getElementById(`${id}-dialog`);
  dialogs.push(dialog);

  document.getElementById(id).addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  });
  document.getElementById(`${id}-close`).addEventListener('click', () => dialog.close());

  // Clicking the backdrop shuts it, as Esc does — but only if the press began
  // there too, as in the palette editor.
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => { pressedBackdrop = event.target === dialog; });
  dialog.addEventListener('click', (event) => {
    if (pressedBackdrop && event.target === dialog) dialog.close();
  });
}

/** Whether any of them is open. */
export const textDialogOpen = () => dialogs.some((dialog) => dialog.open);
