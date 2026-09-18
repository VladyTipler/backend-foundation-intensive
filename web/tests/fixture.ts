import type { Page, Route } from "@playwright/test";

// Test-only API fixture. Never imported by src/ or bundled into the application.
export async function fixture(page: Page, day = 0) {
  const state = {
    signedIn: false,
    jobsMode: "ok",
    rejectWrite: false,
    failExportOnce: false,
    exportAttempt: 0,
    polls: 0,
    requests: [] as {
      method: string;
      path: string;
      body: any;
      headers: Record<string, string>;
    }[],
    jobs: Array.from({ length: 16 }, (_, i) => ({
      id: String(i + 1),
      title: [
        "Backend Developer",
        "Fullstack Engineer",
        "Node.js Developer",
        "Platform Engineer",
      ][i % 4],
      company: ["Acme", "Globex", "Wayne Labs", "Initech"][i % 4],
      createdAt: "2026-09-01T10:00:00.000Z",
    })),
    applications: [] as {
      id: string;
      job: { id: string; title: string; company: string };
      status: string;
    }[],
  };
  const user = { id: "101", name: "Анна", email: "anna@example.test" };
  await page.addInitScript(
    (value) => localStorage.setItem("job-tracker-day", String(value)),
    day,
  );
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = req.method();
    const body = req.postDataJSON();
    const headers = req.headers();
    state.requests.push({ method, path: path + url.search, body, headers });
    const reply = (
      value: unknown,
      status = 200,
      more: Record<string, string> = {},
    ) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "X-Request-Id": "test-request", ...more },
        body: JSON.stringify(value),
      });
    if (path === "/health")
      return reply({ status: "ok", databaseTime: "2026-09-19T00:00:00.000Z" });
    if (path === "/auth/csrf") return reply({ csrfToken: "test-csrf-value" });
    if (path === "/auth/me")
      return state.signedIn
        ? reply({ user })
        : reply({ error: "No session" }, 401);
    if (path === "/auth/login" || path === "/auth/register") {
      state.signedIn = true;
      return reply({ user, accessToken: "test-sensitive-value" }, 200, {
        "Set-Cookie": "session=test-session; Path=/; HttpOnly; SameSite=Lax",
      });
    }
    if (path === "/auth/logout") {
      state.signedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (state.rejectWrite && method !== "GET")
      return reply({ error: "Forbidden" }, 403);
    if (path === "/jobs" && method === "GET") {
      if (state.jobsMode === "missing")
        return reply({ error: "Not implemented" }, 404);
      if (state.jobsMode === "malformed") return reply({ unexpected: true });
      let items = state.jobsMode === "empty" ? [] : state.jobs;
      if (url.searchParams.get("q"))
        items = items.filter((j) =>
          j.title
            .toLowerCase()
            .includes(url.searchParams.get("q")!.toLowerCase()),
        );
      if (url.searchParams.get("company"))
        items = items.filter(
          (j) => j.company === url.searchParams.get("company"),
        );
      const n = Number(url.searchParams.get("page") || 1);
      return reply({
        items: items.slice((n - 1) * 10, n * 10),
        total: items.length,
        page: n,
        limit: 10,
      });
    }
    if (path === "/jobs" && method === "POST") {
      const job = { id: String(state.jobs.length + 1), ...body };
      state.jobs.unshift(job);
      return reply({ job }, 201);
    }
    if (/^\/jobs\/\d+$/.test(path)) {
      const id = path.split("/").pop();
      const job = state.jobs.find((j) => j.id === id);
      if (method === "PATCH") {
        Object.assign(job!, body);
        return reply({ job });
      }
      if (method === "DELETE") {
        state.jobs = state.jobs.filter((j) => j.id !== id);
        return route.fulfill({ status: 204 });
      }
    }
    if (path === "/applications" && method === "GET")
      return reply({
        items: state.applications,
        total: state.applications.length,
        page: 1,
        limit: 10,
      });
    if (path === "/applications" && method === "POST") {
      if (state.applications.some((a) => a.job.id === body.jobId))
        return reply({ error: "Duplicate" }, 409);
      const application = {
        id: String(state.applications.length + 1),
        job: state.jobs.find((j) => j.id === body.jobId)!,
        status: "new",
      };
      state.applications.push(application);
      return reply({ application }, 201);
    }
    if (/^\/applications\/\d+$/.test(path)) {
      const id = path.split("/").pop();
      const application = state.applications.find((a) => a.id === id);
      if (method === "PATCH") {
        Object.assign(application!, body);
        return reply({ application });
      }
      if (method === "DELETE") {
        state.applications = state.applications.filter((a) => a.id !== id);
        return route.fulfill({ status: 204 });
      }
    }
    if (path === "/exports" && method === "POST") {
      state.exportAttempt++;
      if (state.failExportOnce && state.exportAttempt === 1)
        return reply({ error: "Gateway timeout" }, 504);
      return reply({ export: { id: "42", status: "queued" } }, 202);
    }
    if (path === "/exports/42/file")
      return route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        body: "id,title\n1,Backend Developer\n",
      });
    if (path === "/exports/42") {
      state.polls++;
      return reply({
        export: {
          id: "42",
          status: state.polls > 1 ? "completed" : "processing",
          progress: state.polls > 1 ? 100 : 25,
        },
      });
    }
    return reply({ error: "Not found" }, 404);
  });
  return state;
}
