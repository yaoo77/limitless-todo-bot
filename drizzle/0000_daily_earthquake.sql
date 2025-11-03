CREATE TABLE "lifelog_state" (
	"id" text PRIMARY KEY DEFAULT 'latest' NOT NULL,
	"latest_end_time" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "processed_task_hashes" (
	"lifelog_id" text NOT NULL,
	"task_hash" text NOT NULL,
	"task" text NOT NULL,
	"timestamp" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_task_hashes_lifelog_id_task_hash_pk" PRIMARY KEY("lifelog_id","task_hash")
);
