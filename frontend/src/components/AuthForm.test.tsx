import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthForm } from "./AuthForm";

describe("AuthForm", () => {
  it("calls onSubmit with email + password on login submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AuthForm mode="login" onSubmit={onSubmit} isPending={false} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "x@y.z" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "hunter2-correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      email: "x@y.z",
      password: "hunter2-correct-horse",
    });
  });

  it("disables submit while pending", () => {
    render(<AuthForm mode="login" onSubmit={async () => {}} isPending={true} />);
    expect(screen.getByRole("button", { name: /working/i })).toBeDisabled();
  });
});
