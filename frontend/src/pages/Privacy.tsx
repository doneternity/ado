import React from "react";
import { motion } from "framer-motion";
import { DISCORD_INVITE_URL } from "../config";
import styles from "./Legal.module.scss";

const DiscordLink = () => (
  <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Discord server</a>
);

const LAST_UPDATED = "October 20, 2026";

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Who We Are",
    body: <>ADO is an independent, community-run project. For any privacy question or request, reach us on our <DiscordLink />.</>,
  },
  {
    title: "What We Collect",
    body: "Your Discord account details when you sign in (such as your username, email and avatar), basic session and security information such as your IP address, and information about how you use your API key, like which models you call and how much. We also keep error logs so we can fix problems.",
  },
  {
    title: "Your Prompts and Responses",
    body: "Your requests pass through ADO to the AI provider that serves the model you chose. We don't store your prompts or the responses, and we never use them to train AI models. The provider handles them under its own terms.",
  },
  {
    title: "How We Use It",
    body: "To run your account and API key, route your requests, apply usage limits, prevent abuse, and keep the service working. We don't sell your data, send marketing email, or use advertising or analytics trackers.",
  },
  {
    title: "Who Can See It",
    body: "We rely on trusted hosting and infrastructure providers to run ADO, and your requests go to the AI providers that serve them. Some of them may process data outside your country. We may also share information if the law requires it.",
  },
  {
    title: "Security",
    body: "Your data is encrypted in transit and your API key is stored securely. Keep your key private, and rotate it from your dashboard if you think it has leaked.",
  },
  {
    title: "How Long We Keep It",
    body: "Your account stays until you delete it, though we may remove accounts that are no longer used. Usage and error logs are kept only for a limited time.",
  },
  {
    title: "Your Choices",
    body: <>You can rotate your key, see your usage, and delete your account from your dashboard at any time. For anything else about your data, reach us on our <DiscordLink />.</>,
  },
  {
    title: "Cookies",
    body: "We only use the cookies and browser storage needed to keep you signed in, show your key on your dashboard, and remember your settings. No advertising or tracking cookies.",
  },
  {
    title: "Children",
    body: <>ADO isn't meant for anyone under 16. If you think a child has signed up, tell us on our <DiscordLink /> and we'll remove the account.</>,
  },
  {
    title: "Changes",
    body: "If we change this policy, we'll update the date above and mention bigger changes on the site or our Discord server.",
  },
];

export function Privacy() {
  return (
    <motion.div className={styles.page} {...fade}>
      <div className={styles.content}>
        <h1 className={styles.headline}>Privacy Policy</h1>
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
