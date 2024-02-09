CREATE TABLE IF NOT EXISTS "groups" (
	"_id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"verified" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"_id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar,
	"channel_id" varchar,
	"role_ids" text[],
	"group_id" serial NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"_id" serial PRIMARY KEY NOT NULL,
	"credentials" text,
	"discord_id" varchar NOT NULL,
	"notifications" text[]
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_groups" (
	"user_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"verified" boolean DEFAULT false,
	CONSTRAINT "name_pk" PRIMARY KEY("user_id","group_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permissions" (
	"_id" serial PRIMARY KEY NOT NULL,
	"role_ids" text[],
	"user_ids" text[],
	"guild_id" varchar NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_user_id_users__id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_group_id_groups__id_fk" FOREIGN KEY ("group_id") REFERENCES "groups"("_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
