import { describe, expect, it } from "vitest";

import {
  beginFileTransfer,
  getFileTransfers,
  noteBrowserDownload,
} from "./file-transfers.ts";

describe("file transfer progress", () => {
  it("uses measured progress and keeps completion visible briefly", async () => {
    const transfer = beginFileTransfer({
      direction: "upload",
      name: "photo.png",
      totalBytes: 100,
    });

    transfer.update("Uploading", 0.35);
    expect(getFileTransfers().at(-1)).toMatchObject({
      name: "photo.png",
      phase: "Uploading",
      progress: 0.35,
      status: "running",
    });

    transfer.done();
    expect(getFileTransfers().at(-1)).toMatchObject({
      progress: 1,
      status: "done",
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 2550);
    });
    expect(getFileTransfers()).toHaveLength(0);
  });

  it("shows a browser download handoff without inventing completion", async () => {
    noteBrowserDownload("report.pdf");
    expect(getFileTransfers().at(-1)).toMatchObject({
      direction: "download",
      name: "report.pdf",
      progress: null,
      status: "handoff",
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 1850);
    });
    expect(getFileTransfers()).toHaveLength(0);
  });
});
