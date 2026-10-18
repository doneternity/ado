import React from "react";
import { motion } from "framer-motion";
import { DISCORD_INVITE_URL } from "../config";
import styles from "./Legal.module.scss";

const DISCORD = DISCORD_INVITE_URL;
const LAST_UPDATED = "October 18, 2026";

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Acceptance of Terms",
    body: "By accessing or using ADO (\"the Service\"), you agree to these Terms of Service. If you do not agree, do not use the Service.",
  },
  {
    title: "Description of Service",
    body: "ADO provides an OpenAI-compatible API gateway that routes your requests to third-party AI providers, so you can use multiple language models through a single key. The Service is currently free and provided for personal, non-commercial use.",
  },
  {
    title: "Use of the Service",
    body: "You agree to use the Service only for lawful purposes. You may not: (a) attempt to reverse engineer, decompile, or disassemble any part of the Service; (b) use the Service to generate harmful, illegal, or prohibited content; (c) attempt to circumvent rate limits or access controls, including by creating multiple accounts; (d) resell or redistribute access to the Service without authorization; or (e) use the Service in any way that could damage, disable, or impair it.",
  },
  {
    title: "Accounts and Eligibility",
    body: "You sign in with Discord, and you must be a member of the ADO Discord server to use the Service. Free accounts are limited in number, so sign-up may be closed when all free places are taken. You are responsible for keeping your API key secret and for all activity under your account. Tell us promptly if you suspect unauthorized use.",
  },
  {
    title: "API Usage and Limits",
    body: "Each API key has a daily request limit and a per-minute rate limit. Your current limits and usage are shown on your dashboard, and daily limits reset at UTC midnight. Requests over a limit are rejected until it resets. Keys that go unused for 14 days are revoked automatically; you can generate a new one from the dashboard. We may change limits, and will show the current values on the dashboard.",
  },
  {
    title: "Your Content",
    body: "You keep all rights to the prompts you send and the outputs you receive. We do not store them; you grant us only the permission needed to transmit them to the AI provider that handles your request. You are responsible for having the right to submit any content you send.",
  },
  {
    title: "Intellectual Property",
    body: "The Service, including its design, code, and documentation, belongs to its operator. These terms do not give you any rights to it beyond using the Service as described here.",
  },
  {
    title: "Third-Party AI Providers",
    body: "Requests are fulfilled by third-party AI providers, and the models available may change at any time. We are not responsible for the availability, accuracy, or output of those providers, and your requests are also subject to their terms and policies.",
  },
  {
    title: "Privacy",
    body: "We process personal data as described in our Privacy Policy.",
  },
  {
    title: "Disclaimers",
    body: "The Service is provided free of charge and \"as is\", without any guarantee of availability, uptime, or fitness for a particular purpose. AI outputs may be inaccurate, so verify important information independently.",
  },
  {
    title: "Limitation of Liability",
    body: "To the maximum extent permitted by law, the operator is not liable for indirect, incidental, special, or consequential damages arising from your use of the Service. Nothing in these terms limits liability that cannot be limited by law, such as liability for gross negligence or intentional misconduct, or your rights as a consumer.",
  },
  {
    title: "Termination",
    body: "You can stop using the Service and delete your account from the dashboard at any time. We may suspend or end your access if you break these terms or if we discontinue the Service.",
  },
  {
    title: "Changes to These Terms",
    body: "If we change these terms, we will update the date above, and we will announce material changes on the site or our Discord server. If you keep using the Service after a change takes effect, the new terms apply.",
  },
  {
    title: "Consumer Rights",
    body: "If you are a consumer, nothing in these terms takes away the protection of the mandatory laws of the country where you live.",
  },
  {
    title: "Contact",
    body: <>Questions about these terms: reach us on our <a href={DISCORD} target="_blank" rel="noopener noreferrer">Discord server</a>.</>,
  },
];

export function Terms() {
  return (
    <motion.div className={styles.page} {...fade}>
      <div className={styles.content}>
        <h1 className={styles.headline}>Terms of Service</h1>
        <p className={styles.meta}>Last updated: {LAST_UPDATED}</p>

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
