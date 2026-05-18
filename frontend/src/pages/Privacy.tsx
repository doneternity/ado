import { motion } from "framer-motion";
import styles from "./Legal.module.scss";

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

const SECTIONS = [
  {
    title: "Information We Collect",
    body: "We collect account details such as your email address and (for Google sign-in) your name and profile photo when you sign up. We collect usage metadata including per-day request counts and model selections. Technical data collected includes browser type, IP address, and a session cookie. We do not collect the content of your AI requests or responses.",
  },
  {
    title: "How We Use Information",
    body: "Data is used to provide and secure the service, route API requests, troubleshoot issues, and improve reliability. Your email may be used for account-related notifications. Aggregated and anonymized usage insights may be used for analytics and product improvement. We never use your API requests or prompts to train AI models.",
  },
  {
    title: "Data Sharing",
    body: "We do not sell personal data. We share information with trusted infrastructure providers (cloud hosting, database services) required to deliver the service. Subprocessors are bound by data protection agreements. We may disclose information when required by law, to enforce our terms, or protect rights, safety, or property. API requests are proxied to Google Gemini and are subject to Google's privacy policy.",
  },
  {
    title: "Security",
    body: "We implement industry-standard technical and organizational safeguards including encryption in transit (TLS) and at rest, access controls, and monitoring. Provider API keys are stored encrypted with AES-256-GCM. Session cookies are HttpOnly and Secure. However, no system is perfectly secure; we recommend rotating your key periodically and not sharing it publicly.",
  },
  {
    title: "Data Retention",
    body: "Information is retained for as long as necessary to operate the service. Account data is deleted upon account termination. Daily usage counters reset at UTC midnight and are not retained long-term. Error logs are retained for 30 days for debugging purposes. You may request deletion of your personal data at any time by contacting us.",
  },
  {
    title: "Your Choices",
    body: "You can rotate your API key, view your usage, and delete your account from the dashboard at any time. For questions or requests about data (access, correction, deletion), contact us at hello@ado.fly.dev.",
  },
  {
    title: "Cookies",
    body: "We set one cookie: ado_session, an opaque token used to identify your login session. It is HttpOnly, Secure (in production), and SameSite-restricted. No third-party tracking or analytics cookies are set.",
  },
  {
    title: "Children's Privacy",
    body: "Our service is not intended for children under 16. We do not knowingly collect data from children. If you believe a child has provided personal data, contact us immediately to remove it.",
  },
  {
    title: "International Data Transfer",
    body: "Your data may be processed on servers in various countries. We ensure appropriate safeguards for international transfers in compliance with applicable regulations.",
  },
  {
    title: "Changes to This Policy",
    body: "We may update this Privacy Policy periodically. Material changes will be notified via the service. Continued use of the platform after changes constitutes acceptance of the updated policy.",
  },
];

export function Privacy() {
  return (
    <motion.div className={styles.page} {...fade}>
      <div className={styles.content}>
        <span className={styles.eyebrow}>Legal</span>
        <h1 className={styles.headline}>Privacy Policy</h1>
        <p className={styles.meta}>Last updated: May 18, 2026</p>

        {SECTIONS.map((s) => (
          <Section key={s.title} title={s.title}>
            <p>{s.body}</p>
          </Section>
        ))}
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
