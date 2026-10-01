CREATE TYPE "public"."learner_age_band" AS ENUM('5-7', '8-10', '11-13', '14-16', '17-18');--> statement-breakpoint
CREATE TYPE "public"."learner_attention_span" AS ENUM('under-10-minutes', '10-20-minutes', 'over-20-minutes');--> statement-breakpoint
CREATE TYPE "public"."learner_confidence_level" AS ENUM('low', 'developing', 'confident', 'high');--> statement-breakpoint
CREATE TYPE "public"."learner_learning_preference" AS ENUM('visual', 'narrative', 'step-by-step', 'challenge-first');--> statement-breakpoint
CREATE TABLE "learners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutor_id" uuid NOT NULL,
	"pseudonym" varchar(40) NOT NULL,
	"age_band" "learner_age_band" NOT NULL,
	"locale" varchar(20) NOT NULL,
	"curriculum_code" varchar(40) NOT NULL,
	"interests" varchar(40)[] DEFAULT '{}' NOT NULL,
	"learning_preference" "learner_learning_preference" NOT NULL,
	"confidence_level" "learner_confidence_level" NOT NULL,
	"attention_span" "learner_attention_span" NOT NULL,
	"gender" varchar(64),
	"subject" varchar(80) NOT NULL,
	"level" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learners" ADD CONSTRAINT "learners_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;