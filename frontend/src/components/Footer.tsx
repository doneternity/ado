import { Link } from "react-router-dom";
import styles from "./Footer.module.scss";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand}>ADO</Link>
        <nav className={styles.links}>
          <Link to="/pricing"    className={styles.link}>pricing</Link>
          <Link to="/playground" className={styles.link}>playground</Link>
          <Link to="/models"     className={styles.link}>models</Link>
          <Link to="/docs"       className={styles.link}>docs</Link>
          <Link to="/privacy"    className={styles.link}>privacy</Link>
          <Link to="/terms"      className={styles.link}>terms</Link>
        </nav>
        <span className={styles.copy}>© {new Date().getFullYear()} ADO</span>
      </div>
    </footer>
  );
}
