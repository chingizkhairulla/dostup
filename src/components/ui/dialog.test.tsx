import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

function Harness({ hideCloseButton = false }: { hideCloseButton?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <span data-testid="state">{open ? "open" : "closed"}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent hideCloseButton={hideCloseButton}>
          <DialogTitle>Окно</DialogTitle>
          <p>content</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe("shared dialog chrome", () => {
  // Customer rule: the close cross stays on the phone version only.
  it("shows the close cross on phones only", () => {
    render(<Harness />);

    const close = screen.getByRole("button", { name: "Close" });
    expect(close.className).toMatch(/(^|\s)sm:hidden(\s|$)/);
  });

  it("does not add a cross when the dialog asks to hide it", () => {
    render(<Harness hideCloseButton />);

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  // Customer rule: on the computer a click anywhere outside the window closes it.
  it("closes when the user clicks outside the window", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByTestId("state")).toHaveTextContent("open");

    const overlay = document.querySelector("[data-state='open'].fixed.inset-0") as HTMLElement;
    expect(overlay).not.toBeNull();
    await user.click(overlay);

    expect(screen.getByTestId("state")).toHaveTextContent("closed");
  });

  it("stays open when the user clicks inside the window", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByText("content"));

    expect(screen.getByTestId("state")).toHaveTextContent("open");
  });

  it("closes on Escape too", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard("{Escape}");

    expect(screen.getByTestId("state")).toHaveTextContent("closed");
  });
});
