CREATE TABLE "topic_demand" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"requested_by" varchar(160) NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_demand_count_positive" CHECK ("topic_demand"."count" > 0)
);
--> statement-breakpoint
ALTER TABLE "topic_demand" ADD CONSTRAINT "topic_demand_node_id_taxonomy_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."taxonomy_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_demand_node_idx" ON "topic_demand" USING btree ("node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_demand_node_requested_by_key" ON "topic_demand" USING btree ("node_id","requested_by");
