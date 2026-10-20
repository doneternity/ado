import { memo, type ComponentPropsWithoutRef, type ReactElement } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import styles from "./Markdown.module.scss";

export { useCopy } from "./CodeBlock";

const components: Components = {
  // Fenced code: react-markdown wraps it as <pre><code class="language-x">.
  pre({ children }) {
    const child = (Array.isArray(children) ? children[0] : children) as ReactElement<ComponentPropsWithoutRef<"code">> | undefined;
    const className = child?.props?.className ?? "";
    const lang = /language-([\w+#-]+)/.exec(className)?.[1];
    const code = String(child?.props?.children ?? "").replace(/\n$/, "");
    return <CodeBlock code={code} lang={lang} />;
  },
  code({ children }) {
    return <code className={styles.inlineCode}>{children}</code>;
  },
  a({ href, children }) {
    return <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>;
  },
  // Model replies can name any image URL; loading it would tell that server
  // who is reading. Show the link instead.
  img({ src, alt }) {
    const url = typeof src === "string" ? src : "";
    return url ? <a href={url} target="_blank" rel="noopener noreferrer nofollow">{alt || url}</a> : <>{alt}</>;
  },
  table({ children }) {
    return <div className={styles.tableWrap}><table>{children}</table></div>;
  },
};

const plugins = [remarkGfm];

// Renders a model reply. Raw HTML in the reply is shown as text, never run,
// and unsafe link schemes (javascript: and the like) are dropped by
// react-markdown. Memoised so earlier messages don't re-parse on every token.
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className={styles.md}>
      <ReactMarkdown remarkPlugins={plugins} components={components}>{text}</ReactMarkdown>
    </div>
  );
});
