/**
 * Browser stand-in for the `ws` package (FEAT-175).
 *
 * Ink imports `ws` only from its devtools modules, which the web build never
 * enables. This stub keeps those modules loadable without pulling a WebSocket
 * client into the browser bundle.
 */

export class WebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = WebSocket.CLOSED;

  constructor() {
    throw new Error("ws is not available in the browser");
  }
}

export default WebSocket;
