import { focusLikelyOpensSoftwareKeyboard, type WorkspaceClientControllerConstructor } from "@agents-in-the-cloud/shared";

/** Keep the keyboard layout in place until Send submits, including on iOS. */
export function createComposerFocusController(Controller: WorkspaceClientControllerConstructor) {
  return class ComposerFocusController extends Controller {
    declare readonly element: HTMLElement;
    private sendTouch?: { id: number; x: number; y: number; button: HTMLButtonElement };
    private readonly touchStarted = (event: TouchEvent): void => this.startSendTouch(event);
    private readonly touchMoved = (event: TouchEvent): void => this.moveSendTouch(event);
    private readonly touchEnded = (event: TouchEvent): void => this.endSendTouch(event);
    private readonly touchCancelled = (): void => this.cancelSendTouch();

    connect(): void {
      // Agent markup comes from the workspace runtime, which can outlive a web
      // asset reload. Bind here so existing composer markup gets this behavior.
      this.element.addEventListener("touchstart", this.touchStarted, { passive: true });
      this.element.addEventListener("touchmove", this.touchMoved, { passive: true });
      this.element.addEventListener("touchend", this.touchEnded, { passive: false });
      this.element.addEventListener("touchcancel", this.touchCancelled, { passive: true });
    }

    disconnect(): void {
      this.element.removeEventListener("touchstart", this.touchStarted);
      this.element.removeEventListener("touchmove", this.touchMoved);
      this.element.removeEventListener("touchend", this.touchEnded);
      this.element.removeEventListener("touchcancel", this.touchCancelled);
      this.cancelSendTouch();
    }

    preserveInputFocus(event: MouseEvent): void {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      const control = event.target.closest("button, a[href]");
      if (!focusLikelyOpensSoftwareKeyboard() && !(control instanceof HTMLButtonElement && control.type === "submit")) return;
      if (!control?.closest(".composer, .agent-composer-opener, .dialog__close-form")) return;
      const input = document.activeElement;
      if (!this.element.contains(control) || !(input instanceof HTMLTextAreaElement) || !this.element.contains(input)) return;
      event.preventDefault();
    }

    startSendTouch(event: TouchEvent): void {
      this.sendTouch = undefined;
      if (event.touches.length !== 1 || !(event.target instanceof Element)) return;
      const button = event.target.closest(".composer button");
      if (!(button instanceof HTMLButtonElement) || button.type !== "submit" || button.disabled) return;
      // Focus may already have moved off the textarea when iOS delivers
      // touchstart. A Send tap must work with or without an active editor.
      const touch = event.touches[0]!;
      // Screen coordinates stay stable if keyboard dismissal moves the viewport.
      this.sendTouch = { id: touch.identifier, x: touch.screenX, y: touch.screenY, button };
    }

    moveSendTouch(event: TouchEvent): void {
      const tap = this.sendTouch;
      if (!tap) return;
      const touch = [...event.touches].find((touch) => touch.identifier === tap.id);
      // A drag or multi-touch gesture isn't a Send tap. Leave scrolling native.
      if (event.touches.length !== 1 || !touch || Math.hypot(touch.screenX - tap.x, touch.screenY - tap.y) > 10) this.cancelSendTouch();
    }

    cancelSendTouch(): void {
      this.sendTouch = undefined;
    }

    endSendTouch(event: TouchEvent): void {
      const tap = this.sendTouch;
      this.sendTouch = undefined;
      if (!tap || !event.cancelable || tap.button.disabled) return;
      const touch = [...event.changedTouches].find((touch) => touch.identifier === tap.id);
      if (!touch || Math.hypot(touch.screenX - tap.x, touch.screenY - tap.y) > 10) return;
      // iOS can dismiss the keyboard and move Send before its generated click.
      // Submit before that focus transfer, and cancel the generated mouse/click
      // sequence so this tap cannot submit twice. requestSubmit keeps validation,
      // the chosen send/steer mode, dictation and Turbo's submission lifecycle.
      event.preventDefault();
      tap.button.form!.requestSubmit(tap.button);
    }
  };
}
