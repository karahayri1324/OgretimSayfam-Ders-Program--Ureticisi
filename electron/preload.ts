import { contextBridge, ipcRenderer } from 'electron';

const invoke = (channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args);

const on = (channel: string, handler: (...args: unknown[]) => void) => {
  const wrapped = (_e: Electron.IpcRendererEvent, ...args: unknown[]) =>
    handler(...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.off(channel, wrapped);
};

const api = {
  auth: {
    status: () => invoke('auth:status'),
    register: (data: unknown) => invoke('auth:register', data),
    login: (data: unknown) => invoke('auth:login', data),
    logout: () => invoke('auth:logout'),
  },
  teachers: {
    list: () => invoke('teachers:list'),
    create: (data: unknown) => invoke('teachers:create', data),
    update: (id: number, data: unknown) => invoke('teachers:update', id, data),
    delete: (id: number) => invoke('teachers:delete', id),
  },
  classes: {
    list: () => invoke('classes:list'),
    create: (data: unknown) => invoke('classes:create', data),
    update: (id: number, data: unknown) => invoke('classes:update', id, data),
    delete: (id: number, opts?: { kind?: string }) =>
      invoke('classes:delete', id, opts),
  },
  rooms: {
    list: () => invoke('rooms:list'),
    create: (data: unknown) => invoke('rooms:create', data),
    update: (id: number, data: unknown) => invoke('rooms:update', id, data),
    delete: (id: number) => invoke('rooms:delete', id),
  },
  subjects: {
    list: () => invoke('subjects:list'),
    create: (data: unknown) => invoke('subjects:create', data),
    update: (id: number, data: unknown) => invoke('subjects:update', id, data),
    delete: (id: number) => invoke('subjects:delete', id),
  },
  activities: {
    list: () => invoke('activities:list'),
    upsert: (data: unknown) => invoke('activities:upsert', data),
    delete: (id: number) => invoke('activities:delete', id),
    setSplit: (activityIds: number[]) =>
      invoke('activities:setSplit', { activityIds }),
    clearSplit: (id: number) => invoke('activities:clearSplit', id),
  },
  constraints: {
    list: () => invoke('constraints:list'),
    add: (data: unknown) => invoke('constraints:add', data),
    delete: (id: number) => invoke('constraints:delete', id),
    toggle: (id: number, active: boolean) =>
      invoke('constraints:toggle', id, active),
    setWeight: (id: number, weight: number) =>
      invoke('constraints:setWeight', id, weight),
  },
  schedule: {
    get: () => invoke('schedule:get'),
    setDays: (days: unknown) => invoke('schedule:setDays', days),
    setHours: (hours: unknown) => invoke('schedule:setHours', hours),
    setDayHours: (dayId: number, entries: unknown) =>
      invoke('schedule:setDayHours', { dayId, entries }),
    clearDayHours: (dayId: number) => invoke('schedule:clearDayHours', dayId),
    bulkAdjustBreaks: (payload: unknown) =>
      invoke('schedule:bulkAdjustBreaks', payload),
  },
  ai: {
    parse: (text: string) => invoke('ai:parse', text),
    history: () => invoke('ai:history'),
    clearHistory: () => invoke('ai:clearHistory'),
    applyMutations: (actions: unknown) => invoke('ai:applyMutations', actions),
    applyScheduleUpdate: (response: unknown) =>
      invoke('ai:applyScheduleUpdate', response),
  },
  generate: {
    run: (opts?: unknown) => invoke('generate:run', opts),
    cancel: () => invoke('generate:cancel'),
    latest: () => invoke('generate:latest'),
    onProgress: (handler: (event: unknown) => void) =>
      on('generate:progress', handler as (...args: unknown[]) => void),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch: unknown) => invoke('settings:set', patch),
  },
  app: {
    version: () => invoke('app:version'),
    checkFet: () => invoke('app:checkFet'),
    openFETSource: () => invoke('app:openFETSource'),
    openLogs: () => invoke('app:openLogs'),
    exportPdf: (html: string, defaultFilename: string) =>
      invoke('app:exportPdf', html, defaultFilename),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
