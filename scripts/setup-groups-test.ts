/* Prépare le scénario de test « appel classe avec groupes » :
   - classe 1BACSC-1 : création des groupes G1 / G2
   - élèves de la classe répartis moitié G1, moitié G2
   - séance « en cours » pour l'enseignant démo : 1BACSC-1 · G1 · الرياضيات
   Idempotent — relançable après chaque restauration de la DB démo. */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const classe = await db.classe.findFirst({ where: { code: "1BACSC-1" } });
  if (!classe) throw new Error("Classe 1BACSC-1 introuvable — lancer d'abord le seed démo");

  const teacher = await db.teacher.findFirst({ where: { lastName: "العلمي" } });
  if (!teacher) throw new Error("Enseignant démo introuvable");

  // 1) Groupes G1 / G2 sur la classe
  const g1 = await db.groupe.upsert({
    where: { code_classeId: { code: "G1", classeId: classe.id } },
    update: {},
    create: { code: "G1", labelFr: "Groupe 1", labelAr: "المجموعة 1", classeId: classe.id },
  });
  const g2 = await db.groupe.upsert({
    where: { code_classeId: { code: "G2", classeId: classe.id } },
    update: {},
    create: { code: "G2", labelFr: "Groupe 2", labelAr: "المجموعة 2", classeId: classe.id },
  });

  // 2) Répartition des élèves de la classe : moitié G1, moitié G2
  const students = await db.student.findMany({
    where: { classeId: classe.id },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const half = Math.ceil(students.length / 2);
  for (let i = 0; i < students.length; i++) {
    const groupId = i < half ? g1.id : g2.id;
    if (students[i].groupId !== groupId) {
      await db.student.update({ where: { id: students[i].id }, data: { groupId } });
    }
  }
  console.log(`Élèves 1BACSC-1 : ${half} → G1, ${students.length - half} → G2`);

  // 3) Séance « en cours » : aujourd'hui, créneau couvrant maintenant (G1)
  const now = new Date();
  const dow = now.getDay(); // 1=Lundi … 6=Samedi (0=dimanche : repli sur 1)
  const dayOfWeek = dow === 0 ? 1 : dow;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = Math.max(0, nowMin - 15);
  const endMin = Math.min(23 * 60 + 59, nowMin + 105);

  const existing = await db.serviceSlot.findFirst({
    where: { classeId: classe.id, groupId: g1.id, teacherId: teacher.id },
  });
  const slotData = {
    teacherId: teacher.id,
    classeId: classe.id,
    groupId: g1.id,
    subject: "Mathématiques",
    subjectAr: "الرياضيات",
    dayOfWeek,
    startMin,
    endMin,
  };
  if (existing) {
    await db.serviceSlot.update({ where: { id: existing.id }, data: slotData });
    console.log(`Séance mise à jour : 1BACSC-1 · G1 · ${dayOfWeek} · ${startMin}-${endMin}`);
  } else {
    await db.serviceSlot.create({ data: slotData });
    console.log(`Séance créée : 1BACSC-1 · G1 · ${dayOfWeek} · ${startMin}-${endMin}`);
  }

  // Récap
  const n1 = await db.student.count({ where: { groupId: g1.id } });
  const n2 = await db.student.count({ where: { groupId: g2.id } });
  const total = await db.student.count({ where: { classeId: classe.id } });
  console.log(`Récap : G1=${n1} élèves, G2=${n2} élèves, classe=${total} élèves (attendu à l'appel : ${total})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
