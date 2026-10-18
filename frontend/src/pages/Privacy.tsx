import React from "react";
import { motion } from "framer-motion";
import { DISCORD_INVITE_URL } from "../config";
import { LEGAL } from "../data/legal";
import styles from "./Legal.module.scss";

const DiscordLink = () => (
  <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Discord server</a>
);

const Email = () => <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Who We Are",
    body: <>ADO is operated by {LEGAL.operator}, {LEGAL.address}, {LEGAL.country}, which is the controller of the personal data described here. For any privacy question or request, email <Email /> or reach us on our <DiscordLink />.</>,
  },
  {
    title: "Information We Collect",
    body: "When you sign in with Discord we receive and store your Discord user ID, username, email address, and avatar URL. At sign-in we also check, without storing it, whether you are a member of the ADO Discord server and hold the required role. For your API key we store only a hash and a short prefix, plus per-day request counts and when the key was last used. A newly issued key is held for up to 5 minutes so it can be shown to you once. For each login session we store a session token, your IP address, and your browser's user agent. To enforce rate limits we keep short-lived counters keyed by IP address or API key. When a request fails we log its method, path, and status code, without your IP address or request content.",
  },
  {
    title: "Your Prompts and Responses",
    body: "The content of your API requests and the AI responses passes through our servers to the AI provider that handles it. We do not store or log that content, and we never use it to train AI models. The AI provider processes it under its own terms and privacy policy, which may include its own retention.",
  },
  {
    title: "How We Use Information and Why",
    body: "We use this data to run your account, issue and check API keys, route requests, enforce quotas and rate limits, prevent abuse, and fix problems. We process it because it is necessary to provide the service you signed up for, and for our legitimate interest in keeping the service secure and working. We also look at aggregate usage statistics to operate the service. We do not send marketing email, and we do not use analytics or advertising trackers.",
  },
  {
    title: "Who We Share It With",
    body: "We do not sell personal data. We use these service providers to run ADO: Vercel (website hosting), Koyeb (API hosting), Supabase (database), Upstash (rate-limit store), and Discord (sign-in). Your API requests are sent to the third-party AI providers that serve the model you request. We may also disclose information when required by law.",
  },
  {
    title: "Security",
    body: "Traffic is encrypted in transit with TLS, and our database host encrypts data at rest. API keys are stored only as hashes, and the AI-provider keys we hold are encrypted with AES-256-GCM. Session cookies are HttpOnly, Secure, and SameSite-restricted. No system is perfectly secure, so rotate your key if you think it has leaked and don't share it publicly.",
  },
  {
    title: "Data Retention",
    body: "Account data is kept until you delete your account, which removes your account, keys, usage history, and sessions. Daily request counts are deleted after 90 days and error logs after 30 days. Session data is deleted when the session expires: after 7 days of inactivity, or 30 days at most. Rate-limit counters and sign-in state expire within an hour. API keys that go unused for 14 days are automatically revoked.",
  },
  {
    title: "Your Rights",
    body: <>You can rotate your API key, view your usage, and delete your account from the dashboard at any time. Depending on where you live, you may also have the right to access, correct, or export your data, and to object to or restrict its processing. Email <Email /> to make a request. If you are in the EU or UK, you can also complain to your local data protection authority.</>,
  },
  {
    title: "Cookies and Local Storage",
    body: "We set two cookies, both strictly necessary: ado_session keeps you signed in (up to 30 days), and ado_oauth_state protects the Discord sign-in flow (10 minutes). We also use your browser's local storage to keep your API key visible on your dashboard and to remember notices you have dismissed. We don't use analytics, advertising, or third-party cookies, and our fonts are served from our own domain. Because everything we store is needed to provide the service, there is no cookie consent banner.",
  },
  {
    title: "Children's Privacy",
    body: <>ADO is not intended for children under 16, and we do not knowingly collect their data. If you believe a child has signed up, email <Email /> and we will delete the account.</>,
  },
  {
    title: "International Transfers",
    body: "Some of our service providers and AI providers process data outside your country, including in the United States. Where they do, transfers rely on the safeguards those providers offer, such as the EU Standard Contractual Clauses.",
  },
  {
    title: "Changes to This Policy",
    body: "If we change this policy, we will update the date above, and we will announce material changes on the site or our Discord server.",
  },
];

export function Privacy() {
  return (
    <motion.div className={styles.page} {...fade}>
      <div className={styles.content}>
        <span className={styles.eyebrow}><span className={styles.eyebrowDash} />Legal</span>
        <h1 className={styles.headline}>Privacy Policy</h1>
        <p className={styles.meta}>Last updated: {LEGAL.lastUpdated}</p>

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
