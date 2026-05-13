import { motion } from "framer-motion";
import styles from "./Legal.module.scss";

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

export function Privacy() {
  return (
    <motion.div className={styles.page} {...fade}>
      <div className={styles.content}>
        <span className={styles.eyebrow}>Legal</span>
        <h1 className={styles.headline}>Privacy Policy</h1>
        <p className={styles.meta}>Effective date: May 13, 2026</p>

        <Section title="What we collect">
          <p>When you create an account, we collect your <strong>email address</strong> and a bcrypt hash of your password — never the plaintext password. If you sign up via Google, we store your Google account identifier and public profile name instead of a password hash.</p>
          <p>When you use the API, we store a <strong>daily request count</strong> keyed to your API key. This counter resets every UTC midnight and is used solely to enforce the rate limit.</p>
          <p>We store a <strong>session cookie</strong> (<code>ado_session</code>) when you log in. This cookie is HttpOnly, Secure (in production), and expires after 30 days of inactivity or 30 days absolute.</p>
        </Section>

        <Section title="What we do not collect">
          <p>We do <strong>not</strong> log the content of your AI requests or responses. We do not run third-party analytics scripts. We do not use advertising trackers or sell your data to any third party.</p>
        </Section>

        <Section title="How we use your data">
          <p>Your email is used only to send account-related emails: email verification links and, in the future, account security notices. We do not send marketing emails.</p>
          <p>Usage counters are used to enforce the 50-requests-per-day limit and may be used in aggregate (without identifying individual users) to understand overall service load.</p>
        </Section>

        <Section title="Data storage">
          <p>Account data is stored in a PostgreSQL database hosted on Neon (neon.tech). Session data and rate-limit counters are stored in Redis hosted on Upstash (upstash.com). Both providers are SOC 2 certified and operate within the United States.</p>
        </Section>

        <Section title="Third-party services">
          <p>API requests are proxied to <strong>Google Gemini</strong> (generativelanguage.googleapis.com). Your requests pass through Google&apos;s infrastructure and are subject to <a href="https://policies.google.com/privacy" className={styles.link} rel="noopener noreferrer" target="_blank">Google&apos;s Privacy Policy</a>. We pass the request body unmodified and substitute our server-side Gemini API key for the authorization header.</p>
          <p>Email verification is handled either via console logging (development) or <strong>Resend</strong> (resend.com). When Resend is active, your email address is transmitted to Resend solely for the purpose of delivering the verification email.</p>
        </Section>

        <Section title="Cookies">
          <p>We set one cookie: <code>ado_session</code>. It contains an opaque random token used to identify your login session. It is HttpOnly (not accessible to JavaScript), Secure (only sent over HTTPS in production), and SameSite=Lax. No third-party cookies are set.</p>
        </Section>

        <Section title="Data retention">
          <p>Account data is retained for as long as your account exists. Deleting your account removes all associated sessions, API keys, and usage records. Email verification tokens expire after 24 hours. Daily usage counters are kept for the current calendar day only.</p>
        </Section>

        <Section title="Your rights">
          <p>You may request deletion of your account and all associated data at any time by contacting us. Upon request, we will delete your account within 14 days.</p>
        </Section>

        <Section title="Contact">
          <p>Questions or data requests: <a href="mailto:hello@ado.fly.dev" className={styles.link}>hello@ado.fly.dev</a>.</p>
        </Section>
      </div>
    </motion.div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
