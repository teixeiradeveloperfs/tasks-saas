import type { PushPreferences, PushStatus } from "@task-flow/shared/domain/push-contracts";
import { Bell, BellOff, Download, Loader2, Send, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  pushStatus,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  updatePushPreferences,
} from "@/lib/api/push";
import { canInstallPwa, promptPwaInstall } from "@/lib/pwa";

const preferenceLabels: Array<[keyof Omit<PushPreferences, "enabled">, string, string]> = [
  ["taskAssigned", "Responsabilidades", "Quando uma tarefa for atribuída a você."],
  ["taskUpdates", "Atualizações de tarefas", "Status, prioridade, prazo e subtarefas."],
  ["taskComments", "Comentários", "Novos comentários nas tarefas que você acompanha."],
  ["taskDueSoon", "Prazos", "Lembretes de tarefas próximas do vencimento."],
  ["meetings", "Reuniões", "Criação, alteração, cancelamento e lembrete."],
  ["githubPullRequests", "Pull requests", "PR aberta, reaberta, fechada ou mergeada."],
  ["githubActions", "GitHub Actions", "Resultado das execuções vinculadas às tarefas."],
];

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function PwaSettings() {
  const [status, setStatus] = useState<PushStatus>();
  const [subscribed, setSubscribed] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const refreshInstall = () => {
      setInstalled(isStandalone());
      setInstallable(canInstallPwa());
    };
    refreshInstall();
    window.addEventListener("automa:pwa-installable", refreshInstall);
    window.addEventListener("automa:pwa-installed", refreshInstall);
    return () => {
      window.removeEventListener("automa:pwa-installable", refreshInstall);
      window.removeEventListener("automa:pwa-installed", refreshInstall);
    };
  }, []);

  useEffect(() => {
    const available =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(available);
    void pushStatus()
      .then(setStatus)
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Falha ao carregar notificações."),
      );
    if (available) {
      void navigator.serviceWorker.ready
        .then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => setSubscribed(Boolean(subscription)));
    }
  }, []);

  const enable = async () => {
    if (!status?.publicKey || busy) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permissão de notificações não concedida pelo navegador.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      const subscription =
        current ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(status.publicKey),
        }));
      await savePushSubscription(subscription.toJSON());
      setSubscribed(true);
      setStatus(await pushStatus());
      toast.success("Notificações ativadas neste dispositivo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ativar o push.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setStatus(await pushStatus());
      toast.success("Notificações desativadas neste dispositivo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desativar o push.");
    } finally {
      setBusy(false);
    }
  };

  const changePreference = async (key: keyof PushPreferences, value: boolean) => {
    if (!status) return;
    const previous = status.preferences;
    setStatus({ ...status, preferences: { ...previous, [key]: value } });
    try {
      const preferences = await updatePushPreferences({ [key]: value });
      setStatus((current) => (current ? { ...current, preferences } : current));
    } catch (error) {
      setStatus((current) => (current ? { ...current, preferences: previous } : current));
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar a preferência.",
      );
    }
  };

  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <Card className="mt-6 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">Aplicativo e notificações</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Instale o Taskora e receba atualizações mesmo com o aplicativo fechado.
            </p>
          </div>
        </div>
        {!installed && installable && (
          <Button
            variant="outline"
            onClick={async () => {
              if (await promptPwaInstall()) setInstalled(true);
            }}
          >
            <Download className="h-4 w-4" /> Instalar aplicativo
          </Button>
        )}
        {installed && (
          <span className="inline-flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <Smartphone className="h-4 w-4" /> Aplicativo instalado
          </span>
        )}
      </div>

      {!installed && isiOS && (
        <p className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          No iPhone ou iPad, abra o menu Compartilhar do Safari e escolha “Adicionar à Tela de
          Início”. Depois abra o aplicativo instalado para ativar as notificações.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">
            {subscribed ? "Push ativo neste dispositivo" : "Push desativado neste dispositivo"}
          </p>
          <p className="text-xs text-muted-foreground">
            {status?.subscriptionCount ?? 0} dispositivo
            {status?.subscriptionCount === 1 ? "" : "s"} vinculado
            {status?.subscriptionCount === 1 ? "" : "s"} à sua conta.
          </p>
        </div>
        <div className="flex gap-2">
          {subscribed && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await sendTestPush();
                  toast.success("Notificação de teste enviada.");
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Não foi possível enviar o teste.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Send className="h-4 w-4" /> Testar
            </Button>
          )}
          <Button
            variant={subscribed ? "outline" : "default"}
            disabled={busy || !supported || !status?.configured}
            onClick={() => void (subscribed ? disable() : enable())}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : subscribed ? (
              <BellOff className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            {subscribed ? "Desativar neste dispositivo" : "Ativar notificações"}
          </Button>
        </div>
      </div>

      {!supported && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Este navegador não oferece suporte a notificações Web Push.
        </p>
      )}
      {status && !status.configured && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          O administrador ainda precisa configurar as chaves VAPID no servidor.
        </p>
      )}

      {status && (
        <div className="mt-5 divide-y rounded-lg border">
          <div className="flex items-center justify-between gap-4 p-3">
            <div>
              <p className="text-sm font-medium">Todas as notificações</p>
              <p className="text-xs text-muted-foreground">Pause sem remover seus dispositivos.</p>
            </div>
            <Switch
              checked={status.preferences.enabled}
              onCheckedChange={(value) => void changePreference("enabled", value)}
              aria-label="Ativar todas as notificações"
            />
          </div>
          {preferenceLabels.map(([key, label, description]) => (
            <div key={key} className="flex items-center justify-between gap-4 p-3">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={status.preferences[key]}
                disabled={!status.preferences.enabled}
                onCheckedChange={(value) => void changePreference(key, value)}
                aria-label={`Ativar ${label.toLowerCase()}`}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
