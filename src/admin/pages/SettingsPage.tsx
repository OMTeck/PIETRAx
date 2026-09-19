import { useEffect, useMemo, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import { settingsApi } from '@/admin/server';
import { useAsync } from '@/admin/lib';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { can, PERM, ROLES, ROLE_LABELS } from '@/admin/permissions';
import { Button, Input, Field, Toggle, Textarea, PageHeader, Card, Loading, Badge, useToast, cx } from '@/admin/ui';
import type { AdminSettings } from '@/admin/types';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

const SECTIONS: { key: string; label: string; hint: string }[] = [
  { key: 'general', label: 'General', hint: 'Site name, default language' },
  { key: 'company', label: 'Company', hint: 'Brand, tagline, about' },
  { key: 'showroom', label: 'Showroom', hint: 'Image, location, hours' },
  { key: 'contact', label: 'Contact', hint: 'Phone, WhatsApp, email, map' },
  { key: 'social', label: 'Social', hint: 'Social profile URLs' },
  { key: 'languages', label: 'Languages', hint: 'Default language & direction' },
  { key: 'seo', label: 'SEO', hint: 'Titles, OG image, site URL' },
  { key: 'homepage', label: 'Homepage sections', hint: 'Hero, featured collections, arrivals…' },
];

function normalize(value: Json): unknown {
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v as Json);
    return out;
  }
  return value;
}

export function SettingsPage() {
  const { toast } = useToast();
  const { user } = useAdminAuth();
  const { data, loading, error, reload, setData } = useAsync<AdminSettings>(() => settingsApi.get(), []);

  if (loading) return <Loading label="Loading content settings…" />;
  if (error) {
    return <PageHeader title="Content & Settings"><p className="text-sm text-red-700">{error}</p></PageHeader>;
  }
  if (!data) return null;

  const canSecurity = Boolean(user && can(user.role, PERM.settingsSecurity));

  return (
    <div>
      <PageHeader title="Content & Settings" subtitle="Public site copy and options — saved per section" />
      <div className="space-y-5">
        {SECTIONS.map((s) => (
          <SectionCard
            key={s.key}
            section={s.key}
            label={s.label}
            hint={s.hint}
            initial={data[s.key]}
            onSaved={(next) => setData({ ...data, [s.key]: next as Record<string, unknown> })}
          />
        ))}
        {canSecurity && (
          <SecurityCard
            initial={(data.security as Record<string, unknown>) ?? {}}
            onSaved={(next) => setData({ ...data, security: next })}
          />
        )}
      </div>
    </div>
  );
}

function SectionCard({ section, label, hint, initial, onSaved }: { section: string; label: string; hint: string; initial: unknown; onSaved: (v: unknown) => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<unknown>(() => normalize(initial as Json));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(normalize(initial as Json));
  }, [initial]);

  async function save() {
    setSaving(true);
    try {
      await settingsApi.saveSection(section, draft as Record<string, unknown>);
      toast(`${label} saved.`, 'success');
      onSaved(draft);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title={<span className="flex items-center gap-2">{label} <span className="text-xs font-normal text-stone-400">— {hint}</span></span>}
      actions={<Button size="sm" onClick={() => void save()} loading={saving}><Save className="h-3.5 w-3.5" /> Save {label}</Button>}
    >
      <div className="space-y-3">
        <JsonFields value={draft} objKey="root" onChange={setDraft} />
      </div>
    </Card>
  );
}

const FIELD_LABELS: Record<string, string> = {
  siteNameAr: 'Site name (AR)', siteNameEn: 'Site name (EN)', defaultLang: 'Default language',
  nameAr: 'Name', nameEn: 'Name (EN)', taglineAr: 'Tagline', taglineEn: 'Tagline (EN)',
  aboutAr: 'About (AR)', aboutEn: 'About (EN)', foundedYear: 'Founded year',
  image: 'Image URL', location: 'Location', hoursAr: 'Opening hours (AR)', hoursEn: 'Opening hours (EN)',
  phone: 'Phone', whatsapp: 'WhatsApp', email: 'Email', address: 'Address', googleMapsUrl: 'Map embed URL',
  instagram: 'Instagram', facebook: 'Facebook', pinterest: 'Pinterest', linkedin: 'LinkedIn',
  rtlDefault: 'Right-to-left by default', titleTemplate: 'Title template', titleTemplateAr: 'Title template (AR)',
  ogImage: 'OG image URL', siteUrl: 'Site URL', enabled: 'Enabled', count: 'Count',
  titleAr: 'Title (AR)', titleEn: 'Title (EN)', subtitleAr: 'Subtitle (AR)', subtitleEn: 'Subtitle (EN)',
  primaryCtaAr: 'Primary CTA (AR)', primaryCtaEn: 'Primary CTA (EN)', primaryLink: 'Primary link',
  secondaryCtaAr: 'Secondary CTA (AR)', secondaryCtaEn: 'Secondary CTA (EN)', secondaryLink: 'Secondary link',
  ctaAr: 'CTA (AR)', ctaEn: 'CTA (EN)', link: 'Link',
};

interface JsonFieldProps {
  value: unknown;
  objKey: string;
  onChange: (next: unknown) => void;
  label?: string;
}

function humanize(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function JsonFields({ value, objKey, onChange }: JsonFieldProps) {
  if (Array.isArray(value)) {
    const strings = value.every((v) => typeof v === 'string');
    if (strings) {
      return (
        <Field label={humanize(objKey)}>
          <Textarea
            rows={Math.max(2, value.length)}
            value={(value as string[]).join('\n')}
            onChange={(e) =>
              onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))
            }
          />
        </Field>
      );
    }
    return (
      <Field label={humanize(objKey)}>
        <textarea
          rows={5}
          className="w-full rounded border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900"
          value={JSON.stringify(value, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              onChange(parsed);
            } catch {
              // show as-is while typing; entire field is re-parsed on blur/save
              // — treated leniently here, saves are guarded by the API.
            }
          }}
          onBlur={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch {
              /* invalid JSON typed — leave draft unchanged */
            }
          }}
        />
      </Field>
    );
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <div className={objKey === 'root' ? '' : 'rounded border border-stone-100 bg-stone-50/60 p-3'}>
        {objKey !== 'root' && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">{humanize(objKey)}</p>
        )}
        <div className="space-y-3">
          {entries.map(([k, v]) => (
            <JsonFields
              key={k}
              value={v}
              objKey={k}
              onChange={(next) => onChange({ ...(value as Record<string, unknown>), [k]: next })}
            />
          ))}
        </div>
      </div>
    );
  }

  const label = humanize(objKey);
  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-stone-700">{label}</span>
        <Toggle checked={value} onChange={(v) => onChange(v)} label="" />
      </div>
    );
  }
  if (typeof value === 'number') {
    return (
      <Field label={label}>
        <Input type="number" value={String(value)} onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }} />
      </Field>
    );
  }
  return (
    <Field label={label}>
      <Input
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
      />
    </Field>
  );
}

function SecurityCard({ initial, onSaved }: { initial: Record<string, unknown>; onSaved: (v: Record<string, unknown>) => void }) {
  const { toast } = useToast();
  const [mfaRoles, setMfaRoles] = useState<string[]>(Array.isArray(initial.requireMfaRoles) ? (initial.requireMfaRoles as string[]) : ['OWNER', 'ADMIN']);
  const [sessionIdleMinutes, setSessionIdleMinutes] = useState<string>(String(initial.sessionIdleMinutes ?? ''));
  const [sessionAbsHours, setSessionAbsHours] = useState<string>(String(initial.sessionAbsHours ?? ''));
  const [passwordPolicyEnabled, setPasswordPolicyEnabled] = useState<boolean>(Boolean(initial.passwordPolicyEnabled));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await settingsApi.saveSecurity({
        requireMfaRoles: mfaRoles,
        sessionIdleMinutes: sessionIdleMinutes ? Number(sessionIdleMinutes) : undefined,
        sessionAbsHours: sessionAbsHours ? Number(sessionAbsHours) : undefined,
        passwordPolicyEnabled,
      });
      toast('Security settings saved.', 'success');
      onSaved({ ...initial, requireMfaRoles: mfaRoles, sessionIdleMinutes: sessionIdleMinutes ? Number(sessionIdleMinutes) : undefined, sessionAbsHours: sessionAbsHours ? Number(sessionAbsHours) : undefined, passwordPolicyEnabled });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-stone-500" /> Security <Badge tone="amber">Owner only</Badge></span>}
      actions={<Button size="sm" onClick={() => void save()} loading={saving}><Save className="h-3.5 w-3.5" /> Save security</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Require MFA for roles">
          <div className="flex flex-wrap gap-2 pt-1">
            {ROLES.map((r) => {
              const on = mfaRoles.includes(r);
              return (
                <label key={r} className={cx('flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs', on ? 'border-stone-900 bg-stone-900 text-ivory' : 'border-stone-200 text-stone-600')}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => setMfaRoles((prev) => (on ? prev.filter((x) => x !== r) : [...prev, r]))}
                  />
                  {ROLE_LABELS[r]}
                </label>
              );
            })}
          </div>
        </Field>
        <Field label="Session idle timeout (min)" hint="Blank = server default">
          <Input type="number" value={sessionIdleMinutes} onChange={(e) => setSessionIdleMinutes(e.target.value)} />
        </Field>
        <Field label="Session absolute timeout (hrs)" hint="Blank = server default">
          <Input type="number" value={sessionAbsHours} onChange={(e) => setSessionAbsHours(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-stone-700">Enforce password policy on reset</span>
        <Toggle checked={passwordPolicyEnabled} onChange={setPasswordPolicyEnabled} label="" />
      </div>
    </Card>
  );
}

export default SettingsPage;