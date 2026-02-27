import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function run() {
  const user = await prisma.user.findUnique({
    where: { username: 'owner' },
    select: { id: true },
  })
  console.log(user)
}

run().finally(() => prisma.$disconnect())
