CREATE TYPE "public"."cost_model" AS ENUM('free', 'freemium', 'paid');--> statement-breakpoint
CREATE TYPE "public"."licence_code" AS ENUM('cc0', 'public-domain', 'cc-by', 'cc-by-sa', 'platform-tos', 'proprietary');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('course', 'tutorial', 'book', 'reference', 'audio', 'video');--> statement-breakpoint
CREATE TYPE "public"."taxonomy_scheme" AS ENUM('isced-f', 'uk-nc', 'sced', 'internal');--> statement-breakpoint
CREATE TYPE "public"."usage_tier" AS ENUM('open', 'embed', 'commercial');--> statement-breakpoint
CREATE TABLE "resource_taxonomy" (
	"resource_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "resource_taxonomy_resource_id_node_id_pk" PRIMARY KEY("resource_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(160) NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"canonical_url" text NOT NULL,
	"embed_url" text,
	"mirrored_path" text,
	"affiliate_url" text,
	"media_type" "media_type" NOT NULL,
	"provider" varchar(160) NOT NULL,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" varchar(8) NOT NULL,
	"licence" "licence_code" NOT NULL,
	"usage_tier" "usage_tier" NOT NULL,
	"attribution_text" varchar(500),
	"cost_model" "cost_model" NOT NULL,
	"isbn" varchar(13),
	"duration_seconds" integer,
	"page_count" integer,
	"source_connector" varchar(64) NOT NULL,
	"source_terms_verified_at" timestamp with time zone NOT NULL,
	"last_verified_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_licence_matches_usage_tier" CHECK ((
        ("resources"."licence" in ('cc0', 'public-domain', 'cc-by', 'cc-by-sa') and "resources"."usage_tier" = 'open')
        or ("resources"."licence" = 'platform-tos' and "resources"."usage_tier" = 'embed')
        or ("resources"."licence" = 'proprietary' and "resources"."usage_tier" = 'commercial')
      )),
	CONSTRAINT "resources_commercial_links_only" CHECK ("resources"."usage_tier" <> 'commercial' or ("resources"."embed_url" is null and "resources"."mirrored_path" is null)),
	CONSTRAINT "resources_embed_tier_requires_embed_url" CHECK ("resources"."usage_tier" <> 'embed' or ("resources"."embed_url" is not null and "resources"."mirrored_path" is null)),
	CONSTRAINT "resources_affiliate_commercial_only" CHECK ("resources"."affiliate_url" is null or "resources"."usage_tier" = 'commercial'),
	CONSTRAINT "resources_attribution_present_when_required" CHECK ("resources"."licence" not in ('cc-by', 'cc-by-sa')
        or ("resources"."attribution_text" is not null and btrim("resources"."attribution_text") <> ''))
);
--> statement-breakpoint
CREATE TABLE "taxonomy_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"scheme" "taxonomy_scheme" NOT NULL,
	"code" varchar(32) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"path" text NOT NULL,
	"depth" integer NOT NULL,
	"names" jsonb NOT NULL,
	"resource_count" integer DEFAULT 0 NOT NULL,
	"media_type_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxonomy_nodes_depth_non_negative" CHECK ("taxonomy_nodes"."depth" >= 0),
	CONSTRAINT "taxonomy_nodes_counts_non_negative" CHECK ("taxonomy_nodes"."resource_count" >= 0 and "taxonomy_nodes"."media_type_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "resource_taxonomy" ADD CONSTRAINT "resource_taxonomy_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_taxonomy" ADD CONSTRAINT "resource_taxonomy_node_id_taxonomy_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."taxonomy_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_nodes" ADD CONSTRAINT "taxonomy_nodes_parent_id_taxonomy_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."taxonomy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resource_taxonomy_node_idx" ON "resource_taxonomy" USING btree ("node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_slug_key" ON "resources" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "resources_media_type_idx" ON "resources" USING btree ("media_type");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_nodes_slug_key" ON "taxonomy_nodes" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_nodes_scheme_code_key" ON "taxonomy_nodes" USING btree ("scheme","code");--> statement-breakpoint
CREATE INDEX "taxonomy_nodes_path_idx" ON "taxonomy_nodes" USING btree ("path");--> statement-breakpoint
CREATE INDEX "taxonomy_nodes_parent_idx" ON "taxonomy_nodes" USING btree ("parent_id");