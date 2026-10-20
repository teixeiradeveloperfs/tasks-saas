type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let installPrompt: InstallPromptEvent | undefined;

export function registerPwa() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new Event("automa:pwa-installable"));
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = undefined;
    window.dispatchEvent(new Event("automa:pwa-installed"));
  });
}

export function canInstallPwa() {
  return Boolean(installPrompt);
}

export async function promptPwaInstall() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  await prompt.prompt();
  const result = await prompt.userChoice;
  if (result.outcome === "accepted") installPrompt = undefined;
  return result.outcome === "accepted";
}
