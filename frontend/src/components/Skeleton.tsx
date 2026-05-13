import styles from "./Skeleton.module.scss";

type Props = {
  width?: string;
  height?: string;
  theme?: "dark" | "light";
  className?: string;
};

export function Skeleton({ width = "100%", height = "1em", theme = "dark", className }: Props) {
  return (
    <span
      className={`${styles.skeleton} ${theme === "light" ? styles.light : styles.dark} ${className ?? ""}`}
      style={{ width, height, display: "block" }}
      aria-hidden="true"
    />
  );
}
