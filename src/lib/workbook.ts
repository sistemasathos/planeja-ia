import { parseWorkbookBuffer } from "./xlsx-matrix";

function parseInWorker(buffer: ArrayBuffer): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./xlsx-parse.worker.ts", import.meta.url),
      { type: "module" },
    );
    const fail = (err: unknown) => {
      worker.terminate();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    worker.onmessage = (
      event: MessageEvent<{ matrix?: unknown[][]; error?: string }>,
    ) => {
      worker.terminate();
      if (event.data?.error) reject(new Error(event.data.error));
      else resolve(event.data.matrix ?? []);
    };
    worker.onerror = (event) =>
      fail(event.message || "Falha ao ler planilha.");
    worker.postMessage({ buffer });
  });
}

export async function readXlsxMatrix(file: File): Promise<unknown[][]> {
  if (typeof Worker === "undefined") {
    return parseWorkbookBuffer(await file.arrayBuffer());
  }
  try {
    return await parseInWorker(await file.arrayBuffer());
  } catch {
    return parseWorkbookBuffer(await file.arrayBuffer());
  }
}
