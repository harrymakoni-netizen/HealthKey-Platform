"use client";
import { useEffect, useState } from "react";
import { useLocale } from "./locale";
import { api } from "./ui";
export default function PlatformSetup({
  onChange,
}: {
  onChange: () => Promise<void>;
}) {
  const { t } = useLocale();
  const [organizations, setOrganizations] = useState<
      { id: string; name: string }[]
    >([]),
    [orgName, setOrgName] = useState(""),
    [organization, setOrganization] = useState(""),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    api<typeof organizations>("platform/organizations")
      .then(setOrganizations)
      .catch(() => setError("error"));
  }, []);
  async function addOrganization(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const o = await api<{ id: string; name: string }>(
        "platform/organizations",
        { name: orgName },
      );
      setOrganizations([...organizations, o]);
      setOrganization(o.id);
      setOrgName("");
      setMessage("saved");
    } catch {
      setError("error");
    } finally {
      setBusy(false);
    }
  }
  async function addClinic(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("platform/clinics", {
        name,
        code,
        organization_id: organization,
      });
      setName("");
      setCode("");
      setMessage("pausedClinicNote");
      await onChange();
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <details className="form-section" style={{ marginBottom: 24 }}>
        <summary>{t("createOrganisationClinic")}</summary>
        <div className="admin-grid" style={{ marginTop: 24 }}>
          <form onSubmit={addOrganization}>
            <h2>{t("organisation")}</h2>
            <label className="field">
              {t("organisationName")}
              <input
                minLength={3}
                maxLength={100}
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </label>
            <button className="button" disabled={busy}>
              {t("createOrganisation")}
            </button>
          </form>
          <form onSubmit={addClinic}>
            <h2>{t("clinic")}</h2>
            <label className="field">
              {t("organisation")}
              <select
                required
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
              >
                <option value="">{t("organisation")}</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t("displayName")}
              <input
                minLength={3}
                maxLength={80}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              {t("clinicCode")}
              <input
                pattern="[A-Z0-9_-]{3,20}"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {t("createPausedClinic")}
            </button>
          </form>
        </div>
      </details>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {t(message)}
        </p>
      )}
    </>
  );
}
