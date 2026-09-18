import { setHost } from "@/host";
import { nodeHost } from "@/host/node";

// Tests run in Node: install the Node host so `new Session()` works exactly as
// the desktop entrypoint does.
setHost(nodeHost);
