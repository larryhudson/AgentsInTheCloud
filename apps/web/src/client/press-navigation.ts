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
    this.activating = true;
    try {
      this.element.click();
    } finally {
      this.activating = false;
    }
  }

  click(event: MouseEvent): void {
    if (this.activating || !this.pressed || event.detail === 0) return;
    this.pressed = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private readonly releaseClick = (event: MouseEvent): void => {
    this.click(event);
    if (!this.pressed) window.removeEventListener("click", this.releaseClick, true);
  };

  cancel(): void {
    this.pressed = false;
    window.removeEventListener("click", this.releaseClick, true);
  }

  disconnect(): void {
    this.cancel();
  }
}
