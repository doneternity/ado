import { motion } from "framer-motion";
import styles from "./Legal.module.scss";

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

const SECTIONS = [
  {
    title: "Acceptance of Terms",
    body: "By accessing or using ADO (\"the Service\"), you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree to these terms, do not access or use the Service.",
  },
  {
    title: "Description of Service",
    body: "ADO provides an OpenAI-compatible API gateway that routes requests to Google Gemini and other AI providers, allowing users to access multiple language models through a single interface. The Service is provided for personal and non-commercial use, subject to these terms.",
  },
  {
    title: "Use of the Service",
    body: "You agree to use the Service only for lawful purposes and in compliance with all applicable laws. You may not: (a) attempt to reverse engineer, decompile, or disassemble any part of the Service; (b) use the Service to generate harmful, illegal, or prohibited content; (c) attempt to circumvent rate limits or access controls; (d) resell or redistribute the Service without authorization; or (e) use the Service in any manner that could damage, disable, or impair the Service.",
  },
  {
    title: "User Accounts",
    body: "You are responsible for maintaining the confidentiality of your account credentials and API keys. All activities that occur under your account are your responsibility. You must immediately notify us of any unauthorized access or security breaches. We reserve the right to suspend or terminate accounts that violate these terms.",
  },
  {
    title: "API Usage and Rate Limits",
    body: "Your account is subject to a daily request limit (currently 50 requests per UTC day) and per-minute rate limits. Usage that exceeds these limits results in throttling or temporary suspension. We reserve the right to modify rate limits with notice.",
  },
  {
    title: "Intellectual Property",
    body: "The Service, including its design, code, and documentation, is the intellectual property of its operators. You retain ownership of content you generate using the Service. However, you grant us a license to use such content for providing and improving the Service.",
  },
  {
    title: "Third-Party Services",
    body: "The Service integrates with third-party AI providers, primarily Google Gemini. We are not responsible for the availability, accuracy, or output of these third-party services. Your use of third-party services is subject to their respective terms and policies.",
  },
  {
    title: "Data and Privacy",
    body: "We collect and process data as described in our Privacy Policy. By using the Service, you consent to such processing. You are responsible for ensuring you have the right to share any data you input into the Service.",
  },
  {
    title: "Disclaimers",
    body: "The Service is provided \"as is\" without warranties of any kind, whether express or implied. We do not guarantee the accuracy, reliability, or completeness of any AI outputs. You should verify important information independently.",
  },
  {
    title: "Limitation of Liability",
    body: "To the maximum extent permitted by law, ADO shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service. Our total liability shall not exceed any amount you paid for the Service in the past twelve months.",
  },
  {
    title: "Indemnification",
    body: "You agree to indemnify and hold harmless ADO from any claims, damages, losses, or expenses arising from your use of the Service, your violation of these terms, or your generation of prohibited content.",
  },
  {
    title: "Termination",
    body: "We may terminate or suspend your access to the Service at any time for any reason, including violation of these terms. Upon termination, your right to use the Service immediately ceases.",
  },
  {
    title: "Changes to These Terms",
    body: "We may update these Terms of Service from time to time. We will notify users of material changes through the Service. Continued use of the Service after changes constitutes acceptance of the revised terms.",
  },
  {
    title: "Governing Law",
    body: "These Terms of Service shall be governed by and construed in accordance with applicable laws. Any disputes shall be resolved in the appropriate jurisdiction.",
  },
  {
    title: "Contact",
    body: "If you have questions about these terms, contact us at hello@ado.fly.dev.",
  },
];

export function Terms() {
  return (
    <motion.div className={styles.page} {...fade}>
      <div className={styles.content}>
        <span className={styles.eyebrow}>Legal</span>
        <h1 className={styles.headline}>Terms of Service</h1>
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
