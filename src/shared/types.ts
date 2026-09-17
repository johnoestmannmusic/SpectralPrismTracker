export interface LoadedSong {
  /** `lmp-default-proj.lampjson` contents as text. */
  project: string;
  samples: Array<Uint8Array | null>;
  error?: string;
}

export interface AudioFileChoice {
  name: string;
  bytes: Uint8Array;
}

export interface SaveFileRequest {
  suggestedName: string;
  bytes: Uint8Array;
}
