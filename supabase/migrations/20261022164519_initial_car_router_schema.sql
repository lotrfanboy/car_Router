-- CarRouter application schema, managed through Supabase migrations.
-- The Next.js backend connects directly with Prisma; these tables are not a
-- browser-facing Data API.

create table "Vehicle" (
  "id" text not null,
  "brand" text not null,
  "model" text not null,
  "version" text,
  "manufactureYear" integer not null,
  "modelYear" integer not null,
  "mileage" integer not null,
  "priceCents" integer not null,
  "referenceCents" integer,
  "city" text,
  "state" text,
  "fuel" text,
  "transmission" text,
  "source" text not null,
  "sellerType" text,
  "originalUrl" text,
  "imageUrl" text,
  "notes" text,
  "favorite" boolean not null default false,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null,
  constraint "Vehicle_pkey" primary key ("id")
);

create table "VehiclePrice" (
  "id" serial not null,
  "vehicleId" text not null,
  "priceCents" integer not null,
  "observedAt" timestamp(3) not null default current_timestamp,
  "reason" text not null,
  constraint "VehiclePrice_pkey" primary key ("id")
);

create table "SavedSearch" (
  "id" text not null,
  "name" text not null,
  "criteria" text not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  "queryKey" text,
  constraint "SavedSearch_pkey" primary key ("id")
);

create table "SearchRun" (
  "id" text not null,
  "searchId" text not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  "result" text not null,
  constraint "SearchRun_pkey" primary key ("id")
);

create table "DiscoveredListing" (
  "id" text not null,
  "source" text not null,
  "externalId" text not null,
  "payload" text not null,
  "firstSeen" timestamp(3) not null default current_timestamp,
  "lastSeen" timestamp(3) not null default current_timestamp,
  "savedAt" timestamp(3),
  constraint "DiscoveredListing_pkey" primary key ("id")
);

create table "SearchCache" (
  "id" text not null,
  "result" text not null,
  "updatedAt" timestamp(3) not null default current_timestamp,
  constraint "SearchCache_pkey" primary key ("id")
);

create table "Radar" (
  "id" text not null,
  "searchId" text not null,
  "name" text not null,
  "minPercent" double precision not null,
  "intervalHours" integer not null default 24,
  "enabled" boolean not null default false,
  "lastRunAt" timestamp(3),
  "nextRunAt" timestamp(3),
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null,
  constraint "Radar_pkey" primary key ("id")
);

create table "RadarRun" (
  "id" text not null,
  "radarId" text not null,
  "startedAt" timestamp(3) not null default current_timestamp,
  "finishedAt" timestamp(3),
  "status" text not null,
  "message" text not null,
  constraint "RadarRun_pkey" primary key ("id")
);

create table "RadarNotice" (
  "id" text not null,
  "radarId" text not null,
  "listingKey" text not null,
  "priceCents" integer not null,
  "eventKey" text not null,
  "status" text not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  "sentAt" timestamp(3),
  constraint "RadarNotice_pkey" primary key ("id")
);

create table "ListingPrice" (
  "id" serial not null,
  "listingId" text not null,
  "priceCents" integer not null,
  "observedAt" timestamp(3) not null default current_timestamp,
  constraint "ListingPrice_pkey" primary key ("id")
);

create table "ProviderSpend" (
  "id" serial not null,
  "provider" text not null,
  "credits" integer not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  constraint "ProviderSpend_pkey" primary key ("id")
);

create table "SearchLock" (
  "id" text not null,
  "expiresAt" timestamp(3) not null,
  constraint "SearchLock_pkey" primary key ("id")
);

create table "OlxLocation" (
  "id" text not null,
  "region" text not null,
  "verifiedAt" timestamp(3) not null default current_timestamp,
  constraint "OlxLocation_pkey" primary key ("id")
);

create table "CatalogSearch" (
  "id" text not null,
  "name" text not null,
  "query" text not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  constraint "CatalogSearch_pkey" primary key ("id")
);

create index "Vehicle_brand_model_idx" on "Vehicle" ("brand", "model");
create index "Vehicle_createdAt_idx" on "Vehicle" ("createdAt");
create index "Vehicle_favorite_idx" on "Vehicle" ("favorite");
create index "VehiclePrice_vehicleId_id_idx" on "VehiclePrice" ("vehicleId", "id");
create unique index "SavedSearch_queryKey_key" on "SavedSearch" ("queryKey");
create index "SearchRun_searchId_createdAt_idx" on "SearchRun" ("searchId", "createdAt");
create index "DiscoveredListing_lastSeen_idx" on "DiscoveredListing" ("lastSeen");
create index "DiscoveredListing_savedAt_idx" on "DiscoveredListing" ("savedAt");
create unique index "DiscoveredListing_source_externalId_key" on "DiscoveredListing" ("source", "externalId");
create index "Radar_searchId_idx" on "Radar" ("searchId");
create index "Radar_enabled_nextRunAt_idx" on "Radar" ("enabled", "nextRunAt");
create index "RadarRun_radarId_startedAt_idx" on "RadarRun" ("radarId", "startedAt");
create unique index "RadarNotice_eventKey_key" on "RadarNotice" ("eventKey");
create index "RadarNotice_radarId_listingKey_idx" on "RadarNotice" ("radarId", "listingKey");
create index "ListingPrice_listingId_id_idx" on "ListingPrice" ("listingId", "id");
create index "ProviderSpend_provider_createdAt_idx" on "ProviderSpend" ("provider", "createdAt");
create index "SearchLock_expiresAt_idx" on "SearchLock" ("expiresAt");
create index "CatalogSearch_createdAt_idx" on "CatalogSearch" ("createdAt");

alter table "VehiclePrice"
  add constraint "VehiclePrice_vehicleId_fkey"
  foreign key ("vehicleId") references "Vehicle" ("id")
  on delete cascade on update cascade;
alter table "SearchRun"
  add constraint "SearchRun_searchId_fkey"
  foreign key ("searchId") references "SavedSearch" ("id")
  on delete cascade on update cascade;
alter table "Radar"
  add constraint "Radar_searchId_fkey"
  foreign key ("searchId") references "SavedSearch" ("id")
  on delete restrict on update cascade;
alter table "RadarRun"
  add constraint "RadarRun_radarId_fkey"
  foreign key ("radarId") references "Radar" ("id")
  on delete cascade on update cascade;
alter table "RadarNotice"
  add constraint "RadarNotice_radarId_fkey"
  foreign key ("radarId") references "Radar" ("id")
  on delete cascade on update cascade;
alter table "ListingPrice"
  add constraint "ListingPrice_listingId_fkey"
  foreign key ("listingId") references "DiscoveredListing" ("id")
  on delete cascade on update cascade;

-- The application uses a direct PostgreSQL connection. Keep its persistence
-- tables unreachable through Supabase's browser-facing Data API.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences
  from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role, public;

revoke all on table
  "Vehicle", "VehiclePrice", "SavedSearch", "SearchRun",
  "DiscoveredListing", "SearchCache", "Radar", "RadarRun",
  "RadarNotice", "ListingPrice", "ProviderSpend", "SearchLock",
  "OlxLocation", "CatalogSearch"
from anon, authenticated, service_role;

revoke all on sequence "VehiclePrice_id_seq", "ListingPrice_id_seq", "ProviderSpend_id_seq"
from anon, authenticated, service_role;

alter table "Vehicle" enable row level security;
alter table "VehiclePrice" enable row level security;
alter table "SavedSearch" enable row level security;
alter table "SearchRun" enable row level security;
alter table "DiscoveredListing" enable row level security;
alter table "SearchCache" enable row level security;
alter table "Radar" enable row level security;
alter table "RadarRun" enable row level security;
alter table "RadarNotice" enable row level security;
alter table "ListingPrice" enable row level security;
alter table "ProviderSpend" enable row level security;
alter table "SearchLock" enable row level security;
alter table "OlxLocation" enable row level security;
alter table "CatalogSearch" enable row level security;
