import { t } from "./i18n.js";
import { closeMenu, closeModal, getCurrentModal, showToast } from "./ui-components.js";

let pointerReorder = null;
let keyboardReorder = null;
let reorderSavePending = false;
let suppressReorderClickUntil = 0;
let renderApp = () => {};

function configureReorder({ render }) {
  renderApp = render;
}

function createReorderHandle(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button reorder-handle";
  button.title = label;
  button.ariaLabel = label;
  button.setAttribute("aria-describedby", "reorderInstructions");
  button.setAttribute("aria-pressed", "false");
  button.draggable = true;
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="7" r="1.4"></circle>
      <circle cx="16" cy="7" r="1.4"></circle>
      <circle cx="8" cy="12" r="1.4"></circle>
      <circle cx="16" cy="12" r="1.4"></circle>
      <circle cx="8" cy="17" r="1.4"></circle>
      <circle cx="16" cy="17" r="1.4"></circle>
    </svg>
  `;
  return button;
}

function configureReorderContainer(container, config) {
  container._reorderConfig = config;
  if (container.dataset.reorderReady === "true") return;
  container.dataset.reorderReady = "true";
  container.addEventListener("dragover", handleReorderDragOver);
  container.addEventListener("drop", handleReorderDrop);
}

function attachReorderHandle(handle, item, container) {
  const resolveContainer = () => container || item.parentElement;
  handle.addEventListener("dragstart", (event) => startPointerReorder(event, item, resolveContainer()));
  handle.addEventListener("dragend", () => {
    if (pointerReorder?.item === item) cancelPointerReorder();
  });
  handle.addEventListener("keydown", (event) => handleReorderKeydown(event, item, resolveContainer()));
  handle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (Date.now() < suppressReorderClickUntil) event.preventDefault();
  });
}

function startPointerReorder(event, item, container) {
  const config = container?._reorderConfig;
  if (!config || reorderSavePending) {
    event.preventDefault();
    return;
  }
  cancelKeyboardReorder();
  closeMenu({ restoreFocus: false });
  const originalIds = getReorderIds(container, config);
  pointerReorder = {
    container,
    config,
    item,
    handle: event.currentTarget,
    itemId: item.dataset.reorderId,
    originalIds,
    fullIds: config.getFullIds?.() || originalIds,
  };
  item.classList.add("is-dragging");
  container.classList.add("is-reordering");
  event.currentTarget.setAttribute("aria-pressed", "true");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", item.dataset.reorderId);
  event.dataTransfer.setDragImage(item, item.offsetWidth / 2, 24);
  announceReorder(getReorderPositionMessage(pointerReorder));
}

function handleReorderDragOver(event) {
  const session = pointerReorder;
  if (!session || session.container !== event.currentTarget) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  autoScrollReorderContainer(event, session.config.scrollContainer);
  const target = event.target.closest(session.config.itemSelector);
  if (target && target !== session.item) {
    placeReorderItemAtTarget(session, target, event);
    return;
  }
  const fixedEnd = getReorderFixedEnd(session.container, session.config);
  if (event.target.closest(session.config.fixedEndSelector)) {
    session.container.insertBefore(session.item, fixedEnd);
    return;
  }
  const nearestItem = getReorderItems(session.container, session.config)
    .filter((item) => item !== session.item)
    .map((item) => {
      const rect = item.getBoundingClientRect();
      const deltaX = event.clientX - (rect.left + rect.width / 2);
      const deltaY = event.clientY - (rect.top + rect.height / 2);
      return { item, distance: deltaX ** 2 + deltaY ** 2 };
    })
    .sort((first, second) => first.distance - second.distance)[0]?.item;
  if (nearestItem) placeReorderItemAtTarget(session, nearestItem, event);
}

function placeReorderItemAtTarget(session, target, event) {
  const rect = target.getBoundingClientRect();
  const columns = getComputedStyle(session.container).gridTemplateColumns.split(" ").length;
  const insertBefore = columns > 1
    ? event.clientX < rect.left + rect.width / 2
    : event.clientY < rect.top + rect.height / 2;
  target[insertBefore ? "before" : "after"](session.item);
}

function handleReorderDrop(event) {
  if (!pointerReorder || pointerReorder.container !== event.currentTarget) return;
  event.preventDefault();
  suppressReorderClickUntil = Date.now() + 400;
  finishPointerReorder();
}

function finishPointerReorder() {
  const session = pointerReorder;
  if (!session) return;
  pointerReorder = null;
  clearReorderSessionUi(session);
  const orderedIds = getCommitReorderIds(session);
  if (arraysEqual(orderedIds, session.fullIds)) {
    announceReorder(t("顺序未改变"));
    session.handle.focus();
    return;
  }
  void saveReorder(session, orderedIds);
}

function cancelPointerReorder() {
  const session = pointerReorder;
  if (!session) return false;
  pointerReorder = null;
  restoreReorderDom(session.container, session.config, session.fullIds);
  clearReorderSessionUi(session);
  announceReorder(t("已取消排序"));
  if (session.handle.isConnected) session.handle.focus();
  return true;
}

function handleReorderKeydown(event, item, container) {
  const config = container?._reorderConfig;
  if (!config || reorderSavePending) return;
  const isActiveHandle = keyboardReorder?.handle === event.currentTarget;
  if (!keyboardReorder && (event.key === " " || event.key === "Enter")) {
    event.preventDefault();
    beginKeyboardReorder(item, event.currentTarget, container, config);
    return;
  }
  if (!isActiveHandle) return;
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    finishKeyboardReorder();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    cancelKeyboardReorder();
    return;
  }
  if (event.key === "Tab") {
    cancelKeyboardReorder();
    return;
  }
  const items = getReorderItems(container, config);
  const currentIndex = items.indexOf(item);
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex -= 1;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex += 1;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = items.length - 1;
  nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
  if (nextIndex === currentIndex) return;
  event.preventDefault();
  moveReorderItem(container, config, item, nextIndex);
  event.currentTarget.focus();
  announceReorder(getReorderPositionMessage(keyboardReorder));
}

function beginKeyboardReorder(item, handle, container, config) {
  cancelPointerReorder();
  closeMenu({ restoreFocus: false });
  config.ensureAll?.();
  const originalIds = getReorderIds(container, config);
  keyboardReorder = {
    container,
    config,
    item,
    handle,
    itemId: item.dataset.reorderId,
    originalIds,
    fullIds: config.getFullIds?.() || originalIds,
  };
  keyboardReorder.lockedButtons = Array.from(container.querySelectorAll("button"))
    .filter((button) => button !== handle)
    .map((button) => [button, button.disabled]);
  keyboardReorder.lockedButtons.forEach(([button]) => { button.disabled = true; });
  item.classList.add("is-keyboard-reordering");
  container.classList.add("is-reordering");
  handle.setAttribute("aria-pressed", "true");
  announceReorder(t("reorderInstructionsActive", { positionMessage: getReorderPositionMessage(keyboardReorder) }));
}

function finishKeyboardReorder() {
  const session = keyboardReorder;
  if (!session) return;
  keyboardReorder = null;
  clearReorderSessionUi(session);
  const orderedIds = getCommitReorderIds(session);
  if (arraysEqual(orderedIds, session.fullIds)) {
    announceReorder(t("顺序未改变"));
    session.handle.focus();
    return;
  }
  void saveReorder(session, orderedIds);
}

function cancelKeyboardReorder() {
  const session = keyboardReorder;
  if (!session) return false;
  keyboardReorder = null;
  restoreReorderDom(session.container, session.config, session.fullIds);
  clearReorderSessionUi(session);
  announceReorder(t("已取消排序"));
  if (session.handle.isConnected) session.handle.focus();
  return true;
}

function cancelActiveReorder() {
  return cancelKeyboardReorder() || cancelPointerReorder();
}

function cancelReorderIn(container) {
  if (pointerReorder && container?.contains(pointerReorder.container)) cancelPointerReorder();
  if (keyboardReorder && container?.contains(keyboardReorder.container)) cancelKeyboardReorder();
}

function clearReorderSessionUi(session) {
  session.item.classList.remove("is-dragging", "is-keyboard-reordering");
  session.container.classList.remove("is-reordering");
  session.handle.setAttribute("aria-pressed", "false");
  session.lockedButtons?.forEach(([button, wasDisabled]) => {
    if (button.isConnected) button.disabled = wasDisabled;
  });
}

function getReorderItems(container, config) {
  return Array.from(container.querySelectorAll(config.itemSelector));
}

function getReorderIds(container, config) {
  return getReorderItems(container, config).map((item) => item.dataset.reorderId);
}

function getCommitReorderIds(session) {
  const visibleIds = getReorderIds(session.container, session.config);
  const visibleIdSet = new Set(visibleIds);
  return [...visibleIds, ...session.fullIds.filter((id) => !visibleIdSet.has(id))];
}

function getReorderFixedEnd(container, config) {
  return config.fixedEndSelector ? container.querySelector(config.fixedEndSelector) : null;
}

function moveReorderItem(container, config, item, nextIndex) {
  const otherItems = getReorderItems(container, config).filter((candidate) => candidate !== item);
  const fixedEnd = getReorderFixedEnd(container, config);
  if (nextIndex >= otherItems.length) container.insertBefore(item, fixedEnd);
  else container.insertBefore(item, otherItems[nextIndex]);
}

function restoreReorderDom(container, config, orderedIds) {
  if (!container?.isConnected) return;
  const itemById = new Map(getReorderItems(container, config).map((item) => [item.dataset.reorderId, item]));
  const fixedEnd = getReorderFixedEnd(container, config);
  orderedIds.forEach((id) => {
    const item = itemById.get(id);
    if (item) container.insertBefore(item, fixedEnd);
  });
}

function getReorderPositionMessage(session) {
  const items = getReorderItems(session.container, session.config);
  const position = items.indexOf(session.item) + 1;
  return t("reorderPosition", { position, count: items.length, kind: session.config.kind });
}

function autoScrollReorderContainer(event, scrollContainer) {
  if (!scrollContainer) return;
  const rect = scrollContainer.getBoundingClientRect();
  const threshold = 52;
  if (event.clientY < rect.top + threshold) scrollContainer.scrollTop -= 18;
  if (event.clientY > rect.bottom - threshold) scrollContainer.scrollTop += 18;
}

function announceReorder(message) {
  const reorderStatus = document.getElementById("reorderStatus");
  reorderStatus.textContent = "";
  requestAnimationFrame(() => { reorderStatus.textContent = message; });
}

function arraysEqual(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

async function saveReorder(session, orderedIds) {
  reorderSavePending = true;
  const buttonStates = setReorderContainerBusy(session.container, true);
  try {
    await session.config.commit(orderedIds);
    renderApp();
    announceReorder(t("排序已保存"));
    focusReorderHandle(session.config.kind, session.itemId);
  } catch (error) {
    if (error?.code === "WORKSPACE_NOT_FOUND") {
      closeModal({ restoreFocus: false });
      renderApp();
      showToast(t("工作区已不存在。"), "error");
    } else {
      restoreReorderDom(session.container, session.config, session.fullIds);
      showToast(t("无法保存排序。请重试。"), "error");
      announceReorder(t("无法保存排序，已恢复原顺序"));
      if (session.handle.isConnected) requestAnimationFrame(() => session.handle.focus());
    }
  } finally {
    reorderSavePending = false;
    setReorderContainerBusy(session.container, false, buttonStates);
  }
}

function setReorderContainerBusy(container, isBusy, previousStates = []) {
  if (!container?.isConnected) return previousStates;
  if (isBusy) {
    const states = Array.from(container.querySelectorAll("button")).map((button) => [button, button.disabled]);
    states.forEach(([button]) => { button.disabled = true; });
    container.setAttribute("aria-busy", "true");
    return states;
  }
  previousStates.forEach(([button, wasDisabled]) => {
    if (button.isConnected) button.disabled = wasDisabled;
  });
  container.removeAttribute("aria-busy");
  return previousStates;
}

function focusReorderHandle(kind, itemId) {
  requestAnimationFrame(() => {
    const container = kind === "workspace"
      ? document.getElementById("workspaceGrid")
      : getCurrentModal()?.dialog;
    const item = Array.from(container?.querySelectorAll("[data-reorder-id]") || [])
      .find((candidate) => candidate.dataset.reorderId === itemId);
    item?.querySelector(".reorder-handle")?.focus();
  });
}

function reorderLatestItems(items, orderedIds) {
  const latestById = new Map(items.map((item) => [item.id, item]));
  const orderedExistingIds = orderedIds.filter((id) => latestById.has(id));
  const reorderedIdSet = new Set(orderedExistingIds);
  let orderedIndex = 0;
  return items.map((item) => {
    if (!reorderedIdSet.has(item.id)) return item;
    const nextId = orderedExistingIds[orderedIndex];
    orderedIndex += 1;
    return latestById.get(nextId);
  });
}

export {
  attachReorderHandle,
  cancelActiveReorder,
  cancelKeyboardReorder,
  cancelPointerReorder,
  cancelReorderIn,
  configureReorder,
  configureReorderContainer,
  createReorderHandle,
  reorderLatestItems,
};
