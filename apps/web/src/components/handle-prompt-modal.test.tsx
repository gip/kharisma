import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { HandlePromptModal } from "./handle-prompt-modal";
import { en } from "@/i18n/en";
import { I18nProvider } from "@/i18n/i18n-provider";

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider initialLocale="en">{ui}</I18nProvider>);
}

describe("HandlePromptModal", () => {
  it("renders only when open", () => {
    const { rerender } = renderWithI18n(
      <HandlePromptModal
        open={false}
        suggested="alice"
        busy={false}
        error={null}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText(en["handle.title"])).not.toBeInTheDocument();

    rerender(
      <I18nProvider initialLocale="en">
        <HandlePromptModal
          open
          suggested="alice"
          busy={false}
          error={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(en["handle.title"])).toBeInTheDocument();
  });

  it("disables submit until the input is valid", () => {
    renderWithI18n(
      <HandlePromptModal
        open
        suggested="ab"
        busy={false}
        error={null}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const submit = screen.getByRole("button", { name: en["handle.submit"] });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(en["handle.placeholder"]), {
      target: { value: "alice_1" },
    });

    expect(submit).not.toBeDisabled();
  });

  it("submits the trimmed value by button and Enter", () => {
    const onSubmit = vi.fn();
    const { rerender } = renderWithI18n(
      <HandlePromptModal
        open
        suggested="alice"
        busy={false}
        error={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(en["handle.placeholder"]), {
      target: { value: "  bob_1  " },
    });
    fireEvent.click(screen.getByRole("button", { name: en["handle.submit"] }));

    expect(onSubmit).toHaveBeenCalledWith("bob_1");

    rerender(
      <I18nProvider initialLocale="en">
        <HandlePromptModal
          open
          suggested="carol"
          busy={false}
          error={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      </I18nProvider>,
    );

    const input = screen.getByPlaceholderText(en["handle.placeholder"]);
    fireEvent.change(input, { target: { value: "  carol-2  " } });
    const form = input.closest("form");
    if (!form) throw new Error("Expected handle input to be inside a form.");
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenLastCalledWith("carol-2");
  });

  it("cancels from overlay, close button, and Cancel button", () => {
    const onCancel = vi.fn();
    const { rerender } = renderWithI18n(
      <HandlePromptModal
        open
        suggested="alice"
        busy={false}
        error={null}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByTestId("handle-prompt-overlay"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <I18nProvider initialLocale="en">
        <HandlePromptModal
          open
          suggested="alice"
          busy={false}
          error={null}
          onSubmit={vi.fn()}
          onCancel={onCancel}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByLabelText(en["handle.cancel"]));
    expect(onCancel).toHaveBeenCalledTimes(2);

    rerender(
      <I18nProvider initialLocale="en">
        <HandlePromptModal
          open
          suggested="alice"
          busy={false}
          error={null}
          onSubmit={vi.fn()}
          onCancel={onCancel}
        />
      </I18nProvider>,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: en["handle.cancel"] })[1],
    );
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it("renders an inline error", () => {
    renderWithI18n(
      <HandlePromptModal
        open
        suggested="alice"
        busy={false}
        error={'handle "alice" is already in use'}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('handle "alice" is already in use')).toBeInTheDocument();
  });
});
