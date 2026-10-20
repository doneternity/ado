import React from "react";
import { motion } from "framer-motion";
import { DISCORD_INVITE_URL } from "../config";
import styles from "./Legal.module.scss";

const DISCORD = DISCORD_INVITE_URL;
const LAST_UPDATED = "October 20, 2026";

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Using ADO",
    body: "By using ADO you agree to these terms. If you don't, please don't use it.",
  },
  {
    title: "What ADO Is",
    body: "ADO is a community-run, OpenAI-compatible API that lets you use different AI models with one key. It's free for now; paid plans may come later.",
  },
  {
    title: "Fair Use",
    body: "Use ADO lawfully. Don't use it for harmful or illegal content, try to break or overload it, get around its limits (for example with extra accounts), or resell access to it.",
  },
  {
    title: "Your Account",
    body: "You need a Discord account and membership in our Discord server to use ADO. Keep your API key private: you're responsible for what's done with it.",
  },
  {
    title: "Limits",
    body: "Each key has usage limits, shown on your dashboard. Limits can change, and unused keys may be revoked. You can get a new key from your dashboard at any time.",
  },
  {
    title: "Your Content",
    body: "Your prompts and the responses you get are yours. We don't store them; we only pass them to the AI provider that handles your request.",
  },
  {
    title: "AI Providers",
    body: "Models come from third-party providers and can change at any time. We're not responsible for their availability or what they produce, and their own terms apply too.",
  },
  {
    title: "No Guarantees",
    body: "ADO is provided as is, with no promise that it will always be available or work for your purpose. AI output can be wrong, so double-check anything important. As far as the law allows, we're not liable for any loss from using ADO.",
  },
  {
    title: "Ending Access",
    body: "You can delete your account from your dashboard at any time. We may suspend or remove accounts that break these terms, and we may change or shut down the service.",
  },
  {
    title: "Changes",
    body: "If we change these terms, we'll update the date above and mention bigger changes on the site or our Discord server. Using ADO after a change means you accept the new terms.",
  },
  {
    title: "Contact",
    body: <>Questions about these terms? Reach us on our <a href={DISCORD} target="_blank" rel="noopener noreferrer">Discord server</a>.</>,
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
