import { getChromeApi } from "./utils.js";

const memoryLocalStorage = new Map();
const memorySessionStorage = new Map();

function readWebStorage(storage, keys, memory) {
  const result = {};
  keys.forEach((key) => {
    try {
      const raw = storage?.getItem?.(key);
      result[key] = raw == null ? memory.get(key) : JSON.parse(raw);
    } catch {
      result[key] = memory.get(key);
    }
  });
  return result;
}

function writeWebStorage(storage, values, memory) {
  Object.entries(values).forEach(([key, value]) => {
    memory.set(key, value);
    storage?.setItem?.(key, JSON.stringify(value));
  });
}

function removeWebStorage(storage, keys, memory) {
  keys.forEach((key) => {
    memory.delete(key);
    storage?.removeItem?.(key);
  });
}

function readChromeStorage(area, keys) {
  return new Promise((resolve, reject) => {
    area.get(keys, (result) => {
      const chromeApi = getChromeApi();
      if (chromeApi?.runtime?.lastError) reject(new Error(chromeApi.runtime.lastError.message));
      else resolve(result || {});
    });
  });
}

function writeChromeStorage(area, values) {
  return new Promise((resolve, reject) => {
    area.set(values, () => {
      const chromeApi = getChromeApi();
      if (chromeApi?.runtime?.lastError) reject(new Error(chromeApi.runtime.lastError.message));
      else resolve();
    });
  });
}

function removeChromeStorage(area, keys) {
  return new Promise((resolve, reject) => {
    area.remove(keys, () => {
      const chromeApi = getChromeApi();
      if (chromeApi?.runtime?.lastError) reject(new Error(chromeApi.runtime.lastError.message));
      else resolve();
    });
  });
}

function readLocalStorage(keys) {
  const normalizedKeys = Array.isArray(keys) ? keys : [keys];
  const area = getChromeApi()?.storage?.local;
  if (area) return readChromeStorage(area, normalizedKeys);
  return Promise.resolve(readWebStorage(globalThis.localStorage, normalizedKeys, memoryLocalStorage));
}

function writeLocalStorage(values) {
  const area = getChromeApi()?.storage?.local;
  if (area) return writeChromeStorage(area, values);
  writeWebStorage(globalThis.localStorage, values, memoryLocalStorage);
  return Promise.resolve();
}

function removeLocalStorage(keys) {
  const normalizedKeys = Array.isArray(keys) ? keys : [keys];
  const area = getChromeApi()?.storage?.local;
  if (area) return removeChromeStorage(area, normalizedKeys);
  removeWebStorage(globalThis.localStorage, normalizedKeys, memoryLocalStorage);
  return Promise.resolve();
}

function readSessionStorage(keys) {
  const normalizedKeys = Array.isArray(keys) ? keys : [keys];
  const area = getChromeApi()?.storage?.session;
  if (area) return readChromeStorage(area, normalizedKeys);
  return Promise.resolve(readWebStorage(globalThis.sessionStorage, normalizedKeys, memorySessionStorage));
}

function writeSessionStorage(values) {
  const area = getChromeApi()?.storage?.session;
  if (area) return writeChromeStorage(area, values);
  writeWebStorage(globalThis.sessionStorage, values, memorySessionStorage);
  return Promise.resolve();
}

function removeSessionStorage(keys) {
  const normalizedKeys = Array.isArray(keys) ? keys : [keys];
  const area = getChromeApi()?.storage?.session;
  if (area) return removeChromeStorage(area, normalizedKeys);
  removeWebStorage(globalThis.sessionStorage, normalizedKeys, memorySessionStorage);
  return Promise.resolve();
}

export {
  readLocalStorage,
  readSessionStorage,
  removeLocalStorage,
  removeSessionStorage,
  writeLocalStorage,
  writeSessionStorage,
};
