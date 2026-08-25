const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const email = (args[0] || 'admin@tender.ai').trim().toLowerCase();
  const password = args[1] || 'admin12345';
  const name = args[2] || 'Главный Администратор';

  console.log(`\n👑 Инициализация/обновление администратора TenderAI:`);
  console.log(`   Email: ${email}`);
  console.log(`   Имя:   ${name}`);

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      name,
      role: 'ADMIN',
      status: 'APPROVED'
    },
    create: {
      id: `admin_${Date.now()}`,
      email,
      passwordHash,
      name,
      role: 'ADMIN',
      status: 'APPROVED'
    }
  });

  console.log(`\n✅ Администратор успешно создан/обновлен:`);
  console.log(`   ID:     ${user.id}`);
  console.log(`   Email:  ${user.email}`);
  console.log(`   Роль:   ${user.role}`);
  console.log(`   Статус: ${user.status}`);
  console.log(`\nТеперь вы можете войти в систему с этими учетными данными.\n`);
}

main()
  .catch((e) => {
    console.error('❌ Ошибка создания администратора:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
