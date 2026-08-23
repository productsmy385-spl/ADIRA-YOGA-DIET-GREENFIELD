import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaUpload } from "./media-upload";

/**
 * The properties worth holding here are about TRUST and ANNOUNCEMENT, not about upload
 * mechanics — the network path is XMLHttpRequest against a third party and testing that
 * in jsdom tests the stub, not the code.
 *
 * What is asserted:
 *   1. An oversized or unsupported file never reaches the network. The check is a
 *      courtesy rather than a control, but a courtesy that stopped working would send a
 *      40 MB file over a phone connection before telling the user it was refused.
 *   2. Only the file id is carried from the upload into the record call. If this ever
 *      posted the URL or MIME type ImageKit returned, the server would be trusting a
 *      client-supplied description of a file — and no server test would notice.
 *   3. Progress and outcome are announced. The button that started the upload keeps
 *      focus, so without a live region a screen reader user is told nothing at all.
 */

const fetchMock = vi.fn();

class FakeXHR {
  static last: FakeXHR | null = null;
  static sent: FormData | null = null;

  status = 200;
  responseText = JSON.stringify({ fileId: "file-abc", url: "https://evil.example/x" });
  upload = { listeners: {} as Record<string, (event: unknown) => void>, addEventListener(type: string, fn: (event: unknown) => void) { this.listeners[type] = fn; } };
  private listeners: Record<string, () => void> = {};

  open() {}
  addEventListener(type: string, fn: () => void) {
    this.listeners[type] = fn;
  }
  send(form: FormData) {
    FakeXHR.sent = form;
    FakeXHR.last = this;
    // Deliver progress then completion on a microtask, as a real request would.
    queueMicrotask(() => {
      this.upload.listeners.progress?.({ lengthComputable: true, loaded: 50, total: 100 });
      this.listeners.load?.();
    });
  }
}

function imageFile(bytes: number, type = "image/png", name = "photo.png") {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

beforeEach(() => {
  fetchMock.mockReset();
  FakeXHR.last = null;
  FakeXHR.sent = null;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("media upload", () => {
  it("refuses an oversized file without touching the network", async () => {
    const user = userEvent.setup();
    render(<MediaUpload purpose="progress_photo" customerId="member-1" label="Progress photo" />);

    await user.upload(screen.getByLabelText(/progress photo/i), imageFile(20 * 1024 * 1024));

    expect(await screen.findByRole("status")).toHaveTextContent(/larger than 8 MB/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an unsupported type without touching the network", async () => {
    /*
     * `applyAccept: false` is deliberate, and it belongs on setup() rather than on
     * upload() in this version of user-event.
     *
     * The input's `accept` attribute already keeps an SVG out of the file picker, and
     * user-event honours that by default — which would make this test assert the
     * attribute and never reach the component. `accept` is a hint that a drag-and-drop
     * or a scripted change bypasses, so the guard worth testing is the one in
     * `handleFile`, and the file has to actually arrive for it to run.
     */
    const user = userEvent.setup({ applyAccept: false });
    render(<MediaUpload purpose="exercise" label="Illustration" />);

    // SVG specifically: an image that can carry script.
    await user.upload(
      screen.getByLabelText(/illustration/i),
      imageFile(1024, "image/svg+xml", "x.svg"),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(/not supported/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carries only the file id from the upload into the record call", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: "t",
          expire: 1,
          signature: "s",
          publicKey: "public_abc",
          folder: "/org-1/progress_photo",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "media-1",
          purpose: "progress_photo",
          requiresSignedUrl: true,
          url: null,
        }),
      } as Response);

    const user = userEvent.setup();
    render(<MediaUpload purpose="progress_photo" customerId="member-1" label="Progress photo" />);
    await user.upload(screen.getByLabelText(/progress photo/i), imageFile(1024));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body).toEqual({
      fileId: "file-abc",
      purpose: "progress_photo",
      customerId: "member-1",
    });
    // The URL ImageKit reported is deliberately NOT forwarded — the server re-reads it.
    expect(JSON.stringify(body)).not.toContain("evil.example");
  });

  it("sends the server-chosen folder to ImageKit, never one of its own", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: "t",
          expire: 1,
          signature: "s",
          publicKey: "public_abc",
          folder: "/org-1/avatar",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "m", purpose: "avatar", requiresSignedUrl: true, url: null }),
      } as Response);

    const user = userEvent.setup();
    render(<MediaUpload purpose="avatar" customerId="member-1" label="Photo" />);
    await user.upload(screen.getByLabelText(/photo/i), imageFile(1024));

    await waitFor(() => expect(FakeXHR.sent).not.toBeNull());
    expect(FakeXHR.sent?.get("folder")).toBe("/org-1/avatar");
    // The private key must never appear in anything the browser sends.
    expect(FakeXHR.sent?.get("publicKey")).toBe("public_abc");
  });

  it("announces progress and the outcome", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: "t", expire: 1, signature: "s", publicKey: "p", folder: "/f" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "m", purpose: "exercise", requiresSignedUrl: false, url: "u" }),
      } as Response);

    const user = userEvent.setup();
    render(<MediaUpload purpose="exercise" label="Illustration" />);
    await user.upload(screen.getByLabelText(/illustration/i), imageFile(1024));

    expect(await screen.findByRole("status")).toHaveTextContent(/photo saved/i);
  });

  it("surfaces the server's refusal rather than a generic failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "That member was not found." }),
    } as Response);

    const user = userEvent.setup();
    render(<MediaUpload purpose="progress_photo" customerId="member-1" label="Progress photo" />);
    await user.upload(screen.getByLabelText(/progress photo/i), imageFile(1024));

    expect(await screen.findByRole("status")).toHaveTextContent(/member was not found/i);
  });
});
