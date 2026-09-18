import { z } from "zod";

// PostgreSQL BIGINT is commonly serialized as a string. Preserve it losslessly.
export const idSchema = z
  .union([
    z.string().regex(/^[1-9]\d*$/),
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  ])
  .transform(String);
export const userSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string(),
});
export const jobSchema = z.object({
  id: idSchema,
  title: z.string(),
  company: z.string(),
  createdAt: z.string().optional(),
});
export const statuses = [
  "new",
  "screening",
  "interview",
  "offer",
  "rejected",
] as const;
export const statusNames: Record<(typeof statuses)[number], string> = {
  new: "Новый",
  screening: "На рассмотрении",
  interview: "Собеседование",
  offer: "Оффер",
  rejected: "Отказ",
};
export const applicationSchema = z.object({
  id: idSchema,
  job: jobSchema,
  status: z.enum(statuses),
  createdAt: z.string().optional(),
});
export const exportSchema = z.object({
  id: idSchema,
  status: z.enum(["queued", "processing", "completed", "failed"]),
  progress: z.number().min(0).max(100).optional(),
});
const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive().max(100),
  });
export const jobsPageSchema = page(jobSchema);
export const applicationsPageSchema = page(applicationSchema);
export const jobReplySchema = z.object({ job: jobSchema });
export const applicationReplySchema = z.object({
  application: applicationSchema,
});
export const exportReplySchema = z.object({ export: exportSchema });
export const userReplySchema = z.object({ user: userSchema });
export const healthSchema = z.object({
  status: z.literal("ok"),
  databaseTime: z.string(),
});
export const csrfSchema = z.object({ csrfToken: z.string().min(1) });
export type User = z.infer<typeof userSchema>;
export type Job = z.infer<typeof jobSchema>;
export type Application = z.infer<typeof applicationSchema>;
export type ExportJob = z.infer<typeof exportSchema>;
export type JobPage = z.infer<typeof jobsPageSchema>;
export type ApplicationPage = z.infer<typeof applicationsPageSchema>;
