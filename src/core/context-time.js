const CONTEXT_STATE_SCHEMA_VERSION = 2;
const RECORDED_TIME_ORIGIN = "recorded";
const LEGACY_TIME_ORIGIN = "legacy_migration";

function toValidIso(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : "";
}

function toNowMilliseconds(value = Date.now()) {
  if (value instanceof Date) return value.getTime();
  const milliseconds = Number(value);
  return Number.isFinite(milliseconds) ? milliseconds : Date.now();
}

function getMigrationAt(sourceState, now = Date.now()) {
  return toValidIso(sourceState?.contextTimeMigratedAt)
    || new Date(toNowMilliseconds(now)).toISOString();
}

function getLegacyAt(migrationAt) {
  return new Date(Date.parse(migrationAt) - 1).toISOString();
}

function normalizeEntityTime(value, origin, legacyAt) {
  const timestamp = toValidIso(value) || legacyAt;
  const normalizedOrigin = timestamp === legacyAt
    ? LEGACY_TIME_ORIGIN
    : (origin === RECORDED_TIME_ORIGIN ? RECORDED_TIME_ORIGIN : LEGACY_TIME_ORIGIN);
  return { timestamp, origin: normalizedOrigin };
}

function getLatestRecordedAt(sourceState, migrationAt) {
  const candidates = [
    toValidIso(sourceState?.lastRecordedAt),
    ...((Array.isArray(sourceState?.workspaces) ? sourceState.workspaces : []).flatMap((workspace) => [
      workspace?.createdAtOrigin === RECORDED_TIME_ORIGIN ? toValidIso(workspace.createdAt) : "",
      ...((Array.isArray(workspace?.sites) ? workspace.sites : []).map((site) => (
        site?.addedAtOrigin === RECORDED_TIME_ORIGIN ? toValidIso(site.addedAt) : ""
      ))),
    ])),
  ].filter(Boolean);

  if (!candidates.length) return migrationAt;
  return new Date(Math.max(...candidates.map((candidate) => Date.parse(candidate)))).toISOString();
}

function getNextRecordedAt(sourceState, now = Date.now()) {
  const migrationAt = getMigrationAt(sourceState, now);
  const lastRecordedAt = getLatestRecordedAt(sourceState, migrationAt);
  const milliseconds = Math.max(
    toNowMilliseconds(now),
    Date.parse(migrationAt) + 1,
    Date.parse(lastRecordedAt) + 1,
  );
  return new Date(milliseconds).toISOString();
}

function markStateRecordedAt(sourceState, recordedAt) {
  const normalized = toValidIso(recordedAt);
  if (sourceState && normalized) sourceState.lastRecordedAt = normalized;
  return normalized;
}

function createRecordedWorkspaceFields(sourceState, now = Date.now()) {
  const createdAt = getNextRecordedAt(sourceState, now);
  markStateRecordedAt(sourceState, createdAt);
  return { createdAt, createdAtOrigin: RECORDED_TIME_ORIGIN };
}

function createRecordedSiteFields(sourceState, now = Date.now()) {
  const addedAt = getNextRecordedAt(sourceState, now);
  markStateRecordedAt(sourceState, addedAt);
  return { addedAt, addedAtOrigin: RECORDED_TIME_ORIGIN };
}

export {
  CONTEXT_STATE_SCHEMA_VERSION,
  LEGACY_TIME_ORIGIN,
  RECORDED_TIME_ORIGIN,
  createRecordedSiteFields,
  createRecordedWorkspaceFields,
  getLatestRecordedAt,
  getLegacyAt,
  getMigrationAt,
  getNextRecordedAt,
  markStateRecordedAt,
  normalizeEntityTime,
  toValidIso,
};
