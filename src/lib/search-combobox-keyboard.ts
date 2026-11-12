type EnterEvent = { key: string; preventDefault: () => void };
/** An open suggestion popup owns Enter; it must never submit a paid search. */
export function commitComboboxEnter<T>(
  event: EnterEvent,
  state: { open: boolean; loading: boolean; error: boolean; active: number; options: T[] },
  actions: { choose: (option: T) => void; close: () => void },
) {
  if (event.key !== "Enter" || !state.open) return false;
  event.preventDefault();
  const option = state.options[state.active];
  if (!state.loading && !state.error && state.active >= 0 && option !== undefined)
    actions.choose(option);
  else actions.close();
  return true;
}
