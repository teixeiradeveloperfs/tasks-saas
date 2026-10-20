import { prisma } from "@/db/client";
import { notifyMeeting, notifyTask } from "@/notifications/push";

const INTERVAL_MS = 15 * 60 * 1000;

async function sendScheduledNotifications() {
  const now = new Date();
  const taskLimit = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const meetingLimit = new Date(now.getTime() + 30 * 60 * 1000);
  const [tasks, meetings] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: "done" }, dueDate: { gt: now, lte: taskLimit } },
      select: { id: true, workspaceId: true, title: true, dueDate: true },
    }),
    prisma.meeting.findMany({
      where: { cancelledAt: null, startAt: { gt: now, lte: meetingLimit } },
      select: {
        id: true,
        workspaceId: true,
        organizerId: true,
        title: true,
        attendeeEmails: true,
        startAt: true,
      },
    }),
  ]);
  await Promise.allSettled([
    ...tasks.map((task) =>
      notifyTask(
        task,
        undefined,
        "taskDueSoon",
        "O prazo desta tarefa vence nas próximas 24 horas.",
        `task-due:${task.id}:${task.dueDate?.toISOString()}`,
      ),
    ),
    ...meetings.map((meeting) =>
      notifyMeeting(
        meeting,
        undefined,
        "Esta reunião começa em menos de 30 minutos.",
        `meeting-reminder:${meeting.id}:${meeting.startAt.toISOString()}`,
      ),
    ),
  ]);
  await prisma.pushNotificationEvent.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
  });
}

export function startNotificationScheduler(log: { error: (error: unknown) => void }) {
  const run = () => void sendScheduledNotifications().catch((error) => log.error(error));
  const initial = setTimeout(run, 10_000);
  const interval = setInterval(run, INTERVAL_MS);
  initial.unref();
  interval.unref();
}
