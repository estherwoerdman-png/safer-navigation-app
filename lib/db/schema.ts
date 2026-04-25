import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, customType, index, check } from 'drizzle-orm/pg-core';

// PostGIS geography types — Drizzle has no native geography; we use customType.
const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() { return 'geography(point, 4326)'; },
});
const geographyLine = customType<{ data: string; driverData: string }>({
  dataType() { return 'geography(linestring, 4326)'; },
});

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    location: geographyPoint('location').notNull(),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),

    transcript: text('transcript').notNull(),
    type: text('type').notNull(),       // 'acute' | 'environmental'
    severity: text('severity').notNull(), // 'low' | 'medium' | 'high'
    summary: text('summary').notNull(),

    source: text('source').notNull().default('user'), // 'user' | 'seed'
  },
  (t) => ({
    typeCheck: check('reports_type_check', sql`${t.type} in ('acute','environmental')`),
    severityCheck: check('reports_severity_check', sql`${t.severity} in ('low','medium','high')`),
    sourceCheck: check('reports_source_check', sql`${t.source} in ('user','seed')`),
    locIdx: index('reports_loc_gix').using('gist', t.location),
  }),
);

export const feedbackResponses = pgTable('feedback_responses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid('report_id').notNull().references(() => reports.id, { onDelete: 'cascade' }),
  agree: text('agree').notNull(), // store as 'true'/'false' to avoid driver-coercion footguns
  respondedAt: timestamp('responded_at', { withTimezone: true }).notNull().defaultNow(),
  responderLoc: geographyPoint('responder_loc').notNull(),
});

export const routeFeedback = pgTable(
  'route_feedback',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    polyline: geographyLine('polyline').notNull(),
    rating: text('rating').notNull(), // 'lit_quiet' | 'caution' | 'avoid' | 'acute'
    ratedAt: timestamp('rated_at', { withTimezone: true }).notNull().defaultNow(),
    durationMin: integer('duration_min').notNull(),
    mode: text('mode').notNull(), // 'walking' | 'cycling'
  },
  (t) => ({
    ratingCheck: check('route_feedback_rating_check', sql`${t.rating} in ('lit_quiet','caution','avoid','acute')`),
    modeCheck: check('route_feedback_mode_check', sql`${t.mode} in ('walking','cycling')`),
    geomIdx: index('route_feedback_geom_gix').using('gist', t.polyline),
  }),
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
