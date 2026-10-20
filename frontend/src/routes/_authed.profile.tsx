import { createFileRoute } from "@tanstack/react-router";
import { ImagePlus, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { PwaSettings } from "@/components/pwa-settings";
import { useTheme, type ThemePreference } from "@/components/theme-context";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { prepareSquareImage } from "@/lib/image-upload";
import { cn } from "@/lib/utils";
import { MEMBER_COLORS, useProfile, useStore, type Profile } from "@/state/workspace-store";

export const Route = createFileRoute("/_authed/profile")({
  head: () => ({
    meta: [
      { title: "Perfil — Taskora" },
      { name: "description", content: "Suas informações no Taskora." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const profile = useProfile();
  return <ProfileForm key={profile.id} profile={profile} />;
}

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Monitor;
}> = [
  {
    value: "system",
    label: "Sistema",
    description: "Acompanha o tema definido no seu dispositivo.",
    icon: Monitor,
  },
  { value: "light", label: "Claro", description: "Mantém a interface sempre clara.", icon: Sun },
  { value: "dark", label: "Escuro", description: "Mantém a interface sempre escura.", icon: Moon },
];

function ThemeSettings() {
  const { preference, setPreference } = useTheme();

  return (
    <Card className="mt-6 p-4 sm:p-6">
      <div>
        <h2 className="font-semibold">Aparência</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha como o Taskora deve aparecer neste dispositivo.
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const selected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setPreference(option.value)}
              className={cn(
                "flex min-h-24 items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected && "border-primary bg-primary/5 ring-1 ring-primary",
              )}
            >
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", selected && "text-primary")} />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const updateProfile = useStore((s) => s.updateProfile);

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [role, setRole] = useState(profile.role);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [color, setColor] = useState(profile.avatarColor);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || processingImage) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateProfile({
        name: name.trim() || "Você",
        email: email.trim().toLowerCase(),
        role: role.trim(),
        bio: bio.trim(),
        avatarColor: color,
        avatarUrl: avatarUrl ?? null,
      });
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Não foi possível salvar suas informações. Tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Perfil
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Suas informações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Personalize como você aparece no Taskora. As alterações são salvas na sua conta.
          </p>
        </div>

        <Card className="mt-6 p-4 sm:mt-8 sm:p-6">
          <div className="flex items-center gap-4">
            <UserAvatar
              name={name}
              color={color}
              imageUrl={avatarUrl}
              className="h-12 w-12 text-lg sm:h-16 sm:w-16 sm:text-2xl"
            />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">{name || "Sem nome"}</p>
              <p className="truncate text-sm text-muted-foreground">
                {role || "Sem cargo"} · {email || profile.email}
              </p>
            </div>
          </div>

          <form onSubmit={save} className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Foto do perfil</Label>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setProcessingImage(true);
                    setError(null);
                    try {
                      setAvatarUrl(await prepareSquareImage(file));
                    } catch (cause) {
                      setError(
                        cause instanceof Error ? cause.message : "Não foi possível ler a imagem.",
                      );
                    } finally {
                      setProcessingImage(false);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving || processingImage}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  {processingImage ? "Processando…" : avatarUrl ? "Trocar foto" : "Adicionar foto"}
                </Button>
                {avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving || processingImage}
                    onClick={() => setAvatarUrl(undefined)}
                  >
                    <Trash2 className="h-4 w-4" /> Remover
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                JPG, PNG ou WebP de até 8 MB. A foto será recortada automaticamente.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-name">Nome</Label>
              <Input
                id="p-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-email">Email</Label>
              <Input
                id="p-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.slice(0, 254))}
                maxLength={254}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="p-role">Cargo</Label>
              <Input
                id="p-role"
                value={role}
                onChange={(e) => setRole(e.target.value.slice(0, 60))}
                placeholder="Ex.: Product Manager"
                maxLength={60}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="p-bio">Bio</Label>
              <Textarea
                id="p-bio"
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 300))}
                maxLength={300}
                placeholder="Uma linha sobre você."
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Cor do avatar</Label>
              <div className="flex flex-wrap gap-2">
                {MEMBER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Selecionar ${c}`}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition",
                      color === c ? "border-foreground" : "border-transparent",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={saving || processingImage || !email.trim()}>
                {saving ? "Salvando…" : "Salvar alterações"}
              </Button>
              {saved && <span className="text-xs text-muted-foreground">Salvo ✓</span>}
            </div>
            {error && (
              <p className="text-sm text-destructive sm:col-span-2" role="alert">
                {error}
              </p>
            )}
          </form>
        </Card>
        <ThemeSettings />
        <TwoFactorSettings />
        <PwaSettings />
      </div>
    </AppShell>
  );
}
