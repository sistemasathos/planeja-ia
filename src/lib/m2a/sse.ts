/** Parseia um buffer SSE e devolve o restante incompleto. */
export function consumeSseBuffer(
  buffer: string,
  onEvent: (event: string, data: unknown) => void,
): string {
  let rest = buffer;
  let idx = rest.indexOf("\n\n");
  while (idx >= 0) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length) {
      const rawData = dataLines.join("\n");
      let parsed: unknown = rawData;
      try {
        parsed = JSON.parse(rawData);
      } catch {
        /* evento sem JSON */
      }
      onEvent(eventName, parsed);
    }
    idx = rest.indexOf("\n\n");
  }
  return rest;
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name: string }).name === "AbortError")
  );
}

/** Lê um ReadableStream SSE até o fim ou abort. */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) {
        void reader.cancel().catch(() => undefined);
        throw new DOMException("Aborted", "AbortError");
      }
      let value: Uint8Array | undefined;
      let done = false;
      try {
        ({ value, done } = await reader.read());
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) {
          throw new DOMException("Aborted", "AbortError");
        }
        throw err;
      }
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = consumeSseBuffer(buffer, onEvent);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* já liberado */
    }
  }
}
