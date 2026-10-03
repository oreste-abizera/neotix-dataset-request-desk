import { useCallback, useRef } from "react";

/**
 * Remember which control opened a dialog or sheet and focus it again when that closes.
 *
 * Radix restores focus to whatever was focused when the dialog opened, but Safari (and Firefox on
 * macOS) do not focus a button on click, so that would be <body> and a keyboard user would lose their
 * place. Call `remember` from the opener's onClick, and pass `onCloseAutoFocus` to the dialog.
 */
export function useFocusReturn() {
  const opener = useRef<HTMLElement | null>(null);

  const remember = useCallback((event: { currentTarget: HTMLElement }) => {
    opener.current = event.currentTarget;
  }, []);

  const onCloseAutoFocus = useCallback((event: Event) => {
    if (opener.current?.isConnected) {
      event.preventDefault();
      opener.current.focus();
    }
  }, []);

  return { remember, onCloseAutoFocus };
}
