import { buttonHtml, type ButtonOptions } from "../button/button-html.ts";
import { attributesHtml } from "../html.ts";
import { escapeHtml } from "@agents-in-the-cloud/shared";
import { popupMenuHtml } from "./popup-surface.ts";

export interface PopupOptions {
  id: string;
  label: string;
  trigger: Pick<ButtonOptions, "variant" | "content" | "disabled" | "attributesHtml">;
  contentHtml: string;
  menuAttributesHtml?: string;
  placement?: "below" | "above";
  /** Content-width menus can grow beyond the compact 340px limit, within the viewport. */
  width?: "compact" | "content";
}

/** Preferred menu interface: owns the anchor, trigger, ARIA linkage and behavior. */
export function popupHtml(options: PopupOptions): string {
  return `<span class="popup-menu-anchor" data-controller="popup-menu">${buttonHtml({
    type: "button",
    ...options.trigger,
    attributesHtml: `data-popup-menu-trigger aria-haspopup="menu" aria-expanded="false" aria-controls="${escapeHtml(options.id)}" popovertarget="${escapeHtml(options.id)}" ${options.trigger.attributesHtml ?? ""}`,
  })}${popupMenuHtml({ id: options.id, label: options.label, contentHtml: options.contentHtml, placement: options.placement ?? "below", attributesHtml: `${options.width === "content" ? 'data-popup-menu-width="content" ' : ""}${options.menuAttributesHtml ?? ""}` })}</span>`;
}

/** Right-click/Shift+F10 menu around caller-owned, server-rendered content. */
export function contextMenuHtml(options: {
  id: string;
  label: string;
  targetHtml: string;
  contentHtml: string;
  attributesHtml?: string;
}): string {
  return `<div data-controller="popup-menu" data-popup-menu-context-target${attributesHtml(options.attributesHtml)}>${options.targetHtml}${popupMenuHtml({ id: options.id, label: options.label, contentHtml: options.contentHtml, attributesHtml: "data-popup-menu-context" })}</div>`;
}
