CREATE TABLE "feedback_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"agree" text NOT NULL,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responder_loc" "geography(point, 4326)" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location" "geography(point, 4326)" NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transcript" text NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"summary" text NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	CONSTRAINT "reports_type_check" CHECK ("reports"."type" in ('acute','environmental')),
	CONSTRAINT "reports_severity_check" CHECK ("reports"."severity" in ('low','medium','high')),
	CONSTRAINT "reports_source_check" CHECK ("reports"."source" in ('user','seed'))
);
--> statement-breakpoint
CREATE TABLE "route_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"polyline" "geography(linestring, 4326)" NOT NULL,
	"rating" text NOT NULL,
	"rated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_min" integer NOT NULL,
	"mode" text NOT NULL,
	CONSTRAINT "route_feedback_rating_check" CHECK ("route_feedback"."rating" in ('lit_quiet','caution','avoid','acute')),
	CONSTRAINT "route_feedback_mode_check" CHECK ("route_feedback"."mode" in ('walking','cycling'))
);
--> statement-breakpoint
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_loc_gix" ON "reports" USING gist ("location");--> statement-breakpoint
CREATE INDEX "route_feedback_geom_gix" ON "route_feedback" USING gist ("polyline");