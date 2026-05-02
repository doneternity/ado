import styles from "./GoogleButton.module.scss";

export function GoogleButton() {
  return (
    <a href="/api/auth/google" className={styles.btn}>
      <span className={styles.g}>G</span>
      <span>Continue with Google</span>
    </a>
  );
}
