import { t } from "../core/i18n.js";
import { normalizeState, normalizeTileSize } from "../core/state.js";
import { getAppVersion, normalizeUrl } from "../core/utils.js";
import { LEGACY_TIME_ORIGIN, RECORDED_TIME_ORIGIN, toValidIso } from "../core/context-time.js";

const BACKUP_FORMAT = "workspace-tiles-backup";
const BACKUP_SCHEMA_VERSION = 2;
const MAX_BACKUP_FILE_SIZE = 10 * 1024 * 1024;

function createBackup(sourceState, exportedAt = new Date().toISOString(), appVersion = getAppVersion()) {
  const data = normalizeState(sourceState);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    appVersion,
    data: {
      schemaVersion: data.schemaVersion,
      contextTimeMigratedAt: data.contextTimeMigratedAt,
      lastRecordedAt: data.lastRecordedAt,
      workspaces: data.workspaces.map((workspace) => ({
        ...workspace,
        sites: workspace.sites.map(({ faviconUrl, ...site }) => site),
      })),
    },
  };
}

function createBackupFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `workspace-tiles-backup-${year}-${month}-${day}.json`;
}

async function saveBackupFile(contents, filename) {
  if (typeof window.showSaveFilePicker === "function") {
    const handle = await window.showSaveFilePicker({
      id: "workspace-tiles-backup",
      suggestedName: filename,
      startIn: "downloads",
      types: [{
        description: t("Workspace Tiles JSON 备份"),
        accept: { "application/json": [".json"] },
      }],
    });
    const writable = await handle.createWritable();
    await writable.write(new Blob([contents], { type: "application/json;charset=utf-8" }));
    await writable.close();
    return true;
  }

  const url = URL.createObjectURL(new Blob([contents], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

class BackupValidationError extends Error {
  constructor(userMessage) {
    super(userMessage);
    this.name = "BackupValidationError";
    this.userMessage = userMessage;
  }
}

function validateBackupData(value, { now = Date.now() } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BackupValidationError(t("无法导入：这不是有效的 Workspace Tiles 备份文件。"));
  }
  if (value.format !== BACKUP_FORMAT) {
    throw new BackupValidationError(t("无法导入：这不是 Workspace Tiles 创建的备份文件。"));
  }
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
    throw new BackupValidationError(t("无法导入：备份结构版本无效。"));
  }
  if (value.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupValidationError(t("无法导入：该备份由更新版本的 Workspace Tiles 创建。"));
  }
  if (typeof value.exportedAt !== "string" || Number.isNaN(Date.parse(value.exportedAt))) {
    throw new BackupValidationError(t("无法导入：备份时间信息无效。"));
  }
  if (typeof value.appVersion !== "string" || !value.appVersion.trim()) {
    throw new BackupValidationError(t("无法导入：备份缺少插件版本信息。"));
  }
  if (!value.data || typeof value.data !== "object" || !Array.isArray(value.data.workspaces)) {
    throw new BackupValidationError(t("无法导入：备份中的工作区数据无效。"));
  }

  const requiresContextTime = value.schemaVersion >= 2;
  const validOrigins = new Set([RECORDED_TIME_ORIGIN, LEGACY_TIME_ORIGIN]);
  if (requiresContextTime && !toValidIso(value.data.contextTimeMigratedAt)) {
    throw new BackupValidationError(t("无法导入：备份中的工作区数据无效。"));
  }

  const workspaceIds = new Set();
  const workspaces = value.data.workspaces.map((workspace) => {
    if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
      throw new BackupValidationError(t("无法导入：备份中包含无效的工作区。"));
    }
    const workspaceId = typeof workspace.id === "string" ? workspace.id.trim() : "";
    if (!workspaceId || workspaceIds.has(workspaceId)) {
      throw new BackupValidationError(t("无法导入：工作区 ID 缺失或重复。"));
    }
    if (typeof workspace.name !== "string" || !workspace.name.trim() || !Array.isArray(workspace.sites)) {
      throw new BackupValidationError(t("无法导入：工作区名称或网站列表无效。"));
    }
    workspaceIds.add(workspaceId);
    if (requiresContextTime && (
      !toValidIso(workspace.createdAt)
      || !validOrigins.has(workspace.createdAtOrigin)
    )) {
      throw new BackupValidationError(t("无法导入：备份中的工作区数据无效。"));
    }

    const siteIds = new Set();
    const sites = workspace.sites.map((site) => {
      if (!site || typeof site !== "object" || Array.isArray(site)) {
        throw new BackupValidationError(t("无法导入：备份中包含无效的网站。"));
      }
      const siteId = typeof site.id === "string" ? site.id.trim() : "";
      if (!siteId || siteIds.has(siteId)) {
        throw new BackupValidationError(t("无法导入：网站 ID 缺失或重复。"));
      }
      if (typeof site.name !== "string" || !site.name.trim()) {
        throw new BackupValidationError(t("无法导入：网站名称无效。"));
      }
      if (typeof site.url !== "string" || !site.url.trim() || !normalizeUrl(site.url)) {
        throw new BackupValidationError(t("无法导入：备份中包含无效的网址。"));
      }
      if (requiresContextTime && (
        !toValidIso(site.addedAt)
        || !validOrigins.has(site.addedAtOrigin)
      )) {
        throw new BackupValidationError(t("无法导入：备份中包含无效的网站。"));
      }
      siteIds.add(siteId);
      return {
        id: siteId,
        name: site.name.trim(),
        url: normalizeUrl(site.url),
        ...(requiresContextTime ? {
          addedAt: toValidIso(site.addedAt),
          addedAtOrigin: site.addedAtOrigin,
        } : {}),
      };
    });

    const note = typeof workspace.note === "string" ? workspace.note : "";
    const cardFace = workspace.cardFace === "note" ? "note" : "sites";
    const tileSize = normalizeTileSize(workspace.tileSize);
    return {
      id: workspaceId,
      name: workspace.name.trim(),
      note,
      cardFace,
      tileSize,
      ...(requiresContextTime ? {
        createdAt: toValidIso(workspace.createdAt),
        createdAtOrigin: workspace.createdAtOrigin,
      } : {}),
      sites,
    };
  });

  const state = normalizeState({
    ...(requiresContextTime ? {
      schemaVersion: value.data.schemaVersion,
      contextTimeMigratedAt: value.data.contextTimeMigratedAt,
      lastRecordedAt: value.data.lastRecordedAt,
    } : {}),
    workspaces,
  }, { now });

  return {
    state,
    workspaceCount: workspaces.length,
    siteCount: workspaces.reduce((total, workspace) => total + workspace.sites.length, 0),
  };
}

export {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_FILE_SIZE,
  BackupValidationError,
  createBackup,
  createBackupFilename,
  saveBackupFile,
  validateBackupData,
};
