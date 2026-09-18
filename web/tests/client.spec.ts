import { test, expect } from "@playwright/test";
import { fixture } from "./fixture";

test("Day 0 only checks health and does not call future endpoints", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/");
  await expect(page.getByText("API и база на связи")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Вакансии/ })).toBeDisabled();
  expect(state.requests.every((r) => r.path === "/health")).toBe(true);
  await page.screenshot({ path: "test-results/overview.png", fullPage: true });
});
test("Network failure is explicit, never fake data", async ({ page }) => {
  await page.route("**/api/**", (r) => r.abort());
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Нет соединения с API");
});
for (const mode of ["missing", "malformed", "empty"]) {
  test(`Jobs: ${mode} response is handled explicitly`, async ({ page }) => {
    const state = await fixture(page, 2);
    state.jobsMode = mode;
    await page.goto("/");
    await page.getByRole("button", { name: "Вакансии", exact: true }).click();
    if (mode === "empty")
      await expect(
        page.getByRole("heading", { name: "Пока ни одной вакансии" }),
      ).toBeVisible();
    else
      await expect(page.getByRole("alert")).toContainText(
        mode === "missing" ? "404" : "формат ответа не совпал",
      );
    await expect(page.locator(".job-card")).toHaveCount(0);
  });
}
test("Search and pagination are sent to API, not faked in browser", async ({
  page,
}) => {
  const state = await fixture(page, 2);
  await page.goto("/");
  await page.getByRole("button", { name: "Вакансии", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(10);
  await page.screenshot({ path: "test-results/jobs.png", fullPage: true });
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(6);
  await page.getByLabel("Поиск вакансий").fill("Backend");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(4);
  expect(
    state.requests.some(
      (r) => r.path.includes("q=Backend") && r.path.includes("page=1"),
    ),
  ).toBe(true);
});
test("Create, update and delete require confirmed server responses", async ({
  page,
}) => {
  const state = await fixture(page, 2);
  await page.goto("/");
  await page.getByRole("button", { name: "Вакансии", exact: true }).click();
  await page
    .getByRole("button", { name: "Новая вакансия", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill("Тестовая вакансия");
  await page.getByLabel("Компания", { exact: true }).last().fill("Test Ltd");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Тестовая вакансия", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Изменить Тестовая вакансия", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill("Обновлено");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Обновлено", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Удалить Обновлено", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Обновлено", exact: true }),
  ).toHaveCount(0);
  expect(state.requests.some((r) => r.method === "DELETE")).toBe(true);
});
test("Failed write stays visibly failed, without optimistic insertion", async ({
  page,
}) => {
  const state = await fixture(page, 2);
  state.rejectWrite = true;
  await page.goto("/");
  await page.getByRole("button", { name: "Вакансии", exact: true }).click();
  await page
    .getByRole("button", { name: "Новая вакансия", exact: true })
    .click();
  await page
    .getByLabel("Название", { exact: true })
    .fill("Не должно сохраниться");
  await page.getByLabel("Компания", { exact: true }).last().fill("Test");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("403");
  expect(state.jobs.length).toBe(16);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("Session login uses CSRF and hides passwords and token responses", async ({
  page,
}) => {
  const state = await fixture(page, 3);
  await page.goto("/");
  await page.getByRole("button", { name: "Аккаунт", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("anna@example.test");
  await page.getByLabel("Пароль", { exact: true }).fill("NotARealPassword123");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Анна", exact: true }),
  ).toBeVisible();
  expect(
    state.requests.find((r) => r.path === "/auth/login")?.headers[
      "x-csrf-token"
    ],
  ).toBe("test-csrf-value");
  const log = await page.getByLabel("Панель запросов").textContent();
  expect(log).not.toContain("NotARealPassword123");
  expect(log).not.toContain("test-sensitive-value");
  expect(log).not.toContain("test-csrf-value");
  await page.reload();
  await page.getByRole("button", { name: "Аккаунт", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Анна", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Войти", exact: true }),
  ).toBeVisible();
});
test("Applications use session owner, detect duplicates and update status", async ({
  page,
}) => {
  const state = await fixture(page, 3);
  state.signedIn = true;
  await page.goto("/");
  await page.getByRole("button", { name: "Вакансии", exact: true }).click();
  await page
    .getByRole("button", { name: "Откликнуться", exact: true })
    .first()
    .click();
  await expect(page.getByRole("status")).toContainText("сохранён");
  await page
    .getByRole("button", { name: "Откликнуться", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert")).toContainText("409");
  await page.getByRole("button", { name: "Мои отклики", exact: true }).click();
  await page
    .getByLabel("Статус отклика 1", { exact: true })
    .selectOption("interview");
  await expect(
    page.getByLabel("Статус отклика 1", { exact: true }),
  ).toHaveValue("interview");
  expect(
    state.requests.find(
      (r) => r.path === "/applications" && r.method === "POST",
    )?.body,
  ).toEqual({ jobId: "1" });
});
test("Export reuses idempotency key, polls and downloads an actual CSV response", async ({
  page,
}) => {
  const state = await fixture(page, 4);
  state.signedIn = true;
  state.failExportOnce = true;
  await page.goto("/");
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  await page
    .getByRole("button", { name: "Экспортировать отклики", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("504");
  await page
    .getByRole("button", { name: "Экспортировать отклики", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Скачать CSV", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  const writes = state.requests.filter(
    (r) => r.path === "/exports" && r.method === "POST",
  );
  expect(writes).toHaveLength(2);
  expect(writes[0].headers["idempotency-key"]).toBe(
    writes[1].headers["idempotency-key"],
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать CSV", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("applications-42.csv");
});
test("Changing back to Day 0 unmounts future sections", async ({ page }) => {
  const state = await fixture(page, 4);
  state.signedIn = true;
  await page.goto("/");
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  await page.getByLabel("МОЙ ЭТАП").selectOption("0");
  await expect(
    page.getByRole("heading", { name: "Твоя лаборатория." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Экспорт.*день 4/ }),
  ).toBeDisabled();
});
test("Mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.goto("/");
  await expect(page.getByText("API и база на связи")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
