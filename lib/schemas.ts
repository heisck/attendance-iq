import { z } from "zod";

// Shared by the forms (client) and the API routes and server actions (server).

export const FIELDS = { name: "Full name", email: "Student email", studentNo: "Student number", indexNo: "Index number" } as const;
export type Field = keyof typeof FIELDS;

export const studentFields = z.object({
  name: z.string().trim().min(2, "Enter a full name").max(100),
  email: z.email("Enter a valid email").trim().toLowerCase().max(200),
  studentNo: z.string().trim().regex(/^[A-Za-z0-9/-]{3,20}$/, "Student numbers are 3 to 20 letters or digits"),
  indexNo: z.string().trim().regex(/^\d{4,12}$/, "Index numbers are 4 to 12 digits"),
});

const honeypot = { company: z.string().max(200).optional() };

export const loginSchema = z.object({ email: z.string().max(200), password: z.string().max(200), ...honeypot });

// Face check steps. The server picks "center" plus two others; frames come in step order.
export const STEPS = ["center", "left", "right", "up"] as const;
export type Step = (typeof STEPS)[number];
export const FRAMES_PER_STEP = 2;
// Base64 JPEGs, ~20-30 KB each.
const frames = z.array(z.string().max(60_000)).min(2).max(12);

export const ticketSchema = z.object({ code: z.string().max(200).optional(), node: z.string().max(100).optional() });

export const attendSchema = z.object({ ticket: z.string().max(64), indexNo: studentFields.shape.indexNo, frames, ...honeypot });

// rosterId: the picked roster entry. fields: only what the student retyped (all four when not on the roster).
export const registerSchema = z.object({
  ticket: z.string().max(64),
  rosterId: z.string().max(40).optional(),
  fields: studentFields.partial(),
  frames,
  ...honeypot,
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
export const sessionSchema = z
  .object({
    kind: z.enum(["attendance", "registration"]),
    courseId: z.string().max(40).optional(),
    newCourse: z.object({ code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(100) }).optional(),
    week: z.coerce.number().int().min(1).max(30),
    date: z.iso.date(),
    start: hhmm,
    end: hhmm,
    autoApprove: z.boolean(),
  })
  .refine((s) => s.end > s.start, { message: "Closing time must be after opening time", path: ["end"] })
  .refine((s) => !!s.courseId !== !!s.newCourse, { message: "Pick a course or add a new one", path: ["courseId"] });
