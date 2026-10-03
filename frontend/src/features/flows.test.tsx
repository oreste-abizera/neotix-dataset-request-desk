import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations, expectUniqueIds } from "@/test/a11y";
import { admin, client, detail, episode, operator, row } from "@/test/fixtures";
import { fail, mockApi, ok, renderApp } from "@/test/render";

const list = (n: number) =>
  Array.from({ length: n }, (_, i) => row({ id: n - i, task_name: `task ${n - i}` }));

describe("sign in", () => {
  it("sends signed-out visitors to the login page and back after signing in", async () => {
    const { calls } = mockApi({
      "GET /api/auth/me": fail(401, "unauthorized", "Authentication required."),
      "POST /api/auth/login": ok(client),
      "GET /api/requests?limit=21&offset=0": ok([row()]),
    });
    renderApp("/requests");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "client-a@oreste.dev");
    await user.type(screen.getByLabelText(/^password/i), "secret-pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "My requests" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      email: "client-a@oreste.dev",
      password: "secret-pass",
    });
  });

  it("validates inline and shows the server's message for wrong credentials", async () => {
    mockApi({
      "GET /api/auth/me": fail(401, "unauthorized", "Authentication required."),
      "POST /api/auth/login": fail(401, "unauthorized", "Invalid email or password."),
    });
    renderApp("/login");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your email address")).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("aria-invalid", "true");

    await user.type(screen.getByLabelText(/email/i), "a@oreste.dev");
    await user.type(screen.getByLabelText(/^password/i), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  });

  it("has no accessibility violations", async () => {
    mockApi({ "GET /api/auth/me": fail(401, "unauthorized", "x") });
    const { container } = renderApp("/login");
    await screen.findByRole("heading", { name: "Sign in" });
    await expectNoA11yViolations(container);
  });
});

describe("session expiry", () => {
  it("returns to the login page with an explanation when the server says the session ended", async () => {
    let expired = false;
    mockApi({
      // Like the real server: once the session is gone, "who am I" says 401 too.
      "GET /api/auth/me": () =>
        expired ? fail(401, "unauthorized", "Authentication required.") : ok(operator),
      "GET /api/requests?limit=21&offset=0": ok(list(21)),
      "GET /api/requests?limit=21&offset=20": () => {
        expired = true;
        return fail(401, "unauthorized", "Authentication required.");
      },
    });
    renderApp("/requests");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Your session has ended. Please sign in again.")).toBeInTheDocument();
  });
});

describe("request queue", () => {
  it("shows a helpful empty state with the next step for a client", async () => {
    mockApi({ "GET /api/auth/me": ok(client), "GET /api/requests?limit=21&offset=0": ok([]) });
    renderApp("/requests");
    expect(await screen.findByText("You have no requests yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /new request/i }).length).toBeGreaterThan(0);
  });

  it("tells operators the queue is empty rather than inviting them to create a request", async () => {
    mockApi({ "GET /api/auth/me": ok(operator), "GET /api/requests?limit=21&offset=0": ok([]) });
    renderApp("/requests");
    expect(await screen.findByText("The queue is empty")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /new request/i })).not.toBeInTheDocument();
  });

  it("recovers from a failed load with a retry", async () => {
    let attempts = 0;
    mockApi({
      "GET /api/auth/me": ok(client),
      "GET /api/requests?limit=21&offset=0": () =>
        ++attempts === 1 ? fail(500, "internal_error", "Internal server error.") : ok([row()]),
    });
    renderApp("/requests");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /try again/i }));
    expect((await screen.findAllByText("pick cup")).length).toBeGreaterThan(0);
  });

  it("filters by status and pages through results, keeping both in the URL", async () => {
    const { calls } = mockApi({
      "GET /api/auth/me": ok(operator),
      "GET /api/requests?limit=21&offset=0": ok(list(21)), // 21 rows => a next page exists
      "GET /api/requests?limit=21&offset=20": ok(list(3)),
      "GET /api/requests?limit=21&offset=0&status=delivered": ok([
        row({ id: 9, status: "delivered" }),
      ]),
    });
    renderApp("/requests");
    const user = userEvent.setup();

    expect(await screen.findAllByText("task 21")).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(calls.some((c) => c.path.includes("offset=20"))).toBe(true));
    expect(await screen.findByText("Page 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delivered" }));
    await waitFor(() => expect(calls.some((c) => c.path.includes("status=delivered"))).toBe(true));
    expect(screen.getByRole("button", { name: "Delivered" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows the client column to staff only", async () => {
    mockApi({
      "GET /api/auth/me": ok(operator),
      "GET /api/requests?limit=21&offset=0": ok([row()]),
    });
    const staff = renderApp("/requests");
    expect(await screen.findByRole("columnheader", { name: "Client" })).toBeInTheDocument();
    staff.unmount();

    mockApi({
      "GET /api/auth/me": ok(client),
      "GET /api/requests?limit=21&offset=0": ok([row()]),
    });
    renderApp("/requests");
    await screen.findByRole("columnheader", { name: "Request" });
    expect(screen.queryByRole("columnheader", { name: "Client" })).not.toBeInTheDocument();
  });

  it("has no accessibility violations (staff)", async () => {
    mockApi({
      "GET /api/auth/me": ok(operator),
      "GET /api/requests?limit=21&offset=0": ok(list(4)),
    });
    const { container } = renderApp("/requests");
    await screen.findAllByText("task 4");
    await expectNoA11yViolations(container);
  });
});

describe("role guards", () => {
  it("keeps clients out of staff and admin pages", async () => {
    mockApi({ "GET /api/auth/me": ok(client), "GET /api/requests?limit=21&offset=0": ok([]) });
    renderApp("/users");
    expect(await screen.findByRole("heading", { name: "My requests" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Import" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("shows operators the staff pages but not user management", async () => {
    mockApi({ "GET /api/auth/me": ok(operator), "GET /api/requests?limit=21&offset=0": ok([]) });
    renderApp("/requests");
    await screen.findByText("The queue is empty");
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0]!;
    expect(within(nav).getByRole("link", { name: "Import" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("explains an unknown address instead of showing the wrong page", async () => {
    mockApi({ "GET /api/auth/me": ok(client) });
    renderApp("/nope");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});

describe("new request", () => {
  it("validates inline, then submits and opens the new request", async () => {
    const { calls } = mockApi({
      "GET /api/auth/me": ok(client),
      "POST /api/requests": ok(detail({ id: 7 })),
      "GET /api/requests/7": ok(detail({ id: 7 })),
      "GET /api/requests?limit=21&offset=0": ok([]),
    });
    renderApp("/requests/new");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Submit request" }));
    expect(await screen.findByText("Describe the task you need")).toBeInTheDocument();
    expect(screen.getByText("Pick a deadline")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^task/i), "  fold towel ");
    await user.type(screen.getByLabelText(/needed by/i), "2099-01-01");
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(await screen.findByRole("heading", { name: "Request #7" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      task_name: "fold towel",
      episodes_requested: 10,
      deadline: "2099-01-01",
    });
  });

  it("places a server-side validation message next to its field", async () => {
    mockApi({
      "GET /api/auth/me": ok(client),
      "POST /api/requests": fail(422, "validation_error", "Invalid request.", [
        { field: "deadline", message: "deadline must be today or later" },
      ]),
    });
    renderApp("/requests/new");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^task/i), "pick cup");
    await user.type(screen.getByLabelText(/needed by/i), "2099-01-01");
    await user.click(screen.getByRole("button", { name: "Submit request" }));
    const field = await screen.findByText("deadline must be today or later");
    expect(screen.getByLabelText(/needed by/i)).toHaveAccessibleDescription(
      field.textContent ?? "",
    );
  });
});

describe("request detail", () => {
  const inProgress = (over = {}) =>
    detail({
      status: "in_progress",
      episodes_requested: 2,
      assigned_count: 2,
      allowed_transitions: ["delivered"],
      episodes: [episode("EP-1"), episode("EP-2")],
      ...over,
    });

  it("asks for confirmation before a consequential transition, then performs it", async () => {
    const { calls } = mockApi({
      "GET /api/auth/me": ok(operator),
      "GET /api/requests/1": ok(inProgress()),
      "POST /api/requests/1/transitions": ok(
        inProgress({ status: "delivered", allowed_transitions: [] }),
      ),
      "GET /api/requests?limit=21&offset=0": ok([]),
    });
    renderApp("/requests/1");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Mark delivered" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/can no longer be changed/i)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false); // nothing happens until confirmed

    await user.click(within(dialog).getByRole("button", { name: "Mark delivered" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith("/transitions"))?.body).toEqual({ to: "delivered" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect((await screen.findAllByText("Delivered")).length).toBeGreaterThan(0);
  });

  it("returns focus to the button that opened a dialog, even if the browser never focused it", async () => {
    mockApi({
      "GET /api/auth/me": ok(operator),
      "GET /api/requests/1": ok(inProgress()),
    });
    renderApp("/requests/1");
    const user = userEvent.setup();
    const opener = await screen.findByRole("button", { name: "Mark delivered" });
    fireEvent.click(opener); // like Safari: the click does not move focus onto the button
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("keeps the dialog open and explains why when the server refuses", async () => {
    mockApi({
      "GET /api/auth/me": ok(operator),
      "GET /api/requests/1": ok(inProgress()),
      "POST /api/requests/1/transitions": fail(409, "insufficient_episodes", "Not enough", {
        assigned: 1,
        required: 2,
      }),
    });
    renderApp("/requests/1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Mark delivered" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Mark delivered" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Only 1 of 2 episodes are assigned",
    );
  });

  it("lets the client accept a delivery but never shows staff-only controls", async () => {
    mockApi({
      "GET /api/auth/me": ok(client),
      "GET /api/requests/1": ok(
        detail({
          status: "delivered",
          allowed_transitions: ["accepted", "rejected"],
          episodes: [episode("EP-1")],
        }),
      ),
    });
    renderApp("/requests/1");
    expect(await screen.findByRole("button", { name: "Accept delivery" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject delivery" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assign episodes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Export" })).not.toBeInTheDocument();
  });

  it("removes an episode immediately and restores it if the server refuses", async () => {
    let refuse: () => void = () => {};
    const refusal = new Promise<void>((r) => (refuse = r));
    let gets = 0;
    mockApi({
      "GET /api/auth/me": ok(operator),
      // The first load answers normally; any later refetch hangs, so only the rollback can restore the row.
      "GET /api/requests/1": () =>
        ++gets === 1 ? ok(inProgress({ allowed_transitions: [] })) : new Promise<never>(() => {}),
      "DELETE /api/requests/1/assignments/EP-1": async () => {
        await refusal;
        return fail(409, "request_locked", "Episodes cannot be changed now.");
      },
    });
    renderApp("/requests/1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Remove EP-1" }));

    await waitFor(() => expect(screen.queryByText("EP-1")).not.toBeInTheDocument()); // optimistic
    expect(screen.getByText("EP-2")).toBeInTheDocument();

    refuse();
    expect(await screen.findByText("EP-1")).toBeInTheDocument(); // rolled back
  });

  it("explains a request that does not exist", async () => {
    mockApi({
      "GET /api/auth/me": ok(client),
      "GET /api/requests/99": fail(404, "not_found", "Request not found."),
    });
    renderApp("/requests/99");
    expect(await screen.findByText("That request doesn't exist")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    mockApi({
      "GET /api/auth/me": ok(operator),
      "GET /api/requests/1": ok(
        inProgress({
          episodes: [
            episode("EP-1", {
              export: {
                status: "failed",
                attempts: 5,
                max_attempts: 5,
                last_error: "boom",
                next_attempt_at: null,
                finished_at: null,
              },
            }),
            episode("EP-2"),
          ],
        }),
      ),
    });
    const { container } = renderApp("/requests/1");
    await screen.findByText("EP-1");
    await expectNoA11yViolations(container);
  });
});

describe("assign episodes", () => {
  it("lists only assignable episodes as selectable and sends exactly the selection", async () => {
    const items = [
      episode("EP-10"),
      episode("EP-11", { quality: "usable" }),
      episode("EP-12", { quality: "bad" }),
    ];
    const assigned = detail({
      status: "in_progress",
      episodes_requested: 2,
      assigned_count: 2,
      episodes: [episode("EP-10"), episode("EP-11")],
      allowed_transitions: ["delivered"],
    });
    const { calls } = mockApi({
      "GET /api/auth/me": ok(operator),
      "GET /api/requests/1": ok(
        detail({ status: "in_progress", episodes_requested: 2, allowed_transitions: [] }),
      ),
      "GET /api/episodes/task-names": ok(["pick cup", "fold towel"]),
      "GET /api/episodes?page=1&page_size=25&unassigned=true&task_name=pick+cup": ok({
        items,
        total: 3,
        page: 1,
        page_size: 25,
      }),
      "POST /api/requests/1/assignments": ok(assigned),
    });
    renderApp("/requests/1");
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("button", { name: /assign episodes/i }))[0]!);

    const sheet = await screen.findByRole("dialog", { name: "Assign episodes" });
    expect(await within(sheet).findByLabelText("Task")).toHaveValue("pick cup"); // pre-filtered to the request's task
    expect(within(sheet).getAllByLabelText("Select EP-12")[0]).toBeDisabled(); // bad quality
    const select = within(sheet).getAllByLabelText("Select EP-10")[0]!;
    await user.click(select);
    await user.click(within(sheet).getAllByLabelText("Select EP-11")[0]!);
    expect(within(sheet).getByText("2 episodes selected")).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: /^Assign 2/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith("/assignments"))?.body).toEqual({
        episode_ids: ["EP-10", "EP-11"],
      }),
    );
  });
});

describe("users (admin)", () => {
  const users = [admin, { ...operator }, { ...client }];

  it("protects the signed-in admin from locking themselves out", async () => {
    mockApi({ "GET /api/auth/me": ok(admin), "GET /api/users": ok(users) });
    renderApp("/users");
    const selects = await screen.findAllByLabelText("Role for Ada Admin");
    expect(selects[0]).toBeDisabled();
    expect(screen.getAllByRole("switch", { name: /Ada Admin is active/ })[0]).toBeDisabled();
  });

  it("confirms before deactivating someone, then sends the change", async () => {
    const { calls } = mockApi({
      "GET /api/auth/me": ok(admin),
      "GET /api/users": ok(users),
      "PATCH /api/users/2": ok({ ...operator, is_active: false }),
    });
    renderApp("/users");
    const user = userEvent.setup();
    await user.click(
      (await screen.findAllByRole("switch", { name: /Olu Operator is active/ }))[0]!,
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ is_active: false }),
    );
  });

  it("creates a user from the dialog with inline password validation", async () => {
    const { calls } = mockApi({
      "GET /api/auth/me": ok(admin),
      "GET /api/users": ok(users),
      "POST /api/users": ok({ ...operator, id: 9, email: "new@oreste.dev", name: "New Person" }),
    });
    renderApp("/users");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create user" }));
    const dialog = await screen.findByRole("dialog", { name: "Create user" });
    await user.type(within(dialog).getByLabelText(/^email/i), "new@oreste.dev");
    await user.type(within(dialog).getByLabelText(/full name/i), "New Person");
    await user.selectOptions(within(dialog).getByLabelText(/^role/i), "operator");
    await user.type(within(dialog).getByLabelText(/initial password/i), "short");
    await user.click(within(dialog).getByRole("button", { name: "Create user" }));
    expect(await within(dialog).findByText("Use at least 8 characters")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    await user.clear(within(dialog).getByLabelText(/initial password/i));
    await user.type(within(dialog).getByLabelText(/initial password/i), "long-enough-1");
    await user.click(within(dialog).getByRole("button", { name: "Create user" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
        email: "new@oreste.dev",
        role: "operator",
        organisation: null,
      }),
    );
  });
});

describe("accessibility of the remaining pages", () => {
  it("users, import and new-request pages have no violations", async () => {
    mockApi({
      "GET /api/auth/me": ok(admin),
      "GET /api/users": ok([admin, operator, client]),
      "GET /api/imports": ok([]),
    });
    const users = renderApp("/users");
    await screen.findAllByLabelText("Role for Olu Operator");
    await expectNoA11yViolations(users.container);
    expectUniqueIds(users.container); // axe only flags duplicate ids as "needs review"
    users.unmount();

    const imports = renderApp("/imports");
    await screen.findByRole("heading", { name: "Import episodes" });
    await expectNoA11yViolations(imports.container);
    imports.unmount();

    mockApi({ "GET /api/auth/me": ok(client) });
    const form = renderApp("/requests/new");
    await screen.findByRole("heading", { name: "New dataset request" });
    await expectNoA11yViolations(form.container);
  });
});

describe("import", () => {
  it("rejects a non-CSV file before uploading it", async () => {
    mockApi({ "GET /api/auth/me": ok(operator), "GET /api/imports": ok([]) });
    renderApp("/imports");
    const user = userEvent.setup({ applyAccept: false });
    const input = await screen.findByLabelText(/drop a csv/i);
    await user.upload(input, new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/\.csv file/);
  });

  it("uploads a CSV and shows what was imported and skipped, with reasons", async () => {
    const report = {
      import_run_id: 3,
      filename: "episodes.csv",
      total_rows: 5,
      blank_lines: 1,
      imported: 3,
      unchanged: 0,
      skipped_count: 2,
      skipped_by_reason: { unknown_robot: 1, invalid_duration: 1 },
      warnings_by_code: {},
      skipped: [
        {
          line: 4,
          episode_id: "EP-4",
          reason: "unknown_robot",
          detail: "robot 'arm-99' is not a known robot",
        },
        { line: 9, episode_id: "EP-9", reason: "invalid_duration", detail: "'45.5' is not whole" },
      ],
      details_truncated: false,
    };
    mockApi({
      "GET /api/auth/me": ok(operator),
      "GET /api/imports": ok([]),
      "POST /api/imports": ok(report),
    });
    renderApp("/imports");
    const user = userEvent.setup();
    await user.upload(
      await screen.findByLabelText(/drop a csv/i),
      new File(["a,b"], "episodes.csv", { type: "text/csv" }),
    );
    await user.click(await screen.findByRole("button", { name: "Import" }));
    expect(
      await screen.findByRole("heading", { name: "Report for episodes.csv" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Unknown robot", { selector: "td" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/filter skipped rows/i), "invalid_duration");
    expect(screen.queryByText("Unknown robot", { selector: "td" })).not.toBeInTheDocument();
  });
});

describe("analytics", () => {
  it("summarises fulfilment and offers the chart's data as a table", async () => {
    mockApi({
      "GET /api/auth/me": ok(operator),
      "GET /api/analytics": {
        json: {
          from: "x",
          to: "y",
          episodes_per_day_per_robot: [
            { day: new Date().toISOString().slice(0, 10), robot_id: "arm-01", episodes: 4 },
          ],
          requests: {
            by_status: { submitted: 1, in_progress: 2, delivered: 3, accepted: 4, rejected: 0 },
            total: 10,
            delivered_count: 3,
            median_seconds_submitted_to_delivered: 7200,
          },
          top_tasks_by_good_episodes: [{ task_name: "pick cup", good_episodes: 4 }],
        },
      },
    });
    const { container } = renderApp("/analytics");
    expect(await screen.findByText("2.0 h")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Episodes recorded per day/ })).toBeInTheDocument();
    expect(screen.getByText("View data as a table")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe("theme", () => {
  it("switches to dark from the account menu and remembers the choice", async () => {
    mockApi({ "GET /api/auth/me": ok(operator), "GET /api/requests?limit=21&offset=0": ok([]) });
    renderApp("/requests");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /account menu/i }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Dark" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("neotix.theme")).toBe("dark");
  });
});
