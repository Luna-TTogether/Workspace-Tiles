import * as i18n from "../core/i18n.js";
import {
  getState,
  getWorkspace,
  loadStateForUpdate,
  saveState,
  setState,
} from "../core/state.js";
import {
  closeModal,
  createButton,
  createDialog,
  getCurrentModal,
  setButtonLoading,
  showModal,
  showToast,
} from "../ui/ui-components.js";
import { createId } from "../core/utils.js";
import {
  MAX_NOTE_LENGTH,
  normalizeNote,
  parseNoteLines,
  toggleChecklistLine,
} from "./workspace-notes.js";

const t = (key, values) => i18n.t(key, values);
const cardFaceSaveVersions = new Map();
const cardFaceSaveQueues = new Map();

export function setupWorkspaceNote(node, noteFace, workspace, { onSaved = null } = {}) {
  const emptyButton = noteFace.querySelector(".workspace-note-empty");
  const editButton = noteFace.querySelector(".edit-note-button");
  const cancelButton = noteFace.querySelector(".cancel-note-button");
  const saveButton = noteFace.querySelector(".save-note-button");
  const textarea = noteFace.querySelector(".workspace-note-textarea");
  const reader = noteFace.querySelector(".workspace-note-reader");
  const help = noteFace.querySelector(".workspace-note-help");
  const error = noteFace.querySelector(".workspace-note-error");

  emptyButton.querySelector(".workspace-note-empty-label").textContent = t("写点什么……");
  editButton.textContent = t("编辑便签");
  cancelButton.textContent = t("取消");
  const saveSpinner = document.createElement("span");
  saveSpinner.className = "button-spinner";
  saveSpinner.setAttribute("aria-hidden", "true");
  const saveLabel = document.createElement("span");
  saveLabel.className = "button-label";
  saveButton.dataset.defaultLabel = t("保存");
  saveButton.dataset.loadingLabel = t("保存中");
  saveLabel.textContent = saveButton.dataset.defaultLabel;
  saveButton.replaceChildren(saveSpinner, saveLabel);
  textarea.ariaLabel = t("便签内容");
  reader.tabIndex = 0;
  reader.ariaLabel = t("便签内容");
  help.textContent = t("输入 - [ ] 创建创建 todo。");
  help.id = createId("note-help");
  error.id = createId("note-error");
  textarea.setAttribute("aria-describedby", `${help.id} ${error.id}`);
  noteFace.dataset.originalNote = workspace.note;

  emptyButton.addEventListener("click", (event) => {
    event.stopPropagation();
    enterNoteEdit(noteFace);
  });
  editButton.addEventListener("click", (event) => {
    event.stopPropagation();
    enterNoteEdit(noteFace);
  });
  cancelButton.addEventListener("click", (event) => {
    event.stopPropagation();
    exitNoteEdit(noteFace);
  });
  saveButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (saveButton.disabled) return;
    const value = textarea.value;
    if (value.length > MAX_NOTE_LENGTH) {
      setNoteError(noteFace, t("便签内容不能超过 10,000 个字符。"));
      return;
    }

    setNoteError(noteFace, "");
    setButtonLoading(saveButton, true);
    try {
      const savedWorkspace = await updateWorkspaceData(workspace.id, (latestWorkspace) => {
        latestWorkspace.note = normalizeNote(value);
      });
      noteFace.dataset.originalNote = savedWorkspace.note;
      exitNoteEdit(noteFace);
      onSaved?.(savedWorkspace);
    } catch {
      setNoteError(noteFace, t("无法保存便签。请重试。"));
      textarea.focus();
    } finally {
      if (saveButton.isConnected) setButtonLoading(saveButton, false);
    }
  });
  textarea.addEventListener("input", () => {
    setNoteError(noteFace, "");
    help.textContent = textarea.value.length >= MAX_NOTE_LENGTH
      ? t("便签内容不能超过 10,000 个字符。")
      : t("输入 - [ ] 创建创建 todo。");
  });
  textarea.addEventListener("click", (event) => event.stopPropagation());

  renderWorkspaceNote(noteFace, workspace.id, workspace.note);
}

function renderWorkspaceNote(noteFace, workspaceId, note) {
  const reader = noteFace.querySelector(".workspace-note-reader");
  const emptyButton = noteFace.querySelector(".workspace-note-empty");
  const normalizedNote = normalizeNote(note);
  reader.replaceChildren();
  reader.hidden = !normalizedNote;
  emptyButton.hidden = Boolean(normalizedNote);
  if (!normalizedNote) return;

  parseNoteLines(normalizedNote).forEach((line) => {
    if (line.type === "text") {
      const paragraph = document.createElement("p");
      paragraph.className = "workspace-note-line";
      paragraph.textContent = line.source;
      reader.append(paragraph);
      return;
    }

    const row = document.createElement("div");
    row.className = "workspace-note-check-row";
    row.classList.toggle("is-complete", line.checked);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = line.checked;
    checkbox.id = createId("note-check");
    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.textContent = line.text;
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", async () => {
      const requestedChecked = checkbox.checked;
      checkbox.disabled = true;
      try {
        const savedWorkspace = await updateWorkspaceData(workspaceId, (latestWorkspace) => {
          latestWorkspace.note = toggleChecklistLine(latestWorkspace.note, line.index, requestedChecked);
        });
        renderWorkspaceNote(noteFace, workspaceId, savedWorkspace.note);
        noteFace.dataset.originalNote = savedWorkspace.note;
        onSaved?.(savedWorkspace);
      } catch {
        checkbox.checked = !requestedChecked;
        checkbox.disabled = false;
        showToast(t("无法保存便签。请重试。"), "error");
      }
    });
    row.append(checkbox, label);
    reader.append(row);
  });
}

function enterNoteEdit(noteFace) {
  const workspaceContainer = noteFace.closest("[data-workspace-id]");
  const workspaceId = workspaceContainer?.dataset.workspaceId;
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return;
  const textarea = noteFace.querySelector(".workspace-note-textarea");
  noteFace.dataset.originalNote = workspace.note;
  textarea.value = workspace.note;
  noteFace.querySelector(".workspace-note-help").textContent = t("输入 - [ ] 创建创建 todo。");
  noteFace.classList.add("is-editing");
  noteFace.querySelector(".workspace-note-surface").hidden = true;
  noteFace.querySelector(".workspace-note-reading-footer").hidden = true;
  noteFace.querySelector(".workspace-note-editor").hidden = false;
  if (workspaceContainer?.matches(".workspace-tile")) workspaceContainer.draggable = false;
  setNoteError(noteFace, "");
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  });
}

function exitNoteEdit(noteFace) {
  const workspaceContainer = noteFace.closest("[data-workspace-id]");
  const workspaceId = workspaceContainer?.dataset.workspaceId;
  const workspace = getWorkspace(workspaceId);
  noteFace.classList.remove("is-editing");
  noteFace.querySelector(".workspace-note-editor").hidden = true;
  noteFace.querySelector(".workspace-note-surface").hidden = false;
  noteFace.querySelector(".workspace-note-reading-footer").hidden = false;
  if (workspaceContainer?.matches(".workspace-tile")) workspaceContainer.draggable = true;
  setNoteError(noteFace, "");
  if (workspace) {
    noteFace.dataset.originalNote = workspace.note;
    renderWorkspaceNote(noteFace, workspaceId, workspace.note);
  }
}

function setNoteError(noteFace, message) {
  const error = noteFace.querySelector(".workspace-note-error");
  const help = noteFace.querySelector(".workspace-note-help");
  const textarea = noteFace.querySelector(".workspace-note-textarea");
  error.textContent = message;
  error.hidden = !message;
  help.hidden = Boolean(message);
  textarea.setAttribute("aria-invalid", String(Boolean(message)));
}

export function runNoteCardAction(noteFace, action, returnFocus = null) {
  if (noteFace.classList.contains("is-editing")) {
    runAfterDiscardNote(noteFace, action, returnFocus);
    return;
  }
  action();
}

export function runAfterDiscardNote(noteFace, action, returnFocus = null) {
  if (!noteFace.classList.contains("is-editing")) {
    action();
    return;
  }
  const textarea = noteFace.querySelector(".workspace-note-textarea");
  if (textarea.value === noteFace.dataset.originalNote) {
    exitNoteEdit(noteFace);
    action();
    return;
  }
  openNoteDiscardDialog(noteFace, action, returnFocus || textarea);
}

function openNoteDiscardDialog(noteFace, action, returnFocus) {
  const parentModal = getCurrentModal();
  const restoreParent = () => {
    if (parentModal?.dialog && parentModal.dialog.contains(noteFace)) {
      showModal(parentModal.dialog, () => returnFocus?.focus(), {
        onDismiss: parentModal.onDismiss,
        dismissOnBackdrop: parentModal.dismissOnBackdrop,
      });
      return;
    }
    closeModal();
  };
  const dialog = createDialog("small");
  const title = document.createElement("div");
  title.className = "dialog-title";
  title.innerHTML = "<h1></h1>";
  title.querySelector("h1").textContent = t("放弃未保存的修改？");
  dialog.querySelector(".dialog-header").append(title);

  const description = document.createElement("p");
  description.className = "destructive-dialog-copy";
  description.textContent = t("便签中的未保存内容将丢失。");
  dialog.querySelector(".dialog-content").append(description);

  const keepEditing = createButton(t("继续编辑"), restoreParent, { variant: "secondary" });
  keepEditing.dataset.autofocus = "true";
  const discard = createButton(t("放弃修改"), () => {
    exitNoteEdit(noteFace);
    if (parentModal?.dialog && parentModal.dialog.contains(noteFace)) {
      showModal(parentModal.dialog, null, {
        onDismiss: parentModal.onDismiss,
        dismissOnBackdrop: parentModal.dismissOnBackdrop,
      });
    } else {
      closeModal({ restoreFocus: false });
    }
    action();
  }, { variant: "primary" });
  dialog.querySelector(".dialog-footer").append(keepEditing, discard);
  showModal(dialog, null, { returnFocus, onDismiss: restoreParent });
}

export function createWorkspaceDragImage(node) {
  const rect = node.getBoundingClientRect();
  const sourceStyles = getComputedStyle(node);
  const preview = node.cloneNode(true);
  const sourceVisuals = Array.from(node.querySelectorAll(".favicon-visual"));
  const previewVisuals = Array.from(preview.querySelectorAll(".favicon-visual"));
  sourceVisuals.forEach((sourceVisual, index) => {
    const sourceImage = sourceVisual.querySelector(".favicon-image");
    const previewVisual = previewVisuals[index];
    const previewImage = previewVisual?.querySelector(".favicon-image");
    if (!sourceImage || !previewVisual || !previewImage) return;
    try {
      if (!sourceImage.complete || !sourceImage.naturalWidth) throw new Error("Favicon is not ready");
      const canvas = document.createElement("canvas");
      canvas.width = sourceImage.naturalWidth;
      canvas.height = sourceImage.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.drawImage(sourceImage, 0, 0);
      canvas.className = previewImage.className;
      canvas.setAttribute("aria-hidden", "true");
      previewImage.replaceWith(canvas);
    } catch {
      previewImage.remove();
      previewVisual.querySelector(".favicon-fallback")?.removeAttribute("hidden");
    }
  });
  preview.classList.add("workspace-drag-preview");
  preview.classList.remove(
    "direct-reorder-item",
    "is-dragging",
    "is-keyboard-reordering",
    "is-reorder-shifting",
    "is-flipping",
    "flip-to-note",
    "flip-to-sites",
  );
  preview.removeAttribute("data-reorder-id");
  preview.removeAttribute("draggable");
  preview.setAttribute("aria-hidden", "true");
  preview.setAttribute("inert", "");
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  preview.style.gridTemplateRows = sourceStyles.gridTemplateRows;
  ["--tile-label-height", "--tile-height", "--tile-unit"].forEach((property) => {
    const value = sourceStyles.getPropertyValue(property).trim();
    if (value) preview.style.setProperty(property, value);
  });
  preview.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
  preview.querySelectorAll("[for]").forEach((element) => element.removeAttribute("for"));
  preview.querySelectorAll("[draggable]").forEach((element) => element.removeAttribute("draggable"));
  return preview;
}

export function setWorkspaceCardFace(node, face) {
  const isNote = face === "note";
  const sitesFace = node.querySelector(".workspace-sites-face");
  const noteFace = node.querySelector(".workspace-note-face");
  const titleButton = node.querySelector(".workspace-open-button");
  node.classList.toggle("is-note", isNote);
  sitesFace.toggleAttribute("inert", isNote);
  noteFace.toggleAttribute("inert", !isNote);
  sitesFace.setAttribute("aria-hidden", String(isNote));
  noteFace.setAttribute("aria-hidden", String(!isNote));
  if (titleButton) {
    const actionLabel = t(isNote ? "查看网站" : "查看便签");
    titleButton.title = actionLabel;
    titleButton.ariaLabel = `${titleButton.textContent} · ${actionLabel}`;
  }
  if (isNote) {
    const workspace = getWorkspace(node.dataset.workspaceId);
    if (workspace) renderWorkspaceNote(noteFace, workspace.id, workspace.note);
  }
}

export function flipWorkspaceCard(node, workspaceId, face, fromKeyboard = false, persist = true) {
  const currentFace = node.classList.contains("is-note") ? "note" : "sites";
  if (currentFace === face || node.classList.contains("is-flipping")) return;
  const animationClass = face === "note" ? "flip-to-note" : "flip-to-sites";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node.style.setProperty("--workspace-half-width", `${node.getBoundingClientRect().width / 2}px`);

  const finish = () => {
    setWorkspaceCardFace(node, face);
    node.classList.remove("is-flipping", "flip-to-note", "flip-to-sites");
    if (fromKeyboard) {
      node.querySelector(".workspace-open-button")?.focus();
    }
  };

  if (reduceMotion) {
    finish();
  } else {
    const inner = node.querySelector(".workspace-card-inner");
    let completed = false;
    const completeOnce = () => {
      if (completed) return;
      completed = true;
      inner.removeEventListener("animationend", onAnimationEnd);
      finish();
    };
    const onAnimationEnd = (event) => {
      if (event.target === inner) completeOnce();
    };
    node.classList.add("is-flipping", animationClass);
    inner.addEventListener("animationend", onAnimationEnd);
    window.setTimeout(completeOnce, 640);
  }

  if (persist) void persistWorkspaceCardFace(node, workspaceId, face, currentFace);
}

async function persistWorkspaceCardFace(node, workspaceId, face, previousFace) {
  const version = (cardFaceSaveVersions.get(workspaceId) || 0) + 1;
  cardFaceSaveVersions.set(workspaceId, version);
  const previousQueue = cardFaceSaveQueues.get(workspaceId) || Promise.resolve();
  const savePromise = previousQueue.catch(() => {}).then(() => updateWorkspaceData(workspaceId, (workspace) => {
    workspace.cardFace = face;
  }));
  cardFaceSaveQueues.set(workspaceId, savePromise);
  try {
    await savePromise;
  } catch {
    if (cardFaceSaveVersions.get(workspaceId) !== version || !node.isConnected) return;
    flipWorkspaceCard(node, workspaceId, previousFace, false, false);
    showToast(t("无法保存卡片显示状态。请重试。"), "error");
  } finally {
    if (cardFaceSaveQueues.get(workspaceId) === savePromise) cardFaceSaveQueues.delete(workspaceId);
  }
}

async function updateWorkspaceData(workspaceId, update) {
  const previousState = getState();
  const latestState = await loadStateForUpdate();
  const workspace = latestState.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) {
    setState(latestState);
    const error = new Error("Workspace not found");
    error.code = "WORKSPACE_NOT_FOUND";
    throw error;
  }
  update(workspace);
  setState(latestState);
  try {
    await saveState();
    return workspace;
  } catch (error) {
    setState(previousState);
    throw error;
  }
}
