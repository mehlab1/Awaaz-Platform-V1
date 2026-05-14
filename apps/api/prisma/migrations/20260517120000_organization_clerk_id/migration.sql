-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "clerkOrganizationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_clerkOrganizationId_key" ON "organizations"("clerkOrganizationId");
