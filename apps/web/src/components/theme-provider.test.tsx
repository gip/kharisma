import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/components/theme-provider";

function Harness() {
  const { theme, toggle } = useTheme();

  return (
    <button type="button" onClick={toggle}>
      {theme}
    </button>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute("data-theme", "dark");
  });

  it("applies the selected theme to the document when toggled", async () => {
    render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    });

    fireEvent.click(screen.getByRole("button", { name: "dark" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("kharisma:theme")).toBe("light");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "light" })).toBeVisible();
    });
  });
});
