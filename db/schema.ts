import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
