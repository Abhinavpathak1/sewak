CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "assistant_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer,
	"category" text,
	"area" text,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_documents_source_key" ON "assistant_documents" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "assistant_documents_category" ON "assistant_documents" USING btree ("category");