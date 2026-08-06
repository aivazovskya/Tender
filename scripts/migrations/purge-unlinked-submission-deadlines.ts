import { prisma } from '../../src/lib/prisma';

/**
 * Migration Script: Purge Unlinked SUBMISSION_DEADLINE records (Defect 1)
 * Deletes all TenderDeadline records of type 'SUBMISSION_DEADLINE' where the associated company
 * does NOT have a corresponding KanbanCard for that tenderId.
 */
export async function purgeUnlinkedSubmissionDeadlines() {
  console.log('🧹 [Migration] Starting cleanup of unlinked SUBMISSION_DEADLINE records...');

  try {
    // 1. Fetch all SUBMISSION_DEADLINE records
    const deadlines = await prisma.tenderDeadline.findMany({
      where: { type: 'SUBMISSION_DEADLINE' },
      include: {
        companyProfile: true
      }
    });

    console.log(`  📊 Found ${deadlines.length} total SUBMISSION_DEADLINE records to audit...`);

    const idsToDelete: string[] = [];

    for (const ddl of deadlines) {
      if (!ddl.companyProfile) {
        idsToDelete.push(ddl.id);
        continue;
      }

      // Check if a KanbanCard exists for this tenderId & company (by userId or organizationId)
      const matchingCard = await prisma.kanbanCard.findFirst({
        where: {
          tenderId: ddl.tenderId,
          OR: [
            ...(ddl.companyProfile.userId ? [{ userId: ddl.companyProfile.userId }] : []),
            ...(ddl.companyProfile.organizationId ? [{ organizationId: ddl.companyProfile.organizationId }] : [])
          ]
        }
      });

      if (!matchingCard) {
        idsToDelete.push(ddl.id);
      }
    }

    if (idsToDelete.length > 0) {
      const deleteResult = await prisma.tenderDeadline.deleteMany({
        where: { id: { in: idsToDelete } }
      });
      console.log(`  ✅ Successfully purged ${deleteResult.count} unlinked SUBMISSION_DEADLINE records!`);
      return { deletedCount: deleteResult.count };
    } else {
      console.log('  ✨ No unlinked SUBMISSION_DEADLINE records found to purge.');
      return { deletedCount: 0 };
    }
  } catch (error: any) {
    console.error('❌ [Migration Error]:', error?.message || error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  purgeUnlinkedSubmissionDeadlines()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
