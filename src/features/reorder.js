import { t } from "../core/i18n.js";
import { closeMenu, closeModal, getCurrentModal, showToast } from "../ui/ui-components.js";

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
    const dragPreview = createDragImage?.(item) || null;
    if (dragPreview) document.body.append(dragPreview);
    const started = startPointerReorder(event, item, resolveContainer(), {
      handle: item._reorderHandle || null,
      focusOnComplete: false,
      dragImage: dragSource || item,
      dragImageOffsetSource: dragSource || item,
      dragPreview,
    });
    if (!started) {
      dragPreview?.remove();
    }
  });
  item.addEventListener("dragend", () => {
    if (pointerReorder?.item !== item) return;
    suppressReorderClickUntil = Date.now() + 400;
    cancelPointerReorder();
  });
  item.addEventListener("drag", (event) => {
    if (pointerReorder?.item !== item || (!event.clientX && !event.clientY)) return;
    positionDragPreview(pointerReorder, event.clientX, event.clientY);
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
    dragPreview = null,
  } = {},
) {
  const config = container?._reorderConfig;
  if (!config || reorderSavePending) {
    event.preventDefault();
    return false;
  }
  cancelKeyboardReorder();
  closeMenu({ restoreFocus: false });
  const items = getReorderItems(container, config);
  const originalIds = items.map((candidate) => candidate.dataset.reorderId);
  const itemRects = items.map((candidate) => candidate.getBoundingClientRect());
  const itemIndex = items.indexOf(item);
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
    originalIds,
    fullIds: config.getFullIds?.() || originalIds,
    dragPreview,
    pointerOffsetX: event.clientX - itemRects[itemIndex].left,
    pointerOffsetY: event.clientY - itemRects[itemIndex].top,
    pendingPointerX: event.clientX,
    pendingPointerY: event.clientY,
    previewFrame: 0,
    reorderFrame: 0,
    lastReorderAt: 0,
  };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", item.dataset.reorderId);
  if (dragPreview) {
    positionDragPreview(pointerReorder, event.clientX, event.clientY, true);
    const nativeDragImage = createTransparentDragImage();
    event.dataTransfer.setDragImage(nativeDragImage, 0, 0);
    requestAnimationFrame(() => nativeDragImage.remove());
  } else {
    const dragImageRect = dragImage.getBoundingClientRect();
    const offsetSourceRect = dragImageOffsetSource.getBoundingClientRect();
    event.dataTransfer.setDragImage(
      dragImage,
      Math.max(0, Math.min(dragImageRect.width, event.clientX - offsetSourceRect.left)),
      Math.max(0, Math.min(dragImageRect.height, event.clientY - offsetSourceRect.top)),
    );
  }
  requestAnimationFrame(() => {
    if (pointerReorder !== null && pointerReorder.item === item) {
      item.classList.add("is-dragging");
      dragPreview?.classList.add("is-drag-preview-active");
    }
  });
  container.classList.add("is-reordering");
  handle?.setAttribute("aria-pressed", "true");
  announceReorder(getReorderPositionMessage(pointerReorder));
  return true;
}

function handleReorderDragOver(event) {
  const session = pointerReorder;
  if (!session || session.container !== event.currentTarget) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  positionDragPreview(session, event.clientX, event.clientY);
  autoScrollReorderContainer(event, session.config.scrollContainer);
  session.pendingPointerX = event.clientX;
  session.pendingPointerY = event.clientY;
  if (!session.reorderFrame) {
    session.reorderFrame = requestAnimationFrame(() => processPointerReorderFrame(session));
  }
}

function handleReorderDrop(event) {
  const session = pointerReorder;
  if (!session || session.container !== event.currentTarget) return;
  event.preventDefault();
  session.pendingPointerX = event.clientX;
  session.pendingPointerY = event.clientY;
  positionDragPreview(session, event.clientX, event.clientY, true);
  processPointerReorderFrame(session, true);
  suppressReorderClickUntil = Date.now() + 400;
  finishPointerReorder();
}

function processPointerReorderFrame(session, ignoreCooldown = false) {
  if (session.reorderFrame) cancelAnimationFrame(session.reorderFrame);
  session.reorderFrame = 0;
  if (pointerReorder !== session) return;
  const targetIndex = getReorderHitIndex(session, session.pendingPointerX, session.pendingPointerY);
  const items = getReorderItems(session.container, session.config);
  const currentIndex = items.indexOf(session.item);
  if (targetIndex < 0 || targetIndex === currentIndex) return;
  const now = Date.now();
  if (!ignoreCooldown && now - session.lastReorderAt < 90) return;
  if (!hasCrossedReorderThreshold(
    items[currentIndex].getBoundingClientRect(),
    items[targetIndex].getBoundingClientRect(),
    session.pendingPointerX,
    session.pendingPointerY,
  )) return;
  animatePointerReorderToIndex(session, targetIndex);
  session.lastReorderAt = now;
  announceReorder(getPointerReorderPositionMessage(session));
}

function finishPointerReorder() {
  const session = pointerReorder;
  if (!session) return;
  pointerReorder = null;
  cancelPointerReorderFrames(session);
  const orderedIds = getCommitReorderIds(session);
  settleDragPreview(session, session.item.getBoundingClientRect());
  clearReorderSessionUi(session, {
    keepDraggedItem: Boolean(session.dragPreview),
    preserveMotion: true,
  });
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
  cancelPointerReorderFrames(session);
  const originalRect = session.itemRects[session.itemIndex];
  animateReorderDom(session.container, session.config, session.originalIds, session.item);
  settleDragPreview(session, originalRect);
  clearReorderSessionUi(session, {
    keepDraggedItem: Boolean(session.dragPreview),
    preserveMotion: true,
  });
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

function clearReorderSessionUi(session, { keepDraggedItem = false, preserveMotion = false } = {}) {
  if (!keepDraggedItem) session.item.classList.remove("is-dragging");
  session.item.classList.remove("is-keyboard-reordering");
  session.container.classList.remove("is-reordering");
  if (preserveMotion) {
    window.setTimeout(() => {
      if (!session.container.classList.contains("is-reordering")) clearReorderItemMotion(session.items);
    }, 380);
  } else {
    clearReorderItemMotion(session.items);
  }
  session.handle?.setAttribute("aria-pressed", "false");
  session.lockedButtons?.forEach(([button, wasDisabled]) => {
    if (button.isConnected) button.disabled = wasDisabled;
  });
}

function clearReorderItemMotion(items = []) {
  items.forEach((item) => {
    item.classList.remove("is-reorder-shifting");
    item.style.removeProperty("transform");
    item.style.removeProperty("z-index");
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

function getReorderHitIndex(session, clientX, clientY) {
  const items = getReorderItems(session.container, session.config);
  const rects = items.map((item) => {
    const rect = item.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  });
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

function hasCrossedReorderThreshold(currentRect, targetRect, clientX, clientY, threshold = 0.56) {
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentCenterY = currentRect.top + currentRect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const directionX = targetCenterX - currentCenterX;
  const directionY = targetCenterY - currentCenterY;
  const distanceSquared = directionX ** 2 + directionY ** 2;
  if (!distanceSquared) return false;
  const pointerX = clientX - currentCenterX;
  const pointerY = clientY - currentCenterY;
  const progress = (pointerX * directionX + pointerY * directionY) / distanceSquared;
  return progress >= threshold;
}

function animatePointerReorderToIndex(session, targetIndex) {
  const items = getReorderItems(session.container, session.config);
  const previousRects = new Map(items.map((item) => [item, item.getBoundingClientRect()]));
  resetReorderMotion(session.container, items);
  moveReorderItem(session.container, session.config, session.item, targetIndex);
  playReorderFlip(session.container, session.config, previousRects, session.item);
  session.items = getReorderItems(session.container, session.config);
}

function animateReorderDom(container, config, orderedIds, draggedItem = null) {
  if (!container?.isConnected) return;
  const items = getReorderItems(container, config);
  const previousRects = new Map(items.map((item) => [item, item.getBoundingClientRect()]));
  resetReorderMotion(container, items);
  restoreReorderDom(container, config, orderedIds);
  playReorderFlip(container, config, previousRects, draggedItem);
}

function resetReorderMotion(container, items) {
  container.classList.add("is-reorder-measuring");
  items.forEach((item) => {
    item.classList.remove("is-reorder-shifting");
    item.style.removeProperty("transform");
    item.style.removeProperty("z-index");
  });
}

function playReorderFlip(container, config, previousRects, draggedItem) {
  const nextItems = getReorderItems(container, config);
  nextItems.forEach((item) => {
    if (item === draggedItem) return;
    const previousRect = previousRects.get(item);
    if (!previousRect) return;
    const nextRect = item.getBoundingClientRect();
    item.style.transform = `translate3d(${previousRect.left - nextRect.left}px, ${previousRect.top - nextRect.top}px, 0)`;
  });
  void container.offsetWidth;
  container.classList.remove("is-reorder-measuring");
  nextItems.forEach((item) => {
    if (item === draggedItem) return;
    item.classList.add("is-reorder-shifting");
    item.style.transform = "translate3d(0, 0, 0)";
  });
}

function createTransparentDragImage() {
  const image = document.createElement("div");
  image.className = "native-drag-image";
  document.body.append(image);
  return image;
}

function positionDragPreview(session, clientX, clientY, immediate = false) {
  const preview = session.dragPreview;
  if (!preview) return;
  session.pendingPointerX = clientX;
  session.pendingPointerY = clientY;
  if (immediate) {
    if (session.previewFrame) cancelAnimationFrame(session.previewFrame);
    session.previewFrame = 0;
    applyDragPreviewPosition(session);
    return;
  }
  if (!session.previewFrame) {
    session.previewFrame = requestAnimationFrame(() => {
      session.previewFrame = 0;
      if (pointerReorder === session) applyDragPreviewPosition(session);
    });
  }
}

function applyDragPreviewPosition(session) {
  const preview = session.dragPreview;
  if (!preview) return;
  preview.style.setProperty("--drag-x", `${session.pendingPointerX - session.pointerOffsetX}px`);
  preview.style.setProperty("--drag-y", `${session.pendingPointerY - session.pointerOffsetY}px`);
}

function cancelPointerReorderFrames(session) {
  if (session.previewFrame) cancelAnimationFrame(session.previewFrame);
  if (session.reorderFrame) cancelAnimationFrame(session.reorderFrame);
  session.previewFrame = 0;
  session.reorderFrame = 0;
}

function settleDragPreview(session, targetRect) {
  const preview = session.dragPreview;
  if (!preview) return;
  preview.classList.remove("is-drag-preview-active");
  preview.classList.add("is-drag-preview-settling");
  preview.style.setProperty("--drag-x", `${targetRect.left}px`);
  preview.style.setProperty("--drag-y", `${targetRect.top}px`);
  const finish = () => {
    preview.remove();
    session.item.classList.remove("is-dragging");
  };
  preview.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 380);
}

function getPointerReorderPositionMessage(session) {
  const position = getReorderItems(session.container, session.config).indexOf(session.item) + 1;
  return t("reorderPosition", {
    position,
    count: getReorderItems(session.container, session.config).length,
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
    if (session.config.renderAfterCommit === false) {
      restoreReorderDom(session.container, session.config, orderedIds);
    } else {
      renderApp();
    }
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
  hasCrossedReorderThreshold,
  mergeVisibleOrder,
  reorderIdsByIndex,
  reorderLatestItems,
};
