'use client';

import { useState } from 'react';
import { Download, FileUp, Loader2, Users } from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { Alert, Panel } from '@/components/ui';
import { downloadCsv } from '@/lib/browser/csv';
import type { Role } from '@/lib/domain/types';

interface Created {
  name: string;
  username: string;
  role: Role;
  password: string;
}

/**
 * Bulk staff creation.
 *
 * The password sheet is shown once and is the only copy — passwords are hashed
 * before storage, so there is no "show me the password again" and no email is sent
 * (no provider is connected). Download it and hand it over.
 */
export function StaffImport({ onClose }: { onClose: () => void }) {
  const { request, toast, refresh } = useApp();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: Created[];
    skipped: { index: number; name: string; reason: string }[];
    existing: { username: string; role: Role }[];
  } | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const data = await request<typeof result>('/api/staff/import', {
        method: 'POST',
        data: { csv },
      });
      setResult(data);
      toast({
        tone: data?.created.length ? 'success' : 'info',
        title: data?.created.length
          ? `${data.created.length} account${data.created.length === 1 ? '' : 's'} created`
          : 'No accounts created',
        body: data?.created.length
          ? 'Download the password sheet now — it is the only copy.'
          : 'Check the reasons listed and try again.',
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error" title="Nothing was imported">{error}</Alert> : null}

      <Panel
        title="Import a staff list"
        subtitle="CSV with columns: name, username or email, role (receptionist / cleaner / admin), optional phone, job title, shift. Each person gets their own generated password."
      >
        <div className="space-y-3">
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="field py-1.5 text-[0.82rem]"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 500_000) {
                setError('That file is larger than 500 KB — split the list.');
                return;
              }
              setCsv(await file.text());
              setFileName(file.name);
              setResult(null);
            }}
          />
          <textarea
            className="field min-h-[110px] font-mono text-[0.76rem]"
            placeholder={'name,username,role,phone\nMary Phiri,mary,receptionist,+260977000111\nJoseph Zulu,joseph,cleaner,'}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary h-9 px-3 text-[0.82rem]"
              disabled={busy || csv.trim().length < 10}
              onClick={() => void run()}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
              Create accounts
            </button>
            {fileName ? <span className="text-[0.76rem] text-navy-500">Loaded {fileName}</span> : null}
            <button type="button" className="btn-ghost h-9 px-3 text-[0.82rem]" onClick={onClose}>
              Close
            </button>
          </div>
          <p className="text-[0.75rem] leading-relaxed text-navy-500">
            Existing usernames are reported and left alone — nothing is overwritten. Super
            administrator accounts cannot be created by import; do that one by one so the
            privilege is deliberate.
          </p>
        </div>
      </Panel>

      {result?.created.length ? (
        <Panel title="Password sheet — copy it now" subtitle="Shown once. Passwords are stored hashed and cannot be recovered.">
          <div className="overflow-x-auto">
            <table className="w-full text-[0.8rem]">
              <thead>
                <tr className="text-left text-navy-400">
                  <th className="py-1 pr-3 font-medium">Name</th>
                  <th className="py-1 pr-3 font-medium">Username</th>
                  <th className="py-1 pr-3 font-medium">Role</th>
                  <th className="py-1 font-medium">Temporary password</th>
                </tr>
              </thead>
              <tbody>
                {result.created.map((c) => (
                  <tr key={c.username} className="border-t border-sand-100">
                    <td className="py-1.5 pr-3 text-navy-800">{c.name}</td>
                    <td className="py-1.5 pr-3 font-mono text-navy-700">{c.username}</td>
                    <td className="py-1.5 pr-3 text-navy-600">{c.role}</td>
                    <td className="py-1.5 font-mono text-navy-900">{c.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn-secondary mt-3 h-9 px-3 text-[0.82rem]"
            onClick={() =>
              downloadCsv(
                'lemma-staff-passwords',
                ['Name', 'Username', 'Role', 'Temporary password'],
                result.created.map((c) => [c.name, c.username, c.role, c.password]),
              )
            }
          >
            <Download size={14} /> Download password sheet
          </button>
        </Panel>
      ) : null}

      {result?.existing.length ? (
        <Panel title="Already had an account">
          <ul className="space-y-1 text-[0.82rem] text-navy-600">
            {result.existing.map((e) => (
              <li key={e.username}>
                <FileUp size={12} className="mr-1.5 inline" />
                {e.username} — existing {e.role.replace(/_/g, ' ')}, left unchanged.
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {result?.skipped.length ? (
        <Panel title="Skipped rows">
          <ul className="space-y-1 text-[0.82rem] text-navy-600">
            {result.skipped.map((s) => (
              <li key={`${s.index}-${s.name}`}>
                Row {s.index} ({s.name}): {s.reason}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
