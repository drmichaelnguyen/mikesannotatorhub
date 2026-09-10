-- Per-line (per template field) comment choice configs for scope templates.
ALTER TABLE "ScopeOfWorkTemplate" ADD COLUMN "commentFieldConfigs" TEXT NOT NULL DEFAULT '[]';
