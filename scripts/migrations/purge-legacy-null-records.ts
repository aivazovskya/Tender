import { prisma } from '../../src/lib/prisma';

/**
 * Migration Script: Purge legacy records with userId = null (Option A - Task 0.4b)
 * Removes unassigned CompanyProfile and KanbanCard records created prior to multi-tenant user isolation.
 */
export async function purgeLegacyNullRecords() {
  console.log('🧹 [Migration] Starting cleanup of legacy records with userId = null...');

  try {
    const deletedCards = await prisma.kanbanCard.deleteMany({
      where: { userId: null }
    });
    console.log(`  ✅ Purged ${deletedCards.count} legacy KanbanCard records with userId = null`);

    const deletedProfiles = await prisma.companyProfile.deleteMany({
      where: { userId: null }
    });
    console.log(`  ✅ Purged ${deletedProfiles.count} legacy CompanyProfile records with userId = null`);

    console.log('🎉 [Migration] Legacy record cleanup completed successfully!');
    return {
      deletedCardsCount: deletedCards.count,
      deletedProfilesCount: deletedProfiles.count
    };
  } catch (error: any) {
    console.error('❌ [Migration Error]:', error?.message || error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  purgeLegacyNullRecords()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
