-- Comment entry mode + preset choices for annotator discussion composers.
ALTER TABLE "ScopeOfWorkTemplate" ADD COLUMN "commentChoiceMode" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "ScopeOfWorkTemplate" ADD COLUMN "commentChoices" TEXT NOT NULL DEFAULT '';
