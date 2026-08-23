import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemberImport } from "./member-import";

/**
 * What this suite is actually protecting.
 *
 * Not the parsing — that is `member-import.test.ts`, pure and exhaustive. This is about
 * the two properties of the UI that would be dangerous to lose and that no type checks:
 *
 *   1. NOTHING IS WRITTEN BEFORE THE OPERATOR CONFIRMS. Importing three hundred people is
 *      not undoable through the interface, so a regression that posted to /api/members/import
 *      on file selection would be a real incident, and it would look like a UX improvement
 *      in the diff.
 *
 *   2. THE CONFIRM SENDS THE FILE, NOT THE PARSED ROWS. If this ever changed, the server
 *      would be trusting a client-supplied row list — the exact hole the re-parse exists
 *      to close — and every server test would still pass.
 */

const fetchMock = vi.fn();

function csvFile(text: string, name = "members.csv") {
  return new File([text], name, { type: "text/csv" });
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const preview = {
  rows: [
    { line: 2, status: "VALID", errors: [], raw: { email: "a@example.com" } },
    {
      line: 3,
      status: "INVALID",
      errors: ["Full name is required."],
      raw: { email: "b@example.com" },
    },
  ],
  valid: 1,
  invalid: 1,
  duplicates: 0,
  fileErrors: [],
  maxRows: 300,
  tooManyRows: false,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function chooseFile(text = "email,full_name\na@example.com,A\n") {
  const user = userEvent.setup();
  render(<MemberImport />);
  await user.upload(screen.getByLabelText(/member list/i), csvFile(text));
  return user;
}

describe("member import", () => {
  it("previews without writing anything", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(preview));

    await chooseFile();

    await screen.findByText(/before anything is created/i);

    // THE ASSERTION THAT MATTERS: one call, and it is the preview.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/members/import/preview");
  });

  it("shows the counts and the offending line numbers", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(preview));

    await chooseFile();

    expect(await screen.findByText(/will be invited/i)).toBeInTheDocument();
    // The line number must be the one the operator sees in their spreadsheet.
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
  });

  it("sends the file again on confirm, not the parsed rows", async () => {
    const text = "email,full_name\na@example.com,A\n";
    fetchMock.mockResolvedValueOnce(jsonResponse(preview));

    const user = await chooseFile(text);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        created: 1,
        alreadyExisted: [],
        skippedInvalid: 1,
        skippedDuplicate: 0,
      }),
    );

    await user.click(await screen.findByRole("button", { name: /invite 1 member/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/members/import");
    // The raw CSV, byte for byte. A JSON row list here would mean the server is trusting
    // the client's classification.
    expect(init.body).toBe(text);
    expect(init.headers["content-type"]).toBe("text/csv");
  });

  it("refuses to offer an import when no row is valid", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...preview, rows: [preview.rows[1]], valid: 0, invalid: 1 }),
    );

    await chooseFile();

    expect(await screen.findByRole("button", { name: /invite 0 members/i })).toBeDisabled();
  });

  it("refuses an import over the row limit", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...preview, valid: 400, tooManyRows: true }),
    );

    await chooseFile();

    expect(await screen.findByRole("button", { name: /invite 400 members/i })).toBeDisabled();
    expect(screen.getByText(/split it and import it in parts/i)).toBeInTheDocument();
  });

  it("reports a file-level problem once instead of per row", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...preview,
        rows: [],
        valid: 0,
        invalid: 0,
        fileErrors: ["Missing required column(s): full_name."],
      }),
    );

    await chooseFile();

    // role=alert, so it is announced rather than merely displayed.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/full_name/);
  });

  it("announces the outcome in a live region", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(preview));
    const user = await chooseFile();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        created: 1,
        alreadyExisted: ["taken@example.com"],
        skippedInvalid: 1,
        skippedDuplicate: 0,
      }),
    );
    await user.click(await screen.findByRole("button", { name: /invite 1 member/i }));

    // Focus does not move on completion, so without a live region a screen reader user is
    // told nothing at all about what a destructive-looking action just did.
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/1 member invited/i);
    expect(status).toHaveTextContent(/taken@example.com/);
  });

  it("keeps the file picker usable after a failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "That file is empty." }, 400));

    await chooseFile();

    expect(await screen.findByRole("alert")).toHaveTextContent(/that file is empty/i);
    // The retry path must exist: the operator's next move is a corrected file, and an
    // error state with no way forward sends them to reload the page.
    expect(screen.getByRole("button", { name: /try another file/i })).toBeEnabled();
  });
});
