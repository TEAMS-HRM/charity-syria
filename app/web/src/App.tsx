import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Language = 'ar' | 'en';

type OrganizationItem = {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  status: 'provisioning' | 'active' | 'suspended' | 'failed';
  provisioningStatus: 'queued' | 'running' | 'failed' | 'completed' | null;
  provisioningAttempts: number | null;
  createdAt: string;
};

type SignupForm = {
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
};

function normalizeHost(): string {
  if (window.location.hostname.includes('localhost')) {
    return 'charity-syria.com';
  }
  const host = window.location.hostname;
  const withoutAdmin = host.startsWith('admin.') ? host.slice('admin.'.length) : host;
  return withoutAdmin;
}

function statusClass(value: string | null): string {
  if (value === 'active' || value === 'completed') return 'ok';
  if (value === 'failed' || value === 'suspended') return 'bad';
  return 'warn';
}

export function App(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState<Language>(i18n.language?.startsWith('en') ? 'en' : 'ar');
  const [devSub, setDevSub] = useState('local-admin-001');
  const [devEmail, setDevEmail] = useState('admin@charity.local');
  const [signupForm, setSignupForm] = useState<SignupForm>({
    name: '',
    slug: '',
    ownerName: '',
    ownerEmail: '',
  });
  const [rows, setRows] = useState<OrganizationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [signupMessage, setSignupMessage] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupBusy, setSignupBusy] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const signupDialogRef = useRef<HTMLDialogElement | null>(null);

  const isAdminRoute = window.location.pathname.startsWith('/admin');

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  const headers = useMemo(() => {
    const value: Record<string, string> = {};
    if (devSub.trim()) value['x-dev-user-sub'] = devSub.trim();
    if (devEmail.trim()) value['x-dev-email'] = devEmail.trim();
    return value;
  }, [devSub, devEmail]);

  useEffect(() => {
    if (!isAdminRoute) {
      return;
    }
    void fetchOrganizations();
  }, [isAdminRoute]);

  async function fetchOrganizations(): Promise<void> {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/platform/organizations?limit=200', { headers });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || JSON.stringify(data));
      }
      setRows((data.items || []) as OrganizationItem[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  async function bootstrapAdmin(): Promise<void> {
    setError('');
    setMessage('');
    try {
      const response = await fetch('/platform/bootstrap-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ sub: devSub.trim(), email: devEmail.trim() || undefined }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || JSON.stringify(data));
      }
      setMessage(t('okAdmin'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function checkSlugAvailability(): Promise<void> {
    setSignupError('');
    setSignupMessage('');
    const slug = signupForm.slug.trim();
    if (!slug) {
      setSignupError(t('requiredFieldsMessage'));
      return;
    }

    try {
      const response = await fetch(`/organizations/slug/${encodeURIComponent(slug)}/availability`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || JSON.stringify(data));
      }
      setSignupMessage(data.available ? `${t('slugAvailable')}: ${data.slug}` : `${t('slugTaken')}: ${data.slug}`);
    } catch (cause) {
      setSignupError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function submitSignupRequest(): Promise<void> {
    const name = signupForm.name.trim();
    const slug = signupForm.slug.trim().toLowerCase().replace(/\s+/g, '-');
    const ownerName = signupForm.ownerName.trim();
    const ownerEmail = signupForm.ownerEmail.trim();

    if (!name || !slug || !ownerName || !ownerEmail) {
      setSignupError(t('requiredFieldsMessage'));
      setSignupMessage('');
      return;
    }

    setSignupBusy(true);
    setSignupError('');
    setSignupMessage('');

    try {
      const founderSub = ownerEmail.toLowerCase();
      const response = await fetch('/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          slug,
          founderSub,
          founderEmail: ownerEmail,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || JSON.stringify(data));
      }

      const orgId = data.organization?.id ? `ID: ${data.organization.id}` : '';
      setSignupMessage(`${t('signupSuccess')} ${orgId}`.trim());
      setSignupForm({ name: '', slug: '', ownerName: '', ownerEmail: '' });
      signupDialogRef.current?.close();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      setSignupError(`${t('signupFailed')}: ${reason}`);
    } finally {
      setSignupBusy(false);
    }
  }

  async function approveOrganization(id: string): Promise<void> {
    setApprovingId(id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/platform/organizations/${id}/approve`, {
        method: 'POST',
        headers,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || JSON.stringify(data));
      }
      await fetchOrganizations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setApprovingId(null);
    }
  }

  const baseHost = normalizeHost();

  function onLanguageChange(nextLanguage: Language): void {
    setLanguage(nextLanguage);
    void i18n.changeLanguage(nextLanguage);
  }

  function openSignupDialog(): void {
    setSignupError('');
    setSignupMessage('');
    signupDialogRef.current?.showModal();
  }

  if (!isAdminRoute) {
    return (
      <main className="landing-page" dir={dir} lang={language}>
        <section className="landing-shell">
          <header className="landing-header">
            <strong className="brand">Charity Syria</strong>
            <div className="landing-actions">
              <label className="lang-switch">
                <span>{t('langLabel')}</span>
                <select value={language} onChange={(event) => onLanguageChange(event.target.value as Language)}>
                  <option value="ar">{t('langArabic')}</option>
                  <option value="en">{t('langEnglish')}</option>
                </select>
              </label>
              <a className="ghost-link" href="/admin">
                {t('landingSecondaryCta')}
              </a>
            </div>
          </header>

          <section className="landing-hero">
            <p className="kicker">Multi-tenant SaaS</p>
            <h1>{t('landingTitle')}</h1>
            <p>{t('landingSubtitle')}</p>
            <div className="landing-buttons">
              <button className="primary-btn" onClick={openSignupDialog}>
                {t('landingPrimaryCta')}
              </button>
              <a className="outline-btn" href="/admin">
                {t('landingSecondaryCta')}
              </a>
            </div>
            <small>{t('adminLinkHint')}</small>
            {signupMessage ? <p className="msg ok-msg">{signupMessage}</p> : null}
            {signupError ? <p className="msg err-msg">{signupError}</p> : null}
          </section>
        </section>

        <dialog ref={signupDialogRef} className="signup-dialog">
          <form
            method="dialog"
            onSubmit={(event) => {
              event.preventDefault();
              void submitSignupRequest();
            }}
          >
            <h2>{t('signupDialogTitle')}</h2>
            <p>{t('signupDialogHint')}</p>

            <label>
              {t('orgNameLabel')}
              <input
                value={signupForm.name}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>

            <label>
              {t('orgSlugLabel')}
              <input
                value={signupForm.slug}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, slug: event.target.value }))}
                required
              />
            </label>

            <label>
              {t('ownerNameLabel')}
              <input
                value={signupForm.ownerName}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, ownerName: event.target.value }))}
                required
              />
            </label>

            <label>
              {t('ownerEmailLabel')}
              <input
                type="email"
                value={signupForm.ownerEmail}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, ownerEmail: event.target.value }))}
                required
              />
            </label>

            <div className="dialog-actions">
              <button type="button" className="secondary-btn" onClick={() => void checkSlugAvailability()}>
                {t('checkSlugBtn')}
              </button>
              <button type="submit" className="primary-btn" disabled={signupBusy}>
                {signupBusy ? t('loading') : t('submitSignupBtn')}
              </button>
              <button type="button" className="secondary-btn" onClick={() => signupDialogRef.current?.close()}>
                {t('closeBtn')}
              </button>
            </div>
            {signupMessage ? <p className="msg ok-msg">{signupMessage}</p> : null}
            {signupError ? <p className="msg err-msg">{signupError}</p> : null}
          </form>
        </dialog>
      </main>
    );
  }

  return (
    <main className="admin-page" dir={dir} lang={language}>
      <section className="admin-shell">
        <header className="hero-row">
          <div>
            <h1>{t('pageTitle')}</h1>
            <p>{t('pageSubtitle')}</p>
          </div>
          <label className="lang-switch">
            <span>{t('langLabel')}</span>
            <select value={language} onChange={(event) => onLanguageChange(event.target.value as Language)}>
              <option value="ar">{t('langArabic')}</option>
              <option value="en">{t('langEnglish')}</option>
            </select>
          </label>
        </header>

        <section className="panel dev-panel">
          <h2>{t('devSection')}</h2>
          <div className="dev-grid">
            <label>
              {t('devSubLabel')}
              <input value={devSub} onChange={(event) => setDevSub(event.target.value)} />
            </label>
            <label>
              {t('devEmailLabel')}
              <input value={devEmail} onChange={(event) => setDevEmail(event.target.value)} />
            </label>
          </div>
          <div className="actions">
            <button onClick={bootstrapAdmin}>{t('bootstrapBtn')}</button>
            <button onClick={fetchOrganizations}>{t('refreshBtn')}</button>
          </div>
          <small>{t('loginHint')}</small>
        </section>

        <section className="panel">
          <h2>{t('tableTitle')}</h2>
          {message ? <p className="msg ok-msg">{message}</p> : null}
          {error ? <p className="msg err-msg">{error}</p> : null}
          {loading ? <p className="msg">{t('loading')}</p> : null}
          {!loading && rows.length === 0 ? <p className="msg">{t('empty')}</p> : null}

          {!loading && rows.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('colName')}</th>
                    <th>{t('colUrl')}</th>
                    <th>{t('colStatus')}</th>
                    <th>{t('colProvisioning')}</th>
                    <th>{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const orgUrl = `https://${row.slug}.${baseHost}`;
                    const canApprove = row.status !== 'active';
                    return (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>
                          <a href={orgUrl} target="_blank" rel="noreferrer">
                            {orgUrl}
                          </a>
                        </td>
                        <td>
                          <span className={`chip ${statusClass(row.status)}`}>{row.status}</span>
                        </td>
                        <td>
                          <span className={`chip ${statusClass(row.provisioningStatus)}`}>
                            {row.provisioningStatus || '-'}
                          </span>
                        </td>
                        <td>
                          <button
                            disabled={!canApprove || approvingId === row.id}
                            onClick={() => approveOrganization(row.id)}
                          >
                            {approvingId === row.id ? t('approving') : t('approveBtn')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
