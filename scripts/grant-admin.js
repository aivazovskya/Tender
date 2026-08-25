const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] || 'nurbek@creativegroup.kz').trim().toLowerCase();
  const defaultPassword = process.argv[3] || 'admin12345';
  const name = process.argv[4] || 'Нурбек Берекетулы';

  console.log(`\n👑 Выдача прав администратора для: ${email}`);

  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser) {
    const updated = await prisma.user.update({
      where: { email },
      data: {
        role: 'ADMIN',
        status: 'APPROVED'
      }
    });

    console.log(`\n✅ Права администратора успешно выданы существующему аккаунту:`);
    console.log(`   ID:     ${updated.id}`);
    console.log(`   Email:  ${updated.email}`);
    console.log(`   Имя:    ${updated.name || name}`);
    console.log(`   Роль:   ${updated.role}`);
    console.log(`   Статус: ${updated.status}`);
    console.log(`   (Пароль остался прежним, который был задан при регистрации)\n`);
  } else {
    const passwordHash = await bcrypt.hash(defaultPassword, 12);
    const created = await prisma.user.create({
      data: {
        id: `admin_${Date.now()}`,
        email,
        passwordHash,
        name,
        role: 'ADMIN',
        status: 'APPROVED'
      }
    });

    console.log(`\n✅ Создан новый аккаунт администратора:`);
    console.log(`   ID:     ${created.id}`);
    console.log(`   Email:  ${created.email}`);
    console.log(`   Имя:    ${created.name}`);
    console.log(`   Роль:   ${created.role}`);
    console.log(`   Статус: ${created.status}`);
    console.log(`   Пароль: ${defaultPassword}\n`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
