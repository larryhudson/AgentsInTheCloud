import { Controller } from "@hotwired/stimulus";

/** Opt-in press-down activation for reversible navigation, never form actions. */
export class PressNavigationController extends Controller<HTMLElement> {
  private pressed = false;
  private activating = false;

  press(event: PointerEvent): void {
    this.cancel();
    if (!event.isPrimary || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    this.pressed = true;
    // Opening a view can move another control under the pointer before release.
    window.addEventListener("click", this.releaseClick, true);
    window.addEventListener("pointerdown", this.nextPress, true);
    this.activating = true;
    try {
      this.element.click();
    } finally {
      this.activating = false;
    }
  }

  click(event: MouseEvent): void {
    const keyboardClick = event.detail === 0 && !(event instanceof PointerEvent && event.pointerType);
    if (this.activating || !this.pressed || keyboardClick) return;
    this.pressed = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private readonly releaseClick = (event: MouseEvent): void => {
    this.click(event);
    if (!this.pressed) this.cancel();
  };

  // A cancelled gesture may never emit a click. Never consume a separate tap.
  private readonly nextPress = (): void => this.cancel();

  cancel(): void {
    this.pressed = false;
    window.removeEventListener("click", this.releaseClick, true);
    window.removeEventListener("pointerdown", this.nextPress, true);
  }

  disconnect(): void {
    this.cancel();
  }
}
