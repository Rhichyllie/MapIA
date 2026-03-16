CREATE TABLE "creation_telemetry_events" (
    "id" UUID NOT NULL,
    "eventName" VARCHAR(120) NOT NULL,
    "eventVersion" INTEGER NOT NULL,
    "eventId" VARCHAR(120) NOT NULL,
    "dedupeKey" VARCHAR(180),
    "emittedAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "environment" VARCHAR(40) NOT NULL,
    "releaseVersion" VARCHAR(80) NOT NULL,
    "serviceName" VARCHAR(80) NOT NULL,
    "requestId" VARCHAR(120) NOT NULL,
    "traceId" VARCHAR(120) NOT NULL,
    "correlationId" VARCHAR(120) NOT NULL,
    "causationId" VARCHAR(120),
    "actorType" VARCHAR(40) NOT NULL,
    "actorIdentityHash" VARCHAR(128),
    "projectId" UUID,
    "classification" VARCHAR(40) NOT NULL,
    "piiLevel" VARCHAR(40) NOT NULL,
    "retentionClass" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    CONSTRAINT "creation_telemetry_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "creation_telemetry_events_eventName_emittedAt_idx"
ON "creation_telemetry_events"("eventName", "emittedAt");

CREATE INDEX "creation_telemetry_events_emittedAt_idx"
ON "creation_telemetry_events"("emittedAt");

CREATE INDEX "creation_telemetry_events_projectId_emittedAt_idx"
ON "creation_telemetry_events"("projectId", "emittedAt");

CREATE UNIQUE INDEX "creation_telemetry_events_eventName_eventVersion_dedupeKey_key"
ON "creation_telemetry_events"("eventName", "eventVersion", "dedupeKey");
