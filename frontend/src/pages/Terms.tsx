import { motion } from "framer-motion";
import styles from "./Legal.module.scss";

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

export function Terms() {
  return (
    <motion.div className={styles.page} {...fade}>
      <div className={styles.content}>
        <span className={styles.eyebrow}>Legal</span>
        <h1 className={styles.headline}>Terms of Service</h1>
        <p className={styles.meta}>Effective date: May 13, 2026</p>

        <Section title="Acceptance">
          <p>By creating an account or using the ADO API, you agree to these Terms of Service. If you do not agree, do not use the service.</p>
        </Section>

        <Section title="The service">
          <p>ADO provides an OpenAI-compatible API proxy to Google Gemini. You receive an API key upon account creation with a daily limit of 50 chat-completion requests, resetting at UTC midnight.</p>
          <p>The service is provided free of charge on a best-effort basis. There is no uptime SLA.</p>
        </Section>

        <Section title="Acceptable use">
          <p>You may use ADO for personal projects, development, testing, and non-commercial applications. You may <strong>not</strong>:</p>
          <ul className={styles.list}>
            <li>Resell, sublicense, or share API keys with other users or services</li>
            <li>Attempt to circumvent rate limits or quotas by any means</li>
            <li>Use the service to generate content that is illegal, harmful, or violates Google&apos;s Gemini usage policies</li>
            <li>Reverse-engineer or interfere with the ADO infrastructure</li>
            <li>Use automated scripts to create multiple accounts</li>
          </ul>
        </Section>

        <Section title="API key security">
          <p>Your API key is your responsibility. Treat it like a password. ADO is not liable for any usage or charges resulting from a leaked key. You can rotate your key from the dashboard at any time; rotation immediately invalidates the previous key.</p>
        </Section>

        <Section title="Rate limits">
          <p>The free tier provides 50 chat-completion requests per UTC calendar day per key. Exceeding this limit returns HTTP 429 until the quota resets. ADO reserves the right to adjust limits for abuse or infrastructure reasons.</p>
        </Section>

        <Section title="Termination">
          <p>ADO may suspend or terminate your account at any time if you violate these terms, engage in abusive usage patterns, or for any operational reason. You may delete your account at any time.</p>
        </Section>

        <Section title="Disclaimer of warranties">
          <p>The service is provided &quot;as is&quot; without warranty of any kind. ADO makes no guarantees of availability, accuracy, or fitness for any particular purpose. Use at your own risk.</p>
        </Section>

        <Section title="Limitation of liability">
          <p>To the maximum extent permitted by law, ADO and its operators are not liable for any indirect, incidental, or consequential damages arising from use or inability to use the service.</p>
        </Section>

        <Section title="Changes to these terms">
          <p>We may update these Terms at any time. Continued use after changes are posted constitutes acceptance of the revised Terms. Material changes will be announced via the service itself.</p>
        </Section>

        <Section title="Contact">
          <p>Questions about these terms: <a href="mailto:hello@ado.fly.dev" className={styles.link}>hello@ado.fly.dev</a>.</p>
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
