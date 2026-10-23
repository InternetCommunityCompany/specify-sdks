import { contained } from "./contained.js";
import Specify, { type SpecifyInitConfig } from "./index.js";

export interface Host {
  specifyAdvertiser?: unknown;
}

interface EntryPoint {
  q?: unknown;
  (...command: unknown[]): void;
}

function dispatch(client: Specify, [name, argument]: unknown[]): void {
  switch (name) {
    case "setCookieConsent":
      client.setCookieConsent(argument as boolean);
      break;
    case "identify":
      client.identify(argument as string);
      break;
    case "capture":
      client.capture(argument as string);
      break;
    case "reset":
      client.reset();
      break;
    default:
      break;
  }
}

export function install(host: Host): void {
  contained(() => {
    const existing = host.specifyAdvertiser as EntryPoint | undefined;
    const queued = existing?.q;
    const queue: unknown[] = Array.isArray(queued) ? queued : [];
    // A page can load this script twice, from its own snippet and from a tag
    // manager. The second copy must not start a client of its own.
    if (queue.push !== Array.prototype.push) {
      return;
    }
    const entry: EntryPoint =
      typeof existing === "function"
        ? existing
        : (...command: unknown[]) => {
            queue.push(command);
          };
    entry.q = queue;
    host.specifyAdvertiser = entry;

    let client: Specify | undefined;
    const waiting: unknown[][] = [];
    const handle = (item: unknown) =>
      contained(() => {
        const command = Array.from(item as ArrayLike<unknown>);
        if (command[0] !== "init") {
          if (client === undefined) {
            waiting.push(command);
          } else {
            dispatch(client, command);
          }
          return;
        }
        if (client === undefined) {
          client = new Specify(command[1] as SpecifyInitConfig);
          for (const held of waiting.splice(0)) {
            dispatch(client, held);
          }
        }
      });

    // Tag managers keep a reference to the array itself, so the commands they
    // send later arrive through push rather than through the entry point.
    for (const item of queue.splice(0)) {
      handle(item);
    }
    queue.push = (...items: unknown[]) => {
      for (const item of items) {
        handle(item);
      }
      return queue.length;
    };
  });
}
