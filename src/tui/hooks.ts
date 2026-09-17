import { useSyncExternalStore } from "react";
import type { Session, SessionState } from "./session";

/** Subscribes an Ink component to the session store. */
export function useSession(session: Session): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState);
}
