import { parseWorkbookBuffer } from "./xlsx-matrix";

self.onmessage = async (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const matrix = await parseWorkbookBuffer(event.data.buffer);
    self.postMessage({ matrix });
  } catch (err) {
    self.postMessage({
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
