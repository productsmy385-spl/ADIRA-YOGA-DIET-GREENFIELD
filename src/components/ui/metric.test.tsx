import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetricCard, MetricGrid } from "./metric";

const Icon = () => <svg data-testid="icon" />;

describe("MetricCard", () => {
  it("shows the label and the real value", () => {
    render(<MetricCard label="Total members" value={42} icon={<Icon />} />);
    expect(screen.getByText("Total members")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  // Brief rule 13: never fabricate a value. A missing measurement must not read as 0.
  it("renders null as 'not available', never as 0", () => {
    render(<MetricCard label="Adherence" value={null} icon={<Icon />} />);
    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("keeps a genuine zero as zero", () => {
    render(<MetricCard label="Dead jobs" value={0} icon={<Icon />} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("Not available")).not.toBeInTheDocument();
  });

  // Colour alone must not carry meaning (WCAG 1.4.1): attention is also stated in text.
  it("states 'needs attention' in text, not only in colour", () => {
    render(<MetricCard label="Pending requests" value={3} icon={<Icon />} attention />);
    expect(screen.getByText(/needs attention/)).toBeInTheDocument();
  });

  it("becomes a single link when given an href", () => {
    render(<MetricCard label="Members" value={5} icon={<Icon />} href="/admin/members" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/admin/members");
    expect(link).toHaveTextContent("Members");
  });

  it("is not a link without an href", () => {
    render(<MetricCard label="Members" value={5} icon={<Icon />} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("hides the decorative icon from assistive technology", () => {
    render(<MetricCard label="Members" value={5} icon={<Icon />} />);
    expect(screen.getByTestId("icon").parentElement).toHaveAttribute("aria-hidden");
  });

  it("shows a trend with its period", () => {
    render(
      <MetricCard
        label="Check-ins"
        value={10}
        icon={<Icon />}
        trend={{ value: "+12%", direction: "up", period: "vs last week" }}
      />,
    );
    expect(screen.getByText("+12%")).toBeInTheDocument();
    expect(screen.getByText(/vs last week/)).toBeInTheDocument();
  });
});

describe("MetricGrid", () => {
  it("is a labelled region", () => {
    render(
      <MetricGrid label="Organisation">
        <MetricCard label="Members" value={1} icon={<Icon />} />
      </MetricGrid>,
    );
    expect(screen.getByRole("region", { name: "Organisation" })).toBeInTheDocument();
  });
});
