import { t } from "../core/i18n.js";
import { createId } from "../core/utils.js";

const backdrop = document.getElementById("modalBackdrop");
const menuLayer = document.getElementById("menuLayer");
const toastRegion = document.getElementById("toastRegion");

let currentModal = null;
let toastTimer = null;
let menuReturnFocus = null;
let beforeModalClose = () => {};
let onModalClosed = () => {};

function configureUiComponents(options = {}) {
  beforeModalClose = options.beforeModalClose || (() => {});
  onModalClosed = options.onModalClosed || (() => {});
}

function getCurrentModal() {
  return currentModal;
}

function setMenuReturnFocus(element) {
  menuReturnFocus = element;
}

function setFieldError(input, errorElement, message = "") {
  const hasError = Boolean(message);
  input.setAttribute("aria-invalid", String(hasError));
  errorElement.textContent = message;
  errorElement.hidden = !hasError;
}

function hideToast(toast) {
  if (!toast?.isConnected) return;
  toast.classList.remove("is-visible");
  window.setTimeout(() => {
    if (toast.isConnected) toast.remove();
  }, 160);
}

function showToast(message, type = "message", duration = 3600, action = null) {
  window.clearTimeout(toastTimer);
  toastRegion.replaceChildren();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  if (type === "success" || type === "error") {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.classList.add("toast-status-icon");
    icon.setAttribute("viewBox", "0 0 16 16");
    icon.setAttribute("aria-hidden", "true");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "8");
    circle.setAttribute("cy", "8");
    circle.setAttribute("r", "4");
    icon.append(circle);
    toast.append(icon);
  }

  const label = document.createElement("span");
  label.className = "toast-label";
  label.textContent = message;
  toast.append(label);

  if (action?.label && typeof action.onClick === "function") {
    const actionButton = createButton(action.label, async () => {
      window.clearTimeout(toastTimer);
      setButtonLoading(actionButton, true);
      try {
        await action.onClick();
        hideToast(toast);
      } catch {
        setButtonLoading(actionButton, false);
        toastTimer = window.setTimeout(() => hideToast(toast), duration);
      }
    }, {
      variant: action.variant || "secondary",
      size: "small",
      loadingText: action.loadingText || action.label,
    });
    actionButton.classList.add("toast-action");
    toast.append(actionButton);
  }

  toastRegion.append(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  toastTimer = window.setTimeout(() => hideToast(toast), duration);
}

function createButton(text, onClick, { variant = "secondary", size = "medium", loadingText = t("处理中") } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${variant} ${size}`;
  button.dataset.defaultLabel = text;
  button.dataset.loadingLabel = loadingText;

  const spinner = document.createElement("span");
  spinner.className = "button-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "button-label";
  label.textContent = text;
  button.append(spinner, label);
  if (onClick) button.addEventListener("click", onClick);
  return button;
}

function setButtonLoading(button, isLoading) {
  if (!button) return;
  const label = button.querySelector(".button-label");
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
  button.setAttribute("aria-busy", String(isLoading));
  if (label) label.textContent = isLoading ? button.dataset.loadingLabel : button.dataset.defaultLabel;
}

function createIconButton(label, pathData, onClick, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = danger ? "icon-button danger" : "icon-button";
  button.title = label;
  button.ariaLabel = label;
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${pathData}"></path></svg>`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return button;
}

function createOpenAllIconButton(onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.title = t("打开全部");
  button.ariaLabel = t("打开全部");
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 3h6v6"></path>
      <path d="M10 14 21 3"></path>
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>
    </svg>
  `;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return button;
}

function createMoreIconButton(onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button more-workspace-button";
  button.title = t("更多");
  button.ariaLabel = t("更多");
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="1.7"></circle>
      <circle cx="12" cy="12" r="1.7"></circle>
      <circle cx="18" cy="12" r="1.7"></circle>
    </svg>
  `;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return button;
}

function createEmptyState({ title, description, actionLabel = "", onAction = null, compact = false }) {
  const emptyState = document.createElement("section");
  emptyState.className = compact ? "empty-state is-compact" : "empty-state";

  const icon = document.createElement("div");
  icon.className = "empty-state-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z"></path>
    </svg>
  `;

  const copy = document.createElement("div");
  copy.className = "empty-state-copy";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const body = document.createElement("p");
  body.textContent = description;
  copy.append(heading, body);
  emptyState.append(icon, copy);

  if (actionLabel && onAction) emptyState.append(createButton(actionLabel, onAction, { variant: "primary" }));
  return emptyState;
}

function createDialog(size = "") {
  const dialog = document.createElement("section");
  dialog.className = `dialog ${size}`.trim();
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.innerHTML = `
    <header class="dialog-header"></header>
    <div class="dialog-content"></div>
    <footer class="dialog-footer"></footer>
  `;
  return dialog;
}

function createDialogTitle(text) {
  const title = document.createElement("div");
  title.className = "dialog-title";
  title.innerHTML = "<h1></h1>";
  title.querySelector("h1").textContent = text;
  return title;
}

function showModal(dialog, afterPaint, { onDismiss = null, dismissOnBackdrop = true, returnFocus = null } = {}) {
  closeMenu({ restoreFocus: false });
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!dialog._returnFocus) dialog._returnFocus = returnFocus || activeElement;

  const title = dialog.querySelector(".dialog-title h1");
  if (title) {
    if (!title.id) title.id = createId("dialog-title");
    dialog.setAttribute("aria-labelledby", title.id);
  }

  dialog.tabIndex = -1;
  currentModal = { dialog, onDismiss, dismissOnBackdrop };
  backdrop.replaceChildren(dialog);
  backdrop.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    afterPaint?.();
    if (!dialog.contains(document.activeElement)) {
      const initialFocus = dialog.querySelector("[data-autofocus]") || getFocusableElements(dialog)[0] || dialog;
      initialFocus.focus();
    }
  });
}

function closeModal({ restoreFocus = true } = {}) {
  const closingDialog = currentModal?.dialog;
  beforeModalClose(closingDialog);
  const returnFocus = closingDialog?._returnFocus;
  currentModal = null;
  backdrop.hidden = true;
  backdrop.replaceChildren();
  document.body.classList.remove("modal-open");
  onModalClosed();

  if (restoreFocus && returnFocus?.isConnected) requestAnimationFrame(() => returnFocus.focus());
}

function dismissModal() {
  const onDismiss = currentModal?.onDismiss;
  if (onDismiss) onDismiss();
  else closeModal();
}

function getFocusableElements(container) {
  const selector = [
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "a[href]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  return Array.from(container.querySelectorAll(selector))
    .filter((element) => (
      !element.hidden
      && element.getAttribute("aria-hidden") !== "true"
      && element.getClientRects().length > 0
    ));
}

function trapModalFocus(event, dialog) {
  const focusable = getFocusableElements(dialog);
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

function showMenu(menu, anchor) {
  menuReturnFocus = anchor;
  const items = Array.from(menu.querySelectorAll('[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled])'));
  menu.addEventListener("keydown", (event) => {
    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex !== currentIndex) {
      event.preventDefault();
      items[nextIndex]?.focus();
    }
  });
  menuLayer.hidden = false;
  menuLayer.append(menu);
  requestAnimationFrame(() => items[0]?.focus());
}

function closeMenu({ restoreFocus = true } = {}) {
  const returnFocus = menuReturnFocus;
  menuReturnFocus = null;
  menuLayer.hidden = true;
  menuLayer.replaceChildren();
  if (returnFocus?.hasAttribute?.("aria-expanded")) returnFocus.setAttribute("aria-expanded", "false");
  if (restoreFocus && returnFocus?.isConnected) requestAnimationFrame(() => returnFocus.focus());
}

function openDestructiveModal({
  title,
  description,
  actionLabel,
  loadingText,
  onConfirm,
  successMessage,
  onSuccess,
  onCancel = null,
  errorMessage = t("无法完成删除。请重试。"),
  returnFocus = null,
}) {
  const parentModal = currentModal;
  const dialog = createDialog("small destructive-dialog");
  dialog.querySelector(".dialog-header").append(createDialogTitle(title));

  const body = document.createElement("p");
  body.className = "destructive-dialog-copy";
  body.textContent = description;
  dialog.querySelector(".dialog-content").append(body);

  const cancel = () => {
    if (parentModal?.dialog) {
      showModal(parentModal.dialog, null, {
        onDismiss: parentModal.onDismiss,
        dismissOnBackdrop: parentModal.dismissOnBackdrop,
      });
    } else {
      closeModal({ restoreFocus: !onCancel });
      onCancel?.();
    }
  };
  const cancelButton = createButton(t("取消"), cancel);
  cancelButton.dataset.autofocus = "true";
  const confirmButton = createButton(actionLabel, null, { variant: "danger", loadingText });
  confirmButton.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });
  confirmButton.addEventListener("click", async () => {
    if (confirmButton.disabled) return;
    setButtonLoading(confirmButton, true);
    try {
      await onConfirm();
      closeModal({ restoreFocus: false });
      onSuccess?.();
      showToast(successMessage, "success");
    } catch {
      showToast(errorMessage, "error");
    } finally {
      setButtonLoading(confirmButton, false);
    }
  });

  dialog.querySelector(".dialog-footer").append(cancelButton, confirmButton);
  showModal(dialog, null, { onDismiss: cancel, dismissOnBackdrop: false, returnFocus });
}

export {
  closeMenu,
  closeModal,
  configureUiComponents,
  createButton,
  createDialog,
  createDialogTitle,
  createEmptyState,
  createIconButton,
  createMoreIconButton,
  createOpenAllIconButton,
  dismissModal,
  getCurrentModal,
  openDestructiveModal,
  setButtonLoading,
  setFieldError,
  setMenuReturnFocus,
  showMenu,
  showModal,
  showToast,
  trapModalFocus,
};
