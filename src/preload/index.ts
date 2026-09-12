import { contextBridge, ipcRenderer } from "electron";
import { IPC, type LanternApi } from "../shared/types";

const api: LanternApi = {
  loadDefaultSong: () => ipcRenderer.invoke(IPC.loadDefaultSong),
  chooseSongFolder: () => ipcRenderer.invoke(IPC.chooseSongFolder),
  saveFile: (suggestedName, bytes) =>
    ipcRenderer.invoke(IPC.saveFile, { suggestedName, bytes }),
};

contextBridge.exposeInMainWorld("lantern", api);
