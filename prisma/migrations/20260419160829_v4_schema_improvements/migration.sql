/*
  Warnings:

  - A unique constraint covering the columns `[account_id,position_no]` on the table `OpenPosition` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "pips" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Deal_account_id_type_idx" ON "Deal"("account_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "OpenPosition_account_id_position_no_key" ON "OpenPosition"("account_id", "position_no");

-- CreateIndex
CREATE INDEX "Position_account_id_open_time_idx" ON "Position"("account_id", "open_time");
