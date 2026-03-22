// Account settings — S5 §10, CS-WORK-049 AC-38, AC-39, AC-40
// Email preference toggles + account closure button.
// Full UI wiring deferred to E2E Phase 2 (PP-Q1 component library).

export default function SettingsPage() {
  return (
    <div>
      <h1>Account Settings</h1>
      <section>
        <h2>Email Preferences</h2>
        <p>
          4 subscribable categories (SI §5.3). Transactional and Subscription
          are always on. Data served by tRPC{" "}
          <code>settings.getEmailPreferences</code> /{" "}
          <code>settings.updateEmailPreference</code>.
        </p>
      </section>
      <section>
        <h2>Close Account</h2>
        <p>
          Initiates PP §5 6-step orchestrated closure flow via{" "}
          <code>settings.initiateAccountClosure</code>.
        </p>
      </section>
    </div>
  )
}
