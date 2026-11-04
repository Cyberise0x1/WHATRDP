"use client";

import { useState } from "react";
import { Emblem } from "./Emblem";
import { ANONYMOUS_FAQ_ITEMS, HOME_FAQ_ITEMS } from "./faq-items";

interface Props {
  variant?: "home" | "anonymous";
  index?: string;
  id?: string;
  heading?: string;
  intro?: string;
}

export function Faq({ variant = "home", index, id = "faq", heading, intro }: Props) {
  const [open, setOpen] = useState<number | null>(0);
  const items = variant === "anonymous" ? ANONYMOUS_FAQ_ITEMS : HOME_FAQ_ITEMS;
  const label = index ?? (variant === "anonymous" ? "04" : "05");
  const title = heading ?? (variant === "anonymous" ? "Anonymous questions." : "Fair questions.");
  const copy =
    intro ??
    (variant === "anonymous"
      ? "What we collect, what we do not, and how the service works. If something is still unclear, ask before you pay."
      : "The operational answers, not the brochure. If something is still unclear, contact us before you pay.");

  return (
    <section className="section" id={id}>
      <div className="section-label">
        <Emblem className="section-emblem" />[{label} // BEFORE YOU ASK]
      </div>
      <div className="section-head">
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>

      <div className="faq">
        {items.map((item, itemIndex) => {
          const expanded = open === itemIndex;
          const questionId = `${id}-question-${itemIndex}`;
          const answerId = `${id}-answer-${itemIndex}`;
          return (
            <div className="faq-item" key={item.question}>
              <button
                type="button"
                className="faq-question"
                aria-expanded={expanded}
                aria-controls={answerId}
                id={questionId}
                onClick={() => setOpen(expanded ? null : itemIndex)}
              >
                <span className="faq-marker" aria-hidden="true">
                  [{expanded ? "−" : "+"}]
                </span>
                <span>{item.question}</span>
              </button>
              <div
                className={expanded ? "faq-answer open" : "faq-answer"}
                id={answerId}
                role="region"
                aria-labelledby={questionId}
              >
                <div className="faq-answer-inner">
                  <p>{item.answer}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
