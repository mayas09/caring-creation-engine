import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const conversationMemoryCategory = pgEnum("conversation_memory_category", [
  "preference",
  "decision",
  "successful_angle",
  "rejected_lead",
  "tone",
  "avoid_topic",
]);

export const conversationMemory = pgTable(
  "conversation_memory",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    conversationId: uuid("conversation_id"),
    category: conversationMemoryCategory().notNull(),
    key: text().notNull(),
    value: text().notNull(),
    context: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("conversation_memory_user_conversation_idx").on(table.userId, table.conversationId),
    index("conversation_memory_user_category_idx").on(table.userId, table.category),
  ],
);

export type ConversationMemory = typeof conversationMemory.$inferSelect;
export type NewConversationMemory = typeof conversationMemory.$inferInsert;

export const assistantActionLog = pgTable(
  "assistant_action_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    action: text().notNull(),
    target: text(),
    status: text().notNull(),
    detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("assistant_action_log_user_created_idx").on(table.userId, table.createdAt)],
);

export const assistantConfirmation = pgTable(
  "assistant_confirmation",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    action: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    status: text().notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [index("assistant_confirmation_user_status_idx").on(table.userId, table.status)],
);

export const assistantAutomationState = pgTable(
  "assistant_automation_state",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    paused: boolean().notNull().default(false),
    reason: text(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("assistant_automation_state_user_idx").on(table.userId)],
);
