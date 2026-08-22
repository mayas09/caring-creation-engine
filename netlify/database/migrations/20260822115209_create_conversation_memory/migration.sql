CREATE TYPE "conversation_memory_category" AS ENUM('preference', 'decision', 'successful_angle', 'rejected_lead', 'tone', 'avoid_topic');--> statement-breakpoint
CREATE TABLE "conversation_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"category" "conversation_memory_category" NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conversation_memory_user_conversation_idx" ON "conversation_memory" ("user_id","conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_memory_user_category_idx" ON "conversation_memory" ("user_id","category");