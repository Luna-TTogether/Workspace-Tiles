import { t } from "./i18n.js";
import { closeMenu, closeModal, getCurrentModal, showToast } from "./ui-components.js";

let pointerReorder = null;
let keyboardReorder = null;
let reorderSavePending = false;
let suppressReorderClickUntil = 0;
let renderApp = () => {};
let directPointerGesture = null;
let directPointerListenersReady = false;

function configureReorder({ render }) {
  renderApp = render;
  ensureDirectPointerListeners();
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
  item._reorderHandle = handle;
  handle.addEventListener("dragstart", (event) => startPointerReorder(event, item, resolveContainer(), {
    handle,
    focusOnComplete: true,
  }));
  handle.addEventListener("dragend", () => {
    if (pointerReorder?.item !== item) return;
    suppressReorderClickUntil = Date.now() + 400;
    cancelPointerReorder();
  });
  handle.addEventListener("keydown", (event) => handleReorderKeydown(event, item, resolveContainer()));
  handle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (Date.now() < suppressReorderClickUntil) event.preventDefault();
  });
}

function attachDirectReorder(
  item,
  container,
  { ignoreSelector = "", dragSource = null, createDragImage = null } = {},
) {
  const resolveContainer = () => container || item.parentElement;
  item.draggable = true;
  if (dragSource) dragSource.draggable = true;
  item.classList.add("direct-reorder-item");
  item.addEventListener("pointerdown", (event) => {
    if (ignoreSelector && event.target.closest(ignoreSelector)) return;
    beginDirectPointerGesture(event, item);
  });
  item.addEventListener("dragstart", (event) => {
    if (event.target.closest(".direct-reorder-item") !== item) return;
    if (pointerReorder?.item === item) return;
    if (ignoreSelector && event.target.closest(ignoreSelector)) {
      event.preventDefault();
      return;
    }
    markDirectPointerGestureDragged(item);
    const temporaryDragImage = createDragImage?.(item) || null;
    if (temporaryDragImage) document.body.append(temporaryDragImage);
    try {
      startPointerReorder(event, item, resolveContainer(), {
        handle: item._reorderHandle || null,
        focusOnComplete: false,
        dragImage: temporaryDragImage || dragSource || item,
        dragImageOffsetSource: temporaryDragImage ? item : (dragSource || item),
      });
    } finally {
      if (temporaryDragImage) {
        requestAnimationFrame(() => temporaryDragImage.remove());
      }
    }
  });
  item.addEventListener("dragend", () => {
    if (pointerReorder?.item !== item) return;
    suppressReorderClickUntil = Date.now() + 400;
    cancelPointerReorder();
  });
  item.addEventListener("click", (event) => {
    if (Date.now() >= suppressReorderClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

function startPointerReorder(
  event,
  item,
  container,
  {
    handle = null,
    focusOnComplete = false,
    dragImage = item,
    dragImageOffsetSource = dragImage,
  } = {},
) {
  const config = container?._reorderConfig;
  if (!config || reorderSavePending) {
    event.preventDefault();
    return;
  }
  cancelKeyboardReorder();
  closeMenu({ restoreFocus: false });
  const items = getReorderItems(container, config);
  const originalIds = items.map((candidate) => candidate.dataset.reorderId);
  const itemRects = items.map((candidate) => candidate.getBoundingClientRect());
  const itemIndex = items.indexOf(item);
  const scrollTop = config.scrollContainer?.scrollTop || 0;
  pointerReorder = {
    container,
    config,
    item,
    handle,
    focusOnComplete,
    itemId: item.dataset.reorderId,
    items,
    itemRects,
    itemIndex,
    targetIndex: itemIndex,
    scrollTop,
    originalIds,
    fullIds: config.getFullIds?.() || originalIds,
  };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", item.dataset.reorderId);
  const dragImageRect = dragImage.getBoundingClientRect();
  const offsetSourceRect = dragImageOffsetSource.getBoundingClientRect();
  event.dataTransfer.setDragImage(
    dragImage,
    Math.max(0, Math.min(dragImageRect.width, event.clientX - offsetSourceRect.left)),
    Math.max(0, Math.min(dragImageRect.height, event.clientY - offsetSourceRect.top)),
  );
  requestAnimationFrame(() => {
    if (pointerReorder !== null && pointerReorder.item === item) item.classList.add("is-dragging");
  });
  container.classList.add("is-reordering");
  handle?.setAttribute("aria-pressed", "true");
  announceReorder(getReorderPositionMessage(pointerReorder));
}

function handleReorderDragOver(event) {
  const session = pointerReorder;
  if (!session || session.container !== event.currentTarget) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  autoScrollReorderContainer(event, session.config.scrollContainer);
  const targetIndex = getReorderHitIndex(session, event.clientX, event.clientY);
  if (targetIndex < 0 || targetIndex === session.targetIndex) return;
  session.targetIndex = targetIndex;
  updateReorderTransforms(session);
  announceReorder(getPointerReorderPositionMessage(session));
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
  const visibleIds = reorderIdsByIndex(session.originalIds, session.itemIndex, session.targetIndex);
  const orderedIds = session.config.preserveHiddenPositions
    ? mergeVisibleOrder(session.fullIds, visibleIds)
    : [...visibleIds, ...session.fullIds.filter((id) => !visibleIds.includes(id))];
  if (arraysEqual(orderedIds, session.fullIds)) {
    announceReorder(t("顺序未改变"));
    if (session.focusOnComplete && session.handle?.isConnected) session.handle.focus();
    return;
  }
  void saveReorder(session, orderedIds);
}

function cancelPointerReorder() {
  const session = pointerReorder;
  if (!session) return false;
  pointerReorder = null;
  clearReorderSessionUi(session);
  announceReorder(t("已取消排序"));
  if (session.focusOnComplete && session.handle?.isConnected) session.handle.focus();
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
  session.items?.forEach((item) => {
    item.classList.remove("is-reorder-shifting");
    item.style.removeProperty("transform");
    item.style.removeProperty("z-index");
  });
  session.handle?.setAttribute("aria-pressed", "false");
  session.lockedButtons?.forEach(([button, wasDisabled]) => {
    if (button.isConnected) button.disabled = wasDisabled;
  });
}

function ensureDirectPointerListeners() {
  if (directPointerListenersReady) return;
  directPointerListenersReady = true;
  document.addEventListener("pointermove", trackDirectPointerGesture, true);
  document.addEventListener("pointerup", finishDirectPointerGesture, true);
  document.addEventListener("pointercancel", finishDirectPointerGesture, true);
}

function beginDirectPointerGesture(event, item) {
  if (event.button !== 0) return;
  directPointerGesture = {
    item,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
}

function markDirectPointerGestureDragged(item) {
  if (directPointerGesture?.item === item) directPointerGesture.moved = true;
}

function trackDirectPointerGesture(event) {
  const gesture = directPointerGesture;
  if (!gesture || event.pointerId !== gesture.pointerId || gesture.moved) return;
  if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 5) return;
  gesture.moved = true;
}

function finishDirectPointerGesture(event) {
  const gesture = directPointerGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  directPointerGesture = null;
  if (gesture.moved) suppressReorderClickUntil = Date.now() + 400;
}

function getSessionScrollDelta(session) {
  return (session.config.scrollContainer?.scrollTop || 0) - session.scrollTop;
}

function getReorderHitIndex(session, clientX, clientY) {
  const scrollDelta = getSessionScrollDelta(session);
  const rects = session.itemRects.map((rect) => ({
    left: rect.left,
    right: rect.right,
    top: rect.top - scrollDelta,
    bottom: rect.bottom - scrollDelta,
    width: rect.width,
    height: rect.height,
  }));
  const directHit = rects.findIndex((rect) => (
    clientX >= rect.left && clientX <= rect.right
    && clientY >= rect.top && clientY <= rect.bottom
  ));
  if (directHit >= 0) return directHit;

  const bounds = session.container.getBoundingClientRect();
  if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) {
    return -1;
  }
  return rects
    .map((rect, index) => {
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      return { index, distance: dx ** 2 + dy ** 2 };
    })
    .sort((first, second) => first.distance - second.distance)[0]?.index ?? -1;
}

function updateReorderTransforms(session) {
  const { itemIndex, itemRects, targetIndex } = session;
  session.items.forEach((item, index) => {
    if (index === itemIndex) return;
    let positionIndex = index;
    if (itemIndex < targetIndex && index > itemIndex && index <= targetIndex) {
      positionIndex = index - 1;
    } else if (itemIndex > targetIndex && index < itemIndex && index >= targetIndex) {
      positionIndex = index + 1;
    }
    item.classList.add("is-reorder-shifting");
    if (positionIndex === index) {
      item.style.transform = "translate(0, 0)";
      return;
    }
    const from = itemRects[index];
    const to = itemRects[positionIndex];
    item.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px)`;
  });
}

function getPointerReorderPositionMessage(session) {
  return t("reorderPosition", {
    position: session.targetIndex + 1,
    count: session.items.length,
    kind: session.config.kind,
  });
}

function reorderIdsByIndex(ids, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return [...ids];
  const reordered = [...ids];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return reordered;
}

function getReorderItems(container, config) {
  return Array.from(container.querySelectorAll(config.itemSelector));
}

function getReorderIds(container, config) {
  return getReorderItems(container, config).map((item) => item.dataset.reorderId);
}

function getCommitReorderIds(session) {
  const visibleIds = getReorderIds(session.container, session.config);
  if (session.config.preserveHiddenPositions) {
    return mergeVisibleOrder(session.fullIds, visibleIds);
  }
  const visibleIdSet = new Set(visibleIds);
  return [...visibleIds, ...session.fullIds.filter((id) => !visibleIdSet.has(id))];
}

function mergeVisibleOrder(fullIds, visibleIds) {
  const visibleIdSet = new Set(visibleIds);
  let visibleIndex = 0;
  return fullIds.map((id) => {
    if (!visibleIdSet.has(id)) return id;
    const nextId = visibleIds[visibleIndex];
    visibleIndex += 1;
    return nextId;
  });
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
    if (session.focusOnComplete) focusReorderHandle(session.config.kind, session.itemId);
  } catch (error) {
    if (error?.code === "WORKSPACE_NOT_FOUND") {
      closeModal({ restoreFocus: false });
      renderApp();
      showToast(t("工作区已不存在。"), "error");
    } else {
      restoreReorderDom(session.container, session.config, session.fullIds);
      showToast(t("无法保存排序。请重试。"), "error");
      announceReorder(t("无法保存排序，已恢复原顺序"));
      if (session.focusOnComplete && session.handle?.isConnected) {
        requestAnimationFrame(() => session.handle.focus());
      }
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
  attachDirectReorder,
  attachReorderHandle,
  cancelActiveReorder,
  cancelKeyboardReorder,
  cancelPointerReorder,
  cancelReorderIn,
  configureReorder,
  configureReorderContainer,
  createReorderHandle,
  mergeVisibleOrder,
  reorderIdsByIndex,
  reorderLatestItems,
};
