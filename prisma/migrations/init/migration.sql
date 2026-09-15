-- CreateEnum
CREATE TYPE "CharacterClass" AS ENUM ('FIGHTER', 'SUPPORT', 'UTILITY');

-- CreateEnum
CREATE TYPE "EncounterState" AS ENUM ('LOBBY', 'PLAYER_PLAN', 'PLAYER_ACTION', 'RESOLVE_PLAYERS', 'ENEMY_ACTION', 'ROUND_END', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "EncounterMode" AS ENUM ('AUTOMATED', 'MANUAL', 'HYBRID');

-- CreateTable
CREATE TABLE "GuildConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "gmRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "encounterTimeoutsId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterTimeouts" (
    "id" TEXT NOT NULL,
    "playerPlan" INTEGER NOT NULL DEFAULT 300,
    "playerAction" INTEGER NOT NULL DEFAULT 60,
    "enemyAction" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "EncounterTimeouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerCharacter" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "class" "CharacterClass" NOT NULL,
    "utilityKitId" TEXT,
    "maxHp" INTEGER NOT NULL DEFAULT 30,
    "currentHp" INTEGER NOT NULL DEFAULT 30,
    "activeEncounterId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveDefinition" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "class" "CharacterClass" NOT NULL,
    "utilityKitId" TEXT,
    "minLevel" INTEGER NOT NULL,
    "targetRule" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "cooldownRounds" INTEGER,
    "maxCharges" INTEGER,
    "effects" JSONB NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoveDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterMove" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "moveId" TEXT NOT NULL,
    "learnedAtLevel" INTEGER NOT NULL,
    "equippedSlot" INTEGER,

    CONSTRAINT "CharacterMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamActionDefinition" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiredClassMultiset" TEXT[],
    "prerequisites" JSONB NOT NULL,
    "effects" JSONB NOT NULL,
    "unlockRule" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamActionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamActionUnlock" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "teamActionId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "TeamActionUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDefinition" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tiers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterItem" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "currentCharges" INTEGER NOT NULL,

    CONSTRAINT "CharacterItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "state" "EncounterState" NOT NULL DEFAULT 'LOBBY',
    "round" INTEGER NOT NULL DEFAULT 0,
    "enemyName" TEXT NOT NULL,
    "enemyHp" INTEGER NOT NULL,
    "enemyMaxHp" INTEGER NOT NULL,
    "mode" "EncounterMode" NOT NULL DEFAULT 'AUTOMATED',
    "deadlinesId" TEXT NOT NULL,
    "randomSeed" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterDeadlines" (
    "id" TEXT NOT NULL,
    "playerPlanDeadline" TIMESTAMP(3),
    "playerActionDeadline" TIMESTAMP(3),
    "enemyActionDeadline" TIMESTAMP(3),

    CONSTRAINT "EncounterDeadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterParticipant" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "startSnapshot" JSONB NOT NULL,
    "currentHp" INTEGER NOT NULL,
    "statuses" JSONB NOT NULL,
    "shield" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EncounterParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionSubmission" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "ActionSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResolutionEvent" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "phase" "EncounterState" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "definitionVersions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResolutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "beforeSummary" JSONB,
    "afterSummary" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuildConfig_guildId_key" ON "GuildConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildConfig_encounterTimeoutsId_key" ON "GuildConfig"("encounterTimeoutsId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCharacter_userId_key" ON "PlayerCharacter"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_deadlinesId_key" ON "Encounter"("deadlinesId");

-- AddForeignKey
ALTER TABLE "GuildConfig" ADD CONSTRAINT "GuildConfig_encounterTimeoutsId_fkey" FOREIGN KEY ("encounterTimeoutsId") REFERENCES "EncounterTimeouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterMove" ADD CONSTRAINT "CharacterMove_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "PlayerCharacter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamActionUnlock" ADD CONSTRAINT "TeamActionUnlock_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "PlayerCharacter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterItem" ADD CONSTRAINT "CharacterItem_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "PlayerCharacter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_deadlinesId_fkey" FOREIGN KEY ("deadlinesId") REFERENCES "EncounterDeadlines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterParticipant" ADD CONSTRAINT "EncounterParticipant_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterParticipant" ADD CONSTRAINT "EncounterParticipant_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "PlayerCharacter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionSubmission" ADD CONSTRAINT "ActionSubmission_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolutionEvent" ADD CONSTRAINT "ResolutionEvent_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

