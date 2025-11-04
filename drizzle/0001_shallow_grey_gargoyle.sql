CREATE TABLE "task_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"lifelog_id" text NOT NULL,
	"task_hash" text NOT NULL,
	"task" text NOT NULL,
	"timestamp" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"execution_report" text,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
