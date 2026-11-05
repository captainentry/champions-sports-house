const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("champions2024", 10);
  
  await prisma.user.upsert({
    where: { email: "admin@champions.com" },
    update: { password: hashedPassword, role: "ADMIN" },
    create: { email: "admin@champions.com", password: hashedPassword, role: "ADMIN" }
  });
  
  console.log("✅ ADMIN ACCOUNT IS READY! Email: admin@champions.com | Pass: champions2024");
}
main().catch(console.error).finally(() => prisma.$disconnect());