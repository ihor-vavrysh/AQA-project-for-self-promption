CREATE TYPE "public"."difficulty_band" AS ENUM('foundation', 'core', 'stretch');--> statement-breakpoint
CREATE TYPE "public"."enrichment_source" AS ENUM('curated', 'deterministic', 'model');--> statement-breakpoint
CREATE TYPE "public"."safety_vet_status" AS ENUM('pending', 'passed', 'failed');--> statement-breakpoint
CREATE TABLE "resource_enrichment" (
	"resource_id" uuid NOT NULL,
	"source" "enrichment_source" NOT NULL,
	"age_band_fit" text[] DEFAULT '{}' NOT NULL,
	"reading_level" integer,
	"readability_score" numeric(5, 2),
	"difficulty" "difficulty_band",
	"prerequisite_concepts" text[] DEFAULT '{}' NOT NULL,
	"character_fit_tags" text[] DEFAULT '{}' NOT NULL,
	"quality_score" numeric(3, 2),
	"summary" text,
	"safety_vet_status" "safety_vet_status" DEFAULT 'pending' NOT NULL,
	"vetted_by" varchar(320),
	"vetted_at" timestamp with time zone,
	"prompt_version" varchar(64),
	"model" varchar(64),
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(10, 6),
	"enriched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_enrichment_resource_id_source_pk" PRIMARY KEY("resource_id","source"),
	CONSTRAINT "resource_enrichment_model_provenance" CHECK ("resource_enrichment"."source" <> 'model' or ("resource_enrichment"."prompt_version" is not null and "resource_enrichment"."model" is not null)),
	CONSTRAINT "resource_enrichment_non_model_provenance" CHECK ("resource_enrichment"."source" = 'model' or ("resource_enrichment"."prompt_version" is null and "resource_enrichment"."model" is null)),
	CONSTRAINT "resource_enrichment_vetting_needs_human" CHECK ("resource_enrichment"."safety_vet_status" <> 'passed'
        or ("resource_enrichment"."vetted_by" is not null and btrim("resource_enrichment"."vetted_by") <> '')),
	CONSTRAINT "resource_enrichment_quality_range" CHECK ("resource_enrichment"."quality_score" is null or ("resource_enrichment"."quality_score" >= 0 and "resource_enrichment"."quality_score" <= 1)),
	CONSTRAINT "resource_enrichment_tag_cap" CHECK (cardinality("resource_enrichment"."character_fit_tags") <= 8)
);
--> statement-breakpoint
ALTER TABLE "resource_enrichment" ADD CONSTRAINT "resource_enrichment_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resource_enrichment_age_band_idx" ON "resource_enrichment" USING gin ("age_band_fit");--> statement-breakpoint
CREATE INDEX "resource_enrichment_tags_idx" ON "resource_enrichment" USING gin ("character_fit_tags");--> statement-breakpoint
CREATE INDEX "resource_enrichment_vet_idx" ON "resource_enrichment" USING btree ("safety_vet_status");--> statement-breakpoint
CREATE INDEX "resources_published_at_idx" ON "resources" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "resources_language_idx" ON "resources" USING btree ("language");--> statement-breakpoint
CREATE INDEX "resources_cost_model_idx" ON "resources" USING btree ("cost_model");--> statement-breakpoint
-- One enrichment row per resource, preferring a human curator over a deterministic
-- scorer over a model. Whole-row precedence: coalescing columns across sources would
-- produce a record no human reviewed and make the provenance columns meaningless.
-- Declared `.existing()` in schema.ts because DISTINCT ON does not round-trip through
-- the schema generator, so this statement is the definition.
CREATE VIEW "resource_enrichment_current" AS
SELECT DISTINCT ON ("resource_id")
  "resource_id",
  "source",
  "age_band_fit",
  "reading_level",
  "difficulty",
  "character_fit_tags",
  "quality_score",
  "summary",
  "safety_vet_status"
FROM "resource_enrichment"
ORDER BY
  "resource_id",
  CASE "source"
    WHEN 'curated' THEN 0
    WHEN 'deterministic' THEN 1
    ELSE 2
  END;
